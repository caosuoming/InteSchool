import type { Material, Question, QuestionType } from "@/types";
import {
  isDocumentTableFragment,
  parseDocumentTable,
} from "@/lib/document-table";

export type DocumentBlockType =
  | "documentTitle"
  | "documentInfo"
  | "knowledge"
  | "groupTitle"
  | "question";

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

interface TextRange {
  start: number;
  end: number;
}

interface TrailingSolution {
  number: string;
  order: number;
  answer?: string;
  analysis?: string;
  summary?: string;
}

type TrailingSolutionHeadingKind = "answer" | "answerAnalysis";

interface NumberedTrailingEntry {
  number: string;
  rest: string;
}

function createBlockId(): string {
  return `doc-block-${crypto.randomUUID()}`;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const STRUCTURAL_FORMAT_CHARACTERS = /[\u00ad\u200b-\u200f\u202a-\u202e\u2060-\u2064\u2066-\u206f\ufeff]/g;

function normalizeStructuralText(value: string): string {
  return value
    .normalize("NFKC")
    .replace(STRUCTURAL_FORMAT_CHARACTERS, "");
}

function flexibleLiteralSource(value: string): string {
  return Array.from(normalizeStructuralText(value).replace(/\s+/g, ""))
    .map(escapeRegex)
    .join("\\s*");
}

const questionSectionLabels = [
  "不定项选择题",
  "单项选择题",
  "多项选择题",
  "选择题",
  "单选题",
  "多选题",
  "判断题",
  "填空题",
  "解答题",
  "计算题",
  "证明题",
];

const builtInQuestionSectionPattern = new RegExp(
  `^(?:[一二三四五六七八九十百]{1,3}|[0-9]{1,3})\\s*[、.,:)]\\s*(?:${questionSectionLabels
    .map(flexibleLiteralSource)
    .join("|")})(?:\\s|[(:]|$)`,
);

const dottedSectionHeadingPattern = /^\d{1,3}(?:\s*\.\s*\d{1,3}){2,4}\s+\S/;

const knowledgeBlockLabels = ["教学目标", "学习目标", "引入"];
const numberedKnowledgeBlockLabels = ["角度", "探究"];
const knowledgeBlockLabelSource = `(?:${knowledgeBlockLabels.map(flexibleLiteralSource).join("|")})`;
const numberedKnowledgeBlockLabelSource = `(?:${numberedKnowledgeBlockLabels.map(flexibleLiteralSource).join("|")})`;
const knowledgeBlockIndexSource = "(?:[\\d０-９]{1,3}|[零〇一二三四五六七八九十百两]{1,4})";
const knowledgeBlockStartPattern = new RegExp(
  `^(?:(?:[【［[]\\s*)${knowledgeBlockLabelSource}\\s*[】］\\]]|${knowledgeBlockLabelSource}(?=\\s|[:：、]|$)|(?:[【［[]\\s*)${numberedKnowledgeBlockLabelSource}\\s*(?:第\\s*)?${knowledgeBlockIndexSource}\\s*[】］\\]]|${numberedKnowledgeBlockLabelSource}\\s*(?:第\\s*)?${knowledgeBlockIndexSource}(?=\\s|[:：、.．)）]|$))`,
);

function isKnowledgeBlockStart(text: string): boolean {
  return knowledgeBlockStartPattern.test(normalizeStructuralText(text).trim());
}

const numberedSubQuestionAnalysisMarkerSource = String.raw`(?:(?:【|［|\[|\(|（)\s*)?小问\s*(?:第\s*)?(?:（|\()?\s*(?:[\d０-９]{1,3}|[零〇一二三四五六七八九十百两]+)\s*(?:）|\))?\s*详解(?:\s*(?:】|］|\]|\)|）))?`;

function keywordPattern(
  keywords: string[],
  rawAlternatives: string[] = [],
): RegExp | null {
  const alternatives = [
    ...rawAlternatives,
    ...[...new Set(keywords.map((keyword) => keyword.trim()).filter(Boolean))]
      .sort((left, right) => right.length - left.length)
      .map(escapeRegex),
  ];
  return alternatives.length ? new RegExp(`^(?:${alternatives.join("|")})\\s*[:：]?\\s*`) : null;
}

function detectSectionQuestionType(text: string): QuestionType | undefined {
  const normalized = normalizeStructuralText(text).replace(/\s+/g, "");
  if (/不定项选择|多项选择|多选|多个正确|不止一个|至少(?:有|选)/.test(normalized)) return "multiple";
  if (/单项选择|单选/.test(normalized)) return "single";
  if (/判断题|判断正误/.test(normalized)) return "judge";
  if (/填空题|填空/.test(normalized)) return "short";
  if (/解答题|计算题|证明题|论述题/.test(normalized)) return "essay";
  if (/选择题/.test(normalized)) return "single";
  return undefined;
}

function optionIndex(label: string): number {
  return label.toUpperCase().charCodeAt(0) - 65;
}

function scanInlineMathRanges(text: string): TextRange[] {
  const ranges: TextRange[] = [];
  let start = -1;
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] !== "$" || text[index - 1] === "\\") continue;
    if (start < 0) {
      start = index;
    } else {
      ranges.push({ start, end: index + 1 });
      start = -1;
    }
  }
  if (start >= 0) ranges.push({ start, end: text.length });
  return ranges;
}

function scanOptionMarkers(text: string, allowBare = false): OptionMarker[] {
  const pattern = /(^|[\s\u3000])(?:[（(]([A-Ha-h])[）)]|([A-Ha-h])[.．、:：)）]|([A-Ha-h])(?=[ \t\u3000]))[ \t\u3000]*/g;
  const inlineMathRanges = scanInlineMathRanges(text);
  const markers: OptionMarker[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    if (match[4] && !allowBare) continue;
    const label = match[2] || match[3] || match[4];
    if (!label) continue;
    const leading = match[1] || "";
    const start = match.index + leading.length;
    if (inlineMathRanges.some((range) => start > range.start && start < range.end)) continue;
    markers.push({
      start,
      contentStart: pattern.lastIndex,
      index: optionIndex(label),
    });
  }
  return markers;
}

function sequentialOptionMarkers(markers: OptionMarker[], expectedStart: number): OptionMarker[] {
  const first = markers.findIndex((marker) => marker.index === expectedStart);
  if (first < 0) return [];

  const selected = [markers[first]];
  let expected = expectedStart + 1;
  for (let index = first + 1; index < markers.length; index += 1) {
    if (markers[index].index !== expected) continue;
    selected.push(markers[index]);
    expected += 1;
  }
  return selected;
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

function extractOptionLine(text: string, expectedStart: number, allowBare: boolean): string[] | null {
  const markers = scanOptionMarkers(text);
  if (markers.length > 0 && !text.slice(0, markers[0].start).trim()) {
    const options = optionsFromRange(text, markers, expectedStart);
    if (options) return options;
  }
  if (!allowBare) return null;

  const flexibleMarkers = scanOptionMarkers(text, true);
  if (
    flexibleMarkers.length === 0
    || flexibleMarkers[0].index !== expectedStart
    || text.slice(0, flexibleMarkers[0].start).trim()
  ) return null;

  const selected = sequentialOptionMarkers(flexibleMarkers, expectedStart);
  if (selected.length === 0) return null;
  if (selected.length === 1) {
    const content = text.slice(selected[0].contentStart).trim();
    return content ? [content] : null;
  }
  return optionsFromRange(text, selected, expectedStart);
}

function splitQuestionAndInlineOptions(text: string, allowBare: boolean): { stem: string; options: string[] } | null {
  const markers = scanOptionMarkers(text);
  const firstA = markers.findIndex((marker) => marker.index === 0 && marker.start > 0);
  if (firstA >= 0) {
    const optionMarkers = markers.slice(firstA);
    const options = optionsFromRange(text, optionMarkers, 0);
    if (options && options.length >= 2) {
      const stem = text.slice(0, optionMarkers[0].start).trim();
      if (stem) return { stem, options };
    }
  }

  if (!allowBare) return null;
  const flexibleMarkers = scanOptionMarkers(text, true);
  const flexibleFirstA = flexibleMarkers.findIndex((marker) => marker.index === 0 && marker.start > 0);
  if (flexibleFirstA < 0) return null;
  const optionMarkers = sequentialOptionMarkers(flexibleMarkers.slice(flexibleFirstA), 0);
  if (optionMarkers.length < 3) return null;
  const options = optionsFromRange(text, optionMarkers, 0);
  if (!options) return null;
  const stem = text.slice(0, optionMarkers[0].start).trim();
  return stem ? { stem, options } : null;
}

function isImageLine(text: string): boolean {
  return /^!\[[^\]]*\]\([^)]+\)$/.test(text.trim());
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
  const normalized = normalizeStructuralText(text);
  const configured = [...new Set(config.headingKeywords.map((keyword) => keyword.trim()).filter(Boolean))]
    .sort((left, right) => right.length - left.length)
    .map(flexibleLiteralSource);
  const configuredPattern = configured.length
    ? new RegExp(`^(?:${configured.join("|")})\\s*[、.,)]\\s*`)
    : null;
  return Boolean(
    builtInQuestionSectionPattern.test(normalized)
    || dottedSectionHeadingPattern.test(normalized)
    || configuredPattern?.test(normalized)
    || /^第\s*[一二三四五六七八九十百0-9]+\s*[章节部分单元]\s*/.test(normalized)
    || /^#{1,6}\s+/.test(normalized),
  );
}

const builtInSummaryKeywords = [
  "思维升华",
  "【思维升华】",
  "规律方法",
  "【规律方法】",
  "易错提醒",
  "【易错提醒】",
  "反思感悟",
  "【反思感悟】",
  "反思",
  "【反思】",
  "感悟",
  "【感悟】",
];

const builtInProjectHeadingLabels = [
  "课前引入",
  "课后训练",
  "课后训练巩固提升",
  "知识梳理",
  "练习",
  "练习题",
  "训练",
  "拓展",
  "拓展提升",
  "提升练习",
  "提升训练",
];

function isProjectHeading(text: string, config: DocumentParseConfig): boolean {
  const categorizedKeywords = categorizedQuestionFieldKeywords(config);
  const structuredFieldPattern = keywordPattern([
    ...config.answerKeywords,
    ...categorizedKeywords.analysisKeywords,
    ...builtInTrailingAnalysisKeywords,
    ...categorizedKeywords.summaryKeywords,
  ]);
  const numberedSubQuestionAnalysisPattern = keywordPattern(
    [],
    [numberedSubQuestionAnalysisMarkerSource],
  );
  if (structuredFieldPattern?.test(text) || numberedSubQuestionAnalysisPattern?.test(text)) return false;

  const normalized = normalizeStructuralText(text).trim();
  if (/^[【［[][^】］\]\n]{1,40}[】］\]](?:\s*[:：]?\s*)$/.test(normalized)) return true;
  if (builtInProjectHeadingLabels.includes(normalized)) return true;
  if (/^[A-Z]组$/.test(normalized.toUpperCase())) return true;
  return /^(?:热点|考向|题型|类型)\s*(?:第\s*)?(?:[\d０-９]{1,3}|[零〇一二三四五六七八九十百两]{1,4})(?:\s|[、.．:：)）]|$)/.test(normalized);
}

function questionKeywordPrefixes(config: DocumentParseConfig): string[] {
  return [...new Set([
    ...config.questionKeywords,
    "训练",
    "巩固题",
  ]
    .map((keyword) => keyword.trim())
    .filter((keyword) => keyword && keyword !== "第"))]
    .sort((left, right) => right.length - left.length);
}

const questionScoreAnnotationSource = String.raw`[（(]\s*本\s*(?:小\s*)?题\s*(?:(?:满\s*分(?:\s*为)?|共)\s*)?[\d０-９]+(?:[.．][\d０-９]+)?\s*分\s*[）)]`;

function stripQuestionScoreAnnotation(text: string, config: DocumentParseConfig): string {
  const prefixes = questionKeywordPrefixes(config).map(escapeRegex);
  const keywordMarker = prefixes.length
    ? `(?:[【［[]\\s*)?(?:${prefixes.join("|")})\\s*(?:题\\s*)?(?:第\\s*)?[（(]?\\s*[\\d０-９零〇一二三四五六七八九十百两]+\\s*[）)]?(?:\\s*题)?(?:\\s*[】］\\]])?`
    : null;
  const questionMarkers = [
    String.raw`第\s*[\d０-９]+\s*题(?:\s*[、.．:：)）])?`,
    String.raw`[\d０-９]{1,4}\s*(?:[、.．)）]|题[、.．:：)）]?)`,
    keywordMarker,
  ].filter((marker): marker is string => Boolean(marker));

  const scoreAfterQuestionMarker = new RegExp(
    `^(\\s*(?:${questionMarkers.join("|")})\\s*)(?:${questionScoreAnnotationSource}\\s*)+`,
  );
  const afterMarker = text.replace(scoreAfterQuestionMarker, "$1").trim();
  if (afterMarker !== text.trim()) return afterMarker;

  const withoutLeadingScore = text
    .replace(new RegExp(`^\\s*(?:${questionScoreAnnotationSource}\\s*)+`), "")
    .trim();
  return withoutLeadingScore !== text.trim() && isQuestionStart(withoutLeadingScore, config)
    ? withoutLeadingScore
    : text.trim();
}

function isStandaloneQuestionScoreAnnotation(text: string): boolean {
  return new RegExp(`^\\s*(?:${questionScoreAnnotationSource}\\s*)+$`).test(text);
}

function isQuestionStart(text: string, config: DocumentParseConfig): boolean {
  if (/^第\s*[\d０-９]+\s*题(?:\s|[、.．:：)）]|$)/.test(text)) return true;
  if (/^[\d０-９]{1,4}\s*(?:[、.．)）]|题[、.．:：)）]?)(?:\s*\S|\s*$)/.test(text)) return true;

  const prefixes = questionKeywordPrefixes(config).map(escapeRegex);
  if (!prefixes.length) return false;
  const index = "[\\d０-９零〇一二三四五六七八九十百两]+";
  return new RegExp(
    `^(?:[【［[]\\s*)?(?:${prefixes.join("|")})\\s*(?:题\\s*)?(?:第\\s*)?[（(]?\\s*${index}\\s*[）)]?(?:\\s*题)?(?:\\s*[】］\\]])?`,
  ).test(text);
}

function stripPrefix(text: string, pattern: RegExp | null): string {
  return pattern ? text.replace(pattern, "").trim() : text.trim();
}

type QuestionField = "content" | "answer" | "analysis" | "summary";

interface QuestionFieldMarker {
  field: Exclude<QuestionField, "content">;
  start: number;
  end: number;
  contentStart: number;
}

type QuestionFieldPattern = [
  Exclude<QuestionField, "content">,
  RegExp | null,
  { preserveMarker?: boolean }?,
];

const solutionMarkerPattern = /^(?:【\s*)?(解答|解|证明)(?:\s*】)?(?:(?:\s*[:：]\s*)|(?:\s+(?=\S))|\s*$)/;
const numberedProofSolutionPattern = /^(?:[（(]\s*(?:[\d０-９]{1,3}|[ivxlcdm]+)\s*[）)]|[①-⑳])\s*(?:证明|证)(?:\s*[:：]\s*)?/i;
const numberedSubQuestionSolutionPattern = /^(?:[（(]\s*(?:[\d０-９]{1,3}|[ivxlcdm]+)\s*[）)]|[①-⑳])\s*(?:解答|解析|详解|分析|解)(?:(?:\s*[:：]\s*)|(?:\s+(?=\S))|\s*$)/i;
const implicitSolutionLeadPattern = /^(?:由|因为|由于|根据|联立|解得|可得|所以|故|从而|于是|设|令|作|易知|显然|不妨|将|把|代入|整理|消去|同理|又由|证明如下)/;

function appendQuestionField(
  block: Partial<DocumentBlock>,
  field: QuestionField,
  value: string,
): void {
  const normalized = value.trim();
  if (!normalized) return;
  const existing = block[field]?.trim();
  block[field] = existing ? `${existing}\n${normalized}` : normalized;
}

function normalizeQuestionNumber(value: string): string {
  return value.replace(/[０-９]/g, (digit) => String.fromCharCode(digit.charCodeAt(0) - 0xfee0));
}

function extractLeadingQuestionNumber(text: string): { number: string; rest: string } | null {
  const patterns = [
    /^第\s*([\d０-９]{1,4})\s*题(?:\s*[、.．:：)）])?\s*/,
    /^([\d０-９]{1,4})\s*(?:[、.．:：)）]|题[、.．:：)）]?)\s*/,
    /^[（(]\s*([\d０-９]{1,4})\s*[）)]\s*/,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (!match) continue;
    return {
      number: normalizeQuestionNumber(match[1]),
      rest: text.slice(match[0].length).trim(),
    };
  }
  return null;
}

function shouldContinueNumberedSummary(
  line: string,
  block: Partial<DocumentBlock>,
  config: DocumentParseConfig,
): boolean {
  const candidate = extractLeadingQuestionNumber(line);
  if (!candidate) return false;
  const candidateNumber = Number(candidate.number);
  if (!Number.isInteger(candidateNumber)) return false;

  const summary = block.summary?.trim() || "";
  const previous = summary
    .split("\n")
    .map((entry) => extractLeadingQuestionNumber(entry.trim()))
    .filter((entry): entry is { number: string; rest: string } => Boolean(entry))
    .at(-1);

  // Once an explicit summary/analysis marker has selected the summary field,
  // numbered lines are more likely to be list items than fresh questions. The
  // exception is the expected next top-level question. Word/PDF extraction can
  // put its number (for example, "4.") on a line by itself.
  const currentQuestionNumber = extractQuestionNumber(block.content || "", config);
  if (
    currentQuestionNumber
    && candidateNumber === Number(currentQuestionNumber) + 1
    && (
      looksLikeImplicitQuestion({ content: candidate.rest }, undefined, config)
      || (!candidate.rest && !previous)
    )
  ) {
    return false;
  }
  return previous ? candidateNumber === Number(previous.number) + 1 : true;
}

const nestedQuestionMarkerPattern = /^(?:[（(]\s*(?:[\d０-９]{1,3}|[ivxlcdm]+)\s*[）)]|[①-⑳])\s*/i;

function romanNumeralValue(value: string): number | undefined {
  const digits: Record<string, number> = {
    i: 1,
    v: 5,
    x: 10,
    l: 50,
    c: 100,
    d: 500,
    m: 1000,
  };
  const normalized = value.toLowerCase();
  if (!/^[ivxlcdm]+$/.test(normalized)) return undefined;

  let total = 0;
  for (let index = 0; index < normalized.length; index += 1) {
    const current = digits[normalized[index]];
    const next = digits[normalized[index + 1]] || 0;
    total += current < next ? -current : current;
  }
  return total || undefined;
}

function leadingNestedSubQuestionIndex(text: string): number | undefined {
  const trimmed = text.trim();
  const circled = /^([①-⑳])/.exec(trimmed);
  if (circled) return circled[1].codePointAt(0)! - 0x245f;

  const normalized = normalizeStructuralText(trimmed);
  const numeric = /^[（(]\s*([\d０-９]{1,3})\s*[）)]/.exec(normalized);
  if (numeric) return Number(normalizeQuestionNumber(numeric[1]));
  const roman = /^[（(]\s*([ivxlcdm]+)\s*[）)]/i.exec(normalized);
  if (roman) return romanNumeralValue(roman[1]);
  return undefined;
}

interface NestedSubQuestionMarker {
  start: number;
  end: number;
  index: number;
}

function scanNestedSubQuestionMarkers(text: string): NestedSubQuestionMarker[] {
  const pattern = /[（(]\s*(?:[\d０-９]{1,3}|[ivxlcdm]+)\s*[）)]|[①-⑳]/gi;
  const inlineMathRanges = scanInlineMathRanges(text);
  const markers: NestedSubQuestionMarker[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    if (inlineMathRanges.some((range) => match.index > range.start && match.index < range.end)) {
      continue;
    }
    const index = leadingNestedSubQuestionIndex(match[0]);
    if (!index) continue;
    markers.push({ start: match.index, end: pattern.lastIndex, index });
  }
  return markers;
}

function topLevelQuestionRemainder(
  text: string,
  config: DocumentParseConfig,
): { start: number; text: string } | null {
  const directPatterns = [
    /^第\s*[\d０-９]{1,4}\s*题(?:\s*[、.．:：)）])?\s*/,
    /^[\d０-９]{1,4}\s*(?:[、.．:：)）]|题[、.．:：)）]?)\s*/,
  ];
  for (const pattern of directPatterns) {
    const match = pattern.exec(text);
    if (match) return { start: match[0].length, text: text.slice(match[0].length) };
  }

  const prefixes = questionKeywordPrefixes(config).map(escapeRegex);
  if (!prefixes.length) return null;
  const index = "[\\d０-９零〇一二三四五六七八九十百两]+";
  const pattern = new RegExp(
    `^(?:[【［[]\\s*)?(?:${prefixes.join("|")})\\s*(?:题\\s*)?(?:第\\s*)?[（(]?\\s*${index}\\s*[）)]?(?:\\s*题)?(?:\\s*[】］\\]])?(?:\\s*[、.．:：)）])?\\s*`,
  );
  const match = pattern.exec(text);
  return match ? { start: match[0].length, text: text.slice(match[0].length) } : null;
}

function startsIndependentSubQuestionGroup(text: string, config: DocumentParseConfig): boolean {
  const remainder = topLevelQuestionRemainder(text, config);
  return Boolean(remainder && leadingNestedSubQuestionIndex(remainder.text) === 1);
}

function splitSequentialNestedSubQuestions(
  text: string,
  expectedIndex: number,
  searchStart = 0,
): { parts: string[]; nextExpectedIndex: number; matched: boolean } {
  const selected: NestedSubQuestionMarker[] = [];
  let expected = expectedIndex;
  for (const marker of scanNestedSubQuestionMarkers(text)) {
    if (marker.start < searchStart || marker.index !== expected) continue;
    selected.push(marker);
    expected += 1;
  }
  if (selected.length === 0) {
    return { parts: [text], nextExpectedIndex: expectedIndex, matched: false };
  }

  const parts: string[] = [];
  let start = 0;
  for (const marker of selected) {
    const before = text.slice(start, marker.start).trim();
    if (before) parts.push(before);
    start = marker.start;
  }
  const tail = text.slice(start).trim();
  if (tail) parts.push(tail);
  return { parts, nextExpectedIndex: expected, matched: true };
}

function expandIndependentSubQuestionLines(content: string, config: DocumentParseConfig): string[] {
  const source = content.replace(/\r\n?/g, "\n").split("\n");
  const lines: string[] = [];
  let expectedIndex: number | undefined;

  for (const originalLine of source) {
    const line = originalLine.trim();
    if (!line) {
      lines.push(originalLine);
      continue;
    }

    if (isKnowledgeBlockStart(line) || isHeading(line, config) || isProjectHeading(line, config)) {
      expectedIndex = undefined;
      lines.push(originalLine);
      continue;
    }

    if (isQuestionStart(line, config)) {
      expectedIndex = undefined;
      const remainder = topLevelQuestionRemainder(line, config);
      if (!remainder || leadingNestedSubQuestionIndex(remainder.text) !== 1) {
        lines.push(originalLine);
        continue;
      }

      const firstMarker = scanNestedSubQuestionMarkers(line)
        .find((marker) => marker.start >= remainder.start && marker.index === 1);
      const split = splitSequentialNestedSubQuestions(
        line,
        2,
        firstMarker?.end ?? remainder.start,
      );
      lines.push(...split.parts);
      expectedIndex = split.nextExpectedIndex;
      continue;
    }

    if (expectedIndex !== undefined) {
      const split = splitSequentialNestedSubQuestions(line, expectedIndex);
      if (split.matched) {
        lines.push(...split.parts);
        expectedIndex = split.nextExpectedIndex;
        continue;
      }
    }

    lines.push(originalLine);
  }
  return lines;
}

function splitIndependentSubQuestionField(value: string, count: number): string[] | null {
  if (count < 2) return null;
  const markers = scanNestedSubQuestionMarkers(value);
  const first = markers.find((marker) => marker.index === 1 && !value.slice(0, marker.start).trim());
  if (!first) return null;

  const selected = [first];
  let expected = 2;
  for (const marker of markers) {
    if (marker.start <= first.start || marker.index !== expected) continue;
    selected.push(marker);
    expected += 1;
    if (selected.length === count) break;
  }
  if (selected.length !== count) return null;

  return selected.map((marker, index) => value
    .slice(marker.end, selected[index + 1]?.start ?? value.length)
    .trim()
    .replace(/^[,，;；、:：]\s*/, "")
    .replace(/\s*[,，;；]$/, "")
    .trim());
}

function independentSubQuestionRun(
  questions: DocumentBlock[],
  startIndex: number,
  config: DocumentParseConfig,
): DocumentBlock[] {
  const first = questions[startIndex];
  if (!first || !startsIndependentSubQuestionGroup(first.content, config)) return [];

  const run = [first];
  let expected = 2;
  for (let index = startIndex + 1; index < questions.length; index += 1) {
    const question = questions[index];
    if (leadingNestedSubQuestionIndex(question.content) !== expected) break;
    run.push(question);
    expected += 1;
  }
  return run.length > 1 ? run : [];
}

function distributeIndependentSubQuestionFields(
  blocks: DocumentBlock[],
  config: DocumentParseConfig,
): void {
  const questions = blocks.filter((block) => block.type === "question");
  for (let index = 0; index < questions.length; index += 1) {
    const run = independentSubQuestionRun(questions, index, config);
    if (run.length === 0) continue;

    for (const field of ["answer", "analysis", "summary"] as const) {
      for (const source of run) {
        const value = source[field]?.trim();
        if (!value) continue;
        const parts = splitIndependentSubQuestionField(value, run.length);
        if (!parts) continue;
        run.forEach((question, partIndex) => {
          question[field] = parts[partIndex];
          question.questionType = inferQuestionType(question, question.questionType, config);
        });
        break;
      }
    }
    index += run.length - 1;
  }
}

function shouldContinueSequentialSubQuestion(
  line: string,
  block: Partial<DocumentBlock>,
  field: QuestionField,
): boolean {
  const candidate = leadingNestedSubQuestionIndex(line);
  if (!candidate) return false;

  const previous = (block[field] || "")
    .split("\n")
    .map(leadingNestedSubQuestionIndex)
    .filter((index): index is number => index !== undefined)
    .at(-1);
  return previous !== undefined && candidate === previous + 1;
}

function isNestedTrailingAnswerLine(
  line: string,
  entry: { number: string },
  current: TrailingSolution | undefined,
): boolean {
  if (!current || !nestedQuestionMarkerPattern.test(line)) return false;

  const currentNumber = Number(current.number);
  const candidateNumber = Number(entry.number);
  if (
    Number.isFinite(currentNumber)
    && Number.isFinite(candidateNumber)
    && candidateNumber <= currentNumber
  ) {
    return true;
  }

  return Boolean(current.answer && nestedQuestionMarkerPattern.test(current.answer));
}

function extractQuestionNumber(text: string, config: DocumentParseConfig): string | undefined {
  const direct = extractLeadingQuestionNumber(text);
  if (direct) return direct.number;

  const prefixes = questionKeywordPrefixes(config).map(escapeRegex);
  if (!prefixes.length) return undefined;
  const match = new RegExp(
    `^(?:[【［[]\\s*)?(?:${prefixes.join("|")})\\s*(?:题\\s*)?(?:第\\s*)?[（(]?\\s*([\\d０-９]{1,4})\\s*[）)]?`,
  ).exec(text);
  return match ? normalizeQuestionNumber(match[1]) : undefined;
}

function trailingSolutionHeadingKind(text: string): TrailingSolutionHeadingKind | null {
  const normalized = normalizeStructuralText(text)
    .replace(/\s+/g, "")
    .replace(/^[【［[(（]+/, "")
    .replace(/[】］\])）:：]+$/, "");
  if (/^(?:参考)?答案$/.test(normalized)) return "answer";
  if (/^(?:参考)?答案(?:与|和|及)?解析$/.test(normalized)) return "answerAnalysis";
  return null;
}

const builtInTrailingAnalysisKeywords = ["详解", "【详解】", "【解答】"];
const builtInAnalysisAsSummaryKeywords = ["分析", "【分析】", "分析："];

function isAnalysisAsSummaryKeyword(keyword: string): boolean {
  return keyword
    .replace(/\s+/g, "")
    .replace(/^[【［[(（]+/, "")
    .replace(/[】］\])）:：]+$/, "") === "分析";
}

function categorizedQuestionFieldKeywords(config: DocumentParseConfig): {
  analysisKeywords: string[];
  summaryKeywords: string[];
} {
  return {
    analysisKeywords: config.analysisKeywords
      .filter((keyword) => !isAnalysisAsSummaryKeyword(keyword)),
    summaryKeywords: [
      ...config.summaryKeywords,
      ...builtInAnalysisAsSummaryKeywords,
      ...builtInSummaryKeywords,
    ],
  };
}

function splitNumberedTrailingEntries(line: string): NumberedTrailingEntry[] {
  const markerPattern = /(^|[\s\u3000]+)(?:第\s*)?([\d０-９]{1,4})\s*(?:题\s*)?[、.．:：)）]\s*/g;
  const markers = [...line.matchAll(markerPattern)];
  if (markers.length === 0) return [];
  const firstIndex = markers[0].index || 0;
  if (line.slice(0, firstIndex).trim()) return [];

  return markers.map((marker, index) => ({
    number: normalizeQuestionNumber(marker[2]),
    rest: line.slice(
      (marker.index || 0) + marker[0].length,
      markers[index + 1]?.index ?? line.length,
    ).trim(),
  }));
}

function normalizeTableHeader(value: string): string {
  return value.replace(/[\s\u00a0:：、.．()（）【】\x5b\x5d]+/g, "").toLowerCase();
}

function isQuestionNumberHeader(value: string): boolean {
  return /^(?:题号|题目|序号|编号|question|no)$/.test(normalizeTableHeader(value));
}

function isAnswerHeader(value: string): boolean {
  return /^(?:参考)?答案$|^answer$/.test(normalizeTableHeader(value));
}

function tableQuestionNumber(value: string): string | null {
  const normalized = normalizeQuestionNumber(value).replace(/[\s\u00a0]/g, "");
  const match = /^(?:第)?(\d{1,4})(?:题)?[、.．:：)）]?$/.exec(normalized);
  return match?.[1] || null;
}

function tableAnswer(value: string): string {
  return value
    .replace(/^\s*(?:参考)?答案\s*[:：]?\s*/i, "")
    .trim();
}

function expandedTableRows(fragment: string): string[][] {
  return parseDocumentTable(fragment).map((row) => row.flatMap((cell) => (
    Array.from({ length: cell.colSpan || 1 }, () => cell.content.trim())
  )));
}

function trailingSolutionsFromTable(
  fragment: string,
  startOrder: number,
): TrailingSolution[] {
  if (!isDocumentTableFragment(fragment)) return [];
  const rows = expandedTableRows(fragment).filter((row) => row.some(Boolean));
  const entries = new Map<string, string>();
  const add = (numberValue: string, answerValue: string) => {
    const number = tableQuestionNumber(numberValue);
    const answer = tableAnswer(answerValue);
    if (number && answer && !entries.has(number)) entries.set(number, answer);
  };

  for (let rowIndex = 0; rowIndex + 1 < rows.length; rowIndex += 1) {
    const questionRow = rows[rowIndex];
    const answerRow = rows[rowIndex + 1];
    const labelled = isQuestionNumberHeader(questionRow[0] || "")
      && isAnswerHeader(answerRow[0] || "");
    const offset = labelled ? 1 : 0;
    const numbers = questionRow.slice(offset).map(tableQuestionNumber);
    const answers = answerRow.slice(offset).map(tableAnswer);
    const usable = numbers.filter(Boolean).length;
    if ((labelled && usable > 0) || (!labelled && usable >= 2 && answers.length >= usable)) {
      numbers.forEach((number, index) => {
        if (number) add(number, answers[index] || "");
      });
      rowIndex += 1;
    }
  }

  for (let headerIndex = 0; headerIndex < rows.length; headerIndex += 1) {
    const header = rows[headerIndex];
    const questionColumn = header.findIndex(isQuestionNumberHeader);
    const answerColumn = header.findIndex(isAnswerHeader);
    if (questionColumn < 0 || answerColumn < 0 || questionColumn === answerColumn) continue;
    for (const row of rows.slice(headerIndex + 1)) {
      add(row[questionColumn] || "", row[answerColumn] || "");
    }
  }

  if (entries.size === 0) {
    const vertical = rows
      .map((row) => ({
        number: tableQuestionNumber(row[0] || ""),
        answer: tableAnswer(row[1] || ""),
      }))
      .filter((entry) => entry.number && entry.answer);
    if (vertical.length >= 2) {
      vertical.forEach((entry) => add(entry.number!, entry.answer));
    }
  }

  return [...entries].map(([number, answer], index) => ({
    number,
    answer,
    order: startOrder + index,
  }));
}

function fieldSearchPattern(
  keywords: string[],
  rawAlternatives: string[] = [],
): RegExp | null {
  const alternatives = [
    ...rawAlternatives,
    ...[...new Set(keywords.map((keyword) => keyword.trim()).filter(Boolean))]
      .sort((left, right) => right.length - left.length)
      .map(escapeRegex),
  ];
  return alternatives.length ? new RegExp(`(?:${alternatives.join("|")})\\s*[:：]?\\s*`, "g") : null;
}

function scanQuestionFieldMarkers(
  text: string,
  patterns: QuestionFieldPattern[],
): QuestionFieldMarker[] {
  const candidates: QuestionFieldMarker[] = [];
  for (const [field, pattern, options] of patterns) {
    if (!pattern) continue;
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      const previous = text[match.index - 1];
      const bracketed = /^[【［[(（]/.test(match[0]);
      if (match.index > 0 && !/[\s\u3000；;]/.test(previous) && !bracketed) continue;
      candidates.push({
        field,
        start: match.index,
        end: pattern.lastIndex,
        contentStart: options?.preserveMarker ? match.index : pattern.lastIndex,
      });
    }
  }

  candidates.sort((left, right) => left.start - right.start || right.end - left.end);
  const markers: QuestionFieldMarker[] = [];
  for (const candidate of candidates) {
    const previous = markers.at(-1);
    if (previous && candidate.start < previous.end) continue;
    markers.push(candidate);
  }
  return markers;
}

function appendTrailingSolutionLine(
  solution: TrailingSolution,
  line: string,
  currentField: Exclude<QuestionField, "content"> | undefined,
  patterns: QuestionFieldPattern[],
): Exclude<QuestionField, "content"> | undefined {
  const markers = scanQuestionFieldMarkers(line, patterns);
  if (markers.length === 0) {
    if (currentField) appendQuestionField(solution, currentField, line);
    return currentField;
  }

  const leading = line.slice(0, markers[0].start).trim();
  if (leading && currentField) appendQuestionField(solution, currentField, leading);
  for (let index = 0; index < markers.length; index += 1) {
    const marker = markers[index];
    const value = line.slice(marker.contentStart, markers[index + 1]?.start ?? line.length).trim();
    appendQuestionField(solution, marker.field, value);
  }
  return markers.at(-1)?.field;
}

function parseTrailingSolutions(
  lines: string[],
  config: DocumentParseConfig,
): TrailingSolution[] {
  const categorizedKeywords = categorizedQuestionFieldKeywords(config);
  const analysisKeywords = [
    ...categorizedKeywords.analysisKeywords,
    ...builtInTrailingAnalysisKeywords,
  ];
  const patterns: QuestionFieldPattern[] = [
    ["answer", fieldSearchPattern(config.answerKeywords)],
    [
      "analysis",
      fieldSearchPattern([], [numberedSubQuestionAnalysisMarkerSource]),
      { preserveMarker: true },
    ],
    ["analysis", fieldSearchPattern(analysisKeywords)],
    ["summary", fieldSearchPattern(categorizedKeywords.summaryKeywords)],
  ];
  const anchoredPatterns = [
    keywordPattern(config.answerKeywords),
    keywordPattern(analysisKeywords, [numberedSubQuestionAnalysisMarkerSource]),
    keywordPattern(categorizedKeywords.summaryKeywords),
  ];
  const solutions: TrailingSolution[] = [];
  let current: TrailingSolution | undefined;
  let currentField: Exclude<QuestionField, "content"> | undefined;

  const submitCurrent = () => {
    if (current && (current.answer || current.analysis || current.summary)) solutions.push(current);
    current = undefined;
    currentField = undefined;
  };

  for (const originalLine of lines) {
    const line = originalLine.trim();
    if (!line || /^[-—–=*]{3,}$/.test(line)) continue;

    const tableSolutions = trailingSolutionsFromTable(line, solutions.length);
    if (tableSolutions.length > 0) {
      submitCurrent();
      solutions.push(...tableSolutions);
      continue;
    }

    const numberedEntries = splitNumberedTrailingEntries(line);
    if (numberedEntries.length > 0) {
      for (const entry of numberedEntries) {
        submitCurrent();
        current = {
          number: entry.number,
          order: solutions.length,
        };
        currentField = "answer";
        if (entry.rest) {
          currentField = appendTrailingSolutionLine(current, entry.rest, currentField, patterns)
            || currentField;
        }
      }
      continue;
    }

    let entry = extractLeadingQuestionNumber(line);
    if (entry && isNestedTrailingAnswerLine(line, entry, current)) {
      currentField = appendTrailingSolutionLine(current!, line, currentField, patterns)
        || currentField;
      continue;
    }
    if (!entry) {
      const bareNumber = /^([\d０-９]{1,4})\s+(.+)$/.exec(line);
      if (bareNumber && anchoredPatterns.some((pattern) => pattern?.test(bareNumber[2]))) {
        entry = {
          number: normalizeQuestionNumber(bareNumber[1]),
          rest: bareNumber[2].trim(),
        };
      }
    }
    if (entry) {
      submitCurrent();
      current = {
        number: entry.number,
        order: solutions.length,
      };
      currentField = "answer";
      currentField = entry.rest
        ? appendTrailingSolutionLine(current, entry.rest, currentField, patterns) || currentField
        : currentField;
      continue;
    }

    if (!current) continue;
    currentField = appendTrailingSolutionLine(current, line, currentField, patterns);
  }
  submitCurrent();
  return solutions;
}

function mergeTrailingSolutions(
  blocks: DocumentBlock[],
  solutions: TrailingSolution[],
  config: DocumentParseConfig,
  options: { allowPositionalFallback?: boolean } = {},
): number {
  const questions = blocks.filter((block) => block.type === "question");
  const questionsByNumber = new Map<string, DocumentBlock[]>();
  for (const question of questions) {
    const number = extractQuestionNumber(question.content, config);
    if (!number) continue;
    const matches = questionsByNumber.get(number) || [];
    matches.push(question);
    questionsByNumber.set(number, matches);
  }

  const used = new Set<DocumentBlock>();
  let merged = 0;
  for (const solution of solutions) {
    let target = questionsByNumber.get(solution.number)?.find((question) => !used.has(question));
    const ordinal = Number(solution.number) - 1;
    if (!target && Number.isInteger(ordinal) && ordinal >= 0 && ordinal < questions.length) {
      const ordinalTarget = questions[ordinal];
      if (!used.has(ordinalTarget)) target = ordinalTarget;
    }
    if (!target && options.allowPositionalFallback !== false && solutions.length === questions.length) {
      const positionalTarget = questions[solution.order];
      if (positionalTarget && !used.has(positionalTarget)) target = positionalTarget;
    }
    if (!target) continue;

    const targetIndex = questions.indexOf(target);
    const independentRun = targetIndex >= 0
      ? independentSubQuestionRun(questions, targetIndex, config)
      : [];
    if (independentRun.length > 1) {
      const splitAnswer = solution.answer
        ? splitIndependentSubQuestionField(solution.answer, independentRun.length)
        : null;
      const splitAnalysis = solution.analysis
        ? splitIndependentSubQuestionField(solution.analysis, independentRun.length)
        : null;
      const splitSummary = solution.summary
        ? splitIndependentSubQuestionField(solution.summary, independentRun.length)
        : null;
      if (splitAnswer || splitAnalysis || splitSummary) {
        independentRun.forEach((question, index) => {
          appendQuestionField(question, "answer", splitAnswer?.[index] || "");
          appendQuestionField(question, "analysis", splitAnalysis?.[index] || "");
          appendQuestionField(question, "summary", splitSummary?.[index] || "");
          question.questionType = inferQuestionType(question, question.questionType, config);
          used.add(question);
        });
        merged += independentRun.length;
        continue;
      }
    }

    appendQuestionField(target, "answer", solution.answer || "");
    appendQuestionField(target, "analysis", solution.analysis || "");
    appendQuestionField(target, "summary", solution.summary || "");
    target.questionType = inferQuestionType(target, target.questionType, config);
    used.add(target);
    merged += 1;
  }
  return merged;
}

function shouldStartImplicitAnalysis(
  line: string,
  block: Partial<DocumentBlock>,
  sectionType: QuestionType | undefined,
  config: DocumentParseConfig,
  hasFutureStructuredField: boolean,
): boolean {
  if (!hasFutureStructuredField || !implicitSolutionLeadPattern.test(line)) return false;
  if ((block.options?.length || 0) > 0) return false;

  const questionText = block.content?.trim() || "";
  const essayLike = sectionType === "essay"
    || config.essayKeywords.some((keyword) => keyword && questionText.includes(keyword))
    || /(?:求|证明|说明|计算|解答|求证|判断是否)/.test(questionText);
  const promptComplete = /[。！？?]$/.test(questionText)
    || /(?:求|证明|说明|计算|解答|求证|判断是否)/.test(questionText);
  return essayLike && promptComplete;
}

function extractExplicitSolution(
  line: string,
  block: Partial<DocumentBlock>,
): string | undefined {
  const questionText = block.content || "";
  const proofPrompt = /(?:证明|求证|请证)/.test(questionText);
  if ((numberedProofSolutionPattern.test(line) || numberedSubQuestionSolutionPattern.test(line)) && proofPrompt) {
    return line;
  }

  const match = solutionMarkerPattern.exec(line);
  if (!match) return undefined;

  if (match[1] === "证明") {
    if (!/(?:证明|求证|请证)/.test(questionText)) {
      return undefined;
    }
  }

  return line.slice(match[0].length).trim();
}

function looksLikeImplicitQuestion(
  block: Partial<DocumentBlock>,
  sectionType: QuestionType | undefined,
  config: DocumentParseConfig,
): boolean {
  const text = block.content?.trim() || "";
  if (!text || text.length > 4_000) return false;
  if (sectionType) return true;
  if (/[?？]/.test(text)) return true;
  if (/[（(][一二三四五六七八九十0-9]+[）)]/.test(text)) return true;
  if (/(?:已知|设|若|求|证明|求证|计算|判断|选择|写出|求出|说明|是否)/.test(text)) return true;
  return config.essayKeywords.some((keyword) => keyword && text.includes(keyword));
}

function parseDocumentBlocksCore(content: string, config: DocumentParseConfig): DocumentBlock[] {
  const blocks: DocumentBlock[] = [];
  const categorizedKeywords = categorizedQuestionFieldKeywords(config);
  const answerPattern = keywordPattern(config.answerKeywords);
  const analysisPattern = keywordPattern(
    [...categorizedKeywords.analysisKeywords, ...builtInTrailingAnalysisKeywords],
    [numberedSubQuestionAnalysisMarkerSource],
  );
  const numberedSubQuestionAnalysisPattern = keywordPattern(
    [],
    [numberedSubQuestionAnalysisMarkerSource],
  );
  const summaryPattern = keywordPattern(categorizedKeywords.summaryKeywords);
  let currentBlock: Partial<DocumentBlock> = {};
  let currentQuestionField: QuestionField = "content";
  let sectionQuestionType: QuestionType | undefined;
  let independentSubQuestionNextIndex: number | undefined;
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
    currentQuestionField = "content";
  };

  const lines = expandIndependentSubQuestionLines(content, config);
  const structuredFieldAhead = new Array<boolean>(lines.length).fill(false);
  let hasSeenStructuredField = false;
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    structuredFieldAhead[index] = hasSeenStructuredField;
    const trimmed = lines[index].trim();
    if (
      trimmed
      && (answerPattern?.test(trimmed)
        || analysisPattern?.test(trimmed)
        || summaryPattern?.test(trimmed))
    ) {
      hasSeenStructuredField = true;
    }
  }
  const hasFutureStructuredField = (index: number): boolean => structuredFieldAhead[index] || false;
  const nextNonEmptyLine = (index: number): string | undefined => {
    for (let nextIndex = index + 1; nextIndex < lines.length; nextIndex += 1) {
      const candidate = lines[nextIndex].trim();
      if (candidate) return candidate;
    }
    return undefined;
  };

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const originalLine = lines[lineIndex];
    let line = originalLine.trim();
    if (!line || /^[-—–=*]{3,}$/.test(line)) continue;

    if (isKnowledgeBlockStart(line)) {
      submitCurrent();
      independentSubQuestionNextIndex = undefined;
      sectionQuestionType = undefined;
      currentBlock = {
        type: "knowledge",
        content: originalLine,
        knowledgeTitle: line.length > 20 ? `${line.slice(0, 20)}...` : line,
      };
      continue;
    }

    if (isHeading(line, config) || isProjectHeading(line, config)) {
      submitCurrent();
      independentSubQuestionNextIndex = undefined;
      sectionQuestionType = detectSectionQuestionType(line);
      blocks.push({
        id: createBlockId(),
        type: "groupTitle",
        content: line,
        order: order++,
        status: "new",
      });
      continue;
    }

    if (isStandaloneQuestionScoreAnnotation(line)) {
      const nextLine = nextNonEmptyLine(lineIndex);
      if (nextLine && isQuestionStart(stripQuestionScoreAnnotation(nextLine, config), config)) continue;
    }

    line = stripQuestionScoreAnnotation(line, config);

    if (
      currentBlock.type === "question"
      && currentQuestionField === "summary"
      && shouldContinueNumberedSummary(line, currentBlock, config)
    ) {
      appendQuestionField(currentBlock, "summary", line);
      continue;
    }

    if (isQuestionStart(line, config)) {
      submitCurrent();
      independentSubQuestionNextIndex = startsIndependentSubQuestionGroup(line, config) ? 2 : undefined;
      const inline = splitQuestionAndInlineOptions(
        line,
        sectionQuestionType === "single" || sectionQuestionType === "multiple",
      );
      currentBlock = {
        type: "question",
        content: inline?.stem || line,
        options: inline?.options || [],
        questionType: detectSectionQuestionType(line),
        difficulty: 3,
      };
      currentQuestionField = "content";
      continue;
    }

    if (
      currentBlock.type === "question"
      && currentQuestionField === "content"
      && independentSubQuestionNextIndex !== undefined
      && leadingNestedSubQuestionIndex(line) === independentSubQuestionNextIndex
    ) {
      submitCurrent();
      const inline = splitQuestionAndInlineOptions(
        line,
        sectionQuestionType === "single" || sectionQuestionType === "multiple",
      );
      currentBlock = {
        type: "question",
        content: inline?.stem || line,
        options: inline?.options || [],
        questionType: detectSectionQuestionType(line),
        difficulty: 3,
      };
      currentQuestionField = "content";
      independentSubQuestionNextIndex += 1;
      continue;
    }

    if (currentBlock.type === "knowledge" && looksLikeImplicitQuestion(currentBlock, sectionQuestionType, config)) {
      const explicitSolution = extractExplicitSolution(line, currentBlock);
      const labelledAnalysis = analysisPattern?.test(line)
        ? stripPrefix(line, analysisPattern)
        : undefined;
      const implicitAnalysis = explicitSolution ?? labelledAnalysis;
      if (implicitAnalysis !== undefined) {
        currentBlock = {
          ...currentBlock,
          type: "question",
          knowledgeTitle: undefined,
          questionType: inferQuestionType(currentBlock, sectionQuestionType, config),
          difficulty: 3,
        };
        appendQuestionField(currentBlock, "analysis", implicitAnalysis);
        currentQuestionField = "analysis";
        continue;
      }
    }

    if (currentBlock.type === "question") {
      if (shouldContinueSequentialSubQuestion(line, currentBlock, currentQuestionField)) {
        appendQuestionField(currentBlock, currentQuestionField, line);
        continue;
      }
      const explicitSolution = extractExplicitSolution(
        line,
        currentBlock,
      );
      if (explicitSolution !== undefined) {
        appendQuestionField(currentBlock, "analysis", explicitSolution);
        currentQuestionField = "analysis";
        continue;
      }
    }
    if (currentBlock.type === "question" && answerPattern?.test(line)) {
      appendQuestionField(currentBlock, "answer", stripPrefix(line, answerPattern));
      currentQuestionField = "answer";
      continue;
    }
    if (currentBlock.type === "question" && numberedSubQuestionAnalysisPattern?.test(line)) {
      appendQuestionField(currentBlock, "analysis", line);
      currentQuestionField = "analysis";
      continue;
    }
    if (currentBlock.type === "question" && analysisPattern?.test(line)) {
      appendQuestionField(currentBlock, "analysis", stripPrefix(line, analysisPattern));
      currentQuestionField = "analysis";
      continue;
    }
    if (currentBlock.type === "question" && summaryPattern?.test(line)) {
      appendQuestionField(currentBlock, "summary", stripPrefix(line, summaryPattern));
      currentQuestionField = "summary";
      continue;
    }

    if (currentBlock.type === "question") {
      if (isImageLine(line)) {
        appendQuestionField(currentBlock, currentQuestionField, line);
        continue;
      }
      if (isDocumentTableFragment(line)) {
        appendQuestionField(currentBlock, currentQuestionField, line);
        continue;
      }
      if (currentQuestionField === "content") {
        const inline = splitQuestionAndInlineOptions(
          line,
          sectionQuestionType === "single" || sectionQuestionType === "multiple",
        );
        if (inline) {
          appendQuestionField(currentBlock, "content", inline.stem);
          currentBlock.options = inline.options;
          continue;
        }
        const options = extractOptionLine(
          line,
          currentBlock.options?.length || 0,
          sectionQuestionType === "single"
            || sectionQuestionType === "multiple"
            || currentBlock.questionType === "single"
            || currentBlock.questionType === "multiple",
        );
        if (options) {
          currentBlock.options = [...(currentBlock.options || []), ...options];
          continue;
        }
        if ((currentBlock.options?.length || 0) > 0) {
          const lastIndex = currentBlock.options!.length - 1;
          currentBlock.options![lastIndex] = `${currentBlock.options![lastIndex]} ${line}`.trim();
          continue;
        }
        if (shouldStartImplicitAnalysis(
          line,
          currentBlock,
          sectionQuestionType,
          config,
          hasFutureStructuredField(lineIndex),
        )) {
          appendQuestionField(currentBlock, "analysis", line);
          currentQuestionField = "analysis";
          continue;
        }
      }
      appendQuestionField(currentBlock, currentQuestionField, line);
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
  distributeIndependentSubQuestionFields(blocks, config);
  const firstStructuredIndex = blocks.findIndex((block) =>
    block.type === "groupTitle" || block.type === "question");
  if (firstStructuredIndex > 0 && blocks[0]?.type === "knowledge") {
    const preambleLines = blocks[0].content
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    if (preambleLines.length > 0) {
      const original = blocks[0];
      const preambleBlocks: DocumentBlock[] = [{
        ...original,
        type: "documentTitle",
        content: preambleLines[0],
      }];
      if (preambleLines.length > 1) {
        preambleBlocks.push({
          id: createBlockId(),
          type: "documentInfo",
          content: preambleLines.slice(1).join("\n"),
          order: original.order + 1,
          status: "new",
        });
      }
      const next = [...preambleBlocks, ...blocks.slice(1)];
      next.forEach((block, index) => {
        block.order = index;
      });
      return next;
    }
  }
  return blocks;
}

export function parseDocumentBlocks(content: string, config: DocumentParseConfig): DocumentBlock[] {
  const lines = content.replace(/\r\n?/g, "\n").split("\n");
  const solutionHeadingIndexes = lines
    .map((line, index) => ({ index, kind: trailingSolutionHeadingKind(line.trim()) }))
    .filter((entry): entry is { index: number; kind: TrailingSolutionHeadingKind } => Boolean(entry.kind))
    .reverse();

  for (const { index: headingIndex, kind } of solutionHeadingIndexes) {
    const solutions = parseTrailingSolutions(lines.slice(headingIndex + 1), config);
    if (solutions.length === 0) continue;

    const blocks = parseDocumentBlocksCore(lines.slice(0, headingIndex).join("\n"), config);
    const questions = blocks.filter((block) => block.type === "question");
    if (questions.length === 0) continue;
    if (kind === "answer" && questions.some((question) => question.answer || question.analysis)) continue;

    const merged = mergeTrailingSolutions(blocks, solutions, config, {
      allowPositionalFallback: kind !== "answer",
    });
    const requiredMatches = kind === "answer" ? Math.min(2, questions.length) : 1;
    if (merged >= requiredMatches) return blocks;
  }

  return parseDocumentBlocksCore(content, config);
}
