import type { Material, Question, QuestionType } from "@/types";

export type DocumentBlockType = "question" | "knowledge" | "heading" | "unused";

export interface DocumentBlock {
  id: string;
  type: DocumentBlockType;
  content: string;
  order: number;
  questionType?: QuestionType;
  options?: string[];
  answer?: string;
  analysis?: string;
  summary?: string;
  difficulty?: number;
  knowledgeTitle?: string;
  status: "new" | "duplicate" | "edited";
  duplicateOf?: Question | Material;
}

export interface DocumentParseConfig {
  headingKeywords: string[];
  questionKeywords: string[];
  answerKeywords: string[];
  analysisKeywords: string[];
  summaryKeywords: string[];
  singleChoiceKeywords: string[];
  multipleChoiceKeywords: string[];
  fillBlankKeywords: string[];
  essayKeywords: string[];
}

interface OptionMarker {
  start: number;
  contentStart: number;
  index: number;
}

function createBlockId(): string {
  return `doc-block-${crypto.randomUUID()}`;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function keywordPattern(keywords: string[]): RegExp | null {
  const alternatives = [...new Set(keywords.map((keyword) => keyword.trim()).filter(Boolean))]
    .sort((left, right) => right.length - left.length)
    .map(escapeRegex);
  return alternatives.length ? new RegExp(`^(?:${alternatives.join("|")})\\s*[:：]?\\s*`) : null;
}

function detectSectionQuestionType(text: string): QuestionType | undefined {
  if (/多项选择|多选|多个正确|不止一个|至少(?:有|选)/.test(text)) return "multiple";
  if (/单项选择|单选/.test(text)) return "single";
  if (/判断题|判断正误/.test(text)) return "judge";
  if (/填空题|填空/.test(text)) return "short";
  if (/解答题|计算题|证明题|论述题/.test(text)) return "essay";
  if (/选择题/.test(text)) return "single";
  return undefined;
}

function optionIndex(label: string): number {
  const circleLabels = "①②③④⑤⑥⑦⑧⑨⑩";
  const circleIndex = circleLabels.indexOf(label);
  if (circleIndex >= 0) return circleIndex;
  return label.toUpperCase().charCodeAt(0) - 65;
}

function scanOptionMarkers(text: string): OptionMarker[] {
  const pattern = /(^|[\s\u3000])(?:[（(]([A-Ha-h])[）)]|([A-Ha-h])[.．、:：)）]|([①②③④⑤⑥⑦⑧⑨⑩]))\s*/g;
  const markers: OptionMarker[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const label = match[2] || match[3] || match[4];
    if (!label) continue;
    const leading = match[1] || "";
    markers.push({
      start: match.index + leading.length,
      contentStart: pattern.lastIndex,
      index: optionIndex(label),
    });
  }
  return markers;
}

function optionsFromRange(text: string, markers: OptionMarker[], expectedStart: number): string[] | null {
  if (markers.length === 0 || markers[0].index !== expectedStart) return null;
  const options: string[] = [];
  for (let index = 0; index < markers.length; index += 1) {
    const marker = markers[index];
    if (marker.index !== expectedStart + index) return null;
    const end = markers[index + 1]?.start ?? text.length;
    const content = text.slice(marker.contentStart, end).trim();
    if (!content) return null;
    options.push(content);
  }
  return options;
}

function extractOptionLine(text: string, expectedStart: number): string[] | null {
  const markers = scanOptionMarkers(text);
  if (markers.length === 0 || text.slice(0, markers[0].start).trim()) return null;
  return optionsFromRange(text, markers, expectedStart);
}

function splitQuestionAndInlineOptions(text: string): { stem: string; options: string[] } | null {
  const markers = scanOptionMarkers(text);
  const firstA = markers.findIndex((marker) => marker.index === 0 && marker.start > 0);
  if (firstA < 0) return null;
  const optionMarkers = markers.slice(firstA);
  const options = optionsFromRange(text, optionMarkers, 0);
  if (!options || options.length < 2) return null;
  const stem = text.slice(0, optionMarkers[0].start).trim();
  return stem ? { stem, options } : null;
}

function answerLetters(answer: string): string[] {
  const normalized = answer
    .replace(/答案|答|正确选项|选项/gi, "")
    .replace(/[^A-Ha-h]/g, "")
    .toUpperCase();
  return [...new Set(normalized)];
}

function inferQuestionType(
  block: Partial<DocumentBlock>,
  sectionType: QuestionType | undefined,
  config: DocumentParseConfig,
): QuestionType {
  const text = [block.content, block.answer].filter(Boolean).join("\n");
  if (config.multipleChoiceKeywords.some((keyword) => keyword && text.includes(keyword))) return "multiple";
  if (config.singleChoiceKeywords.some((keyword) => keyword && text.includes(keyword))) return "single";
  if (/判断题|判断正误|正确还是错误/.test(text)) return "judge";
  if (config.fillBlankKeywords.some((keyword) => keyword && text.includes(keyword))) return "short";
  if (config.essayKeywords.some((keyword) => keyword && text.includes(keyword))) return "essay";

  const options = block.options || [];
  const letters = answerLetters(block.answer || "");
  if (options.length >= 2) {
    if (letters.length > 1) return "multiple";
    if (sectionType === "multiple" || sectionType === "single") return sectionType;
    return "single";
  }
  if (sectionType && !["single", "multiple"].includes(sectionType)) return sectionType;
  return block.questionType || (text.length > 120 ? "essay" : "short");
}

function isHeading(text: string, config: DocumentParseConfig): boolean {
  const configured = [...new Set(config.headingKeywords.map((keyword) => keyword.trim()).filter(Boolean))]
    .sort((left, right) => right.length - left.length)
    .map(escapeRegex);
  const configuredPattern = configured.length
    ? new RegExp(`^(?:${configured.join("|")})[、.．)）]\\s*`)
    : null;
  return Boolean(
    configuredPattern?.test(text)
    || /^第[一二三四五六七八九十百\d]+[章节部分单元]\s*/.test(text)
    || /^#{1,6}\s+/.test(text),
  );
}

function isQuestionStart(text: string, config: DocumentParseConfig): boolean {
  if (/^第\s*\d+\s*题(?:\s|[、.．:：)）]|$)/.test(text)) return true;
  if (/^\d{1,4}\s*(?:[、.．)）]|题[、.．:：)）]?)\s*\S/.test(text)) return true;

  const prefixes = [...new Set(config.questionKeywords
    .map((keyword) => keyword.trim())
    .filter((keyword) => keyword && keyword !== "第"))]
    .sort((left, right) => right.length - left.length)
    .map(escapeRegex);
  if (!prefixes.length) return false;
  return new RegExp(`^(?:${prefixes.join("|")}|巩固题)\\s*(?:第?\\s*)?[\\d一二三四五六七八九十]+(?:\\s*题)?(?:[、.．:：)）]|\\s)`).test(text);
}

function stripPrefix(text: string, pattern: RegExp | null): string {
  return pattern ? text.replace(pattern, "").trim() : text.trim();
}

export function parseDocumentBlocks(content: string, config: DocumentParseConfig): DocumentBlock[] {
  const blocks: DocumentBlock[] = [];
  const answerPattern = keywordPattern(config.answerKeywords);
  const analysisPattern = keywordPattern(config.analysisKeywords);
  const summaryPattern = keywordPattern(config.summaryKeywords);
  let currentBlock: Partial<DocumentBlock> = {};
  let sectionQuestionType: QuestionType | undefined;
  let order = 0;

  const submitCurrent = () => {
    if (!currentBlock.content?.trim()) {
      currentBlock = {};
      return;
    }
    const block = {
      ...currentBlock,
      id: createBlockId(),
      content: currentBlock.content.trim(),
      order: order++,
      status: currentBlock.status || "new",
    } as DocumentBlock;
    if (block.type === "question") {
      block.options = (block.options || []).filter((option) => option.trim()).map((option) => option.trim());
      block.questionType = inferQuestionType(block, sectionQuestionType, config);
      block.difficulty ||= 3;
    }
    if (block.type === "knowledge" && !block.knowledgeTitle) {
      const firstLine = block.content.split("\n").find((line) => line.trim())?.trim() || "知识内容";
      block.knowledgeTitle = firstLine.length > 20 ? `${firstLine.slice(0, 20)}...` : firstLine;
    }
    blocks.push(block);
    currentBlock = {};
  };

  for (const originalLine of content.replace(/\r\n?/g, "\n").split("\n")) {
    const line = originalLine.trim();
    if (!line || /^[-—–=*]{3,}$/.test(line)) continue;

    if (isHeading(line, config)) {
      submitCurrent();
      sectionQuestionType = detectSectionQuestionType(line);
      blocks.push({
        id: createBlockId(),
        type: "heading",
        content: line,
        order: order++,
        status: "new",
      });
      continue;
    }

    if (isQuestionStart(line, config)) {
      submitCurrent();
      const inline = splitQuestionAndInlineOptions(line);
      currentBlock = {
        type: "question",
        content: inline?.stem || line,
        options: inline?.options || [],
        questionType: detectSectionQuestionType(line),
        difficulty: 3,
      };
      continue;
    }

    if (currentBlock.type === "question" && answerPattern?.test(line)) {
      currentBlock.answer = stripPrefix(line, answerPattern);
      continue;
    }
    if (currentBlock.type === "question" && analysisPattern?.test(line)) {
      currentBlock.analysis = stripPrefix(line, analysisPattern);
      continue;
    }
    if (currentBlock.type === "question" && summaryPattern?.test(line)) {
      currentBlock.summary = stripPrefix(line, summaryPattern);
      continue;
    }

    if (currentBlock.type === "question") {
      const options = extractOptionLine(line, currentBlock.options?.length || 0);
      if (options) {
        currentBlock.options = [...(currentBlock.options || []), ...options];
        continue;
      }
      if ((currentBlock.options?.length || 0) > 0 && !currentBlock.answer) {
        const lastIndex = currentBlock.options!.length - 1;
        currentBlock.options![lastIndex] = `${currentBlock.options![lastIndex]} ${line}`.trim();
        continue;
      }
      if (currentBlock.analysis) {
        currentBlock.analysis += `\n${line}`;
      } else {
        currentBlock.content = `${currentBlock.content}\n${line}`;
      }
      continue;
    }

    if (currentBlock.type === "knowledge") {
      currentBlock.content = `${currentBlock.content}\n${originalLine}`;
    } else {
      currentBlock = {
        type: "knowledge",
        content: originalLine,
        knowledgeTitle: line.length > 20 ? `${line.slice(0, 20)}...` : line,
      };
    }
  }

  submitCurrent();
  return blocks;
}
