import JSZip from "jszip";
import type {
  Courseware,
  PptSlideImportElement,
} from "@/types";
import { getCoursewareFileUrl } from "@/lib/courseware-online";
import { ommlToLatex } from "@/lib/omml-to-latex";

export interface PptSlideOutline {
  title: string;
  content: string;
  elements?: PptSlideImportElement[];
}

interface PptxExtractionOptions {
  imageUrl?: (slideNumber: number, relationshipId: string) => string | undefined;
}

interface SlideSize {
  width: number;
  height: number;
}

interface ElementBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface RunStyle {
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: "normal" | "bold";
  fontStyle?: "normal" | "italic";
  textDecoration?: "none" | "underline" | "line-through";
  color?: string;
}

interface RichTextResult {
  html: string;
  primaryStyle: RunStyle;
  textAlign: "left" | "center" | "right";
}

const PPTX_SLIDE_PATH = /^ppt\/slides\/slide(\d+)\.xml$/;
const PRESENTATION_NS = "http://schemas.openxmlformats.org/presentationml/2006/main";
const DRAWING_NS = "http://schemas.openxmlformats.org/drawingml/2006/main";
const OFFICE_REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const MATH_NS = "http://schemas.openxmlformats.org/officeDocument/2006/math";
const MARKUP_COMPATIBILITY_NS = "http://schemas.openxmlformats.org/markup-compatibility/2006";
const DEFAULT_SLIDE_SIZE: SlideSize = { width: 12_192_000, height: 6_858_000 };
const MAX_SLIDES = 500;

function slideNumber(path: string): number {
  return Number(path.match(PPTX_SLIDE_PATH)?.[1] || 0);
}

function directChild(element: Element, namespace: string, localName: string): Element | undefined {
  return Array.from(element.children).find((child) => (
    child.namespaceURI === namespace && child.localName === localName
  ));
}

function firstDescendant(element: Element, namespace: string, localName: string): Element | undefined {
  return element.getElementsByTagNameNS(namespace, localName)[0] || undefined;
}

function numericAttribute(element: Element | undefined, name: string): number | undefined {
  if (!element) return undefined;
  const value = Number(element.getAttribute(name));
  return Number.isFinite(value) ? value : undefined;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

async function presentationSlideSize(zip: JSZip): Promise<SlideSize> {
  const xml = await zip.file("ppt/presentation.xml")?.async("string");
  if (!xml) return DEFAULT_SLIDE_SIZE;
  const document = new DOMParser().parseFromString(xml, "application/xml");
  if (document.querySelector("parsererror")) return DEFAULT_SLIDE_SIZE;
  const slideSize = document.getElementsByTagNameNS(PRESENTATION_NS, "sldSz")[0];
  const width = numericAttribute(slideSize, "cx");
  const height = numericAttribute(slideSize, "cy");
  return width && height && width > 0 && height > 0
    ? { width, height }
    : DEFAULT_SLIDE_SIZE;
}

function placeholderBounds(shape: Element, fallbackIndex: number): ElementBounds {
  const placeholder = shape.getElementsByTagNameNS(PRESENTATION_NS, "ph")[0];
  const type = placeholder?.getAttribute("type") || "";
  if (type === "title" || type === "ctrTitle") {
    return { x: 8, y: 7, width: 84, height: 18 };
  }
  if (type === "subTitle") {
    return { x: 12, y: 30, width: 76, height: 22 };
  }
  if (type === "body" || type === "obj") {
    return { x: 8, y: 27, width: 84, height: 62 };
  }
  return {
    x: 7,
    y: clamp(8 + fallbackIndex * 12, 5, 82),
    width: 86,
    height: 10,
  };
}

function elementBounds(shape: Element, slideSize: SlideSize, fallbackIndex: number): ElementBounds {
  const properties = directChild(shape, PRESENTATION_NS, "spPr");
  const transform = properties
    ? directChild(properties, DRAWING_NS, "xfrm")
    : directChild(shape, PRESENTATION_NS, "xfrm");
  const offset = transform ? directChild(transform, DRAWING_NS, "off") : undefined;
  const extent = transform ? directChild(transform, DRAWING_NS, "ext") : undefined;
  const x = numericAttribute(offset, "x");
  const y = numericAttribute(offset, "y");
  const width = numericAttribute(extent, "cx");
  const height = numericAttribute(extent, "cy");

  if (x === undefined || y === undefined || !width || !height) {
    return placeholderBounds(shape, fallbackIndex);
  }

  return {
    x: clamp((x / slideSize.width) * 100, 0, 100),
    y: clamp((y / slideSize.height) * 100, 0, 100),
    width: clamp((width / slideSize.width) * 100, 0.5, 100),
    height: clamp((height / slideSize.height) * 100, 0.5, 100),
  };
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

function escapeHtml(value: string): string {
  return value
    .split("&").join("&amp;")
    .split("<").join("&lt;")
    .split(">").join("&gt;")
    .split('"').join("&quot;");
}

function fontFamily(properties: Element | undefined): string | undefined {
  if (!properties) return undefined;
  for (const name of ["ea", "latin", "cs"]) {
    const font = directChild(properties, DRAWING_NS, name)?.getAttribute("typeface")?.trim();
    if (font && !font.startsWith("+")) return font;
  }
  return undefined;
}

function colorFromProperties(properties: Element | undefined): string | undefined {
  if (!properties) return undefined;
  const solidFill = directChild(properties, DRAWING_NS, "solidFill");
  const srgb = solidFill ? directChild(solidFill, DRAWING_NS, "srgbClr") : undefined;
  const value = srgb?.getAttribute("val")?.trim();
  return value && /^[0-9a-f]{6}$/i.test(value) ? `#${value}` : undefined;
}

function mergeRunStyle(properties: Element | undefined, defaults: Element | undefined): RunStyle {
  const size = numericAttribute(properties, "sz") ?? numericAttribute(defaults, "sz");
  const bold = properties?.getAttribute("b") ?? defaults?.getAttribute("b");
  const italic = properties?.getAttribute("i") ?? defaults?.getAttribute("i");
  const underline = properties?.getAttribute("u") ?? defaults?.getAttribute("u");
  const strike = properties?.getAttribute("strike") ?? defaults?.getAttribute("strike");
  return {
    fontSize: size && size > 0 ? (size / 100) * (96 / 72) : undefined,
    fontFamily: fontFamily(properties) || fontFamily(defaults),
    fontWeight: bold === "1" || bold === "true" ? "bold" : undefined,
    fontStyle: italic === "1" || italic === "true" ? "italic" : undefined,
    textDecoration: strike && strike !== "noStrike"
      ? "line-through"
      : underline && underline !== "none"
        ? "underline"
        : undefined,
    color: colorFromProperties(properties) || colorFromProperties(defaults),
  };
}

function cssFontFamily(value: string): string {
  return `"${value.split("\\").join("\\\\").split('"').join('\\"')}"`;
}

function runStyleCss(style: RunStyle): string {
  const declarations: string[] = [];
  if (style.fontFamily) declarations.push(`font-family:${cssFontFamily(style.fontFamily)}`);
  if (style.fontSize) declarations.push(`font-size:${(style.fontSize * 72 / 96).toFixed(2)}pt`);
  if (style.fontWeight) declarations.push(`font-weight:${style.fontWeight}`);
  if (style.fontStyle) declarations.push(`font-style:${style.fontStyle}`);
  if (style.textDecoration) declarations.push(`text-decoration:${style.textDecoration}`);
  if (style.color) declarations.push(`color:${style.color}`);
  return declarations.join(";");
}

function richInlineContent(node: Node, defaults: Element | undefined): string {
  if (node.nodeType === Node.TEXT_NODE) return escapeHtml(node.textContent || "");
  if (node.nodeType !== Node.ELEMENT_NODE) return "";
  const element = node as Element;

  if (element.namespaceURI === MARKUP_COMPATIBILITY_NS && element.localName === "AlternateContent") {
    const preferred = preferredAlternateContent(element);
    return preferred ? richInlineContent(preferred, defaults) : "";
  }
  if (element.namespaceURI === MATH_NS && element.localName === "oMath") {
    return escapeHtml(mathFromElement(element));
  }
  if (element.namespaceURI === DRAWING_NS && element.localName === "br") return "<br>";
  if (element.namespaceURI === DRAWING_NS && (element.localName === "r" || element.localName === "fld")) {
    const properties = directChild(element, DRAWING_NS, "rPr");
    const style = mergeRunStyle(properties, defaults);
    const css = runStyleCss(style);
    const text = Array.from(element.getElementsByTagNameNS(DRAWING_NS, "t"))
      .map((item) => item.textContent || "")
      .join("");
    const escaped = escapeHtml(text);
    return css ? `<span style="${escapeHtml(css)}">${escaped}</span>` : escaped;
  }
  if (element.namespaceURI === DRAWING_NS && element.localName === "t") {
    return escapeHtml(element.textContent || "");
  }
  if (element.namespaceURI === DRAWING_NS && element.localName === "pPr") return "";
  return Array.from(element.childNodes).map((child) => richInlineContent(child, defaults)).join("");
}

function paragraphAlignment(paragraph: Element): "left" | "center" | "right" {
  const properties = directChild(paragraph, DRAWING_NS, "pPr");
  const alignment = properties?.getAttribute("algn");
  if (alignment === "ctr") return "center";
  if (alignment === "r") return "right";
  return "left";
}

function richTextFromTextBody(textBody: Element): RichTextResult | null {
  const paragraphs = Array.from(textBody.children).filter((child) => (
    child.namespaceURI === DRAWING_NS && child.localName === "p"
  ));
  if (paragraphs.length === 0) return null;

  let primaryStyle: RunStyle = {};
  let firstAlignment: "left" | "center" | "right" = "left";
  const html: string[] = [];
  const plain: string[] = [];

  paragraphs.forEach((paragraph, index) => {
    const paragraphProperties = directChild(paragraph, DRAWING_NS, "pPr");
    const defaults = paragraphProperties
      ? directChild(paragraphProperties, DRAWING_NS, "defRPr")
      : undefined;
    const firstRun = Array.from(paragraph.children).find((child) => (
      child.namespaceURI === DRAWING_NS && (child.localName === "r" || child.localName === "fld")
    ));
    const firstRunProperties = firstRun
      ? directChild(firstRun, DRAWING_NS, "rPr")
      : undefined;
    if (Object.keys(primaryStyle).length === 0) {
      primaryStyle = mergeRunStyle(firstRunProperties, defaults);
    }

    const alignment = paragraphAlignment(paragraph);
    if (index === 0) firstAlignment = alignment;
    const body = Array.from(paragraph.childNodes)
      .map((child) => richInlineContent(child, defaults))
      .join("");
    html.push(`<div${alignment !== "left" ? ` style="text-align:${alignment}"` : ""}>${body || "<br>"}</div>`);
    plain.push(paragraphContent(paragraph));
  });

  const plainText = plain.join("\n");
  if (!plainText.trim() && !html.some((entry) => entry !== "<div><br></div>")) return null;
  return {
    html: html.join(""),
    primaryStyle,
    textAlign: firstAlignment,
  };
}

function richTextFromShape(shape: Element): RichTextResult | null {
  const textBody = directChild(shape, PRESENTATION_NS, "txBody");
  return textBody ? richTextFromTextBody(textBody) : null;
}

function shapeBackgroundColor(shape: Element): string {
  const properties = directChild(shape, PRESENTATION_NS, "spPr");
  if (!properties || directChild(properties, DRAWING_NS, "noFill")) return "transparent";
  return colorFromProperties(properties) || "transparent";
}

function extractTextElement(
  shape: Element,
  slideSize: SlideSize,
  fallbackIndex: number,
): PptSlideImportElement | null {
  const text = richTextFromShape(shape);
  if (!text) return null;
  return {
    kind: "text",
    content: text.html,
    ...elementBounds(shape, slideSize, fallbackIndex),
    ...text.primaryStyle,
    textAlign: text.textAlign,
    backgroundColor: shapeBackgroundColor(shape),
    padding: 0,
  } as PptSlideImportElement;
}

function truthyOfficeBoolean(value: string | null): boolean {
  return value === "1" || value === "true";
}

function positiveIntegerAttribute(element: Element, name: string): number | undefined {
  const value = Number(element.getAttribute(name));
  return Number.isInteger(value) && value > 1 ? value : undefined;
}

function tableCellHtml(cell: Element): { html: string; primaryStyle: RunStyle } {
  const textBody = directChild(cell, DRAWING_NS, "txBody");
  const richText = textBody ? richTextFromTextBody(textBody) : null;
  const properties = directChild(cell, DRAWING_NS, "tcPr");
  const backgroundColor = colorFromProperties(properties);
  const anchor = properties?.getAttribute("anchor");
  const styles: string[] = [];
  if (backgroundColor) styles.push(`background-color:${backgroundColor}`);
  if (anchor === "ctr") styles.push("vertical-align:middle");
  if (anchor === "b") styles.push("vertical-align:bottom");

  const attributes: string[] = [];
  const gridSpan = positiveIntegerAttribute(cell, "gridSpan");
  const rowSpan = positiveIntegerAttribute(cell, "rowSpan");
  if (gridSpan) attributes.push(`colspan="${gridSpan}"`);
  if (rowSpan) attributes.push(`rowspan="${rowSpan}"`);
  if (styles.length > 0) attributes.push(`style="${escapeHtml(styles.join(";"))}"`);

  return {
    html: `<td${attributes.length > 0 ? ` ${attributes.join(" ")}` : ""}>${richText?.html || "<div><br></div>"}</td>`,
    primaryStyle: richText?.primaryStyle || {},
  };
}

function extractTableElement(
  graphicFrame: Element,
  slideSize: SlideSize,
  fallbackIndex: number,
): PptSlideImportElement | null {
  const table = firstDescendant(graphicFrame, DRAWING_NS, "tbl");
  if (!table) return null;

  const rows = Array.from(table.children).filter((child) => (
    child.namespaceURI === DRAWING_NS && child.localName === "tr"
  ));
  if (rows.length === 0) return null;

  const grid = directChild(table, DRAWING_NS, "tblGrid");
  const columnWidths = grid
    ? Array.from(grid.children)
      .filter((child) => child.namespaceURI === DRAWING_NS && child.localName === "gridCol")
      .map((column) => numericAttribute(column, "w") || 0)
    : [];
  const totalColumnWidth = columnWidths.reduce((sum, width) => sum + width, 0);
  const colgroup = totalColumnWidth > 0
    ? `<colgroup>${columnWidths.map((width) => (
        `<col style="width:${((width / totalColumnWidth) * 100).toFixed(4)}%">`
      )).join("")}</colgroup>`
    : "";

  const rowHeights = rows.map((row) => numericAttribute(row, "h") || 0);
  const totalRowHeight = rowHeights.reduce((sum, height) => sum + height, 0);
  let primaryStyle: RunStyle = {};
  const rowHtml = rows.map((row, rowIndex) => {
    const cells = Array.from(row.children).filter((child) => (
      child.namespaceURI === DRAWING_NS && child.localName === "tc"
    ));
    const cellHtml = cells.flatMap((cell) => {
      if (truthyOfficeBoolean(cell.getAttribute("hMerge")) || truthyOfficeBoolean(cell.getAttribute("vMerge"))) {
        return [];
      }
      const extracted = tableCellHtml(cell);
      if (Object.keys(primaryStyle).length === 0 && Object.keys(extracted.primaryStyle).length > 0) {
        primaryStyle = extracted.primaryStyle;
      }
      return [extracted.html];
    });
    const rowHeight = totalRowHeight > 0 && rowHeights[rowIndex] > 0
      ? ` style="height:${((rowHeights[rowIndex] / totalRowHeight) * 100).toFixed(4)}%"`
      : "";
    return `<tr${rowHeight}>${cellHtml.join("")}</tr>`;
  }).join("");

  return {
    kind: "text",
    content: `<table class="ppt-import-table">${colgroup}<tbody>${rowHtml}</tbody></table>`,
    ...elementBounds(graphicFrame, slideSize, fallbackIndex),
    ...primaryStyle,
    backgroundColor: "transparent",
    padding: 0,
    textAlign: "left",
  } as PptSlideImportElement;
}

function extractImageElement(
  picture: Element,
  slideSize: SlideSize,
  fallbackIndex: number,
  slideNumberValue: number,
  imageUrl: PptxExtractionOptions["imageUrl"],
): PptSlideImportElement | null {
  const blip = firstDescendant(picture, DRAWING_NS, "blip");
  const relationshipId = blip?.getAttributeNS(OFFICE_REL_NS, "embed")
    || blip?.getAttribute("r:embed")
    || "";
  if (!relationshipId || !imageUrl) return null;
  const src = imageUrl(slideNumberValue, relationshipId);
  if (!src) return null;
  const nonVisual = firstDescendant(picture, PRESENTATION_NS, "cNvPr");
  return {
    kind: "image",
    src,
    alt: nonVisual?.getAttribute("descr")?.trim() || "PPT 图片",
    ...elementBounds(picture, slideSize, fallbackIndex),
  };
}

function importElementsFromSlide(
  xml: string,
  slideSize: SlideSize,
  slideNumberValue: number,
  options: PptxExtractionOptions,
): PptSlideImportElement[] {
  const document = new DOMParser().parseFromString(xml, "application/xml");
  if (document.querySelector("parsererror")) return [];
  const slideTree = document.getElementsByTagNameNS(PRESENTATION_NS, "spTree")[0];
  if (!slideTree) return [];

  const elements: PptSlideImportElement[] = [];
  let fallbackIndex = 0;
  for (const child of Array.from(slideTree.children)) {
    if (child.namespaceURI !== PRESENTATION_NS) continue;
    if (child.localName === "sp") {
      const text = extractTextElement(child, slideSize, fallbackIndex);
      if (text) {
        elements.push(text);
        fallbackIndex += 1;
      }
      continue;
    }
    if (child.localName === "pic") {
      const image = extractImageElement(
        child,
        slideSize,
        fallbackIndex,
        slideNumberValue,
        options.imageUrl,
      );
      if (image) {
        elements.push(image);
        fallbackIndex += 1;
      }
      continue;
    }
    if (child.localName === "graphicFrame") {
      const table = extractTableElement(child, slideSize, fallbackIndex);
      if (table) {
        elements.push(table);
        fallbackIndex += 1;
        continue;
      }

      const image = extractImageElement(
        child,
        slideSize,
        fallbackIndex,
        slideNumberValue,
        options.imageUrl,
      );
      if (image) {
        elements.push(image);
        fallbackIndex += 1;
      }
    }
  }
  return elements;
}

export async function extractPptxSlideOutlines(
  source: Blob | ArrayBuffer | Uint8Array,
  options: PptxExtractionOptions = {},
): Promise<PptSlideOutline[]> {
  const zip = await JSZip.loadAsync(source);
  const slideSize = await presentationSlideSize(zip);
  const slidePaths = Object.keys(zip.files)
    .filter((path) => PPTX_SLIDE_PATH.test(path))
    .sort((left, right) => slideNumber(left) - slideNumber(right))
    .slice(0, MAX_SLIDES);

  return Promise.all(slidePaths.map(async (path, index) => {
    const xml = await zip.file(path)?.async("string") || "";
    const lines = textFromSlideXml(xml);
    const currentSlideNumber = slideNumber(path) || index + 1;
    const elements = importElementsFromSlide(xml, slideSize, currentSlideNumber, options);
    return {
      title: lines[0] || `第 ${index + 1} 页`,
      content: lines.join("\n") || `原 PPT 第 ${index + 1} 页`,
      ...(elements.length > 0 ? { elements } : undefined),
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

function sourceFileId(courseware: Courseware): string | undefined {
  if (!courseware.fileUrl) return undefined;
  try {
    const path = new URL(courseware.fileUrl, window.location.origin).pathname;
    const match = path.match(/^\/api\/files\/([^/]+)$/);
    return match?.[1] ? decodeURIComponent(match[1]) : undefined;
  } catch {
    return undefined;
  }
}

function pptImageUrlFactory(courseware: Courseware): PptxExtractionOptions["imageUrl"] {
  const fileId = sourceFileId(courseware);
  if (!fileId) return undefined;
  return (slideNumberValue, relationshipId) => {
    if (!/^rId[\w.-]+$/i.test(relationshipId)) return undefined;
    const assetKey = `ppt-slide-${slideNumberValue}-${relationshipId}`;
    return `/api/files/${encodeURIComponent(fileId)}/assets/${encodeURIComponent(assetKey)}`;
  };
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
  return extractPptxSlideOutlines(await response.arrayBuffer(), {
    imageUrl: pptImageUrlFactory(courseware),
  });
}
