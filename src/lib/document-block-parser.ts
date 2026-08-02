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

function scanOptionMarkers(text: string): OptionMarker[] {
  const pattern = /(^|[\s\u3000])(?:[（(]([A-Ha-h])[）)]|([A-Ha-h])[.．、:：)）])\s*/g;
  const inlineMathRanges = scanInlineMathRanges(text);
  const markers: OptionMarker[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const label = match[2] || match[3];
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
  if (/^第\s*[\d０-９]+\s*题(?:\s|[、.．:：)）]|$)/.test(text)) return true;
  if (/^[\d０-９]{1,4}\s*(?:[、.．)）]|题[、.．:：)）]?)\s*\S/.test(text)) return true;

  const prefixes = [...new Set(config.questionKeywords
    .map((keyword) => keyword.trim())
    .filter((keyword) => keyword && keyword !== "第"))]
    .sort((left, right) => right.length - left.length)
    .map(escapeRegex);
  if (!prefixes.length) return false;
  const index = "[\\d０-９零〇一二三四五六七八九十百两]+";
  return new RegExp(
    `^(?:[【［[]\\s*)?(?:${prefixes.join("|")}|巩固题)\\s*(?:第\\s*)?[（(]?\\s*${index}\\s*[）)]?(?:\\s*题)?(?:\\s*[】］\\]])?`,
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
}

const solutionMarkerPattern = /^(?:【\s*)?(解答|解|证明)(?:\s*】)?\s*[:：]\s*/;
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
  return value.replace(/[０-９]/g, (digit) => String(digit.charCodeAt(0) - 0xfee0));
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

const nestedQuestionMarkerPattern = /^(?:[（(]\s*(?:[\d０-９]{1,3}|[ivxlcdm]+)\s*[）)]|[①-⑳])\s*/i;

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

  const prefixes = [...new Set(config.questionKeywords
    .map((keyword) => keyword.trim())
    .filter((keyword) => keyword && keyword !== "第"))]
    .sort((left, right) => right.length - left.length)
    .map(escapeRegex);
  if (!prefixes.length) return undefined;
  const match = new RegExp(
    `^(?:[【［[]\\s*)?(?:${prefixes.join("|")}|巩固题)\\s*(?:第\\s*)?[（(]?\\s*([\\d０-９]{1,4})\\s*[）)]?`,
  ).exec(text);
  return match ? normalizeQuestionNumber(match[1]) : undefined;
}

function trailingSolutionHeadingKind(text: string): TrailingSolutionHeadingKind | null {
  const normalized = text
    .replace(/\s+/g, "")
    .replace(/^[【［[(（]+/, "")
    .replace(/[】］\])）:：]+$/, "");
  if (/^(?:参考)?答案$/.test(normalized)) return "answer";
  if (/^(?:参考)?答案(?:与|和|及)?解析$/.test(normalized)) return "answerAnalysis";
  return null;
}

const builtInTrailingAnalysisKeywords = ["详解", "【详解】"];

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

function fieldSearchPattern(keywords: string[]): RegExp | null {
  const alternatives = [...new Set(keywords.map((keyword) => keyword.trim()).filter(Boolean))]
    .sort((left, right) => right.length - left.length)
    .map(escapeRegex);
  return alternatives.length ? new RegExp(`(?:${alternatives.join("|")})\\s*[:：]?\\s*`, "g") : null;
}

function scanQuestionFieldMarkers(
  text: string,
  patterns: Array<[Exclude<QuestionField, "content">, RegExp | null]>,
): QuestionFieldMarker[] {
  const candidates: QuestionFieldMarker[] = [];
  for (const [field, pattern] of patterns) {
    if (!pattern) continue;
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      const previous = text[match.index - 1];
      const bracketed = /^[【［[(（]/.test(match[0]);
      if (match.index > 0 && !/[\s\u3000；;]/.test(previous) && !bracketed) continue;
      candidates.push({ field, start: match.index, end: pattern.lastIndex });
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
  patterns: Array<[Exclude<QuestionField, "content">, RegExp | null]>,
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
    const value = line.slice(marker.end, markers[index + 1]?.start ?? line.length).trim();
    appendQuestionField(solution, marker.field, value);
  }
  return markers.at(-1)?.field;
}

function parseTrailingSolutions(
  lines: string[],
  config: DocumentParseConfig,
): TrailingSolution[] {
  const analysisKeywords = [
    ...config.analysisKeywords,
    ...builtInTrailingAnalysisKeywords,
  ];
  const patterns: Array<[Exclude<QuestionField, "content">, RegExp | null]> = [
    ["answer", fieldSearchPattern(config.answerKeywords)],
    ["analysis", fieldSearchPattern(analysisKeywords)],
    ["summary", fieldSearchPattern(config.summaryKeywords)],
  ];
  const anchoredPatterns = [
    keywordPattern(config.answerKeywords),
    keywordPattern(analysisKeywords),
    keywordPattern(config.summaryKeywords),
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
  hasFutureStructuredField: boolean,
): string | undefined {
  const match = solutionMarkerPattern.exec(line);
  if (!match) return undefined;

  if (match[1] === "证明") {
    const questionText = block.content || "";
    if (!hasFutureStructuredField || !/(?:证明|求证|请证)/.test(questionText)) {
      return undefined;
    }
  }

  return line.slice(match[0].length).trim();
}

function parseDocumentBlocksCore(content: string, config: DocumentParseConfig): DocumentBlock[] {
  const blocks: DocumentBlock[] = [];
  const answerPattern = keywordPattern(config.answerKeywords);
  const analysisPattern = keywordPattern(config.analysisKeywords);
  const summaryPattern = keywordPattern(config.summaryKeywords);
  let currentBlock: Partial<DocumentBlock> = {};
  let currentQuestionField: QuestionField = "content";
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
    currentQuestionField = "content";
  };

  const lines = content.replace(/\r\n?/g, "\n").split("\n");
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

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const originalLine = lines[lineIndex];
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
      currentQuestionField = "content";
      continue;
    }

    if (currentBlock.type === "question") {
      const explicitSolution = extractExplicitSolution(
        line,
        currentBlock,
        hasFutureStructuredField(lineIndex),
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
      if (currentQuestionField === "content") {
        const inline = splitQuestionAndInlineOptions(line);
        if (inline) {
          appendQuestionField(currentBlock, "content", inline.stem);
          currentBlock.options = inline.options;
          continue;
        }
        const options = extractOptionLine(line, currentBlock.options?.length || 0);
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
