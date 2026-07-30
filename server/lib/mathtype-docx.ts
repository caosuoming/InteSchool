import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { posix, join } from "node:path";
import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
import JSZip from "jszip";
import { mml2omml } from "mathml2omml";

const WORD_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const OFFICE_NS = "urn:schemas-microsoft-com:office:office";
const OFFICE_REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const PACKAGE_REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships";
const MAX_EQUATION_COUNT = 512;
const MAX_EQUATION_BYTES = 10 * 1024 * 1024;
const MAX_TOTAL_EQUATION_BYTES = 50 * 1024 * 1024;
const CONVERSION_TIMEOUT_MS = 30_000;
const MAX_CONVERTER_OUTPUT_BYTES = 16 * 1024 * 1024;

interface MathTypeCandidate {
  relationshipId: string;
  embeddingPath: string;
  objectElement: Element;
  runElement: Element | null;
  data: Buffer;
}

interface DocumentRelationships {
  document: Document;
  targets: Map<string, string>;
  entries: Map<string, Element>;
}

export interface MathTypeEquation {
  relationshipId: string;
  data: Buffer;
}

export type MathTypeDecoder = (
  equations: MathTypeEquation[],
) => Promise<Map<string, string>>;

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

function relationshipId(element: Element): string {
  return element.getAttributeNS(OFFICE_REL_NS, "id")
    || element.getAttribute("r:id")
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

function safeEmbeddingPath(target: string): string | null {
  const normalized = posix.normalize(posix.join("word", target.replaceAll("\\", "/")));
  if (!normalized.startsWith("word/embeddings/") || normalized.includes("..")) return null;
  return normalized;
}

function parseRelationships(xml: string): DocumentRelationships {
  const document = new DOMParser().parseFromString(xml, "application/xml");
  const targets = new Map<string, string>();
  const entriesById = new Map<string, Element>();
  const entries = Array.from(document.getElementsByTagNameNS(PACKAGE_REL_NS, "Relationship"));
  for (const entry of entries) {
    if (entry.getAttribute("TargetMode") === "External") continue;
    const id = entry.getAttribute("Id") || "";
    const target = entry.getAttribute("Target") || "";
    if (!id || !target) continue;
    targets.set(id, target);
    entriesById.set(id, entry);
  }
  return { document, targets, entries: entriesById };
}

function hasOnlyObjectContent(run: Element, objectElement: Element): boolean {
  return elementChildren(run).every((child) =>
    child === objectElement
    || (child.namespaceURI === WORD_NS && child.localName === "rPr"));
}

function replaceObjectWithOmml(
  document: Document,
  candidate: MathTypeCandidate,
  omml: string,
): boolean {
  const ommlDocument = new DOMParser().parseFromString(omml, "application/xml");
  const root = ommlDocument.documentElement;
  if (!root || root.localName !== "oMath") return false;

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

async function collectCandidates(
  zip: JSZip,
  document: Document,
  relationships: Map<string, string>,
): Promise<MathTypeCandidate[]> {
  const candidates: MathTypeCandidate[] = [];
  const embeddingData = new Map<string, Buffer>();
  let totalEquationBytes = 0;
  const objects = Array.from(document.getElementsByTagNameNS(WORD_NS, "object"));

  for (const objectElement of objects) {
    if (candidates.length >= MAX_EQUATION_COUNT) break;
    const oleObjects = Array.from(objectElement.getElementsByTagNameNS(OFFICE_NS, "OLEObject"));
    const ole = oleObjects.find((entry) => isMathTypeProgId(entry.getAttribute("ProgID") || ""));
    if (!ole) continue;

    const id = relationshipId(ole);
    if (!isSafeRelationshipId(id)) continue;
    const target = relationships.get(id);
    const embeddingPath = target ? safeEmbeddingPath(target) : null;
    if (!embeddingPath) continue;

    let data = embeddingData.get(embeddingPath);
    if (!data) {
      const embedded = zip.file(embeddingPath);
      if (!embedded) continue;
      data = await embedded.async("nodebuffer");
      if (data.length === 0 || data.length > MAX_EQUATION_BYTES) continue;
      totalEquationBytes += data.length;
      if (totalEquationBytes > MAX_TOTAL_EQUATION_BYTES) break;
      embeddingData.set(embeddingPath, data);
    }
    candidates.push({
      relationshipId: id,
      embeddingPath,
      objectElement,
      runElement: nearestWordRun(objectElement),
      data,
    });
  }

  return candidates;
}

const RUBY_CONVERTER = String.raw`
require "json"
require "mathtype_to_mathml_plus"

result = {}
ARGV.each do |path|
  key = File.basename(path, ".bin")
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

async function runRubyConverter(
  paths: Array<{ relationshipId: string; path: string }>,
): Promise<Map<string, string>> {
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
      fail(new Error("MathType 转换超时"));
    }, CONVERSION_TIMEOUT_MS);

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
      if (stderr.length < 8_192) stderr += chunk.toString("utf8");
    });
    child.on("error", (error) => fail(new Error(`无法启动 MathType 转换器：${error.message}`)));
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`MathType 转换器退出异常（${code ?? "unknown"}）：${stderr.trim()}`));
        return;
      }
      try {
        const payload = JSON.parse(stdout) as Record<string, RubyResult>;
        const result = new Map<string, string>();
        for (const item of paths) {
          const converted = payload[item.relationshipId];
          if (typeof converted?.mathml === "string" && converted.mathml.trim()) {
            result.set(item.relationshipId, converted.mathml);
          }
        }
        resolve(result);
      } catch (error) {
        reject(new Error(`MathType 转换器返回无效结果：${error instanceof Error ? error.message : "未知错误"}`));
      }
    });
  });
}

export const decodeMathTypeEquations: MathTypeDecoder = async (equations) => {
  if (equations.length === 0) return new Map();
  const directory = await mkdtemp(join(tmpdir(), "inteschool-mathtype-"));
  try {
    const paths: Array<{ relationshipId: string; path: string }> = [];
    for (const equation of equations) {
      const path = join(directory, `${equation.relationshipId}.bin`);
      await writeFile(path, equation.data, { mode: 0o600 });
      paths.push({ relationshipId: equation.relationshipId, path });
    }
    return await runRubyConverter(paths);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
};

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
  const candidates = await collectCandidates(zip, document, relationships.targets);
  if (candidates.length === 0) {
    return { buffer: input, detectedCount: 0, convertedCount: 0, failedCount: 0, warnings };
  }

  let mathmlByRelationship: Map<string, string>;
  try {
    const uniqueEquations = new Map<string, Buffer>();
    for (const candidate of candidates) uniqueEquations.set(candidate.relationshipId, candidate.data);
    mathmlByRelationship = await decoder(Array.from(uniqueEquations, ([id, data]) => ({
      relationshipId: id,
      data,
    })));
  } catch (error) {
    warnings.push(error instanceof Error ? error.message : "MathType 转换失败");
    return {
      buffer: input,
      detectedCount: candidates.length,
      convertedCount: 0,
      failedCount: candidates.length,
      warnings,
    };
  }

  let convertedCount = 0;
  const convertedByRelationship = new Map<string, number>();
  const totalByRelationship = new Map<string, number>();
  for (const candidate of candidates) {
    totalByRelationship.set(
      candidate.relationshipId,
      (totalByRelationship.get(candidate.relationshipId) || 0) + 1,
    );
    const mathml = mathmlByRelationship.get(candidate.relationshipId);
    if (!mathml) continue;
    try {
      const omml = mml2omml(mathml);
      if (replaceObjectWithOmml(document, candidate, omml)) {
        convertedCount += 1;
        convertedByRelationship.set(
          candidate.relationshipId,
          (convertedByRelationship.get(candidate.relationshipId) || 0) + 1,
        );
      }
    } catch (error) {
      warnings.push(
        `公式 ${candidate.relationshipId} 转换失败：${error instanceof Error ? error.message : "未知错误"}`,
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
      warnings,
    };
  }

  const removedRelationshipIds = new Set<string>();
  for (const [id, total] of totalByRelationship) {
    if (convertedByRelationship.get(id) !== total) continue;
    const entry = relationships.entries.get(id);
    entry?.parentNode?.removeChild(entry);
    removedRelationshipIds.add(id);
  }
  const candidateEmbeddingPaths = new Set(candidates.map((candidate) => candidate.embeddingPath));
  for (const embeddingPath of candidateEmbeddingPaths) {
    const stillReferenced = Array.from(relationships.targets).some(([id, target]) =>
      !removedRelationshipIds.has(id) && safeEmbeddingPath(target) === embeddingPath);
    if (!stillReferenced) zip.remove(embeddingPath);
  }

  const serializer = new XMLSerializer();
  zip.file("word/document.xml", serializer.serializeToString(document));
  zip.file("word/_rels/document.xml.rels", serializer.serializeToString(relationships.document));
  return {
    buffer: await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }),
    detectedCount: candidates.length,
    convertedCount,
    failedCount,
    warnings,
  };
}
