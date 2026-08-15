import {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  Table, TableRow, TableCell, WidthType, AlignmentType,
  BorderStyle, convertInchesToTwip, ImportedXmlComponent,
  type ParagraphChild,
} from "docx";
import { saveAs } from "file-saver";
import katex from "katex";
import { mml2omml } from "mathml2omml";
import type { ExamPaper, ExamPaperQuestion, Lecture, LectureSection, Question } from "@/types";
import { getDefaultQuestionTypeLabel } from "@/lib/question-types";

const WORD_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const MATH_NS = "http://schemas.openxmlformats.org/officeDocument/2006/math";

const difficultyLabel = ["", "简单", "较易", "中等", "较难", "困难"];

interface DocumentTextStyle {
  bold?: boolean;
  size?: number;
  color?: string;
  font?: string;
}

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

function latexToOmml(latex: string, style: DocumentTextStyle = {}): ParagraphChild | null {
  try {
    const rendered = katex.renderToString(latex, {
      throwOnError: true,
      output: "mathml",
    });
    const mathml = rendered.match(/<math\b[\s\S]*?<\/math>/i)?.[0]
      ?.replace(/<annotation\b[\s\S]*?<\/annotation>/gi, "");
    if (!mathml) return null;
    const omml = mml2omml(mathml);
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
    alignment: options.alignment,
    spacing: options.spacing,
  });
}

function createLabeledParagraph(label: string, content: string, labelColor = "0B2545"): Paragraph {
  return new Paragraph({
    children: [
      textRun(`【${label}】`, { bold: true, color: labelColor, size: 22 }),
      ...documentTextChildren(content, { size: 22 }),
    ],
    spacing: { line: 360 },
  });
}

function createHeading(text: string, level: (typeof HeadingLevel)[keyof typeof HeadingLevel] = HeadingLevel.HEADING_2): Paragraph {
  return new Paragraph({
    children: documentTextChildren(text),
    heading: level,
    spacing: { before: 240, after: 120 },
  });
}

function createOptionsTable(options: string[]): Table {
  const rows: TableRow[] = [];
  const half = Math.ceil(options.length / 2);

  for (let i = 0; i < half; i++) {
    const cells: TableCell[] = [];
    const leftIdx = i;
    const rightIdx = i + half;

    cells.push(
      new TableCell({
        width: { size: 50, type: WidthType.PERCENTAGE },
        borders: {
          top: { style: BorderStyle.NONE },
          bottom: { style: BorderStyle.NONE },
          left: { style: BorderStyle.NONE },
          right: { style: BorderStyle.NONE },
        },
        children: [
          new Paragraph({
            children: [
              textRun(`${String.fromCharCode(65 + leftIdx)}. `, { bold: true, size: 22 }),
              ...documentTextChildren(options[leftIdx], { size: 22 }),
            ],
            spacing: { line: 360 },
          }),
        ],
      }),
    );

    if (rightIdx < options.length) {
      cells.push(
        new TableCell({
          width: { size: 50, type: WidthType.PERCENTAGE },
          borders: {
            top: { style: BorderStyle.NONE },
            bottom: { style: BorderStyle.NONE },
            left: { style: BorderStyle.NONE },
            right: { style: BorderStyle.NONE },
          },
          children: [
            new Paragraph({
              children: [
                textRun(`${String.fromCharCode(65 + rightIdx)}. `, { bold: true, size: 22 }),
                ...documentTextChildren(options[rightIdx], { size: 22 }),
              ],
              spacing: { line: 360 },
            }),
          ],
        }),
      );
    } else {
      cells.push(
        new TableCell({
          width: { size: 50, type: WidthType.PERCENTAGE },
          borders: {
            top: { style: BorderStyle.NONE },
            bottom: { style: BorderStyle.NONE },
            left: { style: BorderStyle.NONE },
            right: { style: BorderStyle.NONE },
          },
          children: [],
        }),
      );
    }

    rows.push(new TableRow({ children: cells }));
  }

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows,
  });
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
  const withLineBreaks = value
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/(?:p|div|li|h[1-6])>/gi, "\n");

  if (typeof document !== "undefined") {
    const container = document.createElement("div");
    container.innerHTML = withLineBreaks;
    replaceRenderedMath(container);
    const structuredMath = replaceStructuredMath(container);
    return restoreStructuredInlineMath(container.textContent || "", structuredMath)
      .replace(/\u00a0/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  return withLineBreaks
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function safeDocxFileName(title: string, fallback = "试卷"): string {
  const normalized = title.trim().replace(/[\\/:*?"<>|]/g, "_");
  return `${normalized || fallback}.docx`;
}

function appendExamQuestion(
  children: Array<Paragraph | Table>,
  question: ExamPaperQuestion,
  linkedQuestion: Question | undefined,
  number: number,
  stemOverride?: string,
) {
  const stem = plainDocumentText(stemOverride || question.stem || linkedQuestion?.stem);
  const options = question.options?.length ? question.options : linkedQuestion?.options;
  const answer = plainDocumentText(question.answer || linkedQuestion?.answer);
  const analysis = plainDocumentText(question.analysis || linkedQuestion?.analysis);

  children.push(
    new Paragraph({
      children: [
        textRun(`${number}. `, { bold: true, size: 24 }),
        ...documentTextChildren(stem, { size: 24 }),
        textRun(`  （${question.score} 分）`, { color: "6B7280", size: 20 }),
      ],
      spacing: { before: 240, after: 120, line: 360 },
    }),
  );

  if (options?.length) {
    children.push(createOptionsTable(options.map((option) => plainDocumentText(option))));
  }

  children.push(createLabeledParagraph("答案", answer || "暂无答案", "059669"));
  children.push(createLabeledParagraph("解析", analysis || "暂无解析", "D4A24C"));
}

export async function buildExamPaperDocxBlob(
  paper: ExamPaper,
  questionsById: Record<string, Question> = {},
): Promise<Blob> {
  const children: Array<Paragraph | Table> = [];
  const contentBlocks = paper.contentBlocks || [];

  if (contentBlocks.length > 0) {
    let questionNumber = 0;
    for (const block of contentBlocks) {
      const content = plainDocumentText(block.content);
      if (block.type === "documentTitle") {
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
        children.push(createHeading(content));
        continue;
      }
      if (block.type === "knowledge") {
        if (block.title) children.push(createHeading(plainDocumentText(block.title), HeadingLevel.HEADING_3));
        if (content) children.push(createParagraph(content, { spacing: { line: 360 } }));
        continue;
      }
      if (block.type === "question") {
        const question = paper.questions.find((item) => item.id === block.examPaperQuestionId)
          || paper.questions.find((item) => item.questionId && item.questionId === block.questionId);
        if (!question) {
          if (content) children.push(createParagraph(content, { spacing: { line: 360 } }));
          continue;
        }
        questionNumber += 1;
        const linkedQuestionId = question.questionId || block.questionId;
        appendExamQuestion(
          children,
          question,
          linkedQuestionId ? questionsById[linkedQuestionId] : undefined,
          questionNumber,
          content,
        );
        continue;
      }
      if (content) children.push(createParagraph(content, { spacing: { line: 360 } }));
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
    if (paper.description) {
      children.push(createParagraph(plainDocumentText(paper.description), {
        color: "6B7280",
        alignment: AlignmentType.CENTER,
        spacing: { after: 120 },
      }));
    }
    children.push(createParagraph(
      `${paper.grade} · ${paper.schoolYear} · ${paper.semester || "上学期"} · ${paper.duration} 分钟 · 满分 ${paper.totalScore} 分`,
      {
        color: "6B7280",
        size: 20,
        alignment: AlignmentType.CENTER,
        spacing: { after: 360 },
      },
    ));
    paper.questions.forEach((question, index) => {
      appendExamQuestion(
        children,
        question,
        question.questionId ? questionsById[question.questionId] : undefined,
        index + 1,
      );
    });
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
): Promise<void> {
  const fileName = safeDocxFileName(paper.title);
  const blob = await buildExamPaperDocxBlob(paper, questionsById);
  saveAs(blob, fileName);
}

function appendLectureQuestion(
  children: Array<Paragraph | Table>,
  section: LectureSection,
  question: Question | undefined,
  number: number,
) {
  const label = section.customLabel || `${number}.`;
  const stem = question?.stem || section.content || section.title;
  children.push(new Paragraph({
    children: [
      textRun(`${label} `, { bold: true, size: 24 }),
      ...documentTextChildren(stem, { size: 24 }),
    ],
    spacing: { before: 240, after: 120, line: 360 },
  }));
  if (question?.options?.length) children.push(createOptionsTable(question.options));
  if (question) {
    children.push(createLabeledParagraph("答案", question.answer || "暂无答案", "059669"));
    children.push(createLabeledParagraph("解析", question.analysis || "暂无解析", "D4A24C"));
  }
}

function appendLectureSections(
  children: Array<Paragraph | Table>,
  sections: LectureSection[],
  questionsById: Record<string, Question>,
  questionCounter: { value: number },
  depth = 0,
  documentTitleSectionId: string | null = null,
) {
  for (const section of sections) {
    if (section.id === documentTitleSectionId) continue;
    if (section.type === "question") {
      questionCounter.value += 1;
      appendLectureQuestion(
        children,
        section,
        section.questionId ? questionsById[section.questionId] : undefined,
        questionCounter.value,
      );
    } else if (section.type === "chapter") {
      const heading = section.customLabel ? `${section.customLabel} ${section.title}` : section.title;
      children.push(createHeading(
        plainDocumentText(heading),
        depth > 0 ? HeadingLevel.HEADING_3 : HeadingLevel.HEADING_2,
      ));
      if (section.content) children.push(createParagraph(section.content, { spacing: { line: 360 } }));
    } else if (section.type === "knowledge") {
      if (section.content) children.push(createParagraph(section.content, { spacing: { line: 360 } }));
    } else if (section.content || !["空白行", "[空白行]"].includes(section.title)) {
      if (section.title && !["正文", "文档正文"].includes(section.title)) {
        const heading = section.customLabel ? `${section.customLabel} ${section.title}` : section.title;
        children.push(createHeading(plainDocumentText(heading), HeadingLevel.HEADING_3));
      }
      if (section.content) children.push(createParagraph(section.content, { spacing: { line: 360 } }));
      else children.push(createParagraph(" ", { spacing: { after: 240 } }));
    } else {
      children.push(createParagraph(" ", { spacing: { after: 240 } }));
    }
    if (section.children?.length) {
      appendLectureSections(
        children,
        section.children,
        questionsById,
        questionCounter,
        depth + 1,
        documentTitleSectionId,
      );
    }
  }
}

export async function buildLectureDocxBlob(
  lecture: Lecture,
  questionsById: Record<string, Question> = {},
): Promise<Blob> {
  const children: Array<Paragraph | Table> = [];
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
  if (lecture.description) {
    children.push(createParagraph(lecture.description, {
      color: "6B7280",
      alignment: AlignmentType.CENTER,
      spacing: { after: 180 },
    }));
  }
  appendLectureSections(
    children,
    lecture.sections,
    questionsById,
    { value: 0 },
    0,
    documentTitleSectionId,
  );
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
): Promise<void> {
  const fileName = safeDocxFileName(lecture.title, "讲义");
  const blob = await buildLectureDocxBlob(lecture, questionsById);
  saveAs(blob, fileName);
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

  const children: (Paragraph | Table)[] = [];

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
  children.push(createParagraph(question.stem, { spacing: { line: 360 } }));

  if (question.options && question.options.length > 0) {
    children.push(createHeading("选项"));
    children.push(createOptionsTable(question.options));
  }

  children.push(createHeading("答案"));
  children.push(
    createParagraph(question.answer, {
      bold: true,
      color: "059669",
      spacing: { line: 360 },
    }),
  );

  children.push(createHeading("解析"));
  children.push(createParagraph(question.analysis, { spacing: { line: 360 } }));

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
    remarks.forEach((remark, idx) => {
      children.push(
        new Paragraph({
          children: [
            textRun(`${idx + 1}. `, { bold: true, color: "D4A24C", size: 22 }),
            ...documentTextChildren(remark, { size: 22 }),
          ],
          spacing: { line: 360 },
        }),
      );
    });
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

  const children: (Paragraph | Table)[] = [];

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

  questions.forEach((question, qIndex) => {
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

    children.push(createParagraph(question.stem, { spacing: { line: 360 } }));

    if (question.options && question.options.length > 0) {
      children.push(createOptionsTable(question.options));
    }

    if (includeAnswers) {
      children.push(
        new Paragraph({
          children: [
            textRun("答案：", { bold: true, color: "059669", size: 22 }),
            ...documentTextChildren(question.answer, { color: "059669", size: 22 }),
          ],
          spacing: { before: 120, line: 360 },
        }),
      );

      if (question.analysis) {
        children.push(
          new Paragraph({
            children: [
              textRun("解析：", { bold: true, color: "D4A24C", size: 22 }),
              ...documentTextChildren(question.analysis, { size: 22 }),
            ],
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
  });

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
