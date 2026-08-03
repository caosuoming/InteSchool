import JSZip from "jszip";
import type { Courseware } from "@/types";
import { getCoursewareFileUrl } from "@/lib/courseware-online";

export interface PptSlideOutline {
  title: string;
  content: string;
}

const PPTX_SLIDE_PATH = /^ppt\/slides\/slide(\d+)\.xml$/;

function slideNumber(path: string): number {
  return Number(path.match(PPTX_SLIDE_PATH)?.[1] || 0);
}

function textFromSlideXml(xml: string): string[] {
  const document = new DOMParser().parseFromString(xml, "application/xml");
  if (document.querySelector("parsererror")) return [];

  const paragraphs = Array.from(document.getElementsByTagName("a:p"));
  const lines = paragraphs
    .map((paragraph) => Array.from(paragraph.getElementsByTagName("a:t"))
      .map((node) => node.textContent || "")
      .join("")
      .trim())
    .filter(Boolean);

  if (lines.length > 0) return lines;
  return Array.from(document.getElementsByTagName("a:t"))
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
