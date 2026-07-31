import JSZip from "jszip";
import { DOMParser } from "@xmldom/xmldom";
import { extname, posix } from "node:path";
import { ommlToLatex } from "../../src/lib/omml-to-latex.js";

const WORD_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const MATH_NS = "http://schemas.openxmlformats.org/officeDocument/2006/math";
const DRAWING_NS = "http://schemas.openxmlformats.org/drawingml/2006/main";
const VML_NS = "urn:schemas-microsoft-com:vml";
const OFFICE_REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const PACKAGE_REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships";
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

type ImageUrlFactory = (relationshipId: string) => string;

function imageExtensionsByRelationship(xml: string | undefined): Map<string, string> {
  const extensions = new Map<string, string>();
  if (!xml) return extensions;
  const relationships = new DOMParser().parseFromString(xml, "application/xml");
  const entries = Array.from(relationships.getElementsByTagNameNS(PACKAGE_REL_NS, "Relationship"));
  for (const entry of entries) {
    if (entry.getAttribute("TargetMode") === "External") continue;
    if (!entry.getAttribute("Type")?.endsWith("/image")) continue;
    const id = entry.getAttribute("Id") || "";
    const extension = extname(entry.getAttribute("Target") || "").toLowerCase();
    if (id && extension) extensions.set(id, extension);
  }
  return extensions;
}

function appendMetafileHint(url: string, extension: string | undefined): string {
  if (![".wmf", ".emf"].includes(extension || "")) return url;
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}officeMetafile=${extension!.slice(1)}`;
}

function elementChildren(node: Node): Element[] {
  return Array.from(node.childNodes)
    .filter((child): child is Element => child.nodeType === ELEMENT_NODE);
}

function normalizeText(value: string): string {
  return value
    .normalize("NFC")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n");
}

function relationshipId(element: Element, attribute: "embed" | "id"): string {
  return element.getAttributeNS(OFFICE_REL_NS, attribute)
    || element.getAttribute(`r:${attribute}`)
    || "";
}

function extractInlineContent(node: Node, imageUrl?: ImageUrlFactory): string {
  if (node.nodeType !== ELEMENT_NODE) return node.textContent || "";
  const element = node as Element;

  if (element.namespaceURI === MATH_NS && ["oMath", "oMathPara"].includes(element.localName)) {
    const latex = ommlToLatex(element).trim();
    return latex ? `$${latex}$` : "";
  }
  if (imageUrl && element.namespaceURI === DRAWING_NS && element.localName === "blip") {
    const id = relationshipId(element, "embed");
    return id ? `![文档图片](${imageUrl(id)})` : "";
  }
  if (imageUrl && element.namespaceURI === VML_NS && element.localName === "imagedata") {
    const id = relationshipId(element, "id");
    return id ? `![文档图片](${imageUrl(id)})` : "";
  }
  if (element.namespaceURI === WORD_NS) {
    if (element.localName === "t") return element.textContent || "";
    if (element.localName === "tab") return "\t";
    if (["br", "cr"].includes(element.localName)) return "\n";
    if (element.localName === "noBreakHyphen") return "‑";
    if (element.localName === "softHyphen") return "­";
  }

  return elementChildren(element).map((child) => extractInlineContent(child, imageUrl)).join("");
}

function extractParagraph(paragraph: Element, imageUrl?: ImageUrlFactory): string {
  return normalizeText(
    elementChildren(paragraph).map((child) => extractInlineContent(child, imageUrl)).join(""),
  ).trim();
}

function extractTable(table: Element, imageUrl?: ImageUrlFactory): string[] {
  const rows = Array.from(table.getElementsByTagNameNS(WORD_NS, "tr"));
  return rows.map((row) => {
    const cells = Array.from(row.getElementsByTagNameNS(WORD_NS, "tc"));
    return cells.map((cell) => {
      const paragraphs = Array.from(cell.getElementsByTagNameNS(WORD_NS, "p"));
      return paragraphs.map((paragraph) => extractParagraph(paragraph, imageUrl)).filter(Boolean).join(" ");
    }).join("\t");
  }).filter((row) => row.trim().length > 0);
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
      blocks.push(...extractTable(child, imageUrl));
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

  const relationshipsXml = await zip.file("word/_rels/document.xml.rels")?.async("string");
  const imageExtensions = imageExtensionsByRelationship(relationshipsXml);
  const resolvedImageUrl = imageUrl
    ? (relationshipId: string) => appendMetafileHint(imageUrl(relationshipId), imageExtensions.get(relationshipId))
    : undefined;

  const document = new DOMParser().parseFromString(documentXml, "application/xml");
  const body = document.getElementsByTagNameNS(WORD_NS, "body")[0];
  if (!body) return "";

  return normalizeText(extractBlocks(body, resolvedImageUrl).join("\n")).trim();
}

function safeImagePath(target: string): string | null {
  const normalized = posix.normalize(posix.join("word", target.replaceAll("\\", "/")));
  if (!normalized.startsWith("word/media/") || normalized.includes("..")) return null;
  return normalized;
}

export async function extractDocxImage(
  data: Buffer,
  requestedRelationshipId: string,
): Promise<DocxImageAsset | null> {
  if (!/^rId[\w.-]+$/i.test(requestedRelationshipId)) return null;

  const zip = await JSZip.loadAsync(data);
  const relationshipsXml = await zip.file("word/_rels/document.xml.rels")?.async("string");
  if (!relationshipsXml) return null;

  const relationships = new DOMParser().parseFromString(relationshipsXml, "application/xml");
  const entries = Array.from(relationships.getElementsByTagNameNS(PACKAGE_REL_NS, "Relationship"));
  const relationship = entries.find((entry) => entry.getAttribute("Id") === requestedRelationshipId);
  if (!relationship || relationship.getAttribute("TargetMode") === "External") return null;
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
