import type { Material, Question, QuestionType } from "@/types";
import { extractUnderlinedAnswers, extractParenthesizedChoiceAnswer } from "@/lib/lesson-inline-answers";
import { normalizeQuestionTypeForSubject } from "@/lib/question-types";
import {
  ensureFillBlankAnswerArea,
  hasFillBlankAnswerArea,
} from "@/lib/fill-blank";
import {
  isDocumentTableFragment,
  parseDocumentTable,
} from "@/lib/document-table";
import { defaultProjectTypeKeywords } from "@/lib/document-project-heading-keywords";

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
  fillBlankOriginalContent?: string;
  order: number;
  questionType?: QuestionType;
  categories?: string[];
  suggestedCategories?: string[];
  options?: string[];
  answer?: string;
  analysis?: string;
  summary?: string;
  difficulty?: number;
  knowledgeTitle?: string;
  inlineAnswers?: string[];
  status: "new" | "duplicate" | "edited";
  duplicateOf?: Question | Material;
}

export interface DocumentParseConfig {
  subject?: string;
  headingKeywords: string[];
  projectTypeKeywords?: string[];
  questionKeywords: string[];
  answerKeywords: string[];
  analysisKeywords: string[];
  summaryKeywords: string[];
  singleChoiceKeywords: string[];
  multipleChoiceKeywords: string[];
  fillBlankKeywords: string[];
  essayKeywords: string[];
  /** 用户确认存在的数学题号。仅用于重新识别非标准题号标记。 */
  confirmedMathQuestionNumbers?: number[];
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
  "综合题",
];

const builtInQuestionSectionPattern = new RegExp(
  `^(?:[一二三四五六七八九十百]{1,3}|[0-9]{1,3})\\s*[、.,:)]\\s*(?:${questionSectionLabels
    .map(flexibleLiteralSource)
    .join("|")})(?:\\s|[(:]|$)`,
);

const dottedSectionHeadingPattern = /^\d{1,3}(?:\s*\.\s*\d{1,3}){2,4}\s+\S/;

const knowledgeBlockLabels = ["教学目标", "学习目标", "引入"];
const numberedKnowledgeBlockLabels = ["角度", "探究", "考法", "知识点"];
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
  if (/综合题/.test(normalized)) return "comprehensive";
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
  const plainPattern = /(^|[\s\u3000])(?:[（(]([A-Ha-h])[）)]|([A-Ha-h])[.．、:：)）]|([A-Ha-h])(?=[ \t\u3000]))[ \t\u3000]*/g;
  // Word math variables are extracted as italic HTML runs; OMML labels may
  // instead appear as standalone LaTeX expressions. Both can denote A-D.
  const mathLabelPattern = /(^|[\s\u3000])(?:<i\s+class=["']math-(?:variable|vector)["']>([A-Ha-h])<\/i>|\$([A-Ha-h])\$|\$\\(?:mathrm|mathit|mathbf)\{([A-Ha-h])\}\$)(?:([.．、:：)）])|(?=[ \t\u3000]))[ \t\u3000]*/g;
  const inlineMathRanges = scanInlineMathRanges(text);
  const markers: OptionMarker[] = [];
  let match: RegExpExecArray | null;
  while ((match = plainPattern.exec(text)) !== null) {
    if (match[4] && !allowBare) continue;
    const label = match[2] || match[3] || match[4];
    if (!label) continue;
    const leading = match[1] || "";
    const start = match.index + leading.length;
    if (inlineMathRanges.some((range) => start > range.start && start < range.end)) continue;
    markers.push({ start, contentStart: plainPattern.lastIndex, index: optionIndex(label) });
  }
  while ((match = mathLabelPattern.exec(text)) !== null) {
    if (!match[5] && !allowBare) continue;
    const label = match[2] || match[3] || match[4];
    const start = match.index + (match[1] || "").length;
    // A math-delimited label itself is safe; an HTML label embedded inside a
    // larger formula is not a new choice.
    if (inlineMathRanges.some((range) => start > range.start && start < range.end)) continue;
    markers.push({ start, contentStart: mathLabelPattern.lastIndex, index: optionIndex(label) });
  }
  return markers.sort((left, right) => left.start - right.start);
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

function mathChoiceAnswerType(answer: string): QuestionType | undefined {
  const normalized = normalizeStructuralText(answer)
    .replace(/^(?:参考答案|答案|正确选项|选项|答)\s*[:：]?\s*/, "")
    .replace(/\$\\(?:mathrm|mathit|mathbf)\{([A-D])\}\$/gi, "$1")
    .replace(/\$([A-D])\$/gi, "$1")
    .trim();
  if (!/^[A-Da-d\s,，、;；.．()（）【】]+$/.test(normalized)) return undefined;
  const letters = normalized.match(/[A-D]/gi);
  if (!letters) return undefined;
  return new Set(letters.map((letter) => letter.toUpperCase())).size > 1 ? "multiple" : "single";
}

function inferAtomicQuestionType(
  block: Partial<DocumentBlock>,
  sectionType: QuestionType | undefined,
  config: DocumentParseConfig,
): QuestionType {
  const text = [block.content, block.answer].filter(Boolean).join("\n");
  if (config.subject?.trim() === "地理" && sectionType === "comprehensive") return "comprehensive";
  const options = block.options || [];
  if (
    config.subject?.trim() === "数学"
    && (options.length >= 2
      || sectionType === "single" || sectionType === "multiple"
      || block.questionType === "single" || block.questionType === "multiple"
      || /选择|选出|选项/.test(block.content || ""))
  ) {
    const answerType = mathChoiceAnswerType(block.answer || "");
    if (answerType) return answerType;
  }
  if (config.multipleChoiceKeywords.some((keyword) => keyword && text.includes(keyword))) return "multiple";
  if (config.singleChoiceKeywords.some((keyword) => keyword && text.includes(keyword))) return "single";
  if (/判断题|判断正误|正确还是错误/.test(text)) return "judge";
  if (config.fillBlankKeywords.some((keyword) => keyword && text.includes(keyword))) return "short";
  if (config.essayKeywords.some((keyword) => keyword && text.includes(keyword))) return "essay";

  const letters = config.subject?.trim() === "数学" ? [] : answerLetters(block.answer || "");
  if (options.length >= 2) {
    if (letters.length > 1) return "multiple";
    if (sectionType === "multiple" || sectionType === "single") return sectionType;
    return "single";
  }
  if (hasFillBlankAnswerArea(block.content || "")) return "short";
  if (sectionType && !["single", "multiple"].includes(sectionType)) return sectionType;
  return block.questionType || (text.length > 120 ? "essay" : "short");
}

function inferQuestionType(
  block: Partial<DocumentBlock>,
  sectionType: QuestionType | undefined,
  config: DocumentParseConfig,
): QuestionType {
  if (config.subject?.trim() === "地理" && sectionType === "comprehensive") return "comprehensive";
  return inferSharedStemSubQuestionType(block, sectionType, config)
    || inferAtomicQuestionType(block, sectionType, config);
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

const descriptiveProjectHeadingLabels = [
  "题型突破",
  "举题说法",
  "随堂内化",
  "配套精炼",
];

function isCompactImageHeading(text: string): boolean {
  const match = /^!\[[^\]]*\]\(([^)]+)\)/.exec(text);
  if (!match) return false;

  let imageUrl: URL;
  try {
    imageUrl = new URL(match[1], "https://inteschool.invalid");
  } catch {
    return false;
  }
  const width = Number(imageUrl.searchParams.get("officeWidth"));
  const height = Number(imageUrl.searchParams.get("officeHeight"));
  if (!width || !height || height > 56 || width > 480 || width < 32) return false;

  const rest = text.slice(match[0].length).trim();
  if (!rest) return width >= height * 1.3;
  return rest.length <= 60
    && !/[。！？；;]$/.test(rest)
    && !/^(?:已知|若|设|求|证明|求证|计算|选择|解析|分析|答案|解答|解：|答：)/.test(rest)
    && !/^(?:\d{1,3}\s*[.．、]|第\s*[一二三四五六七八九十百\d]+\s*题)/.test(rest);
}


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
  if (config.subject?.trim() === "地理" && geographySummaryStartPattern.test(text)) return false;

  const normalized = normalizeStructuralText(text).trim();
  if (/^[【［[][^】］\]\n]{1,40}[】］\]](?:\s*[:：]?\s*)$/.test(normalized)) return true;
  const keywords = (config.projectTypeKeywords ?? defaultProjectTypeKeywords)
    .map((keyword) => normalizeStructuralText(keyword).trim())
    .filter(Boolean);
  if (keywords.includes(normalized)) return true;
  const descriptiveLabels = keywords.filter((keyword) => descriptiveProjectHeadingLabels.includes(keyword));
  if (descriptiveLabels.length && new RegExp(
    "^(?:" + descriptiveLabels.map(flexibleLiteralSource).join("|") + ")(?:\\s*[:：、]\\s*|\\s+)(?![。！？；;])[^。！？；;]{1,60}$",
  ).test(normalized)) return true;
  if (/^[A-Z]组(?:$|(?:\s+|[:：、]\s*)[^。！？；;]{1,60}$)/.test(normalized.toUpperCase())) return true;
  if (isCompactImageHeading(normalized)) return true;
  const numberedLabels = keywords.filter((keyword) => ["热点", "考向", "题型", "类型", "视角", "目标"].includes(keyword));
  if (!numberedLabels.length) return false;
  return new RegExp(
    "^(?:" + numberedLabels.map(flexibleLiteralSource).join("|") + ")\\s*(?:第\\s*)?(?:[\\d０-９]{1,3}|[零〇一二三四五六七八九十百两]{1,4})(?:\\s|[、.．:：)）]|$)",
  ).test(normalized);
}

function questionKeywordPrefixes(config: DocumentParseConfig): string[] {
  return [...new Set([
    ...config.questionKeywords,
    "延伸探究",
    "跟踪训练",
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

function mathQuestionNumber(text: string, confirmedNumbers: number[] = []): string | undefined {
  const normalized = normalizeStructuralText(text).trim();
  // 非标准标点只在数学科目中识别，避免其他学科的枚举列表被当成题目。
  const marked = /^(\d{1,4})\s*([,，。｡:：;；·•—–])\s*(.*)$/.exec(normalized);
  if (marked) {
    const [, number, separator, remainder] = marked;
    const rest = remainder.trim();
    if (!/^\d/.test(rest)
      && (!/[,·•—–]/.test(separator) || !rest || /^[\p{Script=Han}]/u.test(rest))) {
      return number;
    }
  }

  // 人工确认后才容许没有常规标点的行；必须有独立编号和正文。
  const uncertain = /^(\d{1,4})(?:\s+|[\p{P}])\s*(\S.*)$/u.exec(normalized);
  if (uncertain && confirmedNumbers.includes(Number(uncertain[1]))
    && !/^\d/.test(uncertain[2])) return uncertain[1];
  return undefined;
}

function isQuestionStart(text: string, config: DocumentParseConfig): boolean {
  if (config.subject?.trim() === "数学" && mathQuestionNumber(text, config.confirmedMathQuestionNumbers)) return true;
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

function mathQuestionNumberCandidate(text: string): { number: number; separated: boolean } | null {
  const normalized = normalizeStructuralText(text.trim());
  const match = /^([0-9]{1,4})([、.:：)；;!?！？·•。—–-]|\s+|(?=[\u3400-\u9fff]))/.exec(normalized);
  if (!match) return null;
  const rest = normalized.slice(match[0].length);
  // A decimal like "13.5" is not question 13.
  if (match[2] === "." && /^\d/.test(rest)) return null;
  return { number: Number(match[1]), separated: Boolean(match[2]) };
}

function isConfirmedMathQuestionStart(line: string, config: DocumentParseConfig): boolean {
  if (config.subject?.trim() !== "数学" || !config.confirmedMathQuestionNumbers?.length) return false;
  const candidate = mathQuestionNumberCandidate(line);
  return Boolean(candidate && config.confirmedMathQuestionNumbers.includes(candidate.number));
}

function isSequentialMathQuestionStart(
  line: string,
  block: Partial<DocumentBlock>,
  config: DocumentParseConfig,
): boolean {
  if (config.subject?.trim() !== "数学" || block.type !== "question") return false;
  const normalized = normalizeStructuralText(line.trim());
  const candidate = mathQuestionNumber(normalized, config.confirmedMathQuestionNumbers)
    || (/^\d{1,4}\s+(?:已知|设|若|求|计算|证明|判断|试|下列|选择|指出|写出|解答|阅读|根据|关于|如图|在|有)/.test(normalized)
      ? String(mathQuestionNumberCandidate(normalized)?.number || "") : undefined);
  const currentNumber = extractQuestionNumber(block.content || "", config);
  return Boolean(candidate && currentNumber && Number(candidate) === Number(currentNumber) + 1);
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
  if (config.subject?.trim() === "数学" && previous && candidateNumber === Number(previous.number) + 1) {
    return true;
  }
  if (
    currentQuestionNumber
    && candidateNumber === Number(currentQuestionNumber) + 1
    && (
      (config.subject?.trim() === "数学"
        && !(previous && candidateNumber === Number(previous.number) + 1))
      ||
      (config.subject?.trim() === "地理" && candidate.rest.length >= 5)
      || looksLikeImplicitQuestion({ content: candidate.rest }, undefined, config)
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
  const extendedInquiry = /^延伸\s*探究\s*(?:第\s*)?[（(]?\s*([\d０-９]{1,3})\s*[）)]?/.exec(trimmed);
  if (extendedInquiry) return Number(normalizeQuestionNumber(extendedInquiry[1]));
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

function scanExtendedInquiryMarkers(text: string): NestedSubQuestionMarker[] {
  const pattern = /延伸\s*探究\s*(?:第\s*)?[（(]?\s*([\d０-９]{1,3})\s*[）)]?/g;
  const markers: NestedSubQuestionMarker[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const index = Number(normalizeQuestionNumber(match[1]));
    if (!Number.isInteger(index) || index <= 0) continue;
    markers.push({ start: match.index, end: pattern.lastIndex, index });
  }
  return markers;
}

function scanGroupedSubQuestionMarkers(text: string): NestedSubQuestionMarker[] {
  return [...scanNestedSubQuestionMarkers(text), ...scanExtendedInquiryMarkers(text)]
    .sort((left, right) => left.start - right.start || left.end - right.end);
}

function sharedStemSubQuestionMarkers(
  text: string,
  config: DocumentParseConfig,
): NestedSubQuestionMarker[] {
  const remainder = topLevelQuestionRemainder(text, config);
  if (!remainder) return [];

  const markers = scanGroupedSubQuestionMarkers(text);
  const first = markers.find((marker) => marker.index === 1 && marker.start >= remainder.start);
  if (!first || !text.slice(remainder.start, first.start).trim()) return [];

  const selected = [first];
  let expected = 2;
  for (const marker of markers) {
    if (marker.start <= first.start || marker.index !== expected) continue;
    selected.push(marker);
    expected += 1;
  }
  return selected;
}

function splitGroupedSubQuestionValues(value: string, count: number): string[] | null {
  const marked = splitIndependentSubQuestionField(value, count);
  if (marked) return marked;

  const lines = value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.length === count ? lines : null;
}

function inferSharedStemSubQuestionType(
  block: Partial<DocumentBlock>,
  sectionType: QuestionType | undefined,
  config: DocumentParseConfig,
): QuestionType | undefined {
  const content = block.content?.trim() || "";
  if (!content) return undefined;
  const markers = sharedStemSubQuestionMarkers(content, config);
  if (markers.length === 0) return undefined;

  const answers = splitGroupedSubQuestionValues(block.answer || "", markers.length);
  const childTypes = markers.map((marker, index) => {
    const segment = content.slice(marker.start, markers[index + 1]?.start ?? content.length).trim();
    const explicitType = detectSectionQuestionType(segment);
    const inline = splitQuestionAndInlineOptions(
      segment,
      explicitType === "single"
        || explicitType === "multiple"
        || sectionType === "single"
        || sectionType === "multiple",
    );
    const options = inline?.options
      || (index === 0 ? block.options || [] : []);
    const inferred = inferAtomicQuestionType(
      {
        content: inline?.stem || segment,
        options,
        answer: answers?.[index],
        questionType: explicitType,
      },
      explicitType || sectionType,
      config,
    );
    if (
      inferred === "short"
      && options.length === 0
      && /(?:求|求出|求解|证明|计算|说明|论述|解答)/.test(inline?.stem || segment)
    ) return "essay";
    return inferred;
  });

  const uniqueTypes = [...new Set(childTypes)];
  return uniqueTypes.length === 1 ? uniqueTypes[0] : "comprehensive";
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
  const markers = scanGroupedSubQuestionMarkers(value);
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

function splitIndependentChoiceAnswerLines(
  value: string,
  questions: DocumentBlock[],
): string[] | null {
  if (questions.length < 2 || !questions.every((question) => (question.options?.length || 0) >= 2)) {
    return null;
  }

  const lines = value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length !== questions.length) return null;

  const valid = lines.every((line, index) => {
    const compact = line.replace(/[\s,，、/;；]/g, "");
    if (!/^[A-H]+$/i.test(compact)) return false;
    const optionCount = questions[index].options?.length || 0;
    return [...compact.toUpperCase()].every((label) => optionIndex(label) < optionCount);
  });
  return valid ? lines : null;
}

function splitIndependentSubQuestionAnswer(
  value: string,
  questions: DocumentBlock[],
): string[] | null {
  return splitIndependentSubQuestionField(value, questions.length)
    || splitIndependentChoiceAnswerLines(value, questions);
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
        const parts = field === "answer"
          ? splitIndependentSubQuestionAnswer(value, run)
          : splitIndependentSubQuestionField(value, run.length);
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
  if (config.subject?.trim() === "数学") {
    const mathNumber = mathQuestionNumber(text, config.confirmedMathQuestionNumbers);
    if (mathNumber) return mathNumber;
    const confirmedCandidate = mathQuestionNumberCandidate(text);
    if (confirmedCandidate && config.confirmedMathQuestionNumbers?.includes(confirmedCandidate.number)) {
      return String(confirmedCandidate.number);
    }
  }

  const prefixes = questionKeywordPrefixes(config).map(escapeRegex);
  if (!prefixes.length) return undefined;
  const match = new RegExp(
    `^(?:[【［[]\\s*)?(?:${prefixes.join("|")})\\s*(?:题\\s*)?(?:第\\s*)?[（(]?\\s*([\\d０-９]{1,4})\\s*[）)]?`,
  ).exec(text);
  return match ? normalizeQuestionNumber(match[1]) : undefined;
}

function trailingSolutionHeadingKind(text: string): TrailingSolutionHeadingKind | null {
  const compact = normalizeStructuralText(text)
    .replace(/\s+/g, "")
    .replace(/^[【［[(（]+/, "");
  const normalized = compact.replace(/[】］\])）:：]+$/, "");
  if (/^(?:参考)?答案$/.test(normalized)) return "answer";
  if (/^(?:参考)?答案(?:与|和|及)?解析$/.test(normalized)) return "answerAnalysis";
  const heading = /(?:参考)?答案(?:与|和|及)?解析|(?:参考)?答案/;
  const leading = new RegExp(`^(${heading.source})`).exec(compact);
  if (leading && (/^(?:[（(【［][^）)】］]{1,40}[）)】］])?$/.test(compact.slice(leading[0].length))
    || (leading[0].startsWith("参考答案")
      && /^[:：](?:第)?[\d０-９]{1,4}[、.．:：)）]\S/.test(compact.slice(leading[0].length))))) {
    return leading[0].includes("解析") ? "answerAnalysis" : "answer";
  }
  const trailing = new RegExp(`(${heading.source})$`).exec(normalized);
  if (trailing) {
    const prefix = normalized.slice(0, trailing.index);
    if (prefix.length > 0 && prefix.length <= 60 && !/[?？。！:：]/.test(prefix)) {
      return trailing[0].includes("解析") ? "answerAnalysis" : "answer";
    }
  }
  return null;
}

const geographySummaryLabelSource = String.raw`(?:【|［|\[)?\s*(?:难度|知识点|点睛)\s*(?:】|］|\])?\s*[:：]?\s*`;
const geographySummaryStartPattern = /^(?:(?:【|［|\[)\s*(?:难度|知识点|点睛)\s*(?:】|］|\])|(?:难度|知识点|点睛)\s*[:：])/;

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
    ["summary", config.subject?.trim() === "地理" ? fieldSearchPattern([], [geographySummaryLabelSource]) : null, { preserveMarker: true }],
    ["summary", fieldSearchPattern(categorizedKeywords.summaryKeywords)],
  ];
  const anchoredPatterns = [
    keywordPattern(config.answerKeywords),
    keywordPattern(analysisKeywords, [numberedSubQuestionAnalysisMarkerSource]),
    keywordPattern(categorizedKeywords.summaryKeywords, config.subject?.trim() === "地理" ? [geographySummaryLabelSource] : []),
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
        ? splitIndependentSubQuestionAnswer(solution.answer, independentRun)
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

function continuesSharedStemExtendedInquiry(
  line: string,
  block: Partial<DocumentBlock>,
  field: QuestionField,
  config: DocumentParseConfig,
): boolean {
  if (field !== "content" || block.type !== "question" || !/^延伸\s*探究/.test(line)) return false;
  const content = block.content?.trim() || "";
  if (!content || /^延伸\s*探究/.test(content)) return false;
  const remainder = topLevelQuestionRemainder(content, config);
  if (!remainder?.text.trim()) return false;
  const markers = scanExtendedInquiryMarkers(content);
  return leadingNestedSubQuestionIndex(line) === (markers.at(-1)?.index || 0) + 1;
}

function recoverSequentialMathQuestionLines(lines: string[], config: DocumentParseConfig): string[] {
  if (config.subject?.trim() !== "数学") return lines;

  const sections: number[] = [];
  const known = new Map<number, number>();
  const candidates = new Map<number, { number: number; rest: string }>();
  let section = 0;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (isHeading(line, config) || isProjectHeading(line, config) || isKnowledgeBlockStart(line)) section += 1;
    sections.push(section);
    if (!line) continue;

    const explicit = extractLeadingQuestionNumber(line);
    if (explicit && isQuestionStart(line, config)) {
      known.set(index, Number(explicit.number));
      continue;
    }

    const match = /^([\d０-９]{1,4})(.*)$/.exec(line);
    if (!match) continue;
    const rest = match[2].replace(/^[\s\u3000。·•:：\-－—?？]+/, "").trim();
    if (rest.length < 3 || !/^[（(【［\u3400-\u9fff]/.test(rest)) continue;
    // A number embedded in a formula or measurement is not a question label.
    if (!/^(?:[（(【［]|已知|设|若|求|计算|证明|判断|试|下列|选择|指出|写出|解答|阅读|根据|关于|如图|在|有)/.test(rest)) continue;
    candidates.set(index, { number: Number(normalizeQuestionNumber(match[1])), rest });
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (const [index, candidate] of candidates) {
      if (known.has(index) || candidate.number <= 0) continue;
      let previous: number | undefined;
      let next: number | undefined;
      for (let cursor = index - 1; cursor >= 0 && sections[cursor] === sections[index]; cursor -= 1) {
        if (known.has(cursor)) {
          previous = known.get(cursor);
          break;
        }
      }
      for (let cursor = index + 1; cursor < lines.length && sections[cursor] === sections[index]; cursor += 1) {
        if (known.has(cursor)) {
          next = known.get(cursor);
          break;
        }
      }
      const hasSeparator = /^[\d０-９]{1,4}\s*[、.．:：)）,，。｡;；·•—–]/.test(lines[index].trim());
      if ((hasSeparator && (candidate.number === (previous ?? -1) + 1 || candidate.number + 1 === next))
        || (next !== undefined && candidate.number + 1 === next
          && (previous === undefined || previous < candidate.number))) {
        known.set(index, candidate.number);
        changed = true;
      }
    }
  }

  return lines.map((line, index) => {
    const candidate = candidates.get(index);
    if (candidate && known.get(index) === candidate.number) {
      const original = line.trim();
      const priorRecovered = [...candidates].some(([otherIndex, other]) => otherIndex < index
        && known.get(otherIndex) === other.number && other.number === candidate.number - 1
        && !mathQuestionNumber(lines[otherIndex]));
      const directMath = mathQuestionNumber(original, config.confirmedMathQuestionNumbers);
      const whitespaceNumber = /^\d{1,4}\s+[\u3400-\u9fff]/.test(original);
      const priorIsSequential = [...known].some(([otherIndex, number]) => otherIndex < index
        && sections[otherIndex] === sections[index] && number === candidate.number - 1);
      if (!priorRecovered && (directMath || (whitespaceNumber && priorIsSequential))) return line;
      return `${candidate.number}. ${candidate.rest}`;
    }
    const colon = /^\s*([\d０-９]{1,4})\s*[:：]\s*(.*)$/.exec(line);
    if (colon && known.has(index) && known.get(index) === known.get(index + 1)! - 1) {
      return `${normalizeQuestionNumber(colon[1])}. ${colon[2]}`;
    }
    return line;
  });
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
  const summaryPattern = keywordPattern(
    categorizedKeywords.summaryKeywords,
    config.subject?.trim() === "地理" ? [geographySummaryLabelSource] : [],
  );
  let currentBlock: Partial<DocumentBlock> = {};
  let currentQuestionField: QuestionField = "content";
  let sectionQuestionType: QuestionType | undefined;
  let independentSubQuestionNextIndex: number | undefined;
  let separatedByBlank = false;
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
      const fillBlankSignal = sectionQuestionType === "short"
        || hasFillBlankAnswerArea(block.content)
        || config.fillBlankKeywords.some((keyword) => (
          keyword && [block.content, block.answer].filter(Boolean).join("\n").includes(keyword)
        ));
      if (block.questionType === "short" && fillBlankSignal && !/<u\b[^>]*>[^<]*\S[^<]*<\/u>/i.test(block.content)) {
        normalizeBlockFillBlankArea(block);
      }
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

  const normalizedContent = recoverSequentialMathQuestionLines(content.replace(/\r\n?/g, "\n").split("\n"), config).join("\n");
  const lines = expandIndependentSubQuestionLines(normalizedContent, config);
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
    if (!line) {
      separatedByBlank = true;
      continue;
    }
    const afterBlank = separatedByBlank;
    separatedByBlank = false;
    if (/^[-—–=*]{3,}$/.test(line)) continue;

    // Blank lines in geography papers often separate a new reading passage
    // from the previous question's final option.
    if (
      config.subject?.trim() === "地理"
      && currentBlock.type === "question"
      && currentQuestionField === "content"
      && (currentBlock.options?.length || 0) >= 2
      && !isQuestionStart(line, config)
      && !isImageLine(line)
      && !isDocumentTableFragment(line)
      && !extractOptionLine(line, currentBlock.options?.length || 0, true)
      && (afterBlank || startsGeographyReadingPassage(lines, lineIndex, config))
    ) {
      submitCurrent();
      const isUnnumberedQuestion = /[?？]/.test(line)
        && !/(?:据此|根据|阅读|读图|结合).{0,40}(?:完成|回答|作答)/.test(line);
      currentBlock = {
        type: isUnnumberedQuestion ? "question" : "knowledge",
        content: originalLine,
      };
      continue;
    }

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

    const isExpectedQuestionImage = isCompactImageHeading(line)
      && currentBlock.type === "question"
      && currentQuestionField === "content"
      && /(?:图|图形|图像|图示|如下|如图|下图|如下图|示意图)\s*[：:.。]?$/.test(currentBlock.content?.trim() || "");
    if (isHeading(line, config) || (!isExpectedQuestionImage && isProjectHeading(line, config))) {
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

    const confirmedMathStart = isConfirmedMathQuestionStart(line, config);
    const mathDecimal = config.subject?.trim() === "数学"
      && /^[\d０-９]{1,4}\s*[.．][\d０-９]/.test(line);
    if (
      currentBlock.type === "question"
      && currentQuestionField === "summary"
      && !confirmedMathStart
      && (mathDecimal || shouldContinueNumberedSummary(line, currentBlock, config))
    ) {
      appendQuestionField(currentBlock, "summary", line);
      continue;
    }

    if (!mathDecimal && (isQuestionStart(line, config)
      || isSequentialMathQuestionStart(line, currentBlock, config)
      || confirmedMathStart) && !continuesSharedStemExtendedInquiry(
      line, currentBlock, currentQuestionField, config,
    )) {
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
      && independentSubQuestionNextIndex !== undefined
      && leadingNestedSubQuestionIndex(line) === independentSubQuestionNextIndex
      && (
        currentQuestionField === "content"
        || !shouldContinueSequentialSubQuestion(line, currentBlock, currentQuestionField)
      )
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
      appendQuestionField(currentBlock, "summary", geographySummaryStartPattern.test(line)
        && config.subject?.trim() === "地理" ? line : stripPrefix(line, summaryPattern));
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

function normalizeBlockFillBlankArea(block: DocumentBlock): void {
  const content = ensureFillBlankAnswerArea(block.content, block.answer);
  if (content === block.content) return;
  block.fillBlankOriginalContent ??= block.content;
  block.content = content;
}

function normalizeInlineDocumentAnswers(blocks: DocumentBlock[]): DocumentBlock[] {
  for (const block of blocks) {
    if (block.type === "knowledge") {
      const extracted = extractUnderlinedAnswers(block.content, true);
      block.content = extracted.content;
      if (extracted.answers.length) block.inlineAnswers = extracted.answers;
      continue;
    }
    if (block.type !== "question") continue;
    if (block.questionType === "single" || block.questionType === "multiple") {
      const extracted = extractParenthesizedChoiceAnswer(block.content, block.questionType === "single" ? "single" : "multiple");
      block.content = extracted.stem;
      if (extracted.answer && !block.answer?.trim()) block.answer = extracted.answer;
    } else if (block.questionType === "short") {
      const extracted = extractUnderlinedAnswers(block.content);
      block.content = extracted.content;
      if (extracted.answers.length && !block.answer?.trim()) {
        block.answer = extracted.answers.join("；");
      }
    }
  }
  return blocks;
}

function normalizeFillBlankAreas(blocks: DocumentBlock[], subject?: string): DocumentBlock[] {
  for (const block of blocks) {
    if (block.type === "question" && block.questionType) {
      block.questionType = normalizeQuestionTypeForSubject(block.questionType, subject);
    }
    if (
      block.type !== "question"
      || block.questionType !== "short"
      || !hasFillBlankAnswerArea(block.content)
    ) continue;
    normalizeBlockFillBlankArea(block);
  }
  return blocks;
}

const geographySharedStemPattern = /(?:据.{0,24}(?:完成|回答|作答)|根据.{0,40}(?:完成|回答|作答)|(?:阅读|读|观察|结合).{0,40}(?:完成|回答|作答)|(?:完成|回答)下[列面]|(?:据此|就此|由此).{0,12}(?:完成|回答|作答).{0,12}(?:小题|题))/;

function startsGeographyReadingPassage(lines: string[], index: number, config: DocumentParseConfig): boolean {
  const current = lines[index].trim();
  if (geographySharedStemPattern.test(current)) return true;
  for (let next = index + 1; next < Math.min(lines.length, index + 5); next += 1) {
    const candidate = lines[next].trim();
    if (!candidate) continue;
    if (isQuestionStart(candidate, config) || isHeading(candidate, config)
      || trailingSolutionHeadingKind(candidate) || extractOptionLine(candidate, 0, true)) break;
    if (geographySharedStemPattern.test(candidate)) return true;
  }
  return false;
}

function geographySubQuestionCount(content: string): number {
  const markers = scanGroupedSubQuestionMarkers(content);
  let expected = 1;
  for (const marker of markers) {
    if (marker.index === expected) expected += 1;
  }
  const topLevelNumbers = [...content.matchAll(/^\s*(\d{1,4})\s*[.．、]\s*\S/gm)];
  return Math.max(1, expected - 1, topLevelNumbers.length);
}

function geographyDetailCategory(type: QuestionType, content: string): string | undefined {
  const count = geographySubQuestionCount(content);
  if (type === "single") return `单选题·${count >= 4 ? "4个及以上" : count + "个"}小题`;
  if (type === "multiple") return count > 1 ? "多选题组" : "多选单题";
  if (type === "comprehensive") return `综合题·${count >= 6 ? "6问及以上" : count + "问"}`;
  return undefined;
}

function groupGeographyChoiceQuestions(blocks: DocumentBlock[], source: string, config: DocumentParseConfig): DocumentBlock[] {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const sharedStemPattern = geographySharedStemPattern;
  const numberedPattern = /^\s*([\d０-９]{1,4})\s*[.．、]\s*\S/;
  const optionPattern = /^\s*[A-Ha-h]\s*[.．、:：)）]/;
  const groups: Array<{ introduction: string; numbers: string[] }> = [];
  for (let index = 0; index < lines.length; index += 1) {
    const cue = lines[index].trim();
    if (!sharedStemPattern.test(cue) || isHeading(cue, config) || trailingSolutionHeadingKind(cue)) continue;

    let start = index;
    while (start > 0 && index - start < 12) {
      const preceding = lines[start - 1].trim();
      if (isHeading(preceding, config)
        || isQuestionStart(preceding, config)
        || optionPattern.test(preceding)
        || trailingSolutionHeadingKind(preceding)
        || /(?:试卷|测试卷|考试卷)$/.test(preceding)
        || (preceding && sharedStemPattern.test(preceding))) break;
      start -= 1;
    }
    const introduction = lines.slice(start, index + 1).map((line) => line.trim()).filter(Boolean).join("\n");
    const range = /(?:回答|完成|作答)\s*(?:下[列面]\s*)?(?:第\s*)?(\d{1,3})\s*[—–～~至到-]\s*(\d{1,3})\s*题/.exec(introduction);
    const lastInRange = range && Number(range[2]) > Number(range[1])
      && Number(range[2]) - Number(range[1]) <= 9 ? Number(range[2]) : undefined;
    const numbers: string[] = [];
    for (let next = index + 1; next < lines.length; next += 1) {
      const candidate = lines[next].trim();
      if (!candidate) continue;
      if (isHeading(candidate, config) || trailingSolutionHeadingKind(candidate)
        || sharedStemPattern.test(candidate)) break;
      const match = numberedPattern.exec(candidate);
      if (match) {
        const number = normalizeQuestionNumber(match[1]);
        if (numbers.length > 0 && Number(number) !== Number(numbers[numbers.length - 1]) + 1) break;
        numbers.push(number);
        if (lastInRange && Number(number) >= lastInRange) break;
      } else if (numbers.length > 0 && !optionPattern.test(candidate)
        && !isImageLine(candidate) && !isDocumentTableFragment(candidate)
        && /^(?:图|表|材料|据|根据|阅读)/.test(candidate)) break;
    }
    if (numbers.length >= 2) groups.push({ introduction, numbers });
  }
  if (groups.length === 0) return blocks;

  const result = [...blocks];
  let searchFrom = 0;
  for (const group of groups) {
    const first = result.findIndex((block, index) => index >= searchFrom
      && block.type === "question" && extractQuestionNumber(block.content, config) === group.numbers[0]);
    if (first < 0) continue;
    const members = result.slice(first, first + group.numbers.length);
    if (!members.every((block, index) => block?.type === "question" && extractQuestionNumber(block.content, config) === group.numbers[index])) continue;
    const section = [...result.slice(0, first)].reverse().find((block) => block.type === "groupTitle");
    const sectionType = section ? detectSectionQuestionType(section.content) : undefined;
    const type = sectionType || (members.every((member) => (member.options?.length || 0) >= 2)
      ? (members.some((member) => member.questionType === "multiple") ? "multiple" : "single")
      : undefined);
    if (type !== "single" && type !== "multiple" && type !== "comprehensive") continue;

    const field = (key: "answer" | "analysis" | "summary") => members
      .map((item, index) => item[key] ? `（${index + 1}）${item[key]}` : "")
      .filter(Boolean)
      .join("\n") || undefined;
    const content = [group.introduction, ...members.map((item) => [
      item.content,
      ...(item.options || []).map((option, index) => `${String.fromCharCode(65 + index)}. ${option}`),
    ].join("\n"))].join("\n");
    const merged: DocumentBlock = {
      ...members[0],
      content,
      options: [],
      questionType: type,
      answer: field("answer"),
      analysis: field("analysis"),
      summary: field("summary"),
    };
    result.splice(first, members.length, merged);
    let mergedIndex = first;
    while (mergedIndex > 0) {
      const preceding = result[mergedIndex - 1];
      if (!["knowledge", "documentTitle", "documentInfo"].includes(preceding.type)) break;
      if (!group.introduction.includes(preceding.content.trim())) break;
      result.splice(mergedIndex - 1, 1);
      mergedIndex -= 1;
    }
    searchFrom = mergedIndex + 1;
  }
  return result;
}

function refineGeographyBlocks(blocks: DocumentBlock[], source: string, config: DocumentParseConfig): DocumentBlock[] {
  if (config.subject?.trim() !== "地理") return blocks;
  const grouped = groupGeographyChoiceQuestions(blocks, source, config);
  for (let index = 0; index < grouped.length; index += 1) {
    const block = grouped[index];
    if (block.type !== "knowledge") continue;
    const next = grouped[index + 1];
    if (next?.type === "question") {
      next.content = block.content.trim() + "\n" + next.content;
      grouped.splice(index, 1);
      index -= 1;
    } else {
      block.type = "documentInfo";
      delete block.knowledgeTitle;
    }
  }
  let sectionType: QuestionType | undefined;
  grouped.forEach((block, index) => {
    block.order = index;
    if (block.type === "groupTitle") {
      sectionType = detectSectionQuestionType(block.content);
    } else if (block.type === "question") {
      if (sectionType === "comprehensive") block.questionType = "comprehensive";
      else if ((sectionType === "single" || sectionType === "multiple") && block.questionType === "short") {
        block.questionType = sectionType;
      }
      const detail = geographyDetailCategory(block.questionType || "short", block.content);
      if (detail) block.categories = [...new Set([...(block.categories || []), detail])];
    }
  });
  return grouped;
}

type EnglishPart = "听力" | "阅读理解" | "语言运用" | "写作";

const englishPartPattern = /^第\s*[一二三四五六七八九十百\d]+\s*部分\s*(听力|阅读理解|语言运用|写作)(?:\b|\s|[（(：:]|$)/;
const englishSectionPattern = /^第\s*[一二三四五六七八九十百\d]+\s*节(?:\s|[（(：:]|$)/;
const englishTypeHeadingPattern = /^(?:(?:[一二三四五六七八九十百\d]+)\s*[、.．)]\s*|第\s*[一二三四五六七八九十百\d]+\s*节\s*)?(听力选择题|听力填空|单项选择(?:题)?|阅读理解|完形填空|语法填空|短文改错|改错|选词填空|翻译|完成句子|单词拼写|短文填空|书面表达|书信写作|应用文写作|读后续写)(?:题)?(?:\s|[（(：:]|$)/;
const englishListeningSinglePattern = /每\s*段\s*录音\s*后\s*有\s*一个\s*小题/;
const englishListeningGroupPattern = /每\s*段\s*录音\s*后\s*有\s*几\s*个\s*小题/;
const englishListeningPassagePattern = /^听\s*下\s*面\s*(?:一|[\d一二三四五六七八九十]+)\s*段\s*(?:对话|独白|材料|录音)/;
const englishGapPattern = /阅读\s*下\s*面\s*短文[，,。]?\s*从\s*短文\s*后\s*的\s*选项\s*中\s*选出/;
const englishFieldPattern = /【\s*(答案|原文|导语|点睛|总结|详解|解析|解答|\d+题详解|第\d+题详解)\s*】/g;

/** Detect the task format, never relying on the mere presence of blanks. */
function englishSectionType(heading: string): QuestionType | undefined {
  const text = normalizeStructuralText(heading).replace(/\s+/g, "");
  if (/听力填空|听力(?:信息|表格|记录)填空/.test(text)) return "englishListeningFill";
  if (/听力选择|听力理解|^听力$/.test(text)) return "englishListeningChoice";
  if (/单项选择|单选/.test(text)) return "englishSingle";
  if (/阅读理解|阅读表达|七选五/.test(text)) return "englishReading";
  if (/完形填空|完型填空/.test(text)) return "englishCloze";
  if (/语法填空|语法填词/.test(text)) return "englishGrammarFill";
  if (/短文改错|改错|错误改正/.test(text)) return "englishCorrection";
  if (/选词填空|词汇选填|方框选词/.test(text)) return "englishWordSelection";
  if (/单词拼写|根据首字母|词汇拼写/.test(text)) return "englishSpelling";
  if (/完成句子|补全句子|句子填空/.test(text)) return "englishSentenceCompletion";
  if (/短文填空|语篇填空/.test(text)) return "englishPassageFill";
  if (/翻译|英译汉|汉译英/.test(text)) return "englishTranslation";
  if (/书信写作|应用文写作|写信|邮件写作|邀请信|建议信|感谢信|求职信/.test(text)) return "englishLetter";
  if (/书面表达|读后续写|作文|写作/.test(text)) return "englishComposition";
  return undefined;
}

/** Typical task instructions distinguish otherwise similar blank-based exercise formats. */
function englishInstructionType(line: string): QuestionType | undefined {
  const text = normalizeStructuralText(line).trim();
  if (/^(?:根据所听|听录音|听短文|听对话).*?(?:填|补全|完成表格|记录信息)|^(?:Listen|Complete).*(?:recording|audio).*(?:blank|form)/i.test(text)) return "englishListeningFill";
  if (/^(?:听下面|听录音|听对话|根据所听).*?(?:选择|选出|回答)|^Listen.*(?:choose|answer)/i.test(text)) return "englishListeningChoice";
  if (/^(?:阅读|通读).*?(?:完形|从每题所给|从[A-D]个选项|最佳选项).*?(?:填|选择|选出)|^Read.*(?:fill|choose).*?(?:best|A.*B.*C.*D)/i.test(text)) return "englishCloze";
  if (/^(?:从方框|从所给词|选用所给词|选择适当的词)|^(?:Choose|Select) (?:the )?words? from/i.test(text)) return "englishWordSelection";
  if (/^(?:用所给词|用括号内所给|按语法要求).*?(?:适当形式|填空)|^Fill.*(?:correct form|grammar)/i.test(text)) return "englishGrammarFill";
  if (/^(?:短文|根据短文|阅读短文).*?(?:首字母|填空|补全|填词)/.test(text)) return "englishPassageFill";
  if (/^(?:根据汉语|根据首字母|根据提示).*?(?:拼写|写出单词|单词)/.test(text)) return "englishSpelling";
  if (/^(?:根据汉语意思|按要求).*?(?:完成句子|补全句子)/.test(text)) return "englishSentenceCompletion";
  if (/^(?:翻译下列|将下列|把下面).*?(?:译成|翻译|英语|汉语)|^Translate (?:the following|these)/i.test(text)) return "englishTranslation";
  if (/^(?:找出|指出|改正|修改).*?(?:错误|错处)|^Correct (?:the|any|errors)/i.test(text)) return "englishCorrection";
  if (/^(?:请|根据).*?(?:写一封|写封|电子邮件|邀请信|建议信|感谢信)|^Write (?:an? )?(?:letter|e-mail|email)/i.test(text)) return "englishLetter";
  if (/^(?:请|根据).*?(?:写一篇|写短文|作文|书面表达)|^Write (?:an? )?(?:essay|composition|article)/i.test(text)) return "englishComposition";
  if (/^(?:阅读下面|阅读下列|阅读短文).*?(?:回答|选择|问题)|^Read (?:the|this) passage.*(?:answer|question)/i.test(text)) return "englishReading";
  if (/^(?:选择|选出).*?(?:唯一|最佳|正确).*?(?:答案|选项)|^Choose (?:the )?(?:best|correct) answer/i.test(text)) return "englishSingle";
  return undefined;
}

function englishPartForType(type: QuestionType): EnglishPart {
  if (type.startsWith("englishListening")) return "听力";
  if (type === "englishReading") return "阅读理解";
  if (type === "englishComposition" || type === "englishLetter") return "写作";
  return "语言运用";
}

interface EnglishUnit {
  lines: string[];
  part: EnglishPart;
  questionType?: QuestionType;
  grouped: boolean;
  gap: boolean;
}

function englishFieldParts(lines: string[]): {
  content: string;
  answer?: string;
  analysis?: string;
  summary?: string;
} {
  const text = lines.join("\n").trim();
  const markers = [...text.matchAll(englishFieldPattern)];
  if (markers.length === 0) return { content: text };
  const result: { content: string; answer?: string; analysis?: string; summary?: string } = {
    content: text.slice(0, markers[0].index).trim(),
  };
  for (let index = 0; index < markers.length; index += 1) {
    const marker = markers[index];
    const label = marker[1];
    const field = label === "答案" ? "answer"
      : label === "导语" || label === "点睛" || label === "总结" ? "summary"
        : "analysis";
    const start = marker.index! + marker[0].length;
    const value = text.slice(start, markers[index + 1]?.index ?? text.length).trim();
    // Keep numbered explanation labels and transcripts to preserve their subquestion mapping.
    const prefix = /^\d+题详解$|^第\d+题详解$|^原文$/.test(label) ? `【${label}】` : "";
    appendQuestionField(result, field, `${prefix}${value}`);
  }
  return result;
}

function englishQuestionNumbers(content: string): string[] {
  return content.split("\n")
    .map((line) => extractLeadingQuestionNumber(line.trim())?.number)
    .filter((value): value is string => Boolean(value));
}

function englishAnswerMap(value: string): Map<string, string> {
  const matches = [...value.matchAll(/(?:^|[\s,，;；])(?:第\s*)?(\d{1,3})\s*(?:题)?\s*[.．、:：)）]\s*([A-Ha-h]|(?:正确|错误|对|错))(?=\s|$|[,，;；]|\d{1,3}\s*[.．、:：)）])/g)];
  return new Map(matches.map((match) => [match[1], match[2]]));
}

function parseEnglishDocumentBlocks(content: string, config: DocumentParseConfig): DocumentBlock[] | null {
  if (config.subject?.trim() !== "英语") return null;
  const sourceLines = content.replace(/\r\n?/g, "\n").split("\n");
  const structuralLines = sourceLines.map((line) => normalizeStructuralText(line).trim());
  const firstPart = structuralLines.find((line) => englishPartPattern.test(line));
  const firstNamedSection = structuralLines.find((line) => englishTypeHeadingPattern.test(line));
  const firstInstruction = structuralLines.find((line) => englishInstructionType(line));
  const inferredPart: EnglishPart | undefined = firstNamedSection
    ? englishPartForType(englishSectionType(firstNamedSection) || "englishSingle")
    : firstInstruction ? englishPartForType(englishInstructionType(firstInstruction)!)
    : structuralLines.some((line) => englishGapPattern.test(line))
    ? "阅读理解"
    : structuralLines.some((line) => englishListeningSinglePattern.test(line) || englishListeningGroupPattern.test(line))
      ? "听力" : undefined;
  if (!firstPart && !inferredPart) return null;

  const blocks: DocumentBlock[] = [];
  let part: EnglishPart | undefined = firstPart || firstNamedSection ? undefined : inferredPart;
  let listeningAtomic = false;
  let gap = false;
  let sectionType: QuestionType | undefined = firstPart ? undefined : firstNamedSection ? englishSectionType(firstNamedSection) : firstInstruction ? englishInstructionType(firstInstruction) : undefined;
  let current: EnglishUnit | undefined;
  const addBlock = (type: DocumentBlockType, text: string, fields: Partial<DocumentBlock> = {}) => {
    if (!text.trim()) return;
    blocks.push({
      id: createBlockId(), type, content: text.trim(), order: blocks.length, status: "new", ...fields,
    });
  };
  const submitCurrent = () => {
    if (!current) return;
    const unit = current;
    current = undefined;
    const fields = englishFieldParts(unit.lines);
    if (!fields.content) return;
    const numbers = englishQuestionNumbers(fields.content);
    const isQuestion = numbers.length > 0 || unit.gap
      || (unit.part === "写作" && /请|写|write|suppose|假设|要求/i.test(fields.content));
    if (!isQuestion) {
      addBlock("knowledge", fields.content, { knowledgeTitle: fields.content.slice(0, 20) });
      return;
    }
    const grouped = unit.grouped || numbers.length > 1 || unit.gap;
    const questionType = unit.questionType || (unit.part === "听力" ? "englishListeningChoice" : unit.part === "阅读理解" ? "englishReading" : unit.part === "写作" ? "englishComposition" : "englishGrammarFill");
    if (grouped) {
      addBlock("question", fields.content, {
        questionType, difficulty: 3,
        answer: fields.answer, analysis: fields.analysis, summary: fields.summary,
      });
      return;
    }
    const parsed = parseDocumentBlocksCore(fields.content, config)
      .find((block) => block.type === "question");
    const originalNumber = numbers[0];
    const answer = fields.answer?.replace(
      new RegExp(`^(?:第\\s*)?${originalNumber}\\s*(?:题)?\\s*[.．、:：)）]\\s*`), "",
    ).trim();
    addBlock("question", parsed?.content || fields.content, {
      options: parsed?.options || [],
      questionType: questionType === "englishComposition" && /(?:写信|邮件|letter|email|e-mail|邀请信|建议信|感谢信)/i.test(fields.content)
        ? "englishLetter" : questionType,
      difficulty: 3, answer, analysis: fields.analysis, summary: fields.summary,
    });
  };
  const addLine = (line: string, grouped: boolean) => {
    if (!current) current = { lines: [], part: part!, questionType: sectionType, grouped, gap };
    current.lines.push(line);
  };

  let beforePart: string[] = [];
  for (let index = 0; index < sourceLines.length; index += 1) {
    const raw = sourceLines[index];
    const line = structuralLines[index];
    if (!line) continue;
    const major = englishPartPattern.exec(line);
    if (major) {
      submitCurrent();
      if (beforePart.length) {
        addBlock("documentTitle", beforePart[0]);
        if (beforePart.length > 1) addBlock("documentInfo", beforePart.slice(1).join("\n"));
        beforePart = [];
      }
      part = major[1] as EnglishPart;
      listeningAtomic = false;
      gap = false;
      sectionType = englishSectionType(major[1]);
      addBlock("groupTitle", raw);
      continue;
    }
    const namedSection = englishTypeHeadingPattern.exec(line);
    if (!part && !namedSection) {
      beforePart.push(raw);
      continue;
    }
    if (namedSection || englishSectionPattern.test(line)) {
      submitCurrent();
      if (beforePart.length) {
        addBlock("documentTitle", beforePart[0]);
        if (beforePart.length > 1) addBlock("documentInfo", beforePart.slice(1).join("\n"));
        beforePart = [];
      }
      gap = false;
      sectionType = englishSectionType(namedSection?.[1] || line) || sectionType;
      if (namedSection) part = englishPartForType(sectionType!);
      listeningAtomic = sectionType === "englishListeningChoice";
      addBlock("groupTitle", raw);
      continue;
    }
    if (part === "听力" && (englishListeningSinglePattern.test(line) || englishListeningGroupPattern.test(line))) {
      submitCurrent();
      listeningAtomic = englishListeningSinglePattern.test(line);
      addBlock("groupTitle", raw);
      continue;
    }
    if (part === "阅读理解" && englishGapPattern.test(line)) {
      submitCurrent();
      gap = true;
      addLine(raw, true);
      continue;
    }
    if (part === "阅读理解" && !gap && /^(?:[A-D]|(?:Passage|Text)\s+[A-D\d]+|阅读材料\s*[A-D\d]+)$/i.test(line)) {
      submitCurrent();
      addBlock("groupTitle", raw);
      continue;
    }
    if (part === "听力" && englishListeningPassagePattern.test(line)) {
      submitCurrent();
      addLine(raw, true);
      continue;
    }
    const instructionType = englishInstructionType(line);
    if (instructionType && instructionType !== sectionType) {
      submitCurrent();
      sectionType = instructionType;
      part = englishPartForType(instructionType);
    }
    const numbered = extractLeadingQuestionNumber(line);
    if (numbered && (
      (part === "听力" && listeningAtomic && !current?.grouped)
      || (part === "写作" && (!current || englishQuestionNumbers(current.lines.join("\n")).length > 0))
      || ["englishSingle", "englishTranslation", "englishSentenceCompletion", "englishSpelling"].includes(sectionType || "")
    )) {
      submitCurrent();
      addLine(raw, false);
      continue;
    }
    addLine(raw, !["englishSingle", "englishTranslation", "englishSentenceCompletion", "englishSpelling"].includes(sectionType || "")
      && (part !== "听力" && part !== "写作" || !listeningAtomic));
  }
  submitCurrent();
  if (beforePart.length) {
    addBlock("documentTitle", beforePart[0]);
    if (beforePart.length > 1) addBlock("documentInfo", beforePart.slice(1).join("\n"));
  }

  // A single answer key often follows several independent listening questions.
  // Distribute only explicitly numbered answer pairs; leave unnumbered answers untouched.
  let sectionStart = 0;
  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index];
    if (block.type === "groupTitle" && englishPartPattern.test(normalizeStructuralText(block.content))) {
      sectionStart = index + 1;
    }
    if (block.type !== "question" || !block.answer) continue;
    const answers = englishAnswerMap(block.answer);
    if (answers.size < 2) continue;
    for (const candidate of blocks.slice(sectionStart, index + 1)) {
      if (candidate.type !== "question" || englishQuestionNumbers(candidate.content).length > 1) continue;
      const numbers = englishQuestionNumbers(candidate.content);
      if (numbers.length === 1 && answers.has(numbers[0])) candidate.answer = answers.get(numbers[0]);
    }
    if (englishQuestionNumbers(block.content).length === 1) {
      const number = englishQuestionNumbers(block.content)[0];
      block.answer = answers.get(number) || block.answer;
    }
  }
  return blocks;
}

export function parseDocumentBlocks(content: string, config: DocumentParseConfig): DocumentBlock[] {
  const english = parseEnglishDocumentBlocks(content, config);
  if (english) return english;
  const lines = content.replace(/\r\n?/g, "\n").split("\n");
  const solutionHeadingIndexes = lines
    .map((line, index) => ({ index, kind: trailingSolutionHeadingKind(line.trim()) }))
    .filter((entry): entry is { index: number; kind: TrailingSolutionHeadingKind } => Boolean(entry.kind))
    .reverse();

  for (const { index: headingIndex, kind } of solutionHeadingIndexes) {
    const headingLine = lines[headingIndex].trim();
    const inlineAnswers = headingLine.replace(/^(?:【\s*)?(?:参考)?答案(?:(?:与|和|及)?解析)?(?:\s*】)?\s*[:：]\s*/, "");
    const solutionLines = inlineAnswers !== headingLine
      ? [inlineAnswers, ...lines.slice(headingIndex + 1)]
      : lines.slice(headingIndex + 1);
    const solutions = parseTrailingSolutions(solutionLines, config);
    if (solutions.length === 0) continue;

    const blocks = parseDocumentBlocksCore(lines.slice(0, headingIndex).join("\n"), config);
    const questions = blocks.filter((block) => block.type === "question");
    if (questions.length === 0) continue;
    if (kind === "answer" && questions.some((question) => question.answer || question.analysis)) continue;

    const merged = mergeTrailingSolutions(blocks, solutions, config, {
      allowPositionalFallback: kind !== "answer",
    });
    const requiredMatches = kind === "answer" && config.subject?.trim() !== "地理"
      ? Math.min(2, questions.length) : 1;
    if (merged >= requiredMatches) return refineGeographyBlocks(normalizeFillBlankAreas(normalizeInlineDocumentAnswers(blocks), config.subject), content, config);
  }

  const fallback = refineGeographyBlocks(normalizeFillBlankAreas(normalizeInlineDocumentAnswers(parseDocumentBlocksCore(content, config)), config.subject), content, config);
  if (config.subject?.trim() !== "英语") return fallback;
  let sectionType: QuestionType | undefined;
  for (const block of fallback) {
    if (block.type === "groupTitle") sectionType = englishSectionType(block.content);
    if (block.type === "question" && sectionType) block.questionType = sectionType;
  }
  return fallback;
}

export interface MathQuestionNumberSequenceGap {
  previous: number;
  next: number;
  missing: number[];
}

/** 仅检查已识别为顶层数学题的编号，忽略小问和示例题的局部编号。 */
export function findMathQuestionNumberSequenceGaps(blocks: DocumentBlock[], confirmedNumbers: number[] = []): MathQuestionNumberSequenceGap[] {
  const gaps: MathQuestionNumberSequenceGap[] = [];
  let previous: number | undefined;
  for (const block of blocks) {
    if (block.type !== "question") continue;
    const firstLine = block.content.trim().split("\n", 1)[0];
    const numberText = extractLeadingQuestionNumber(firstLine)?.number || mathQuestionNumber(firstLine, confirmedNumbers);
    if (!numberText) continue;
    const number = Number(numberText);
    if (previous !== undefined && number > previous + 1) {
      gaps.push({
        previous,
        next: number,
        missing: Array.from({ length: Math.min(number - previous - 1, 100) }, (_, index) => previous! + index + 1),
      });
    }
    previous = number;
  }
  return gaps;
}


export interface MathQuestionNumberGap {
  afterBlockId: string;
  previousNumber: number;
  nextNumber: number;
}

export interface SuspectedMathQuestionNumber {
  blockId: string;
  number: number;
}

export function findMathQuestionNumberGaps(
  blocks: DocumentBlock[],
  config: DocumentParseConfig,
): MathQuestionNumberGap[] {
  if (config.subject?.trim() !== "数学") return [];
  const gaps: MathQuestionNumberGap[] = [];
  let previous: { id: string; number: number } | undefined;
  for (const block of blocks) {
    if (block.type === "groupTitle") {
      previous = undefined;
      continue;
    }
    if (block.type !== "question") continue;
    const number = Number(extractQuestionNumber(block.content, config));
    if (!Number.isInteger(number) || number < 1) continue;
    if (previous && number > previous.number + 1 && number - previous.number <= 30) {
      gaps.push({ afterBlockId: previous.id, previousNumber: previous.number, nextNumber: number });
    }
    previous = { id: block.id, number };
  }
  return gaps;
}

export function findSuspectedMathQuestionNumbers(
  blocks: DocumentBlock[],
  config: DocumentParseConfig,
): SuspectedMathQuestionNumber[] {
  if (config.subject?.trim() !== "数学") return [];
  const warnings: SuspectedMathQuestionNumber[] = [];
  for (const block of blocks) {
    if (block.type !== "question") continue;
    const number = Number(extractQuestionNumber(block.content, config));
    if (!Number.isInteger(number) || number < 1) continue;
    const fields: Array<keyof Pick<DocumentBlock, "content" | "answer" | "analysis" | "summary">> =
      ["content", "answer", "analysis", "summary"];
    const hasPossibleNext = fields.some((field) => (block[field] || "")
      .split("\n")
      .some((line, index) => {
        if (field === "content" && index === 0) return false;
        const candidate = mathQuestionNumberCandidate(line);
        return candidate?.number === number + 1 && !candidate.separated;
      }));
    if (hasPossibleNext) warnings.push({ blockId: block.id, number: number + 1 });
  }
  return warnings;
}

// The teacher explicitly confirms these numbers. Only numbered lines in the
// selected block are reparsed; all neighboring reviewed blocks remain intact.
export function reparseMathQuestionBlock(
  block: DocumentBlock,
  config: DocumentParseConfig,
  confirmedNumbers: number[],
): DocumentBlock[] | null {
  if (
    config.subject?.trim() !== "数学" || block.type !== "question"
    || confirmedNumbers.length === 0 || confirmedNumbers.length > 50
    || confirmedNumbers.some((number) => !Number.isInteger(number) || number < 1 || number > 9999)
  ) return null;

  const fields = ["content", "answer", "analysis", "summary"] as const;
  for (let fieldIndex = 0; fieldIndex < fields.length; fieldIndex += 1) {
    const field = fields[fieldIndex];
    const lines = (block[field] || "").split("\n");
    for (let lineIndex = field === "content" ? 1 : 0; lineIndex < lines.length; lineIndex += 1) {
      const candidate = mathQuestionNumberCandidate(lines[lineIndex]);
      if (!candidate || !confirmedNumbers.includes(candidate.number)) continue;
      // Already extracted option fields cannot be reliably attributed to two
      // different questions when their stems were concatenated.
      if (field === "content" && block.options?.length) return null;

      const previousText = lines.slice(0, lineIndex).join("\n").trim();
      const remainder = lines.slice(lineIndex).join("\n").trim();
      const after = fields.slice(fieldIndex + 1).flatMap((nextField) => {
        const value = block[nextField]?.trim();
        if (!value) return [];
        const labels = { answer: "答案：", analysis: "解析：", summary: "总结：" };
        return [labels[nextField as keyof typeof labels] + value];
      });
      const parsed = parseDocumentBlocks([remainder, ...after].join("\n"), {
        ...config,
        confirmedMathQuestionNumbers: confirmedNumbers,
      });
      const parsedNumbers = parsed
        .filter((item) => item.type === "question")
        .map((item) => Number(extractQuestionNumber(item.content, {
          ...config, confirmedMathQuestionNumbers: confirmedNumbers,
        })));
      if (
        !parsed.length || parsed[0].type !== "question"
        || !confirmedNumbers.every((number) => parsedNumbers.includes(number))
      ) return null;

      const original: DocumentBlock = { ...block, [field]: previousText, status: "edited" };
      for (const nextField of fields.slice(fieldIndex + 1)) {
        delete original[nextField];
      }
      if (!original.content.trim()) return null;
      return [original, ...parsed];
    }
  }
  return null;
}
