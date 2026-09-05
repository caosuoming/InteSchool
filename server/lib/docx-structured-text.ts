import JSZip from "jszip";
import { DOMParser } from "@xmldom/xmldom";
import { extname, posix } from "node:path";
import { ommlToLatex } from "../../src/lib/omml-to-latex.js";
import {
  renderDocumentTableStructuredCell,
  serializeDocumentTable,
  type DocumentTable,
  type DocumentTableCell,
} from "../../src/lib/document-table.js";
import {
  wordEqFieldRunsToLatex,
  type WordEqInstructionRun,
} from "./word-eq.js";

const WORD_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const MATH_NS = "http://schemas.openxmlformats.org/officeDocument/2006/math";
const DRAWING_NS = "http://schemas.openxmlformats.org/drawingml/2006/main";
const VML_NS = "urn:schemas-microsoft-com:vml";
const OFFICE_NS = "urn:schemas-microsoft-com:office:office";
const WORDPROCESSING_DRAWING_NS =
  "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing";
const OFFICE_REL_NS =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const PACKAGE_REL_NS =
  "http://schemas.openxmlformats.org/package/2006/relationships";
const ELEMENT_NODE = 1;

const IMAGE_MIME_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".bmp": "image/bmp",
  ".svg": "image/svg+xml",
  ".tif": "image/tiff",
  ".tiff": "image/tiff",
  ".emf": "image/emf",
  ".wmf": "image/wmf",
};

export interface DocxImageAsset {
  data: Buffer;
  contentType: string;
  fileName: string;
}

type ImageUrlFactory = (
  relationshipId: string,
  displaySize?: ImageDisplaySize | null,
) => string;

interface ImageDisplaySize {
  width: number;
  height: number;
}

const EMU_PER_CSS_PIXEL = 9_525;
const CSS_PIXELS_PER_POINT = 96 / 72;
const MAX_IMAGE_DISPLAY_PIXELS = 10_000;

function imageExtensionsByRelationship(
  xml: string | undefined,
): Map<string, string> {
  const extensions = new Map<string, string>();
  if (!xml) return extensions;
  const relationships = new DOMParser().parseFromString(xml, "application/xml");
  const entries = Array.from(
    relationships.getElementsByTagNameNS(PACKAGE_REL_NS, "Relationship"),
  );
  for (const entry of entries) {
    if (entry.getAttribute("TargetMode") === "External") continue;
    if (!entry.getAttribute("Type")?.endsWith("/image")) continue;
    const id = entry.getAttribute("Id") || "";
    const extension = extname(entry.getAttribute("Target") || "").toLowerCase();
    if (id && extension) extensions.set(id, extension);
  }
  return extensions;
}

function appendQueryParameters(
  url: string,
  parameters: Array<[string, string]>,
): string {
  if (parameters.length === 0) return url;
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}${parameters.map(([key, value]) => `${key}=${value}`).join("&")}`;
}

function appendImageLayoutHint(
  url: string,
  extension: string | undefined,
  displaySize?: ImageDisplaySize | null,
): string {
  const parameters: Array<[string, string]> = [];
  if ([".wmf", ".emf"].includes(extension || "")) {
    parameters.push(["officeMetafile", extension!.slice(1)]);
  }
  if (displaySize) {
    parameters.push(
      ["officeWidth", displaySize.width.toFixed(2)],
      ["officeHeight", displaySize.height.toFixed(2)],
    );
  }
  return appendQueryParameters(url, parameters);
}

function safeDisplayDimension(value: number): number | null {
  return Number.isFinite(value) &&
    value > 0 &&
    value <= MAX_IMAGE_DISPLAY_PIXELS
    ? value
    : null;
}

function parseCssLength(value: string): number | null {
  const match = value
    .trim()
    .match(/^([0-9]+(?:\.[0-9]+)?)(pt|px|in|cm|mm|pc)?$/i);
  if (!match) return null;
  const amount = Number(match[1]);
  const unit = (match[2] || "px").toLowerCase();
  const factor =
    unit === "pt"
      ? CSS_PIXELS_PER_POINT
      : unit === "in"
        ? 96
        : unit === "cm"
          ? 96 / 2.54
          : unit === "mm"
            ? 96 / 25.4
            : unit === "pc"
              ? 16
              : 1;
  return safeDisplayDimension(amount * factor);
}

function parseVmlDisplaySize(element: Element): ImageDisplaySize | null {
  let current: Node | null = element;
  while (current?.nodeType === ELEMENT_NODE) {
    const ancestor = current as Element;
    if (ancestor.namespaceURI === VML_NS && ancestor.localName === "shape") {
      const declarations = new Map(
        (ancestor.getAttribute("style") || "")
          .split(";")
          .map((declaration) =>
            declaration
              .split(":", 2)
              .map((part, index) =>
                index === 0 ? part.trim().toLowerCase() : part.trim(),
              ),
          )
          .filter(
            (parts): parts is [string, string] =>
              parts.length === 2 && Boolean(parts[0]) && Boolean(parts[1]),
          ),
      );
      const width = parseCssLength(declarations.get("width") || "");
      const height = parseCssLength(declarations.get("height") || "");
      return width && height ? { width, height } : null;
    }
    current = current.parentNode;
  }
  return null;
}

function parseDrawingDisplaySize(element: Element): ImageDisplaySize | null {
  let current: Node | null = element;
  while (current?.nodeType === ELEMENT_NODE) {
    const ancestor = current as Element;
    if (
      ancestor.namespaceURI === WORDPROCESSING_DRAWING_NS &&
      ["inline", "anchor"].includes(ancestor.localName)
    ) {
      const extent = Array.from(
        ancestor.getElementsByTagNameNS(WORDPROCESSING_DRAWING_NS, "extent"),
      )[0];
      const cx = Number(extent?.getAttribute("cx"));
      const cy = Number(extent?.getAttribute("cy"));
      const width = safeDisplayDimension(cx / EMU_PER_CSS_PIXEL);
      const height = safeDisplayDimension(cy / EMU_PER_CSS_PIXEL);
      return width && height ? { width, height } : null;
    }
    current = current.parentNode;
  }
  return null;
}

function imageDisplaySize(element: Element): ImageDisplaySize | null {
  return element.namespaceURI === VML_NS
    ? parseVmlDisplaySize(element)
    : parseDrawingDisplaySize(element);
}

function elementChildren(node: Node): Element[] {
  return Array.from(node.childNodes).filter(
    (child): child is Element => child.nodeType === ELEMENT_NODE,
  );
}

function wordRunVerticalAlign(element: Element): string {
  const properties = elementChildren(element).find(
    (child) => child.namespaceURI === WORD_NS && child.localName === "rPr",
  );
  const verticalAlign = properties
    ? elementChildren(properties).find(
        (child) => child.namespaceURI === WORD_NS && child.localName === "vertAlign",
      )
    : undefined;
  return verticalAlign?.getAttributeNS(WORD_NS, "val")
    || verticalAlign?.getAttribute("w:val")
    || "";
}

function wordRunIsItalic(element: Element): boolean {
  const properties = elementChildren(element).find(
    (child) => child.namespaceURI === WORD_NS && child.localName === "rPr",
  );
  if (!properties) return false;
  const italic = elementChildren(properties).find(
    (child) => child.namespaceURI === WORD_NS && ["i", "iCs"].includes(child.localName),
  );
  if (!italic) return false;
  const value = (
    italic.getAttributeNS(WORD_NS, "val")
    || italic.getAttribute("w:val")
    || "true"
  ).toLowerCase();
  return !["0", "false", "off", "none"].includes(value);
}

function wordRunIsBold(element: Element): boolean {
  const properties = elementChildren(element).find(
    (child) => child.namespaceURI === WORD_NS && child.localName === "rPr",
  );
  if (!properties) return false;
  const bold = elementChildren(properties).find(
    (child) => child.namespaceURI === WORD_NS && ["b", "bCs"].includes(child.localName),
  );
  if (!bold) return false;
  const value = (
    bold.getAttributeNS(WORD_NS, "val")
    || bold.getAttribute("w:val")
    || "true"
  ).toLowerCase();
  return !["0", "false", "off", "none"].includes(value);
}

function mathVariableMarkup(content: string, bold = false): string {
  const isVector = bold && /^[A-Za-z0]$/.test(content);
  const className = isVector ? "math-vector" : "math-variable";
  return isVector || /^[A-Za-z]+$/.test(content)
    ? `<i class="${className}">${content}</i>`
    : content;
}

function markScriptedMathVariables(content: string): string {
  return content.replace(
    /(^|[^A-Za-z>])([A-Za-z])(?=<(?:sub|sup)>)/g,
    (_match, prefix: string, variable: string) => (
      `${prefix}<i class="math-variable">${variable}</i>`
    ),
  );
}

function nearestWordRun(element: Element): Element | undefined {
  let current: Node | null = element;
  while (current?.nodeType === ELEMENT_NODE) {
    const currentElement = current as Element;
    if (currentElement.namespaceURI === WORD_NS && currentElement.localName === "r") {
      return currentElement;
    }
    current = current.parentNode;
  }
  return undefined;
}

function instructionRuns(element: Element): WordEqInstructionRun[] {
  const instructions = element.namespaceURI === WORD_NS && element.localName === "instrText"
    ? [element]
    : Array.from(element.getElementsByTagNameNS(WORD_NS, "instrText"));
  return instructions.map((entry) => {
    const run = nearestWordRun(entry);
    return {
      text: entry.textContent || "",
      verticalAlign: run ? wordRunVerticalAlign(run) : "",
    };
  });
}

function normalizeText(value: string): string {
  return value
    .normalize("NFC")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n");
}

function relationshipId(element: Element, attribute: "embed" | "id"): string {
  return (
    element.getAttributeNS(OFFICE_REL_NS, attribute) ||
    element.getAttribute(`r:${attribute}`) ||
    (attribute === "id"
      ? element.getAttributeNS(OFFICE_NS, "relid") || element.getAttribute("o:relid")
      : "") ||
    ""
  );
}

function extractInlineContent(node: Node, imageUrl?: ImageUrlFactory): string {
  if (node.nodeType !== ELEMENT_NODE) return node.textContent || "";
  const element = node as Element;

  if (element.namespaceURI === WORD_NS && element.localName === "r") {
    const properties = elementChildren(element).find((child) =>
      child.namespaceURI === WORD_NS && child.localName === "rPr"
    );
    const verticalValue = wordRunVerticalAlign(element);
    const content = elementChildren(element)
      .filter((child) => child !== properties)
      .map((child) => extractInlineContent(child, imageUrl))
      .join("");
    const bold = wordRunIsBold(element);
    const styledContent = bold && /^[A-Za-z0]$/.test(content)
      ? mathVariableMarkup(content, true)
      : wordRunIsItalic(element)
        ? mathVariableMarkup(content, bold)
        : content;
    if (styledContent && verticalValue === "superscript") {
      return `<sup>${mathVariableMarkup(styledContent)}</sup>`;
    }
    if (styledContent && verticalValue === "subscript") {
      return `<sub>${mathVariableMarkup(styledContent)}</sub>`;
    }
    return styledContent;
  }

  if (
    element.namespaceURI === MATH_NS &&
    ["oMath", "oMathPara"].includes(element.localName)
  ) {
    const latex = ommlToLatex(element).trim();
    return latex ? `$${latex}$` : "";
  }
  if (
    imageUrl &&
    element.namespaceURI === DRAWING_NS &&
    element.localName === "blip"
  ) {
    const id = relationshipId(element, "embed");
    return id ? `![文档图片](${imageUrl(id, imageDisplaySize(element))})` : "";
  }
  if (
    imageUrl &&
    element.namespaceURI === VML_NS &&
    element.localName === "imagedata"
  ) {
    const id = relationshipId(element, "id");
    return id ? `![文档图片](${imageUrl(id, imageDisplaySize(element))})` : "";
  }
  if (element.namespaceURI === WORD_NS) {
    if (element.localName === "t") return element.textContent || "";
    if (element.localName === "tab") return "\t";
    if (["br", "cr"].includes(element.localName)) return "\n";
    if (element.localName === "noBreakHyphen") return "‑";
    if (element.localName === "softHyphen") return "­";
  }

  return elementChildren(element)
    .map((child) => extractInlineContent(child, imageUrl))
    .join("");
}

function extractParagraph(
  paragraph: Element,
  imageUrl?: ImageUrlFactory,
): string {
  let field: {
    depth: number;
    instruction: WordEqInstructionRun[];
    result: string;
    phase: "instruction" | "result";
  } | null = null;
  const content: string[] = [];

  const fieldCharTypes = (element: Element): string[] => {
    const fieldChars = element.namespaceURI === WORD_NS && element.localName === "fldChar"
      ? [element]
      : Array.from(element.getElementsByTagNameNS(WORD_NS, "fldChar"));
    return fieldChars
      .map((entry) => entry.getAttributeNS(WORD_NS, "fldCharType") || entry.getAttribute("w:fldCharType") || "")
      .filter(Boolean);
  };
  const finishField = () => {
    if (!field) return;
    const latex = wordEqFieldRunsToLatex(field.instruction);
    content.push(latex ? `$${latex}$` : field.result);
    field = null;
  };

  for (const child of elementChildren(paragraph)) {
    const fieldTypes = fieldCharTypes(child);
    const beginCount = fieldTypes.filter((type) => type === "begin").length;
    if (!field && beginCount === 0) {
      content.push(extractInlineContent(child, imageUrl));
      continue;
    }

    if (!field) {
      field = { depth: beginCount, instruction: [], result: "", phase: "instruction" };
    } else {
      field.depth += beginCount;
    }

    if (field.phase === "instruction") {
      field.instruction.push(...instructionRuns(child));
    } else {
      field.result += extractInlineContent(child, imageUrl);
    }

    if (fieldTypes.includes("separate")) field.phase = "result";
    field.depth -= fieldTypes.filter((type) => type === "end").length;
    if (field.depth <= 0) finishField();
  }
  if (field) content.push(field.result);

  return normalizeText(markScriptedMathVariables(content.join(""))).trim();
}

function wordChild(element: Element, localName: string): Element | undefined {
  return elementChildren(element).find(
    (child) => child.namespaceURI === WORD_NS && child.localName === localName,
  );
}

function wordChildren(element: Element, localName: string): Element[] {
  return elementChildren(element).filter(
    (child) => child.namespaceURI === WORD_NS && child.localName === localName,
  );
}

function tableCellSpan(cell: Element): number {
  const properties = wordChild(cell, "tcPr");
  const gridSpan = properties ? wordChild(properties, "gridSpan") : undefined;
  const value = gridSpan?.getAttributeNS(WORD_NS, "val")
    || gridSpan?.getAttribute("w:val")
    || "";
  const span = Number(value);
  return Number.isInteger(span) && span > 1 && span <= 100 ? span : 1;
}

function tableCellVerticalMerge(cell: Element): "restart" | "continue" | null {
  const properties = wordChild(cell, "tcPr");
  const merge = properties ? wordChild(properties, "vMerge") : undefined;
  if (!merge) return null;
  const value = merge.getAttributeNS(WORD_NS, "val") || merge.getAttribute("w:val");
  return value === "restart" ? "restart" : "continue";
}

function extractTableCell(cell: Element, imageUrl?: ImageUrlFactory): string {
  return elementChildren(cell)
    .flatMap((child) => {
      if (child.namespaceURI !== WORD_NS) return [];
      if (child.localName === "p") return [extractParagraph(child, imageUrl)];
      if (child.localName === "tbl") {
        const nested = extractTable(child, imageUrl);
        return nested ? [nested] : [];
      }
      if (["sdt", "sdtContent", "customXml"].includes(child.localName)) {
        return extractBlocks(child, imageUrl);
      }
      return [];
    })
    .filter(Boolean)
    .join("\n");
}

function extractTable(table: Element, imageUrl?: ImageUrlFactory): string {
  const extracted: DocumentTable = [];
  const activeVerticalMerges = new Map<number, DocumentTableCell>();

  for (const rowElement of wordChildren(table, "tr")) {
    const row: DocumentTableCell[] = [];
    const extendedCells = new Set<DocumentTableCell>();
    let column = 0;

    for (const cellElement of wordChildren(rowElement, "tc")) {
      const colSpan = tableCellSpan(cellElement);
      const verticalMerge = tableCellVerticalMerge(cellElement);
      if (verticalMerge === "continue") {
        const merged = activeVerticalMerges.get(column);
        if (merged) {
          if (!extendedCells.has(merged)) {
            merged.rowSpan = (merged.rowSpan || 1) + 1;
            extendedCells.add(merged);
          }
          column += Math.max(colSpan, merged.colSpan || 1);
          continue;
        }
      }

      const cell: DocumentTableCell = {
        content: extractTableCell(cellElement, imageUrl),
        colSpan: colSpan > 1 ? colSpan : undefined,
      };
      row.push(cell);
      for (let offset = 0; offset < colSpan; offset += 1) {
        if (verticalMerge === "restart") {
          activeVerticalMerges.set(column + offset, cell);
        } else {
          activeVerticalMerges.delete(column + offset);
        }
      }
      column += colSpan;
    }

    if (row.length > 0) extracted.push(row);
  }

  return extracted.length > 0
    ? serializeDocumentTable(extracted, renderDocumentTableStructuredCell)
    : "";
}

function extractBlocks(parent: Element, imageUrl?: ImageUrlFactory): string[] {
  const blocks: string[] = [];
  for (const child of elementChildren(parent)) {
    if (child.namespaceURI !== WORD_NS) continue;
    if (child.localName === "p") {
      const paragraph = extractParagraph(child, imageUrl);
      if (paragraph) blocks.push(paragraph);
      continue;
    }
    if (child.localName === "tbl") {
      const table = extractTable(child, imageUrl);
      if (table) blocks.push(table);
      continue;
    }
    if (["sdt", "sdtContent", "customXml"].includes(child.localName)) {
      blocks.push(...extractBlocks(child, imageUrl));
    }
  }
  return blocks;
}

export async function extractDocxStructuredText(
  data: Buffer,
  imageUrl?: ImageUrlFactory,
): Promise<string> {
  const zip = await JSZip.loadAsync(data);
  const documentXml = await zip.file("word/document.xml")?.async("string");
  if (!documentXml) return "";

  const relationshipsXml = await zip
    .file("word/_rels/document.xml.rels")
    ?.async("string");
  const imageExtensions = imageExtensionsByRelationship(relationshipsXml);
  const resolvedImageUrl = imageUrl
    ? (relationshipId: string, displaySize?: ImageDisplaySize | null) =>
        appendImageLayoutHint(
          imageUrl(relationshipId),
          imageExtensions.get(relationshipId),
          displaySize,
        )
    : undefined;

  const document = new DOMParser().parseFromString(
    documentXml,
    "application/xml",
  );
  const body = document.getElementsByTagNameNS(WORD_NS, "body")[0];
  if (!body) return "";

  return normalizeText(extractBlocks(body, resolvedImageUrl).join("\n")).trim();
}

function safeImagePath(target: string): string | null {
  const normalized = posix.normalize(
    posix.join("word", target.replaceAll("\\", "/")),
  );
  if (!normalized.startsWith("word/media/") || normalized.includes(".."))
    return null;
  return normalized;
}

export async function extractDocxImage(
  data: Buffer,
  requestedRelationshipId: string,
): Promise<DocxImageAsset | null> {
  if (!/^rId[\w.-]+$/i.test(requestedRelationshipId)) return null;

  const zip = await JSZip.loadAsync(data);
  const relationshipsXml = await zip
    .file("word/_rels/document.xml.rels")
    ?.async("string");
  if (!relationshipsXml) return null;

  const relationships = new DOMParser().parseFromString(
    relationshipsXml,
    "application/xml",
  );
  const entries = Array.from(
    relationships.getElementsByTagNameNS(PACKAGE_REL_NS, "Relationship"),
  );
  const relationship = entries.find(
    (entry) => entry.getAttribute("Id") === requestedRelationshipId,
  );
  if (!relationship || relationship.getAttribute("TargetMode") === "External")
    return null;
  if (!relationship.getAttribute("Type")?.endsWith("/image")) return null;

  const target = relationship.getAttribute("Target") || "";
  const imagePath = safeImagePath(target);
  if (!imagePath) return null;
  const file = zip.file(imagePath);
  if (!file) return null;

  const extension = extname(imagePath).toLowerCase();
  const contentType = IMAGE_MIME_TYPES[extension];
  if (!contentType) return null;

  return {
    data: await file.async("nodebuffer"),
    contentType,
    fileName: posix.basename(imagePath),
  };
}
