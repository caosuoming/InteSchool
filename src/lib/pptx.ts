import JSZip from "jszip";
import type { Courseware } from "@/types";
import { getCoursewareFileUrl } from "@/lib/courseware-online";
import { ommlToLatex } from "@/lib/omml-to-latex";

export interface PptSlideOutline {
  title: string;
  content: string;
}

const PPTX_SLIDE_PATH = /^ppt\/slides\/slide(\d+)\.xml$/;
const DRAWING_NS = "http://schemas.openxmlformats.org/drawingml/2006/main";
const MATH_NS = "http://schemas.openxmlformats.org/officeDocument/2006/math";
const MARKUP_COMPATIBILITY_NS = "http://schemas.openxmlformats.org/markup-compatibility/2006";

function slideNumber(path: string): number {
  return Number(path.match(PPTX_SLIDE_PATH)?.[1] || 0);
}

function mathFromElement(element: Element): string {
  const latex = ommlToLatex(element).trim();
  return latex ? `$${latex}$` : "";
}

function preferredAlternateContent(element: Element): Element | null {
  const children = Array.from(element.children);
  return children.find((child) => (
    child.namespaceURI === MARKUP_COMPATIBILITY_NS
    && child.localName === "Choice"
    && child.getElementsByTagNameNS(MATH_NS, "oMath").length > 0
  )) || children.find((child) => (
    child.namespaceURI === MARKUP_COMPATIBILITY_NS
    && child.localName === "Fallback"
  )) || children[0] || null;
}

function paragraphContent(node: Node): string {
  if (node.nodeType !== Node.ELEMENT_NODE) return "";
  const element = node as Element;

  if (element.namespaceURI === MARKUP_COMPATIBILITY_NS && element.localName === "AlternateContent") {
    const preferred = preferredAlternateContent(element);
    return preferred ? paragraphContent(preferred) : "";
  }

  if (element.namespaceURI === MATH_NS && element.localName === "oMath") {
    return mathFromElement(element);
  }

  if (element.namespaceURI === DRAWING_NS && element.localName === "t") {
    return element.textContent || "";
  }

  if (element.namespaceURI === DRAWING_NS && element.localName === "br") {
    return "\n";
  }

  return Array.from(element.childNodes).map(paragraphContent).join("");
}

function textFromSlideXml(xml: string): string[] {
  const document = new DOMParser().parseFromString(xml, "application/xml");
  if (document.querySelector("parsererror")) return [];

  const paragraphs = Array.from(document.getElementsByTagNameNS(DRAWING_NS, "p"));
  const lines = paragraphs
    .map((paragraph) => paragraphContent(paragraph).trim())
    .filter(Boolean);

  if (lines.length > 0) return lines;
  return Array.from(document.getElementsByTagNameNS(DRAWING_NS, "t"))
    .map((node) => node.textContent?.trim() || "")
    .filter(Boolean);
}

export async function extractPptxSlideOutlines(
  source: Blob | ArrayBuffer | Uint8Array,
): Promise<PptSlideOutline[]> {
  const zip = await JSZip.loadAsync(source);
  const slidePaths = Object.keys(zip.files)
    .filter((path) => PPTX_SLIDE_PATH.test(path))
    .sort((left, right) => slideNumber(left) - slideNumber(right))
    .slice(0, 500);

  return Promise.all(slidePaths.map(async (path, index) => {
    const xml = await zip.file(path)?.async("string") || "";
    const lines = textFromSlideXml(xml);
    return {
      title: lines[0] || `第 ${index + 1} 页`,
      content: lines.join("\n") || `原 PPT 第 ${index + 1} 页`,
    };
  }));
}

export async function countPptxSlides(source: Blob | ArrayBuffer | Uint8Array): Promise<number | undefined> {
  try {
    const slides = await extractPptxSlideOutlines(source);
    return slides.length || undefined;
  } catch {
    return undefined;
  }
}

export async function loadCoursewarePptSlides(courseware: Courseware): Promise<PptSlideOutline[]> {
  if (courseware.type !== "ppt") return [];
  if (!courseware.fileName?.toLowerCase().endsWith(".pptx")) {
    return Array.from({ length: Math.max(courseware.pageCount || 1, 1) }, (_, index) => ({
      title: `${courseware.title} · 第 ${index + 1} 页`,
      content: `原 PPT 第 ${index + 1} 页`,
    }));
  }

  const fileUrl = getCoursewareFileUrl(courseware);
  if (!fileUrl) return [];
  const response = await fetch(fileUrl, { credentials: "same-origin" });
  if (!response.ok) throw new Error("PPT 文件读取失败");
  return extractPptxSlideOutlines(await response.arrayBuffer());
}
