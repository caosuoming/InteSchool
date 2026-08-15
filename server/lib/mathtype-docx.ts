import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join, posix } from "node:path";
import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
import JSZip from "jszip";
import { mml2omml } from "mathml2omml";

const WORD_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const MATH_NS = "http://schemas.openxmlformats.org/officeDocument/2006/math";
const OFFICE_NS = "urn:schemas-microsoft-com:office:office";
const VML_NS = "urn:schemas-microsoft-com:vml";
const DRAWING_NS = "http://schemas.openxmlformats.org/drawingml/2006/main";
const OFFICE_REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const PACKAGE_REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships";
const MAX_EQUATION_COUNT = 2_048;
const MAX_CONVERTER_BATCH_SIZE = 128;
const MAX_EQUATION_BYTES = 10 * 1024 * 1024;
const MAX_TOTAL_EQUATION_BYTES = 50 * 1024 * 1024;
const MIN_CONVERSION_TIMEOUT_MS = 30_000;
const MAX_CONVERSION_TIMEOUT_MS = 120_000;
const CONVERSION_TIMEOUT_PER_EQUATION_MS = 250;
const MAX_CONVERTER_OUTPUT_BYTES = 32 * 1024 * 1024;

export type MathTypeEquationFormat = "ole" | "wmf";

interface MathTypeCandidate {
  relationshipId: string;
  embeddingRelationshipId: string | null;
  embeddingPath: string | null;
  previewRelationshipId: string | null;
  previewPath: string | null;
  objectElement: Element;
  runElement: Element | null;
  data: Buffer | null;
  previewData: Buffer | null;
}

interface DocumentRelationships {
  document: Document;
  targets: Map<string, string>;
  types: Map<string, string>;
  entries: Map<string, Element>;
}

export interface MathTypeEquation {
  relationshipId: string;
  data: Buffer;
  format?: MathTypeEquationFormat;
}

export interface MathTypeDecodeResult {
  mathml: Map<string, string>;
  errors: Map<string, string>;
}

export type MathTypeDecoder = (
  equations: MathTypeEquation[],
) => Promise<Map<string, string> | MathTypeDecodeResult>;

export interface MathTypeRuntimeStatus {
  available: boolean;
  message: string;
}

export interface MathTypeDocxConversionResult {
  buffer: Buffer;
  detectedCount: number;
  convertedCount: number;
  failedCount: number;
  warnings: string[];
}

function elementChildren(node: Node): Element[] {
  return Array.from(node.childNodes)
    .filter((child): child is Element => child.nodeType === 1);
}

function relationshipId(element: Element, attribute = "id"): string {
  return element.getAttributeNS(OFFICE_REL_NS, attribute)
    || element.getAttribute(`r:${attribute}`)
    || (attribute === "id"
      ? element.getAttributeNS(OFFICE_NS, "relid") || element.getAttribute("o:relid")
      : "")
    || "";
}

function isMathTypeProgId(value: string): boolean {
  return /(?:mathtype|equation)/i.test(value);
}

function isSafeRelationshipId(value: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_.-]{0,127}$/.test(value);
}

function nearestWordRun(element: Element): Element | null {
  let current = element.parentNode;
  while (current && current.nodeType === 1) {
    const parent = current as Element;
    if (parent.namespaceURI === WORD_NS && parent.localName === "r") return parent;
    current = parent.parentNode;
  }
  return null;
}

function directChildOfRun(element: Element, run: Element | null): Element | null {
  if (!run) return null;
  let current: Node = element;
  while (current.parentNode && current.parentNode !== run) current = current.parentNode;
  return current.parentNode === run && current.nodeType === 1 ? current as Element : null;
}

function safePartPath(target: string, prefix: "embeddings" | "media"): string | null {
  const normalized = posix.normalize(posix.join("word", target.replaceAll("\\", "/")));
  if (!normalized.startsWith(`word/${prefix}/`) || normalized.includes("..")) return null;
  return normalized;
}

function safeCandidatePartPath(target: string): string | null {
  return safePartPath(target, "embeddings") || safePartPath(target, "media");
}

function parseRelationships(xml: string): DocumentRelationships {
  const document = new DOMParser().parseFromString(xml, "application/xml");
  const targets = new Map<string, string>();
  const types = new Map<string, string>();
  const entriesById = new Map<string, Element>();
  const entries = Array.from(document.getElementsByTagNameNS(PACKAGE_REL_NS, "Relationship"));
  for (const entry of entries) {
    if (entry.getAttribute("TargetMode") === "External") continue;
    const id = entry.getAttribute("Id") || "";
    const target = entry.getAttribute("Target") || "";
    if (!id || !target) continue;
    targets.set(id, target);
    types.set(id, entry.getAttribute("Type") || "");
    entriesById.set(id, entry);
  }
  return { document, targets, types, entries: entriesById };
}

function hasOnlyObjectContent(run: Element, objectElement: Element): boolean {
  return elementChildren(run).every((child) =>
    child === objectElement
    || (child.namespaceURI === WORD_NS && child.localName === "rPr"));
}

function directWordRunProperties(run: Element | null): Element | null {
  if (!run) return null;
  return elementChildren(run).find((child) =>
    child.namespaceURI === WORD_NS && child.localName === "rPr") || null;
}

function directWordProperty(runProperties: Element | null, localName: string): Element | null {
  if (!runProperties) return null;
  return elementChildren(runProperties).find((child) =>
    child.namespaceURI === WORD_NS && child.localName === localName) || null;
}

function applyMathRunFormatting(root: Element, sourceRun: Element | null): void {
  const document = root.ownerDocument;
  if (!document) return;
  const sourceProperties = directWordRunProperties(sourceRun);
  const copiedProperties = ["b", "bCs", "i", "iCs", "color", "sz", "szCs"];

  for (const mathRun of Array.from(root.getElementsByTagNameNS(MATH_NS, "r"))) {
    for (const child of [...elementChildren(mathRun)]) {
      if (child.namespaceURI === WORD_NS && child.localName === "rPr") {
        mathRun.removeChild(child);
      }
    }

    const runProperties = document.createElementNS(WORD_NS, "w:rPr");
    const fonts = document.createElementNS(WORD_NS, "w:rFonts");
    for (const attribute of ["ascii", "hAnsi", "eastAsia", "cs"]) {
      fonts.setAttributeNS(WORD_NS, `w:${attribute}`, "Cambria Math");
    }
    runProperties.appendChild(fonts);

    for (const name of copiedProperties) {
      const source = directWordProperty(sourceProperties, name);
      if (source) runProperties.appendChild(source.cloneNode(true));
    }

    // MathType OLE previews can carry baseline offsets that no longer apply
    // after conversion. Explicitly use the text baseline so native Word math
    // remains vertically aligned with adjacent text.
    const position = document.createElementNS(WORD_NS, "w:position");
    position.setAttributeNS(WORD_NS, "w:val", "0");
    runProperties.appendChild(position);

    const text = elementChildren(mathRun).find((child) =>
      child.namespaceURI === MATH_NS && child.localName === "t") || null;
    mathRun.insertBefore(runProperties, text);
  }
}

function replaceObjectWithOmml(
  candidate: MathTypeCandidate,
  omml: string,
): boolean {
  const ommlDocument = new DOMParser().parseFromString(omml, "application/xml");
  const root = ommlDocument.documentElement;
  if (!root || root.localName !== "oMath") return false;

  applyMathRunFormatting(root, candidate.runElement);
  const replacement = root.cloneNode(true);
  const run = candidate.runElement;
  if (run?.parentNode && hasOnlyObjectContent(run, candidate.objectElement)) {
    run.parentNode.replaceChild(replacement, run);
    return true;
  }

  const parent = candidate.objectElement.parentNode;
  if (!parent) return false;
  parent.replaceChild(replacement, candidate.objectElement);
  return true;
}

const OLE_SIGNATURE = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
const EQUATION_NATIVE_UTF16 = Buffer.from("Equation Native", "utf16le");
const MATHTYPE_ASCII = Buffer.from("MathType", "ascii");
const WMF_MATHTYPE_SIGNATURES = [Buffer.from("MathTypeUU", "ascii"), Buffer.from("AppsMFCC\x01", "binary")];

function looksLikeMathTypeOle(data: Buffer): boolean {
  return data.subarray(0, OLE_SIGNATURE.length).equals(OLE_SIGNATURE)
    && (data.includes(EQUATION_NATIVE_UTF16) || data.includes(MATHTYPE_ASCII));
}

function looksLikeMathTypeWmf(data: Buffer): boolean {
  return WMF_MATHTYPE_SIGNATURES.some((signature) => data.includes(signature));
}

async function collectCandidates(
  zip: JSZip,
  document: Document,
  relationships: DocumentRelationships,
): Promise<MathTypeCandidate[]> {
  const candidates: MathTypeCandidate[] = [];
  const partData = new Map<string, Buffer>();
  let totalEquationBytes = 0;

  const readPart = async (path: string | null): Promise<Buffer | null> => {
    if (!path) return null;
    const cached = partData.get(path);
    if (cached) return cached;
    const file = zip.file(path);
    if (!file) return null;
    const data = await file.async("nodebuffer");
    if (data.length === 0 || data.length > MAX_EQUATION_BYTES) return null;
    totalEquationBytes += data.length;
    if (totalEquationBytes > MAX_TOTAL_EQUATION_BYTES) return null;
    partData.set(path, data);
    return data;
  };

  const objects = Array.from(document.getElementsByTagNameNS(WORD_NS, "object"));
  for (const objectElement of objects) {
    if (candidates.length >= MAX_EQUATION_COUNT || totalEquationBytes > MAX_TOTAL_EQUATION_BYTES) break;

    const oleObjects = Array.from(objectElement.getElementsByTagNameNS(OFFICE_NS, "OLEObject"));
    const explicitOle = oleObjects.find((entry) => isMathTypeProgId(entry.getAttribute("ProgID") || ""));
    const ole = explicitOle || oleObjects[0] || null;
    const oleId = ole ? relationshipId(ole) : "";
    const oleTarget = isSafeRelationshipId(oleId) ? relationships.targets.get(oleId) : undefined;
    const embeddingPath = oleTarget ? safePartPath(oleTarget, "embeddings") : null;
    const data = await readPart(embeddingPath);

    const previewElements = Array.from(objectElement.getElementsByTagNameNS(VML_NS, "imagedata"));
    const previewElement = previewElements.find((entry) => isSafeRelationshipId(relationshipId(entry))) || null;
    const previewId = previewElement ? relationshipId(previewElement) : "";
    const previewTarget = previewId ? relationships.targets.get(previewId) : undefined;
    const previewPath = previewTarget ? safePartPath(previewTarget, "media") : null;
    const previewData = previewPath && extname(previewPath).toLowerCase() === ".wmf"
      ? await readPart(previewPath)
      : null;

    const explicitMathType = Boolean(explicitOle);
    const detectedFromOle = Boolean(data && looksLikeMathTypeOle(data));
    const detectedFromPreview = Boolean(previewData && looksLikeMathTypeWmf(previewData));
    const oleRelationshipType = oleId ? relationships.types.get(oleId) || "" : "";
    const isOleRelationship = oleRelationshipType.endsWith("/oleObject");
    if (!explicitMathType && !(isOleRelationship && detectedFromOle) && !detectedFromPreview) continue;

    const primaryId = isSafeRelationshipId(oleId)
      ? oleId
      : isSafeRelationshipId(previewId)
        ? previewId
        : "";
    if (!primaryId || (!data && !previewData)) continue;

    candidates.push({
      relationshipId: primaryId,
      embeddingRelationshipId: isSafeRelationshipId(oleId) ? oleId : null,
      embeddingPath,
      previewRelationshipId: isSafeRelationshipId(previewId) ? previewId : null,
      previewPath,
      objectElement,
      runElement: nearestWordRun(objectElement),
      data,
      previewData,
    });
  }

  const claimedPreviewIds = new Set(
    candidates
      .map((candidate) => candidate.previewRelationshipId)
      .filter((id): id is string => Boolean(id)),
  );
  const standaloneImages = [
    ...Array.from(document.getElementsByTagNameNS(DRAWING_NS, "blip"))
      .map((element) => ({ element, id: relationshipId(element, "embed") })),
    ...Array.from(document.getElementsByTagNameNS(VML_NS, "imagedata"))
      .map((element) => ({ element, id: relationshipId(element) })),
  ];
  for (const { element, id } of standaloneImages) {
    if (candidates.length >= MAX_EQUATION_COUNT || totalEquationBytes > MAX_TOTAL_EQUATION_BYTES) break;
    if (!isSafeRelationshipId(id) || claimedPreviewIds.has(id)) continue;
    const relationshipType = relationships.types.get(id) || "";
    if (!relationshipType.endsWith("/image")) continue;
    const target = relationships.targets.get(id);
    const previewPath = target ? safePartPath(target, "media") : null;
    if (!previewPath || extname(previewPath).toLowerCase() !== ".wmf") continue;
    const previewData = await readPart(previewPath);
    if (!previewData || !looksLikeMathTypeWmf(previewData)) continue;
    const runElement = nearestWordRun(element);
    const replacementElement = directChildOfRun(element, runElement);
    if (!runElement || !replacementElement
      || !hasOnlyObjectContent(runElement, replacementElement)) continue;

    candidates.push({
      relationshipId: id,
      embeddingRelationshipId: null,
      embeddingPath: null,
      previewRelationshipId: id,
      previewPath,
      objectElement: replacementElement,
      runElement,
      data: null,
      previewData,
    });
    claimedPreviewIds.add(id);
  }

  return candidates;
}

const RUBY_CONVERTER = String.raw`
require "json"
require "mathtype_to_mathml_plus"

result = {}
ARGV.each do |path|
  key = File.basename(path, File.extname(path))
  begin
    result[key] = { "mathml" => MathTypeToMathMLPlus::Converter.new(path).convert }
  rescue => error
    result[key] = { "error" => "#{error.class}: #{error.message}" }
  end
end
STDOUT.write(JSON.generate(result))
`;

interface RubyResult {
  mathml?: unknown;
  error?: unknown;
}

function converterTimeout(pathCount: number): number {
  return Math.min(
    MAX_CONVERSION_TIMEOUT_MS,
    Math.max(MIN_CONVERSION_TIMEOUT_MS, 20_000 + pathCount * CONVERSION_TIMEOUT_PER_EQUATION_MS),
  );
}

function unavailableConverterMessage(stderr: string): string | null {
  if (/cannot load such file\s+--\s+mathtype_to_mathml_plus/i.test(stderr)) {
    return "MathType 转换器不可用：未安装 mathtype_to_mathml_plus 0.0.16";
  }
  return null;
}

async function runRubyConverter(
  paths: Array<{ relationshipId: string; path: string }>,
): Promise<MathTypeDecodeResult> {
  return new Promise((resolve, reject) => {
    const child = spawn("ruby", ["-W0", "-e", RUBY_CONVERTER, ...paths.map((item) => item.path)], {
      env: { ...process.env, RUBYOPT: "-W0" },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    let outputBytes = 0;
    let settled = false;

    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    };

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      fail(new Error(`MathType 转换超时（${paths.length} 个公式）`));
    }, converterTimeout(paths.length));

    child.stdout.on("data", (chunk: Buffer) => {
      outputBytes += chunk.length;
      if (outputBytes > MAX_CONVERTER_OUTPUT_BYTES) {
        child.kill("SIGKILL");
        fail(new Error("MathType 转换输出过大"));
        return;
      }
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      if (stderr.length < 32_768) stderr += chunk.toString("utf8");
    });
    child.on("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") {
        fail(new Error("MathType 转换器不可用：未找到 Ruby 运行时"));
        return;
      }
      fail(new Error(`无法启动 MathType 转换器：${error.message}`));
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(
          unavailableConverterMessage(stderr)
          || `MathType 转换器退出异常（${code ?? "unknown"}）：${stderr.trim() || "无错误输出"}`,
        ));
        return;
      }
      try {
        const payload = JSON.parse(stdout) as Record<string, RubyResult>;
        const mathml = new Map<string, string>();
        const errors = new Map<string, string>();
        for (const item of paths) {
          const converted = payload[item.relationshipId];
          if (typeof converted?.mathml === "string" && converted.mathml.trim()) {
            mathml.set(item.relationshipId, converted.mathml);
          } else if (typeof converted?.error === "string" && converted.error.trim()) {
            errors.set(item.relationshipId, converted.error.trim());
          } else {
            errors.set(item.relationshipId, "转换器未返回公式结果");
          }
        }
        resolve({ mathml, errors });
      } catch (error) {
        reject(new Error(`MathType 转换器返回无效结果：${error instanceof Error ? error.message : "未知错误"}`));
      }
    });
  });
}

function normalizeDecodeResult(result: Map<string, string> | MathTypeDecodeResult): MathTypeDecodeResult {
  if (result instanceof Map) return { mathml: result, errors: new Map() };
  return result;
}

export const decodeMathTypeEquations: MathTypeDecoder = async (equations) => {
  if (equations.length === 0) return { mathml: new Map(), errors: new Map() };
  const directory = await mkdtemp(join(tmpdir(), "inteschool-mathtype-"));
  try {
    const paths: Array<{ relationshipId: string; path: string }> = [];
    for (const equation of equations) {
      const extension = equation.format === "wmf" ? ".wmf" : ".bin";
      const path = join(directory, `${equation.relationshipId}${extension}`);
      await writeFile(path, equation.data, { mode: 0o600 });
      paths.push({ relationshipId: equation.relationshipId, path });
    }
    const mathml = new Map<string, string>();
    const errors = new Map<string, string>();
    for (let offset = 0; offset < paths.length; offset += MAX_CONVERTER_BATCH_SIZE) {
      const result = await runRubyConverter(paths.slice(offset, offset + MAX_CONVERTER_BATCH_SIZE));
      for (const [id, value] of result.mathml) mathml.set(id, value);
      for (const [id, value] of result.errors) errors.set(id, value);
    }
    return { mathml, errors };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
};

let runtimeProbe: Promise<MathTypeRuntimeStatus> | null = null;

export function probeMathTypeRuntime(): Promise<MathTypeRuntimeStatus> {
  if (runtimeProbe) return runtimeProbe;
  runtimeProbe = new Promise((resolve) => {
    const child = spawn(
      "ruby",
      ["-W0", "-e", 'require "mathtype_to_mathml_plus"; STDOUT.write("ok")'],
      { env: { ...process.env, RUBYOPT: "-W0" }, stdio: ["ignore", "pipe", "pipe"], windowsHide: true },
    );
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (status: MathTypeRuntimeStatus) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(status);
    };
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish({ available: false, message: "MathType 转换器自检超时" });
    }, 10_000);
    child.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString("utf8"); });
    child.stderr.on("data", (chunk: Buffer) => { if (stderr.length < 8_192) stderr += chunk.toString("utf8"); });
    child.on("error", (error: NodeJS.ErrnoException) => finish({
      available: false,
      message: error.code === "ENOENT"
        ? "未找到 Ruby 运行时"
        : `无法启动 Ruby：${error.message}`,
    }));
    child.on("close", (code) => {
      if (code === 0 && stdout === "ok") {
        finish({ available: true, message: "available" });
        return;
      }
      finish({
        available: false,
        message: unavailableConverterMessage(stderr) || stderr.trim() || `转换器退出码 ${code ?? "unknown"}`,
      });
    });
  });
  return runtimeProbe;
}

function documentReferencesRelationship(document: Document, id: string): boolean {
  const elements = Array.from(document.getElementsByTagName("*"));
  return elements.some((element) => Array.from(element.attributes).some((attribute) =>
    attribute.namespaceURI === OFFICE_REL_NS && attribute.value === id));
}

async function decodeCandidates(
  candidates: MathTypeCandidate[],
  decoder: MathTypeDecoder,
  warnings: string[],
): Promise<Map<string, string>> {
  const mathml = new Map<string, string>();
  const errors = new Map<string, string>();

  const primary = new Map<string, MathTypeEquation>();
  for (const candidate of candidates) {
    if (candidate.data) {
      primary.set(candidate.relationshipId, {
        relationshipId: candidate.relationshipId,
        data: candidate.data,
        format: "ole",
      });
    }
  }

  if (primary.size > 0) {
    try {
      const result = normalizeDecodeResult(await decoder([...primary.values()]));
      for (const [id, value] of result.mathml) mathml.set(id, value);
      for (const [id, value] of result.errors) errors.set(id, value);
    } catch (error) {
      warnings.push(error instanceof Error ? error.message : "MathType OLE 转换失败");
    }
  }

  const previews = new Map<string, MathTypeEquation>();
  for (const candidate of candidates) {
    if (!mathml.has(candidate.relationshipId) && candidate.previewData) {
      previews.set(candidate.relationshipId, {
        relationshipId: candidate.relationshipId,
        data: candidate.previewData,
        format: "wmf",
      });
    }
  }

  if (previews.size > 0) {
    try {
      const result = normalizeDecodeResult(await decoder([...previews.values()]));
      for (const [id, value] of result.mathml) {
        mathml.set(id, value);
        errors.delete(id);
      }
      for (const [id, value] of result.errors) {
        if (!mathml.has(id)) errors.set(id, value);
      }
    } catch (error) {
      warnings.push(error instanceof Error ? error.message : "MathType WMF 回退转换失败");
    }
  }

  for (const candidate of candidates) {
    const error = errors.get(candidate.relationshipId);
    if (error && !mathml.has(candidate.relationshipId)) {
      warnings.push(`公式 ${candidate.relationshipId} 解码失败：${error}`);
    }
  }
  return mathml;
}

export async function convertMathTypeDocxToOmml(
  input: Buffer,
  decoder: MathTypeDecoder = decodeMathTypeEquations,
): Promise<MathTypeDocxConversionResult> {
  const warnings: string[] = [];
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(input);
  } catch {
    return {
      buffer: input,
      detectedCount: 0,
      convertedCount: 0,
      failedCount: 0,
      warnings: ["无法读取 DOCX 压缩包，已保留原始文档"],
    };
  }

  const documentXml = await zip.file("word/document.xml")?.async("string");
  const relationshipsXml = await zip.file("word/_rels/document.xml.rels")?.async("string");
  if (!documentXml || !relationshipsXml) {
    return { buffer: input, detectedCount: 0, convertedCount: 0, failedCount: 0, warnings };
  }

  const document = new DOMParser().parseFromString(documentXml, "application/xml");
  const relationships = parseRelationships(relationshipsXml);
  const candidates = await collectCandidates(zip, document, relationships);
  if (candidates.length === 0) {
    return { buffer: input, detectedCount: 0, convertedCount: 0, failedCount: 0, warnings };
  }

  const mathmlByRelationship = await decodeCandidates(candidates, decoder, warnings);
  let convertedCount = 0;
  for (const candidate of candidates) {
    const mathml = mathmlByRelationship.get(candidate.relationshipId);
    if (!mathml) continue;
    try {
      const omml = mml2omml(mathml);
      if (replaceObjectWithOmml(candidate, omml)) convertedCount += 1;
    } catch (error) {
      warnings.push(
        `公式 ${candidate.relationshipId} 转换为微软公式失败：${error instanceof Error ? error.message : "未知错误"}`,
      );
    }
  }

  const failedCount = candidates.length - convertedCount;
  if (failedCount > 0) warnings.push(`有 ${failedCount} 个 MathType 公式保留为原始对象`);
  if (convertedCount === 0) {
    return {
      buffer: input,
      detectedCount: candidates.length,
      convertedCount,
      failedCount,
      warnings: [...new Set(warnings)],
    };
  }

  const candidateRelationshipIds = new Set<string>();
  for (const candidate of candidates) {
    if (candidate.embeddingRelationshipId) candidateRelationshipIds.add(candidate.embeddingRelationshipId);
    if (candidate.previewRelationshipId) candidateRelationshipIds.add(candidate.previewRelationshipId);
  }

  const removedRelationshipIds = new Set<string>();
  for (const id of candidateRelationshipIds) {
    if (documentReferencesRelationship(document, id)) continue;
    const entry = relationships.entries.get(id);
    entry?.parentNode?.removeChild(entry);
    removedRelationshipIds.add(id);
  }

  const removablePartPaths = new Set<string>();
  for (const id of removedRelationshipIds) {
    const target = relationships.targets.get(id);
    const path = target ? safeCandidatePartPath(target) : null;
    if (path) removablePartPaths.add(path);
  }
  for (const path of removablePartPaths) {
    const stillReferenced = Array.from(relationships.targets).some(([id, target]) =>
      !removedRelationshipIds.has(id) && safeCandidatePartPath(target) === path);
    if (!stillReferenced) zip.remove(path);
  }

  const serializer = new XMLSerializer();
  zip.file("word/document.xml", serializer.serializeToString(document));
  zip.file("word/_rels/document.xml.rels", serializer.serializeToString(relationships.document));
  return {
    buffer: await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }),
    detectedCount: candidates.length,
    convertedCount,
    failedCount,
    warnings: [...new Set(warnings)],
  };
}
