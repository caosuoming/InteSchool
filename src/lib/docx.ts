import {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  AlignmentType, Tab, TabStopPosition, TabStopType,
  BorderStyle, convertInchesToTwip, ImportedXmlComponent, ImageRun,
  type ParagraphChild,
} from "docx";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import katex from "katex";
import { mml2omml } from "mathml2omml";
import type { ExamPaper, ExamPaperQuestion, Lecture, LectureSection, Question } from "@/types";
import { getDefaultQuestionTypeLabel } from "@/lib/question-types";
import {
  parseDocumentImageDisplaySize,
  parseOfficeMetafileLayout,
} from "@/lib/office-metafile";

const WORD_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const MATH_NS = "http://schemas.openxmlformats.org/officeDocument/2006/math";
const IMAGE_MARKER_START = "\uE300";
const IMAGE_MARKER_END = "\uE301";
const MAX_DOCUMENT_IMAGE_WIDTH = 640;
const OPTION_LAYOUT_WIDTH_TWIPS = TabStopPosition.MAX;
const OPTION_LABEL_WIDTH_TWIPS = 330;
const OPTION_COLUMN_GAP_TWIPS = 360;

const difficultyLabel = ["", "简单", "较易", "中等", "较难", "困难"];

interface DocumentTextStyle {
  bold?: boolean;
  size?: number;
  color?: string;
  font?: string;
}

interface DocumentImageReference {
  source: string;
  alt: string;
  width: number | null;
  height: number | null;
}

type RasterImageType = "jpg" | "png" | "gif" | "bmp";

function importedXmlElement(element: Element): ImportedXmlComponent {
  const attributes: Record<string, string> = {};
  for (const attribute of Array.from(element.attributes)) {
    attributes[attribute.name] = attribute.value;
  }
  const component = new ImportedXmlComponent(
    element.tagName,
    Object.keys(attributes).length > 0 ? attributes : undefined,
  );
  for (const child of Array.from(element.childNodes)) {
    if (child.nodeType === Node.ELEMENT_NODE) {
      component.push(importedXmlElement(child as Element));
    } else if (child.nodeType === Node.TEXT_NODE && child.nodeValue) {
      component.push(child.nodeValue);
    }
  }
  return component;
}

function appendWordProperty(
  document: XMLDocument,
  parent: Element,
  name: string,
  value?: string,
): void {
  const element = document.createElementNS(WORD_NS, `w:${name}`);
  if (value !== undefined) element.setAttributeNS(WORD_NS, "w:val", value);
  parent.appendChild(element);
}

function applyOmmlRunStyle(root: Element, style: DocumentTextStyle): void {
  const document = root.ownerDocument;
  if (!document) return;
  root.setAttribute("xmlns:w", WORD_NS);

  for (const run of Array.from(root.getElementsByTagNameNS(MATH_NS, "r"))) {
    for (const child of Array.from(run.childNodes)) {
      if (child.nodeType === Node.ELEMENT_NODE) {
        const element = child as Element;
        if (element.namespaceURI === WORD_NS && element.localName === "rPr") {
          run.removeChild(element);
        }
      }
    }

    const runProperties = document.createElementNS(WORD_NS, "w:rPr");
    const fonts = document.createElementNS(WORD_NS, "w:rFonts");
    for (const attribute of ["ascii", "hAnsi", "eastAsia", "cs"]) {
      fonts.setAttributeNS(WORD_NS, `w:${attribute}`, "Cambria Math");
    }
    runProperties.appendChild(fonts);
    if (style.bold) appendWordProperty(document, runProperties, "b");
    if (style.color) appendWordProperty(document, runProperties, "color", style.color);
    if (style.size) {
      appendWordProperty(document, runProperties, "sz", String(style.size));
      appendWordProperty(document, runProperties, "szCs", String(style.size));
    }
    appendWordProperty(document, runProperties, "position", "0");

    const textNode = Array.from(run.childNodes).find((child) =>
      child.nodeType === Node.ELEMENT_NODE
      && (child as Element).namespaceURI === MATH_NS
      && (child as Element).localName === "t");
    run.insertBefore(runProperties, textNode || null);
  }
}

function escapeOmmlTextContent(omml: string): string {
  return omml.replace(
    /(<m:t\b[^>]*>)([\s\S]*?)(<\/m:t>)/g,
    (_match, opening: string, text: string, closing: string) =>
      `${opening}${text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}${closing}`,
  );
}

function latexToOmml(latex: string, style: DocumentTextStyle = {}): ParagraphChild | null {
  try {
    const rendered = katex.renderToString(normalizeAdjacentLatexScripts(latex), {
      throwOnError: true,
      output: "mathml",
    });
    const mathml = rendered.match(/<math\b[\s\S]*?<\/math>/i)?.[0]
      ?.replace(/<annotation\b[\s\S]*?<\/annotation>/gi, "");
    if (!mathml) return null;
    const omml = escapeOmmlTextContent(mml2omml(mathml));
    const xml = new DOMParser().parseFromString(omml, "application/xml");
    if (xml.getElementsByTagName("parsererror").length > 0) return null;
    applyOmmlRunStyle(xml.documentElement, style);
    return importedXmlElement(xml.documentElement) as unknown as ParagraphChild;
  } catch {
    return null;
  }
}

function textRun(text: string, style: DocumentTextStyle = {}): TextRun {
  return new TextRun({
    text,
    bold: style.bold,
    size: style.size,
    color: style.color,
    font: style.font || "宋体",
  });
}

function textRunsWithLineBreaks(text: string, style: DocumentTextStyle = {}): TextRun[] {
  return text.split("\n").map((line, index) => new TextRun({
    text: line,
    break: index > 0 ? 1 : undefined,
    bold: style.bold,
    size: style.size,
    color: style.color,
    font: style.font || "宋体",
  }));
}

function documentTextChildren(value: string | undefined, style: DocumentTextStyle = {}): ParagraphChild[] {
  const text = mergeInlineFormulaRuns(plainDocumentText(value));
  if (!text) return [textRun("", style)];

  const children: ParagraphChild[] = [];
  const formulaPattern = /\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g;
  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = formulaPattern.exec(text)) !== null) {
    if (match.index > cursor) {
      children.push(...textRunsWithLineBreaks(text.slice(cursor, match.index), style));
    }
    const latex = (match[1] ?? match[2] ?? "").trim();
    const formula = latex ? latexToOmml(latex, style) : null;
    if (formula) children.push(formula);
    else children.push(...textRunsWithLineBreaks(match[0], style));
    cursor = formulaPattern.lastIndex;
  }
  if (cursor < text.length) {
    children.push(...textRunsWithLineBreaks(text.slice(cursor), style));
  }
  return children.length > 0 ? children : [textRun(text, style)];
}

function createParagraph(
  text: string,
  options: {
    bold?: boolean;
    size?: number;
    color?: string;
    alignment?: (typeof AlignmentType)[keyof typeof AlignmentType];
    spacing?: { before?: number; after?: number; line?: number };
  } = {},
): Paragraph {
  return new Paragraph({
    children: documentTextChildren(text, {
      bold: options.bold,
      size: options.size,
      color: options.color,
    }),
    alignment: options.alignment ?? AlignmentType.LEFT,
    spacing: options.spacing,
  });
}

function createLabeledParagraph(label: string, content: string, labelColor = "0B2545"): Paragraph {
  return new Paragraph({
    children: [
      textRun(`【${label}】`, { bold: true, color: labelColor, size: 22 }),
      ...documentTextChildren(content, { size: 22 }),
    ],
    alignment: AlignmentType.LEFT,
    spacing: { line: 360 },
  });
}

function createHeading(text: string, level: (typeof HeadingLevel)[keyof typeof HeadingLevel] = HeadingLevel.HEADING_2): Paragraph {
  return new Paragraph({
    children: documentTextChildren(text),
    heading: level,
    alignment: AlignmentType.LEFT,
    spacing: { before: 240, after: 120 },
  });
}

function optionCharacterWidthTwips(character: string): number {
  if (/\s/u.test(character)) return 55;
  if ((character.codePointAt(0) || 0) <= 0xff) return 110;
  return 220;
}

function estimatedOptionWidthTwips(option: string): number {
  const text = plainDocumentText(option);
  if (!text) return OPTION_LABEL_WIDTH_TWIPS + OPTION_COLUMN_GAP_TWIPS;
  if (text.includes("\n") || /<img\b|!\[[^\]]*\]\(/i.test(option)) {
    return OPTION_LAYOUT_WIDTH_TWIPS + 1;
  }

  const textWidth = Array.from(text).reduce(
    (width, character) => width + optionCharacterWidthTwips(character),
    0,
  );
  return OPTION_LABEL_WIDTH_TWIPS + textWidth + OPTION_COLUMN_GAP_TWIPS;
}

function optionColumnCount(options: string[]): number {
  if (options.length <= 1) return 1;
  const widths = options.map(estimatedOptionWidthTwips);
  const candidates = [options.length, 2, 1]
    .filter((columns, index, values) => columns <= options.length && values.indexOf(columns) === index);

  return candidates.find((columns) => {
    const columnWidth = OPTION_LAYOUT_WIDTH_TWIPS / columns;
    return widths.every((width) => width <= columnWidth);
  }) || 1;
}

async function createOptionParagraphs(options: string[]): Promise<Paragraph[]> {
  const columns = optionColumnCount(options);
  const paragraphs: Paragraph[] = [];

  for (let rowStart = 0; rowStart < options.length; rowStart += columns) {
    const rowEnd = Math.min(options.length, rowStart + columns);
    const children: ParagraphChild[] = [];

    for (let index = rowStart; index < rowEnd; index += 1) {
      children.push(
        textRun(`${String.fromCharCode(65 + index)}. `, { bold: true, size: 22 }),
        ...await documentRichChildren(options[index], { size: 22 }),
      );
      if (index + 1 < rowEnd) children.push(new TextRun({ children: [new Tab()] }));
    }

    paragraphs.push(new Paragraph({
      children,
      alignment: AlignmentType.LEFT,
      spacing: { line: 360, after: 60 },
      tabStops: columns > 1
        ? Array.from({ length: columns - 1 }, (_, index) => ({
          type: TabStopType.LEFT,
          position: Math.round(OPTION_LAYOUT_WIDTH_TWIPS * (index + 1) / columns),
        }))
        : undefined,
    }));
  }

  return paragraphs;
}

const STRUCTURED_MATH_SELECTOR = "i.math-variable, sub, sup";
const MATH_CONTEXT_SYMBOLS = new Set(Array.from("+-−－＋=＝<>＜＞≤≥≠≈×÷*/·⋅()（）[]{}|.^±∓"));

function isMathContextCharacter(value: string): boolean {
  return /^[A-Za-z0-9]$/.test(value) || MATH_CONTEXT_SYMBOLS.has(value);
}

function mathContextPrefix(value: string): string {
  let end = 0;
  while (end < value.length && isMathContextCharacter(value[end])) end += 1;
  return value.slice(0, end);
}

function mathContextSuffix(value: string): string {
  let start = value.length;
  while (start > 0 && isMathContextCharacter(value[start - 1])) start -= 1;
  return value.slice(start);
}

function normalizeMathContextText(value: string): string {
  return value
    .replace(/＝/g, "=")
    .replace(/[－−]/g, "-")
    .replace(/＋/g, "+")
    .replace(/＜/g, "<")
    .replace(/＞/g, ">");
}

function readLatexScriptGroup(
  value: string,
  markerIndex: number,
): { content: string; end: number } | null {
  if (!["_", "^"].includes(value[markerIndex]) || value[markerIndex + 1] !== "{") {
    return null;
  }

  let depth = 0;
  for (let index = markerIndex + 1; index < value.length; index += 1) {
    const character = value[index];
    if (character === "\\") {
      index += 1;
      continue;
    }
    if (character === "{") {
      depth += 1;
      continue;
    }
    if (character === "}") {
      depth -= 1;
      if (depth === 0) {
        return {
          content: value.slice(markerIndex + 2, index),
          end: index + 1,
        };
      }
    }
  }
  return null;
}

function normalizeAdjacentLatexScripts(value: string): string {
  let result = "";
  let cursor = 0;

  while (cursor < value.length) {
    const first = readLatexScriptGroup(value, cursor);
    if (!first) {
      result += value[cursor];
      cursor += 1;
      continue;
    }

    const marker = value[cursor];
    let content = normalizeMathContextText(first.content);
    let end = first.end;
    while (end < value.length && value[end] === marker) {
      const next = readLatexScriptGroup(value, end);
      if (!next) break;
      content += normalizeMathContextText(next.content);
      end = next.end;
    }

    result += `${marker}{${content}}`;
    cursor = end;
  }

  return result;
}

function isEnumerationPrefix(value: string): boolean {
  return /^(?:\(\d+\)|（\d+）|\d+\.)$/.test(value);
}

function mergeInlineFormulaRuns(value: string): string {
  const formulaPattern = /\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g;
  const tokens: Array<{ type: "text"; value: string } | { type: "math"; value: string; display: boolean }> = [];
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = formulaPattern.exec(value)) !== null) {
    if (match.index > cursor) tokens.push({ type: "text", value: value.slice(cursor, match.index) });
    tokens.push({
      type: "math",
      value: match[1] ?? match[2] ?? "",
      display: match[1] !== undefined,
    });
    cursor = formulaPattern.lastIndex;
  }
  if (cursor < value.length) tokens.push({ type: "text", value: value.slice(cursor) });
  if (!tokens.some((token) => token.type === "math" && !token.display)) return value;

  const result: string[] = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.type === "text") {
      result.push(token.value);
      continue;
    }
    if (token.display) {
      result.push(`$$${token.value}$$`);
      continue;
    }

    let latex = token.value;
    const previous = result.at(-1);
    if (previous) {
      const suffix = mathContextSuffix(previous);
      if (suffix && !isEnumerationPrefix(suffix)) {
        result[result.length - 1] = previous.slice(0, -suffix.length);
        latex = normalizeMathContextText(suffix) + latex;
      }
    }

    while (index + 1 < tokens.length) {
      const next = tokens[index + 1];
      if (next.type === "math") {
        if (next.display) break;
        latex += next.value;
        index += 1;
        continue;
      }

      const following = tokens[index + 2];
      if (
        next.value.length > 0
        && following?.type === "math"
        && !following.display
        && Array.from(next.value).every(isMathContextCharacter)
      ) {
        latex += normalizeMathContextText(next.value) + following.value;
        index += 2;
        continue;
      }

      const prefix = mathContextPrefix(next.value);
      if (prefix) {
        latex += normalizeMathContextText(prefix);
        next.value = next.value.slice(prefix.length);
      }
      break;
    }

    result.push(`$${latex}$`);
  }
  return result.join("");
}

function richInlineMathLatex(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.nodeValue || "";
  if (node.nodeType !== Node.ELEMENT_NODE) return "";

  const element = node as Element;
  const content = Array.from(element.childNodes).map(richInlineMathLatex).join("");
  if (element.tagName.toLowerCase() === "sub") return `_{${content}}`;
  if (element.tagName.toLowerCase() === "sup") return `^{${content}}`;
  return content;
}

const RAW_LATEX_MARKER_START = "\uE400";
const RAW_LATEX_MARKER_END = "\uE401";

function decodeCommonHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'");
}

function protectRawLatex(value: string): { text: string; formulas: string[] } {
  const formulas: string[] = [];
  const text = value.replace(
    /\$\$[\s\S]+?\$\$|\$[^$\n]+?\$/g,
    (formula) => {
      const index = formulas.push(decodeCommonHtmlEntities(formula)) - 1;
      return `${RAW_LATEX_MARKER_START}${index}${RAW_LATEX_MARKER_END}`;
    },
  );
  return { text, formulas };
}

function restoreRawLatex(value: string, formulas: string[]): string {
  if (formulas.length === 0) return value;
  return value.replace(/\uE400(\d+)\uE401/g, (_marker, index: string) =>
    formulas[Number(index)] || "",
  );
}

function restoreStructuredInlineMath(
  value: string,
  formulas: string[],
): string {
  if (formulas.length === 0) return value;
  return value.replace(/\uE200(\d+)\uE201/g, (_marker, index: string) => {
    const latex = formulas[Number(index)]?.trim();
    return latex ? `$${latex}$` : "";
  });
}

function replaceRenderedMath(container: HTMLElement): void {
  container.querySelectorAll<HTMLElement>(".katex-formula[data-latex]").forEach((formula) => {
    const latex = formula.dataset.latex;
    if (!latex) return;
    const delimiter = formula.classList.contains("katex-formula-block") ? "$$" : "$";
    formula.replaceWith(`${delimiter}${latex}${delimiter}`);
  });

  container.querySelectorAll<HTMLElement>(".katex").forEach((formula) => {
    const annotation = formula.querySelector<HTMLElement>('annotation[encoding="application/x-tex"]');
    const latex = annotation?.textContent?.trim();
    if (latex) formula.replaceWith(`$${latex}$`);
  });

  container.querySelectorAll<MathMLElement>("math").forEach((formula) => {
    const annotation = formula.querySelector<HTMLElement>('annotation[encoding="application/x-tex"]');
    const latex = annotation?.textContent?.trim();
    if (latex) formula.replaceWith(`$${latex}$`);
  });
}

function replaceStructuredMath(container: HTMLElement): string[] {
  const formulas: string[] = [];
  const roots = Array.from(container.querySelectorAll<HTMLElement>(STRUCTURED_MATH_SELECTOR))
    .filter((element) => !element.parentElement?.closest(STRUCTURED_MATH_SELECTOR));

  for (const element of roots) {
    if (element.closest(".katex")) continue;
    const latex = richInlineMathLatex(element).trim();
    if (!latex) continue;
    const index = formulas.push(latex) - 1;
    element.replaceWith(document.createTextNode(`\uE200${index}\uE201`));
  }
  return formulas;
}

function plainDocumentText(value: string | undefined): string {
  if (!value) return "";
  const protectedLatex = protectRawLatex(value);
  const withLineBreaks = protectedLatex.text
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/(?:p|div|li|h[1-6])>/gi, "\n");

  if (typeof document !== "undefined") {
    const container = document.createElement("div");
    container.innerHTML = withLineBreaks;
    replaceRenderedMath(container);
    const structuredMath = replaceStructuredMath(container);
    return restoreRawLatex(
      restoreStructuredInlineMath(container.textContent || "", structuredMath),
      protectedLatex.formulas,
    )
      .replace(/\u00a0/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  return restoreRawLatex(
    decodeCommonHtmlEntities(withLineBreaks.replace(/<[^>]*>/g, "")),
    protectedLatex.formulas,
  )
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}


function documentImageMarker(index: number): string {
  return `${IMAGE_MARKER_START}${index}${IMAGE_MARKER_END}`;
}

function positiveDimension(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function extractRichDocumentContent(value: string | undefined): {
  text: string;
  images: DocumentImageReference[];
} {
  if (!value) return { text: "", images: [] };

  const images: DocumentImageReference[] = [];
  const appendImage = (
    source: string,
    alt = "文档图片",
    width: number | null = null,
    height: number | null = null,
  ): string => {
    const displaySize = parseDocumentImageDisplaySize(source);
    const index = images.push({
      source,
      alt,
      width: width ?? displaySize?.width ?? null,
      height: height ?? displaySize?.height ?? null,
    }) - 1;
    return documentImageMarker(index);
  };

  let marked = value.replace(
    /!\[([^\]]*)\]\(([^\s)]+)(?:\s+["'][^"']*["'])?\)/g,
    (_match, alt: string, source: string) => appendImage(source, alt || "文档图片"),
  );
  const protectedLatex = protectRawLatex(marked);
  marked = protectedLatex.text
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/(?:p|div|li|h[1-6])>/gi, "\n");

  if (typeof document !== "undefined") {
    const container = document.createElement("div");
    container.innerHTML = marked;
    container.querySelectorAll<HTMLImageElement>("img[src]").forEach((image) => {
      const source = image.getAttribute("src")?.trim();
      if (!source) {
        image.remove();
        return;
      }
      const width = positiveDimension(image.dataset.officeWidth || image.getAttribute("width"));
      const height = positiveDimension(image.dataset.officeHeight || image.getAttribute("height"));
      image.replaceWith(document.createTextNode(appendImage(
        source,
        image.alt || "文档图片",
        width,
        height,
      )));
    });
    replaceRenderedMath(container);
    const structuredMath = replaceStructuredMath(container);
    return {
      text: restoreRawLatex(
        restoreStructuredInlineMath(container.textContent || "", structuredMath),
        protectedLatex.formulas,
      )
        .replace(/\u00a0/g, " ")
        .replace(/\n{3,}/g, "\n\n")
        .trim(),
      images,
    };
  }

  marked = marked.replace(
    /<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi,
    (_match, source: string) => appendImage(source),
  );
  return {
    text: restoreRawLatex(
      decodeCommonHtmlEntities(marked.replace(/<[^>]*>/g, "")),
      protectedLatex.formulas,
    )
      .replace(/\n{3,}/g, "\n\n")
      .trim(),
    images,
  };
}

function rasterTypeFromContentType(contentType: string | null): RasterImageType | null {
  const normalized = contentType?.split(";", 1)[0]?.trim().toLowerCase();
  if (normalized === "image/png") return "png";
  if (normalized === "image/jpeg" || normalized === "image/jpg") return "jpg";
  if (normalized === "image/gif") return "gif";
  if (normalized === "image/bmp" || normalized === "image/x-ms-bmp") return "bmp";
  return null;
}

function rasterTypeFromData(data: Uint8Array): RasterImageType | null {
  if (data.length >= 8 && data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47)
    return "png";
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff)
    return "jpg";
  if (data.length >= 6 && String.fromCharCode(...data.slice(0, 6)).startsWith("GIF"))
    return "gif";
  if (data.length >= 2 && data[0] === 0x42 && data[1] === 0x4d)
    return "bmp";
  return null;
}

function jpegDimensions(data: Uint8Array): { width: number; height: number } | null {
  let offset = 2;
  while (offset + 8 < data.length) {
    if (data[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = data[offset + 1];
    if (marker === 0xd8 || marker === 0xd9) {
      offset += 2;
      continue;
    }
    if (offset + 4 > data.length) return null;
    const length = (data[offset + 2] << 8) | data[offset + 3];
    if (length < 2 || offset + 2 + length > data.length) return null;
    if (
      marker >= 0xc0 && marker <= 0xcf
      && ![0xc4, 0xc8, 0xcc].includes(marker)
      && offset + 8 < data.length
    ) {
      return {
        height: (data[offset + 5] << 8) | data[offset + 6],
        width: (data[offset + 7] << 8) | data[offset + 8],
      };
    }
    offset += 2 + length;
  }
  return null;
}

function rasterDimensions(
  data: Uint8Array,
  type: RasterImageType,
): { width: number; height: number } | null {
  if (type === "png" && data.length >= 24) {
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }
  if (type === "gif" && data.length >= 10) {
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    return { width: view.getUint16(6, true), height: view.getUint16(8, true) };
  }
  if (type === "bmp" && data.length >= 26) {
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    return {
      width: Math.abs(view.getInt32(18, true)),
      height: Math.abs(view.getInt32(22, true)),
    };
  }
  if (type === "jpg") return jpegDimensions(data);
  return null;
}

function decodeRasterDataUrl(value: string): { data: Uint8Array; type: RasterImageType } | null {
  const match = value.match(/^data:image\/(png|jpe?g|gif|bmp);base64,([a-z0-9+/=]+)$/i);
  if (!match) return null;
  const binary = atob(match[2]);
  const data = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return { data, type: match[1].toLowerCase().startsWith("jp") ? "jpg" : match[1].toLowerCase() as RasterImageType };
}

function imageTransformation(
  image: DocumentImageReference,
  intrinsic: { width: number; height: number } | null,
): { width: number; height: number } {
  const preferred = image.width && image.height
    ? { width: image.width, height: image.height }
    : intrinsic && intrinsic.width > 0 && intrinsic.height > 0
      ? intrinsic
      : { width: 480, height: 320 };
  const scale = Math.min(1, MAX_DOCUMENT_IMAGE_WIDTH / preferred.width);
  return {
    width: Math.max(1, Math.round(preferred.width * scale)),
    height: Math.max(1, Math.round(preferred.height * scale)),
  };
}

async function loadDocumentImage(image: DocumentImageReference): Promise<ImageRun | null> {
  try {
    let data: Uint8Array;
    let type: RasterImageType | null;
    const dataUrl = decodeRasterDataUrl(image.source);
    if (dataUrl) {
      data = dataUrl.data;
      type = dataUrl.type;
    } else {
      const response = await fetch(image.source, { credentials: "same-origin" });
      if (!response.ok) return null;
      const raw = new Uint8Array(await response.arrayBuffer());
      const metafile = parseOfficeMetafileLayout(image.source);
      if (metafile) {
        const { convertEmfToDataUrl, convertWmfToDataUrl } = await import("emf-converter");
        const convertMetafile = metafile.format === "wmf" ? convertWmfToDataUrl : convertEmfToDataUrl;
        const converted = await convertMetafile(raw.buffer, {
          maxWidth: Math.min(2400, Math.max(64, Math.ceil((image.width || 1200) * 2))),
          maxHeight: Math.min(1600, Math.max(64, Math.ceil((image.height || 800) * 2))),
          dpiScale: 2,
        });
        const raster = converted ? decodeRasterDataUrl(converted) : null;
        if (!raster) return null;
        data = raster.data;
        type = raster.type;
      } else {
        data = raw;
        type = rasterTypeFromContentType(response.headers.get("content-type")) || rasterTypeFromData(raw);
      }
    }
    if (!type) return null;
    return new ImageRun({
      type,
      data,
      transformation: imageTransformation(image, rasterDimensions(data, type)),
    });
  } catch {
    return null;
  }
}

async function documentRichChildren(
  value: string | undefined,
  style: DocumentTextStyle = {},
): Promise<ParagraphChild[]> {
  const { text: extractedText, images } = extractRichDocumentContent(value);
  const text = mergeInlineFormulaRuns(extractedText);
  if (!text) return [textRun("", style)];

  const children: ParagraphChild[] = [];
  const tokenPattern = /\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$|\uE300(\d+)\uE301/g;
  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = tokenPattern.exec(text)) !== null) {
    if (match.index > cursor) {
      children.push(...textRunsWithLineBreaks(text.slice(cursor, match.index), style));
    }
    if (match[3] !== undefined) {
      const image = images[Number(match[3])];
      const imageRun = image ? await loadDocumentImage(image) : null;
      if (imageRun) children.push(imageRun);
      else if (image?.alt) children.push(textRun(`[${image.alt}]`, style));
    } else {
      const latex = (match[1] ?? match[2] ?? "").trim();
      const formula = latex ? latexToOmml(latex, style) : null;
      if (formula) children.push(formula);
      else children.push(...textRunsWithLineBreaks(match[0], style));
    }
    cursor = tokenPattern.lastIndex;
  }
  if (cursor < text.length) children.push(...textRunsWithLineBreaks(text.slice(cursor), style));
  return children.length > 0 ? children : [textRun("", style)];
}

async function createRichParagraph(
  value: string | undefined,
  options: {
    bold?: boolean;
    size?: number;
    color?: string;
    alignment?: (typeof AlignmentType)[keyof typeof AlignmentType];
    spacing?: { before?: number; after?: number; line?: number };
  } = {},
): Promise<Paragraph> {
  return new Paragraph({
    children: await documentRichChildren(value, {
      bold: options.bold,
      size: options.size,
      color: options.color,
    }),
    alignment: options.alignment ?? AlignmentType.LEFT,
    spacing: options.spacing,
  });
}

async function createRichLabeledParagraph(
  label: string,
  content: string,
  labelColor = "0B2545",
): Promise<Paragraph> {
  return new Paragraph({
    children: [
      textRun(`【${label}】`, { bold: true, color: labelColor, size: 22 }),
      ...await documentRichChildren(content, { size: 22 }),
    ],
    alignment: AlignmentType.LEFT,
    spacing: { line: 360 },
  });
}

function safeFileStem(title: string, fallback: string): string {
  return title.trim().replace(/[\\/:*?"<>|]/g, "_") || fallback;
}

function safeDocxFileName(title: string, fallback = "试卷"): string {
  return `${safeFileStem(title, fallback)}.docx`;
}

export type DocumentDownloadMode = "student" | "teacher" | "normal" | "answers";

const documentDownloadModeLabel: Record<DocumentDownloadMode, string> = {
  student: "学生用卷",
  teacher: "教师用卷",
  normal: "普通用卷",
  answers: "纯答案版",
};

interface DocumentBuildOptions {
  mode?: DocumentDownloadMode;
}

interface NumberedSolution {
  number: number;
  answer: string;
  analysis: string;
}

async function appendNumberedSolution(
  children: Paragraph[],
  solution: NumberedSolution,
  includeAnalysis: boolean,
): Promise<void> {
  children.push(new Paragraph({
    children: [
      textRun(`${solution.number}. `, { bold: true, size: 22 }),
      textRun("答案：", { bold: true, color: "059669", size: 22 }),
      ...await documentRichChildren(solution.answer, { color: "059669", size: 22 }),
    ],
    alignment: AlignmentType.LEFT,
    spacing: { before: 160, line: 360 },
  }));
  if (includeAnalysis) {
    children.push(new Paragraph({
      children: [
        textRun("解析：", { bold: true, color: "D4A24C", size: 22 }),
        ...await documentRichChildren(solution.analysis, { size: 22 }),
      ],
      alignment: AlignmentType.LEFT,
      spacing: { line: 360 },
    }));
  }
}

async function appendSolutionSection(
  children: Paragraph[],
  solutions: NumberedSolution[],
  mode: "normal" | "answers",
): Promise<void> {
  if (solutions.length === 0) return;
  children.push(createHeading(mode === "answers" ? "答案" : "答案解析", HeadingLevel.HEADING_2));
  for (const solution of solutions) {
    await appendNumberedSolution(children, solution, mode === "normal");
  }
}

async function downloadDocumentVariants(
  title: string,
  fallback: string,
  modes: DocumentDownloadMode[],
  build: (mode: DocumentDownloadMode) => Promise<Blob>,
): Promise<void> {
  const uniqueModes = Array.from(new Set(modes));
  if (uniqueModes.length === 0) throw new Error("请至少选择一种下载模式");

  const stem = safeFileStem(title, fallback);
  if (uniqueModes.length === 1) {
    const mode = uniqueModes[0];
    saveAs(await build(mode), `${stem}_${documentDownloadModeLabel[mode]}.docx`);
    return;
  }

  const zip = new JSZip();
  for (const mode of uniqueModes) {
    zip.file(`${stem}_${documentDownloadModeLabel[mode]}.docx`, await build(mode));
  }
  saveAs(await zip.generateAsync({ type: "blob" }), `${stem}_下载版本.zip`);
}

async function appendExamQuestion(
  children: Paragraph[],
  question: ExamPaperQuestion,
  linkedQuestion: Question | undefined,
  number: number,
  mode: DocumentDownloadMode,
  markMultiple: boolean,
  stemOverride?: string,
): Promise<void> {
  const stem = stemOverride || question.stem || linkedQuestion?.stem || "";
  const options = question.options?.length ? question.options : linkedQuestion?.options;
  const answer = question.answer || linkedQuestion?.answer || "暂无答案";
  const analysis = question.analysis || linkedQuestion?.analysis || "暂无解析";

  children.push(
    new Paragraph({
      children: [
        textRun(`${number}. `, { bold: true, size: 24 }),
        ...(markMultiple && (question.type === "multiple" || linkedQuestion?.type === "multiple")
          ? [textRun("（多选）", { bold: true, size: 24 })]
          : []),
        ...await documentRichChildren(stem, { size: 24 }),
      ],
      alignment: AlignmentType.LEFT,
      spacing: { before: 240, after: 120, line: 360 },
    }),
  );

  if (options?.length) {
    children.push(...await createOptionParagraphs(options));
  }

  if (mode === "teacher") {
    children.push(await createRichLabeledParagraph("答案", answer, "059669"));
    children.push(await createRichLabeledParagraph("解析", analysis, "D4A24C"));
  }
}

export async function buildExamPaperDocxBlob(
  paper: ExamPaper,
  questionsById: Record<string, Question> = {},
  options: DocumentBuildOptions = {},
): Promise<Blob> {
  const children: Paragraph[] = [];
  const contentBlocks = paper.contentBlocks || [];
  const mode = options.mode || "teacher";
  const solutions: NumberedSolution[] = [];
  const markMultiple = paper.layoutMode === "flat";

  if (contentBlocks.length > 0) {
    if (mode === "answers") {
      const title = plainDocumentText(
        contentBlocks.find((block) => block.type === "documentTitle")?.content || paper.title,
      );
      children.push(new Paragraph({
        children: documentTextChildren(title),
        heading: HeadingLevel.TITLE,
        alignment: AlignmentType.CENTER,
        spacing: { after: 360 },
      }));
    }
    let questionNumber = 0;
    for (const block of contentBlocks) {
      const content = plainDocumentText(block.content);
      if (block.type === "documentTitle") {
        if (mode === "answers") continue;
        children.push(
          new Paragraph({
            children: documentTextChildren(content),
            heading: HeadingLevel.TITLE,
            alignment: AlignmentType.CENTER,
            spacing: { after: 360 },
          }),
        );
        continue;
      }
      if (block.type === "groupTitle" || block.type === "heading") {
        if (mode === "answers") continue;
        children.push(createHeading(content));
        continue;
      }
      if (block.type === "knowledge") {
        if (mode === "answers") continue;
        if (block.title) children.push(createHeading(plainDocumentText(block.title), HeadingLevel.HEADING_3));
        if (block.content.trim()) children.push(await createRichParagraph(block.content, { spacing: { line: 360 } }));
        continue;
      }
      if (block.type === "question") {
        const question = paper.questions.find((item) => item.id === block.examPaperQuestionId)
          || paper.questions.find((item) => item.questionId && item.questionId === block.questionId);
        if (!question) {
          if (mode !== "answers" && block.content.trim()) {
            children.push(await createRichParagraph(block.content, { spacing: { line: 360 } }));
          }
          continue;
        }
        questionNumber += 1;
        const linkedQuestionId = question.questionId || block.questionId;
        const linkedQuestion = linkedQuestionId ? questionsById[linkedQuestionId] : undefined;
        const answer = question.answer || linkedQuestion?.answer || "暂无答案";
        const analysis = question.analysis || linkedQuestion?.analysis || "暂无解析";
        solutions.push({ number: questionNumber, answer, analysis });
        if (mode !== "answers") {
          await appendExamQuestion(
            children,
            question,
            linkedQuestion,
            questionNumber,
            mode,
            markMultiple,
            block.content,
          );
        }
        continue;
      }
      if (mode === "answers") continue;
      if (block.content.trim()) children.push(await createRichParagraph(block.content, { spacing: { line: 360 } }));
    }
  } else {
    children.push(
      new Paragraph({
        children: documentTextChildren(paper.title),
        heading: HeadingLevel.TITLE,
        alignment: AlignmentType.CENTER,
        spacing: { after: 180 },
      }),
    );
    if (mode !== "answers" && paper.description) {
      children.push(await createRichParagraph(paper.description, {
        color: "6B7280",
        alignment: AlignmentType.CENTER,
        spacing: { after: 120 },
      }));
    }
    if (mode !== "answers") {
      children.push(createParagraph(
        `${paper.grade} · ${paper.schoolYear} · ${paper.semester || "上学期"} · ${paper.duration} 分钟 · 满分 ${paper.totalScore} 分`,
        {
          color: "6B7280",
          size: 20,
          alignment: AlignmentType.CENTER,
          spacing: { after: 360 },
        },
      ));
    }
    for (const [index, question] of paper.questions.entries()) {
      const linkedQuestion = question.questionId ? questionsById[question.questionId] : undefined;
      solutions.push({
        number: index + 1,
        answer: question.answer || linkedQuestion?.answer || "暂无答案",
        analysis: question.analysis || linkedQuestion?.analysis || "暂无解析",
      });
      if (mode !== "answers") {
        await appendExamQuestion(
          children,
          question,
          linkedQuestion,
          index + 1,
          mode,
          markMultiple,
        );
      }
    }
  }

  if (mode === "normal" || mode === "answers") {
    await appendSolutionSection(children, solutions, mode);
  }

  if (children.length === 0) {
    children.push(createParagraph("该试卷暂无可下载内容。"));
  }

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: convertInchesToTwip(0.8),
              right: convertInchesToTwip(0.8),
              bottom: convertInchesToTwip(0.8),
              left: convertInchesToTwip(0.8),
            },
          },
        },
        children,
      },
    ],
  });

  return Packer.toBlob(doc);
}

export async function generateExamPaperDocx(
  paper: ExamPaper,
  questionsById: Record<string, Question> = {},
  options: DocumentBuildOptions = {},
): Promise<void> {
  const fileName = safeDocxFileName(paper.title);
  const blob = await buildExamPaperDocxBlob(paper, questionsById, options);
  saveAs(blob, fileName);
}

export async function downloadExamPaperDocxVariants(
  paper: ExamPaper,
  questionsById: Record<string, Question>,
  modes: DocumentDownloadMode[],
): Promise<void> {
  await downloadDocumentVariants(
    paper.title,
    "试卷",
    modes,
    (mode) => buildExamPaperDocxBlob(paper, questionsById, { mode }),
  );
}

async function appendLectureQuestion(
  children: Paragraph[],
  section: LectureSection,
  question: Question | undefined,
  number: number,
  mode: DocumentDownloadMode,
): Promise<void> {
  const label = section.customLabel || `${number}.`;
  const stem = question?.stem || section.content || section.title;
  children.push(new Paragraph({
    children: [
      textRun(`${label} `, { bold: true, size: 24 }),
      ...(question?.type === "multiple" ? [textRun("（多选）", { bold: true, size: 24 })] : []),
      ...await documentRichChildren(stem, { size: 24 }),
    ],
    alignment: AlignmentType.LEFT,
    spacing: { before: 240, after: 120, line: 360 },
  }));
  if (question?.options?.length) children.push(...await createOptionParagraphs(question.options));
  if (question && mode === "teacher") {
    children.push(await createRichLabeledParagraph("答案", question.answer || "暂无答案", "059669"));
    children.push(await createRichLabeledParagraph("解析", question.analysis || "暂无解析", "D4A24C"));
  }
}

async function appendLectureSections(
  children: Paragraph[],
  sections: LectureSection[],
  questionsById: Record<string, Question>,
  questionCounter: { value: number },
  mode: DocumentDownloadMode,
  solutions: NumberedSolution[],
  depth = 0,
  documentTitleSectionId: string | null = null,
): Promise<void> {
  for (const section of sections) {
    if (section.id === documentTitleSectionId) continue;
    if (section.type === "question") {
      questionCounter.value += 1;
      const question = section.questionId ? questionsById[section.questionId] : undefined;
      if (question) {
        solutions.push({
          number: questionCounter.value,
          answer: question.answer || "暂无答案",
          analysis: question.analysis || "暂无解析",
        });
      }
      if (mode !== "answers") {
        await appendLectureQuestion(
          children,
          section,
          question,
          questionCounter.value,
          mode,
        );
      }
    } else if (section.type === "chapter") {
      if (mode !== "answers") {
        const heading = section.customLabel ? `${section.customLabel} ${section.title}` : section.title;
        children.push(createHeading(
          plainDocumentText(heading),
          depth > 0 ? HeadingLevel.HEADING_3 : HeadingLevel.HEADING_2,
        ));
        if (section.content) children.push(await createRichParagraph(section.content, { spacing: { line: 360 } }));
      }
    } else if (section.type === "knowledge") {
      if (mode !== "answers" && section.content) {
        children.push(await createRichParagraph(section.content, { spacing: { line: 360 } }));
      }
    } else if (section.content || !["空白行", "[空白行]"].includes(section.title)) {
      if (mode !== "answers") {
        if (section.title && !["正文", "文档正文"].includes(section.title)) {
          const heading = section.customLabel ? `${section.customLabel} ${section.title}` : section.title;
          children.push(createHeading(plainDocumentText(heading), HeadingLevel.HEADING_3));
        }
        if (section.content) children.push(await createRichParagraph(section.content, { spacing: { line: 360 } }));
        else children.push(createParagraph(" ", { spacing: { after: 240 } }));
      }
    } else if (mode !== "answers") {
      children.push(createParagraph(" ", { spacing: { after: 240 } }));
    }
    if (section.children?.length) {
      await appendLectureSections(
        children,
        section.children,
        questionsById,
        questionCounter,
        mode,
        solutions,
        depth + 1,
        documentTitleSectionId,
      );
    }
  }
}

export async function buildLectureDocxBlob(
  lecture: Lecture,
  questionsById: Record<string, Question> = {},
  options: DocumentBuildOptions = {},
): Promise<Blob> {
  const children: Paragraph[] = [];
  const mode = options.mode || "teacher";
  const solutions: NumberedSolution[] = [];
  const documentTitle = lecture.contentBlocks
    ?.find((block) => block.type === "documentTitle")
    ?.content.trim() || lecture.title;
  const documentTitleSectionId = lecture.sections.find(
    (section) => section.type === "chapter" && section.title.trim() === documentTitle,
  )?.id || null;

  children.push(new Paragraph({
    children: documentTextChildren(documentTitle),
    heading: HeadingLevel.TITLE,
    alignment: AlignmentType.CENTER,
    spacing: { after: 360 },
  }));
  if (mode !== "answers" && lecture.description) {
    children.push(await createRichParagraph(lecture.description, {
      color: "6B7280",
      alignment: AlignmentType.CENTER,
      spacing: { after: 180 },
    }));
  }
  await appendLectureSections(
    children,
    lecture.sections,
    questionsById,
    { value: 0 },
    mode,
    solutions,
    0,
    documentTitleSectionId,
  );
  if (mode === "normal" || mode === "answers") {
    await appendSolutionSection(children, solutions, mode);
  }
  if (children.length === 1 && !lecture.description) {
    children.push(createParagraph("该讲义暂无可下载内容。"));
  }

  const doc = new Document({
    sections: [{
      properties: {
        page: {
          margin: {
            top: convertInchesToTwip(0.8),
            right: convertInchesToTwip(0.8),
            bottom: convertInchesToTwip(0.8),
            left: convertInchesToTwip(0.8),
          },
        },
      },
      children,
    }],
  });
  return Packer.toBlob(doc);
}

export async function generateLectureDocx(
  lecture: Lecture,
  questionsById: Record<string, Question> = {},
  options: DocumentBuildOptions = {},
): Promise<void> {
  const fileName = safeDocxFileName(lecture.title, "讲义");
  const blob = await buildLectureDocxBlob(lecture, questionsById, options);
  saveAs(blob, fileName);
}

export async function downloadLectureDocxVariants(
  lecture: Lecture,
  questionsById: Record<string, Question>,
  modes: DocumentDownloadMode[],
): Promise<void> {
  await downloadDocumentVariants(
    lecture.title,
    "讲义",
    modes,
    (mode) => buildLectureDocxBlob(lecture, questionsById, { mode }),
  );
}

export async function generateQuestionDocx(
  question: Question,
  options: {
    chapterNames?: string[];
    pointNames?: string[];
    remarks?: string[];
  } = {},
): Promise<void> {
  const { chapterNames = [], pointNames = [], remarks = [] } = options;

  const children: Paragraph[] = [];

  children.push(
    new Paragraph({
      text: "题目详情",
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      spacing: { after: 240 },
    }),
  );

  const metaParts: string[] = [];
  metaParts.push(`题型：${getDefaultQuestionTypeLabel(question.type)}`);
  metaParts.push(`难度：${difficultyLabel[question.difficulty]}`);
  if (question.grade) metaParts.push(`年级：${question.grade}`);
  if (question.schoolYear) metaParts.push(`学年：${question.schoolYear}`);
  if (question.sourceType) metaParts.push(`来源：${question.sourceType}`);

  children.push(
    createParagraph(metaParts.join("    "), {
      color: "6B7280",
      size: 20,
      alignment: AlignmentType.CENTER,
      spacing: { after: 360 },
    }),
  );

  children.push(createHeading("题干"));
  children.push(await createRichParagraph(question.stem, { spacing: { line: 360 } }));

  if (question.options && question.options.length > 0) {
    children.push(createHeading("选项"));
    children.push(...await createOptionParagraphs(question.options));
  }

  children.push(createHeading("答案"));
  children.push(
    await createRichParagraph(question.answer, {
      bold: true,
      color: "059669",
      spacing: { line: 360 },
    }),
  );

  children.push(createHeading("解析"));
  children.push(await createRichParagraph(question.analysis, { spacing: { line: 360 } }));

  if (chapterNames.length > 0 || pointNames.length > 0) {
    children.push(createHeading("关联信息"));
    if (chapterNames.length > 0) {
      children.push(createLabeledParagraph("章节", chapterNames.join("、")));
    }
    if (pointNames.length > 0) {
      children.push(createLabeledParagraph("知识点", pointNames.join("、")));
    }
  }

  if (remarks.length > 0) {
    children.push(createHeading("教师备注"));
    for (const [idx, remark] of remarks.entries()) {
      children.push(
        new Paragraph({
          children: [
            textRun(`${idx + 1}. `, { bold: true, color: "D4A24C", size: 22 }),
            ...await documentRichChildren(remark, { size: 22 }),
          ],
          alignment: AlignmentType.LEFT,
          spacing: { line: 360 },
        }),
      );
    }
  }

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: convertInchesToTwip(1),
              right: convertInchesToTwip(1),
              bottom: convertInchesToTwip(1),
              left: convertInchesToTwip(1),
            },
          },
        },
        children,
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const fileName = `题目_${question.id}.docx`;
  saveAs(blob, fileName);
}

export async function generateQuestionsDocx(
  questions: Question[],
  options: {
    title?: string;
    chapterMap?: Map<string, string>;
    knowledgeMap?: Map<string, string>;
    includeAnswers?: boolean;
  } = {},
): Promise<void> {
  const {
    title = "题目列表",
    includeAnswers = true,
  } = options;

  const children: Paragraph[] = [];

  children.push(
    new Paragraph({
      text: title,
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      spacing: { after: 360 },
    }),
  );

  children.push(
    createParagraph(`共 ${questions.length} 道题目`, {
      color: "6B7280",
      size: 20,
      alignment: AlignmentType.CENTER,
      spacing: { after: 480 },
    }),
  );

  for (const [qIndex, question] of questions.entries()) {
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: `${qIndex + 1}. `,
            bold: true,
            font: "宋体",
            size: 24,
          }),
          new TextRun({
            text: `[${getDefaultQuestionTypeLabel(question.type)}] [${difficultyLabel[question.difficulty]}]`,
            color: "6B7280",
            size: 20,
            font: "宋体",
          }),
        ],
        spacing: { before: 360, after: 120 },
      }),
    );

    children.push(await createRichParagraph(question.stem, { spacing: { line: 360 } }));

    if (question.options && question.options.length > 0) {
      children.push(...await createOptionParagraphs(question.options));
    }

    if (includeAnswers) {
      children.push(
        new Paragraph({
          children: [
            textRun("答案：", { bold: true, color: "059669", size: 22 }),
            ...await documentRichChildren(question.answer, { color: "059669", size: 22 }),
          ],
          alignment: AlignmentType.LEFT,
          spacing: { before: 120, line: 360 },
        }),
      );

      if (question.analysis) {
        children.push(
          new Paragraph({
            children: [
              textRun("解析：", { bold: true, color: "D4A24C", size: 22 }),
              ...await documentRichChildren(question.analysis, { size: 22 }),
            ],
            alignment: AlignmentType.LEFT,
            spacing: { line: 360 },
          }),
        );
      }
    }

    children.push(
      new Paragraph({
        children: [],
        border: {
          bottom: { style: BorderStyle.SINGLE, size: 1, color: "E5E7EB" },
        },
        spacing: { before: 240, after: 240 },
      }),
    );
  }

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: convertInchesToTwip(1),
              right: convertInchesToTwip(1),
              bottom: convertInchesToTwip(1),
              left: convertInchesToTwip(1),
            },
          },
        },
        children,
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const fileName = `${title}_${new Date().toISOString().slice(0, 10)}.docx`;
  saveAs(blob, fileName);
}
