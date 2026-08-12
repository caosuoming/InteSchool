import { posix } from "node:path";
import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
import { Resvg } from "@resvg/resvg-js";
import * as CFB from "cfb";
import JSZip from "jszip";
import katex from "katex";
import { mathjax } from "mathjax-full/js/mathjax.js";
import { liteAdaptor } from "mathjax-full/js/adaptors/liteAdaptor.js";
import { RegisterHTMLHandler } from "mathjax-full/js/handlers/html.js";
import { TeX } from "mathjax-full/js/input/tex.js";
import { AllPackages } from "mathjax-full/js/input/tex/AllPackages.js";
import { SVG } from "mathjax-full/js/output/svg.js";
import { ommlToLatex } from "../../src/lib/omml-to-latex.js";

const WORD_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const MATH_NS = "http://schemas.openxmlformats.org/officeDocument/2006/math";
const OFFICE_NS = "urn:schemas-microsoft-com:office:office";
const VML_NS = "urn:schemas-microsoft-com:vml";
const OFFICE_REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const PACKAGE_REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships";
const CONTENT_TYPES_NS = "http://schemas.openxmlformats.org/package/2006/content-types";
const OLE_REL_TYPE = `${OFFICE_REL_NS}/oleObject`;
const IMAGE_REL_TYPE = `${OFFICE_REL_NS}/image`;
const MAX_EQUATION_COUNT = 2_048;
const MAX_LATEX_LENGTH = 100_000;
const MAX_RENDERED_PREVIEW_BYTES = 8 * 1024 * 1024;

const OLE_STREAM = Buffer.from("0100000200000000000000000000000000000000", "hex");
const COMP_OBJ_STREAM = Buffer.from(
  "0100feff02000100ffffffff03ce020000000000c000000000000046090000004571756174696f6e00feffffff444e51450f0000004571756174696f6e2e44534d54340000000000",
  "hex",
);
const OBJ_INFO_STREAM = Buffer.from("000003000100", "hex");

const mathJaxAdaptor = liteAdaptor();
RegisterHTMLHandler(mathJaxAdaptor);
const mathJaxDocument = mathjax.document("", {
  InputJax: new TeX({ packages: AllPackages }),
  OutputJax: new SVG({ fontCache: "none" }),
});

interface PreviewImage {
  data: Buffer;
  widthPx: number;
  heightPx: number;
}

interface FormulaArtifact {
  latex: string;
  ole: Buffer;
  preview: PreviewImage;
}

interface FormulaTarget {
  element: Element;
  replaceElement: Element;
  display: boolean;
}

interface PartConversion {
  partPath: string;
  document: Document;
  relationshipsPath: string;
  relationships: Document;
  formulas: Array<{ target: FormulaTarget; artifact: FormulaArtifact }>;
}

export interface OmmlMathTypeDocxConversionResult {
  buffer: Buffer;
  detectedCount: number;
  convertedCount: number;
}

function elementChildren(node: Node): Element[] {
  return Array.from(node.childNodes).filter((child): child is Element => child.nodeType === 1);
}

function childElementsByLocalName(element: Element, localName: string): Element[] {
  return elementChildren(element).filter((child) => child.localName === localName);
}

function descendantsByLocalName(element: Element, localName: string): Element[] {
  return Array.from(element.getElementsByTagName("*")).filter((child) => child.localName === localName);
}

function int8(value: number): Buffer {
  const buffer = Buffer.alloc(1);
  buffer.writeInt8(value, 0);
  return buffer;
}

function uint8(value: number): Buffer {
  return Buffer.from([value & 0xff]);
}

function uint16(value: number): Buffer {
  const buffer = Buffer.alloc(2);
  buffer.writeUInt16LE(value & 0xffff, 0);
  return buffer;
}

function uint32(value: number): Buffer {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(value >>> 0, 0);
  return buffer;
}

function endRecord(): Buffer {
  return uint8(0);
}

function lineRecord(records: Buffer[], placeholder = false): Buffer {
  if (placeholder) return Buffer.from([1, 1]);
  return Buffer.concat([Buffer.from([1, 0]), ...records, endRecord()]);
}

function pileRecord(lines: Buffer[]): Buffer {
  return Buffer.concat([
    Buffer.from([4, 0, 2, 1]),
    ...lines,
    endRecord(),
  ]);
}

function typefaceForMathml(element: Element): number {
  if (element.localName === "mn") return 8;
  if (element.localName === "mo") return 6;
  if (element.localName === "mtext") return 1;
  const variant = (element.getAttribute("mathvariant") || "").toLowerCase();
  if (variant === "normal" || variant === "upright") return 1;
  return 3;
}

function charRecord(character: string, typeface: number): Buffer {
  const codePoint = character.codePointAt(0);
  if (codePoint === undefined || codePoint > 0xffff) {
    throw new Error(`MathType MTEF 暂不支持字符 U+${(codePoint || 0).toString(16).toUpperCase()}`);
  }
  return Buffer.concat([
    Buffer.from([2, 0]),
    int8(typeface - 128),
    uint16(codePoint),
  ]);
}

function textRecords(text: string, typeface: number): Buffer[] {
  return [...text].flatMap((character) => {
    if (character === "\u00a0") return [charRecord(" ", 1)];
    return [charRecord(character, typeface)];
  });
}

function variationBytes(variation: number): Buffer {
  if (variation < 0 || variation > 0x7fff) throw new Error("MathType 模板 variation 超出范围");
  if (variation < 0x80) return uint8(variation);
  return Buffer.from([(variation & 0x7f) | 0x80, (variation >> 8) & 0xff]);
}

function templateRecord(
  selector: number,
  variation: number,
  subobjects: Buffer[],
  specificOptions = 0,
): Buffer {
  return Buffer.concat([
    Buffer.from([3, 0, selector]),
    variationBytes(variation),
    uint8(specificOptions),
    ...subobjects,
    endRecord(),
  ]);
}

function scriptTemplate(
  kind: "sub" | "sup" | "subsup",
  subRecords: Buffer[],
  supRecords: Buffer[],
): Buffer {
  const selector = kind === "sub" ? 27 : kind === "sup" ? 28 : 29;
  return templateRecord(selector, 0, [
    uint8(11),
    lineRecord(subRecords, kind === "sup"),
    lineRecord(supRecords, kind === "sub"),
  ]);
}

function matrixPartitionBytes(partitionCount: number): Buffer {
  return Buffer.alloc(Math.ceil((partitionCount * 2) / 8));
}

function matrixRecord(element: Element): Buffer {
  const rows = childElementsByLocalName(element, "mtr");
  const columns = Math.max(1, ...rows.map((row) => childElementsByLocalName(row, "mtd").length));
  const cells: Buffer[] = [];
  for (const row of rows) {
    const rowCells = childElementsByLocalName(row, "mtd");
    for (let column = 0; column < columns; column += 1) {
      const cell = rowCells[column];
      cells.push(lineRecord(cell ? mathmlChildrenToMtef(cell) : [], !cell));
    }
  }
  return Buffer.concat([
    Buffer.from([5, 0, 4, 1, 1, rows.length, columns]),
    matrixPartitionBytes(rows.length + 1),
    matrixPartitionBytes(columns + 1),
    ...cells,
    endRecord(),
  ]);
}

function accentTemplate(base: Element, accent: Element, under: boolean): Buffer[] | null {
  const text = accent.textContent || "";
  const baseRecords = mathmlToMtef(base);
  if (!baseRecords.length) return null;
  if (under && ["_", "¯", "‾", "―"].includes(text)) {
    return [templateRecord(12, 0, [lineRecord(baseRecords)])];
  }
  if (!under && ["¯", "‾", "―"].includes(text)) {
    return [templateRecord(13, 0, [lineRecord(baseRecords)])];
  }
  if (!under && ["^", "ˆ", "̂"].includes(text)) {
    return [templateRecord(33, 0, [lineRecord(baseRecords)])];
  }
  if (!under && ["~", "˜", "̃"].includes(text)) {
    return [templateRecord(32, 0, [lineRecord(baseRecords)])];
  }
  if (["→", "⃗"].includes(text)) {
    return [templateRecord(31, under ? 0x06 : 0x02, [lineRecord(baseRecords)])];
  }
  return null;
}

function mathmlChildrenToMtef(element: Element): Buffer[] {
  return elementChildren(element).flatMap((child) => mathmlToMtef(child));
}

function mathmlToMtef(element: Element): Buffer[] {
  const localName = element.localName;
  if (["annotation", "annotation-xml", "none"].includes(localName)) return [];

  if (["mi", "mn", "mo", "mtext"].includes(localName)) {
    return textRecords(element.textContent || "", typefaceForMathml(element));
  }
  if (localName === "mspace") return textRecords(" ", 1);
  if (localName === "semantics") {
    const first = elementChildren(element).find((child) => !["annotation", "annotation-xml"].includes(child.localName));
    return first ? mathmlToMtef(first) : [];
  }
  if (["math", "mrow", "mstyle", "mpadded", "mphantom", "TeXAtom"].includes(localName)) {
    return mathmlChildrenToMtef(element);
  }
  if (localName === "mfrac") {
    const [numerator, denominator] = elementChildren(element);
    return [templateRecord(11, 0, [
      lineRecord(numerator ? mathmlToMtef(numerator) : [], !numerator),
      lineRecord(denominator ? mathmlToMtef(denominator) : [], !denominator),
    ])];
  }
  if (localName === "msqrt") {
    return [templateRecord(10, 0, [
      lineRecord(mathmlChildrenToMtef(element)),
      lineRecord([], true),
    ])];
  }
  if (localName === "mroot") {
    const [radicand, degree] = elementChildren(element);
    return [templateRecord(10, 1, [
      lineRecord(radicand ? mathmlToMtef(radicand) : [], !radicand),
      lineRecord(degree ? mathmlToMtef(degree) : [], !degree),
    ])];
  }
  if (["msub", "msup", "msubsup"].includes(localName)) {
    const [base, sub, sup] = elementChildren(element);
    if (base && sub && localName === "msup") {
      const accented = accentTemplate(base, sub, false);
      if (accented) return accented;
    }
    if (base && sub && localName === "msub") {
      const accented = accentTemplate(base, sub, true);
      if (accented) return accented;
    }
    const records = base ? mathmlToMtef(base) : [];
    if (localName === "msub") {
      records.push(scriptTemplate("sub", sub ? mathmlToMtef(sub) : [], []));
    } else if (localName === "msup") {
      records.push(scriptTemplate("sup", [], sub ? mathmlToMtef(sub) : []));
    } else {
      records.push(scriptTemplate(
        "subsup",
        sub ? mathmlToMtef(sub) : [],
        sup ? mathmlToMtef(sup) : [],
      ));
    }
    return records;
  }
  if (["munder", "mover", "munderover"].includes(localName)) {
    const [base, underOrOver, over] = elementChildren(element);
    if (base && underOrOver && localName !== "munderover") {
      const accented = accentTemplate(base, underOrOver, localName === "munder");
      if (accented) return accented;
    }
    const records = base ? mathmlToMtef(base) : [];
    if (localName === "munder") {
      records.push(scriptTemplate("sub", underOrOver ? mathmlToMtef(underOrOver) : [], []));
    } else if (localName === "mover") {
      records.push(scriptTemplate("sup", [], underOrOver ? mathmlToMtef(underOrOver) : []));
    } else {
      records.push(scriptTemplate(
        "subsup",
        underOrOver ? mathmlToMtef(underOrOver) : [],
        over ? mathmlToMtef(over) : [],
      ));
    }
    return records;
  }
  if (localName === "mtable") return [matrixRecord(element)];
  if (localName === "mtr" || localName === "mtd") return mathmlChildrenToMtef(element);
  if (localName === "mfenced") {
    const open = element.getAttribute("open") || "(";
    const close = element.getAttribute("close") || ")";
    const fenceSelector = new Map([
      ["()", 1],
      ["{}", 2],
      ["[]", 3],
      ["||", 4],
    ]).get(`${open}${close}`);
    if (fenceSelector !== undefined) {
      return [templateRecord(fenceSelector, 3, [lineRecord(mathmlChildrenToMtef(element))])];
    }
    return [
      ...textRecords(open, 6),
      ...mathmlChildrenToMtef(element),
      ...textRecords(close, 6),
    ];
  }
  if (localName === "menclose") {
    const notation = element.getAttribute("notation") || "";
    const content = mathmlChildrenToMtef(element);
    if (notation.includes("box")) return [templateRecord(37, 0x1e, [lineRecord(content)])];
    return content;
  }

  const children = mathmlChildrenToMtef(element);
  if (children.length) return children;
  return textRecords(element.textContent || "", 3);
}

function mathmlFromLatex(latex: string): Element {
  const rendered = katex.renderToString(latex, {
    output: "mathml",
    throwOnError: true,
    strict: "ignore",
    trust: false,
  });
  const document = new DOMParser().parseFromString(rendered, "text/xml");
  const math = Array.from(document.getElementsByTagName("*")).find((element) => element.localName === "math");
  if (!math) throw new Error("无法从 LaTeX 生成 MathML");
  return math;
}

export function createMathTypeMtefFromLatex(latex: string, inline = true): Buffer {
  const math = mathmlFromLatex(latex);
  const records = mathmlToMtef(math);
  const header = Buffer.concat([
    Buffer.from([5, 0, 0, 6, 7]),
    Buffer.from("DSMT6\0", "ascii"),
    uint8(inline ? 1 : 0),
  ]);
  return Buffer.concat([
    header,
    lineRecord(records),
    endRecord(),
  ]);
}

export function createMathTypeOleFromLatex(latex: string, inline = true): Buffer {
  const mtef = createMathTypeMtefFromLatex(latex, inline);
  const equationNative = Buffer.concat([
    uint32(28),
    uint32(2),
    uint32(mtef.length),
    uint32(0),
    uint32(0),
    uint32(0),
    uint32(0),
    mtef,
  ]);
  const compoundFile = CFB.utils.cfb_new();
  CFB.utils.cfb_add(compoundFile, "\x01Ole", OLE_STREAM);
  CFB.utils.cfb_add(compoundFile, "\x01CompObj", COMP_OBJ_STREAM);
  CFB.utils.cfb_add(compoundFile, "\x03ObjInfo", OBJ_INFO_STREAM);
  CFB.utils.cfb_add(compoundFile, "Equation Native", equationNative);
  return Buffer.from(CFB.write(compoundFile, { type: "buffer" }));
}

function renderPreview(latex: string, display: boolean): PreviewImage {
  const node = mathJaxDocument.convert(latex, { display });
  const container = mathJaxAdaptor.outerHTML(node);
  const svg = container
    .replace(/^<mjx-container[^>]*>/, "")
    .replace(/<\/mjx-container>$/, "");
  if (!svg.startsWith("<svg")) throw new Error("无法生成 MathType 公式预览图");
  const rendered = new Resvg(svg, {
    fitTo: { mode: "zoom", value: 2 },
    background: "rgba(255,255,255,0)",
  }).render();
  const data = Buffer.from(rendered.asPng());
  if (data.length > MAX_RENDERED_PREVIEW_BYTES) throw new Error("MathType 公式预览图过大");
  return { data, widthPx: rendered.width, heightPx: rendered.height };
}

function formulaArtifact(element: Element, display: boolean): FormulaArtifact {
  const latex = ommlToLatex(element as unknown as globalThis.Element).trim();
  if (!latex) throw new Error("公式内容为空");
  if (latex.length > MAX_LATEX_LENGTH) throw new Error("公式内容过长");
  return {
    latex,
    ole: createMathTypeOleFromLatex(latex, !display),
    preview: renderPreview(latex, display),
  };
}

function hasAncestor(element: Element, namespace: string, localName: string): boolean {
  let parent = element.parentNode;
  while (parent?.nodeType === 1) {
    const candidate = parent as Element;
    if (candidate.namespaceURI === namespace && candidate.localName === localName) return true;
    parent = parent.parentNode;
  }
  return false;
}

function collectFormulaTargets(document: Document): FormulaTarget[] {
  const targets: FormulaTarget[] = [];
  const paragraphs = Array.from(document.getElementsByTagNameNS(MATH_NS, "oMathPara"));
  for (const paragraph of paragraphs) {
    const formulas = Array.from(paragraph.getElementsByTagNameNS(MATH_NS, "oMath"));
    if (formulas.length === 0) continue;
    targets.push({ element: paragraph, replaceElement: paragraph, display: true });
  }
  const inline = Array.from(document.getElementsByTagNameNS(MATH_NS, "oMath"));
  for (const formula of inline) {
    if (hasAncestor(formula, MATH_NS, "oMathPara")) continue;
    targets.push({ element: formula, replaceElement: formula, display: false });
  }
  return targets;
}

function relationshipsPathForPart(partPath: string): string {
  const directory = posix.dirname(partPath);
  const baseName = posix.basename(partPath);
  return posix.join(directory, "_rels", `${baseName}.rels`);
}

function createRelationshipsDocument(): Document {
  const document = new DOMParser().parseFromString(
    `<Relationships xmlns="${PACKAGE_REL_NS}"/>`,
    "application/xml",
  );
  return document;
}

function allRelationshipIds(document: Document): Set<string> {
  return new Set(
    Array.from(document.getElementsByTagNameNS(PACKAGE_REL_NS, "Relationship"))
      .map((element) => element.getAttribute("Id") || "")
      .filter(Boolean),
  );
}

function nextRelationshipId(existing: Set<string>, prefix: string): string {
  for (let index = 1; index <= 100_000; index += 1) {
    const id = `${prefix}${index}`;
    if (!existing.has(id)) {
      existing.add(id);
      return id;
    }
  }
  throw new Error("无法分配 DOCX relationship id");
}

function appendRelationship(
  document: Document,
  id: string,
  type: string,
  target: string,
): void {
  const relationship = document.createElementNS(PACKAGE_REL_NS, "Relationship");
  relationship.setAttribute("Id", id);
  relationship.setAttribute("Type", type);
  relationship.setAttribute("Target", target);
  document.documentElement.appendChild(relationship);
}

function nextAvailablePart(zip: JSZip, directory: string, prefix: string, extension: string): string {
  for (let index = 1; index <= 100_000; index += 1) {
    const path = `${directory}/${prefix}${index}.${extension}`;
    if (!zip.file(path)) return path;
  }
  throw new Error("无法分配 DOCX 嵌入对象路径");
}

function ensureNamespace(root: Element, prefix: string, namespace: string): void {
  const attributeName = `xmlns:${prefix}`;
  if (!root.getAttribute(attributeName)) root.setAttribute(attributeName, namespace);
}

function createMathTypeRun(
  document: Document,
  oleRelationshipId: string,
  imageRelationshipId: string,
  preview: PreviewImage,
  index: number,
): Element {
  const run = document.createElementNS(WORD_NS, "w:r");
  const object = document.createElementNS(WORD_NS, "w:object");
  const widthPt = Math.max(8, Math.min(450, preview.widthPx * 0.375));
  const heightPt = Math.max(8, Math.min(120, preview.heightPx * 0.375));
  const dxa = Math.round(widthPt * 20);
  const dya = Math.round(heightPt * 20);
  object.setAttributeNS(WORD_NS, "w:dxaOrig", String(dxa));
  object.setAttributeNS(WORD_NS, "w:dyaOrig", String(dya));

  const shape = document.createElementNS(VML_NS, "v:shape");
  const shapeId = `_x0000_i${10_000 + index}`;
  shape.setAttribute("id", shapeId);
  shape.setAttribute("type", "#_x0000_t75");
  shape.setAttribute("style", `width:${widthPt.toFixed(2)}pt;height:${heightPt.toFixed(2)}pt`);
  shape.setAttributeNS(OFFICE_NS, "o:ole", "");

  const imageData = document.createElementNS(VML_NS, "v:imagedata");
  imageData.setAttributeNS(OFFICE_REL_NS, "r:id", imageRelationshipId);
  imageData.setAttributeNS(OFFICE_NS, "o:title", "");
  shape.appendChild(imageData);
  object.appendChild(shape);

  const oleObject = document.createElementNS(OFFICE_NS, "o:OLEObject");
  oleObject.setAttribute("Type", "Embed");
  oleObject.setAttribute("ProgID", "Equation.DSMT4");
  oleObject.setAttribute("ShapeID", shapeId);
  oleObject.setAttribute("DrawAspect", "Content");
  oleObject.setAttribute("ObjectID", `_${1_000_000 + index}`);
  oleObject.setAttributeNS(OFFICE_REL_NS, "r:id", oleRelationshipId);
  object.appendChild(oleObject);
  run.appendChild(object);
  return run;
}

function replaceFormulaTarget(target: FormulaTarget, run: Element): void {
  const parent = target.replaceElement.parentNode;
  if (!parent) throw new Error("公式节点没有父节点");
  parent.replaceChild(run, target.replaceElement);
}

function ensureContentTypeDefault(document: Document, extension: string, contentType: string): void {
  const defaults = Array.from(document.getElementsByTagNameNS(CONTENT_TYPES_NS, "Default"));
  if (defaults.some((entry) => (entry.getAttribute("Extension") || "").toLowerCase() === extension)) return;
  const entry = document.createElementNS(CONTENT_TYPES_NS, "Default");
  entry.setAttribute("Extension", extension);
  entry.setAttribute("ContentType", contentType);
  document.documentElement.appendChild(entry);
}

function formulaPartPaths(zip: JSZip): string[] {
  return Object.keys(zip.files).filter((path) => (
    path === "word/document.xml"
    || /^word\/(?:header|footer)\d+\.xml$/i.test(path)
    || /^word\/(?:footnotes|endnotes|comments)\.xml$/i.test(path)
    || path === "word/glossary/document.xml"
  ));
}

async function preparePartConversion(zip: JSZip, partPath: string): Promise<PartConversion | null> {
  const xml = await zip.file(partPath)?.async("string");
  if (!xml || !xml.includes("oMath")) return null;
  const document = new DOMParser().parseFromString(xml, "application/xml");
  const targets = collectFormulaTargets(document);
  if (targets.length === 0) return null;
  const relationshipsPath = relationshipsPathForPart(partPath);
  const relationshipsXml = await zip.file(relationshipsPath)?.async("string");
  const relationships = relationshipsXml
    ? new DOMParser().parseFromString(relationshipsXml, "application/xml")
    : createRelationshipsDocument();
  const formulas = targets.map((target) => ({
    target,
    artifact: formulaArtifact(target.element, target.display),
  }));
  return { partPath, document, relationshipsPath, relationships, formulas };
}

export async function convertOmmlDocxToMathType(
  input: Buffer,
): Promise<OmmlMathTypeDocxConversionResult> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(input);
  } catch {
    throw new Error("无法读取 DOCX 压缩包");
  }

  const prepared: PartConversion[] = [];
  let detectedCount = 0;
  for (const partPath of formulaPartPaths(zip)) {
    const conversion = await preparePartConversion(zip, partPath);
    if (!conversion) continue;
    detectedCount += conversion.formulas.length;
    if (detectedCount > MAX_EQUATION_COUNT) {
      throw new Error(`文档公式超过 ${MAX_EQUATION_COUNT} 个，无法安全转换`);
    }
    prepared.push(conversion);
  }
  if (detectedCount === 0) return { buffer: input, detectedCount: 0, convertedCount: 0 };

  let globalIndex = 0;
  for (const conversion of prepared) {
    const relationshipIds = allRelationshipIds(conversion.relationships);
    const partDirectory = posix.dirname(conversion.partPath);
    ensureNamespace(conversion.document.documentElement, "r", OFFICE_REL_NS);
    ensureNamespace(conversion.document.documentElement, "o", OFFICE_NS);
    ensureNamespace(conversion.document.documentElement, "v", VML_NS);

    for (const { target, artifact } of conversion.formulas) {
      globalIndex += 1;
      const olePath = nextAvailablePart(zip, "word/embeddings", "inteschoolMathType", "bin");
      const imagePath = nextAvailablePart(zip, "word/media", "inteschoolMathType", "png");
      zip.file(olePath, artifact.ole);
      zip.file(imagePath, artifact.preview.data);

      const oleRelationshipId = nextRelationshipId(relationshipIds, "rIdInteschoolMathTypeOle");
      const imageRelationshipId = nextRelationshipId(relationshipIds, "rIdInteschoolMathTypeImage");
      appendRelationship(
        conversion.relationships,
        oleRelationshipId,
        OLE_REL_TYPE,
        posix.relative(partDirectory, olePath),
      );
      appendRelationship(
        conversion.relationships,
        imageRelationshipId,
        IMAGE_REL_TYPE,
        posix.relative(partDirectory, imagePath),
      );
      replaceFormulaTarget(
        target,
        createMathTypeRun(
          conversion.document,
          oleRelationshipId,
          imageRelationshipId,
          artifact.preview,
          globalIndex,
        ),
      );
    }

    const serializer = new XMLSerializer();
    zip.file(conversion.partPath, serializer.serializeToString(conversion.document));
    zip.file(conversion.relationshipsPath, serializer.serializeToString(conversion.relationships));
  }

  const contentTypesXml = await zip.file("[Content_Types].xml")?.async("string");
  if (!contentTypesXml) throw new Error("DOCX 缺少 [Content_Types].xml");
  const contentTypes = new DOMParser().parseFromString(contentTypesXml, "application/xml");
  ensureContentTypeDefault(
    contentTypes,
    "bin",
    "application/vnd.openxmlformats-officedocument.oleObject",
  );
  ensureContentTypeDefault(contentTypes, "png", "image/png");
  zip.file("[Content_Types].xml", new XMLSerializer().serializeToString(contentTypes));

  return {
    buffer: await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }),
    detectedCount,
    convertedCount: detectedCount,
  };
}
