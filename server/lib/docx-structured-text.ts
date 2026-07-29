import JSZip from "jszip";
import { DOMParser } from "@xmldom/xmldom";
import { ommlToLatex } from "../../src/lib/omml-to-latex.js";

const WORD_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const MATH_NS = "http://schemas.openxmlformats.org/officeDocument/2006/math";
const ELEMENT_NODE = 1;

function elementChildren(node: Node): Element[] {
  return Array.from(node.childNodes)
    .filter((child): child is Element => child.nodeType === ELEMENT_NODE);
}

function normalizeText(value: string): string {
  return value
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n");
}

function extractInlineContent(node: Node): string {
  if (node.nodeType !== ELEMENT_NODE) return node.textContent || "";
  const element = node as Element;

  if (element.namespaceURI === MATH_NS && ["oMath", "oMathPara"].includes(element.localName)) {
    const latex = ommlToLatex(element).trim();
    return latex ? `$${latex}$` : "";
  }
  if (element.namespaceURI === WORD_NS) {
    if (element.localName === "t") return element.textContent || "";
    if (element.localName === "tab") return "\t";
    if (["br", "cr"].includes(element.localName)) return "\n";
    if (element.localName === "noBreakHyphen") return "‑";
    if (element.localName === "softHyphen") return "­";
  }

  return elementChildren(element).map(extractInlineContent).join("");
}

function extractParagraph(paragraph: Element): string {
  return normalizeText(elementChildren(paragraph).map(extractInlineContent).join("")).trim();
}

function extractTable(table: Element): string[] {
  const rows = Array.from(table.getElementsByTagNameNS(WORD_NS, "tr"));
  return rows.map((row) => {
    const cells = Array.from(row.getElementsByTagNameNS(WORD_NS, "tc"));
    return cells.map((cell) => {
      const paragraphs = Array.from(cell.getElementsByTagNameNS(WORD_NS, "p"));
      return paragraphs.map(extractParagraph).filter(Boolean).join(" ");
    }).join("\t");
  }).filter((row) => row.trim().length > 0);
}

function extractBlocks(parent: Element): string[] {
  const blocks: string[] = [];
  for (const child of elementChildren(parent)) {
    if (child.namespaceURI !== WORD_NS) continue;
    if (child.localName === "p") {
      const paragraph = extractParagraph(child);
      if (paragraph) blocks.push(paragraph);
      continue;
    }
    if (child.localName === "tbl") {
      blocks.push(...extractTable(child));
      continue;
    }
    if (["sdt", "sdtContent", "customXml"].includes(child.localName)) {
      blocks.push(...extractBlocks(child));
    }
  }
  return blocks;
}

export async function extractDocxStructuredText(data: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(data);
  const documentXml = await zip.file("word/document.xml")?.async("string");
  if (!documentXml) return "";

  const document = new DOMParser().parseFromString(documentXml, "application/xml");
  const body = document.getElementsByTagNameNS(WORD_NS, "body")[0];
  if (!body) return "";

  return normalizeText(extractBlocks(body).join("\n")).trim();
}
