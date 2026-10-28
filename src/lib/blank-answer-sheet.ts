export type BlankQuestionType = "single" | "multiple" | "judge" | "fill" | "essay";
export type BlankPaperSize = "8K" | "A3";
export type BlankIdentityMode = "barcode" | "examNumber";
export type BlankChoiceDirection = "horizontal" | "vertical";

export interface BlankQuestionSection {
  type: BlankQuestionType;
  count: number;
  score: number;
}

export interface BlankAnswerSheetConfig {
  title: string;
  subtitle: string;
  paperSize: BlankPaperSize;
  columns: 2 | 3;
  choiceDirection: BlankChoiceDirection;
  identityMode: BlankIdentityMode;
  examNumberDigits: number;
  showInstructions: boolean;
  instructions: string;
  essaySpaceMm: number;
  /** Overrides keyed by the 1-based ordinal within the essay section (not global question number). */
  essaySpaceByQuestion: Record<number, number>;
  sections: BlankQuestionSection[];
}

export const BLANK_QUESTION_TYPES: { type: BlankQuestionType; label: string; max: number }[] = [
  { type: "single", label: "单项选择题", max: 200 },
  { type: "multiple", label: "多项选择题", max: 200 },
  { type: "judge", label: "判断题", max: 200 },
  { type: "fill", label: "填空题", max: 100 },
  { type: "essay", label: "解答题", max: 40 },
];

export const DEFAULT_BLANK_ANSWER_SHEET: BlankAnswerSheetConfig = {
  title: "高中数学通用考试答题卡",
  subtitle: "数学答题卡",
  paperSize: "8K",
  columns: 2,
  choiceDirection: "horizontal",
  identityMode: "barcode",
  examNumberDigits: 8,
  showInstructions: true,
  instructions: "答题前，请填写姓名、班级和考号。\n选择题请用2B铅笔填涂，修改时擦净原答案。\n请在指定答题区域内作答，保持卡面整洁。",
  essaySpaceMm: 65,
  essaySpaceByQuestion: {},
  sections: [
    { type: "single", count: 11, score: 5 },
    { type: "multiple", count: 0, score: 5 },
    { type: "judge", count: 0, score: 2 },
    { type: "fill", count: 3, score: 5 },
    { type: "essay", count: 3, score: 12 },
  ],
};

/** Landscape physical sheet dimensions in millimeters. */
export const BLANK_PAPER_MM: Record<BlankPaperSize, { width: number; height: number }> = {
  "8K": { width: 390, height: 270 },
  A3: { width: 420, height: 297 },
};

export interface BlankSheetBlock {
  type: BlankQuestionType;
  numbers: number[];
  heightMm: number;
  answerSpaceMm: number;
  heading: string;
}

export interface BlankSheetPage {
  side: "front" | "back";
  columns: BlankSheetBlock[][];
}

export function blankAnswerSheetTotal(sections: BlankQuestionSection[]) {
  return sections.reduce((sum, section) => sum + section.count * section.score, 0);
}

export function blankAnswerSheetColumns(config: BlankAnswerSheetConfig): 2 | 3 {
  return config.paperSize === "A3" ? 3 : config.columns;
}

export function blankEssaySpace(value: number): number {
  return Number.isFinite(value) ? Math.min(150, Math.max(30, Math.round(value))) : 65;
}

export function blankAnswerSheetBlocks(config: BlankAnswerSheetConfig): BlankSheetBlock[] {
  const blocks: BlankSheetBlock[] = [];
  let nextNumber = 1;
  for (const section of config.sections) {
    if (section.count <= 0) continue;
    const label = BLANK_QUESTION_TYPES.find((item) => item.type === section.type)?.label || section.type;
    const heading = label + "（共" + section.count + "题，每题" + section.score + "分，共" + section.count * section.score + "分）";
    const chunk = section.type === "essay" ? 1 : section.type === "fill" ? section.count : 10;
    for (let start = 0; start < section.count; start += chunk) {
      const count = Math.min(chunk, section.count - start);
      const numbers = Array.from({ length: count }, (_, i) => nextNumber + start + i);
      const answerSpaceMm = section.type === "essay"
        ? blankEssaySpace(config.essaySpaceByQuestion?.[start + 1] ?? config.essaySpaceMm) : 0;
      const rows = config.choiceDirection === "vertical" ? 1 : Math.min(5, count);
      const heightMm = section.type === "essay"
        ? 8 + answerSpaceMm
        : section.type === "fill" ? 9 + count * 10
          : config.choiceDirection === "vertical" ? 9 + rows * 20 : 9 + rows * 4.7;
      blocks.push({
        type: section.type,
        numbers,
        heightMm,
        answerSpaceMm,
        heading: start === 0 ? heading : "",
      });
    }
    nextNumber += section.count;
  }
  return blocks;
}

export function blankIdentityHeight(config: BlankAnswerSheetConfig) {
  return config.identityMode === "examNumber" ? 70 : 52;
}

export function paginateBlankAnswerSheet(config: BlankAnswerSheetConfig): BlankSheetPage[] {
  const blocks = blankAnswerSheetBlocks(config);
  const height = BLANK_PAPER_MM[config.paperSize].height - 29;
  const columnCount = blankAnswerSheetColumns(config);
  const newPage = (index: number): BlankSheetPage => ({
    side: index % 2 === 0 ? "front" : "back",
    columns: Array.from({ length: columnCount }, () => []),
  });
  const pages: BlankSheetPage[] = [];
  let page = newPage(0);
  let column = 0;
  let used = blankIdentityHeight(config);
  const nextColumn = () => {
    column += 1;
    if (column === columnCount) {
      pages.push(page);
      page = newPage(pages.length);
      column = 0;
    }
    used = page.side === "front" && column === 0 ? blankIdentityHeight(config) : 0;
  };
  for (const block of blocks) {
    if (block.type === "fill") {
      let start = 0;
      while (start < block.numbers.length) {
        const remaining = block.numbers.length - start;
        const requiredHeight = 9 + remaining * 10 + 1;
        if (requiredHeight > height - used && requiredHeight <= height) {
          nextColumn();
          continue;
        }
        const capacity = Math.floor((height - used - 10) / 10);
        if (capacity < 1) {
          nextColumn();
          continue;
        }
        const count = Math.min(remaining, capacity);
        const segment = {
          ...block,
          numbers: block.numbers.slice(start, start + count),
          heightMm: 9 + count * 10,
          heading: start === 0 ? block.heading : "",
        };
        page.columns[column].push(segment);
        used += segment.heightMm + 1;
        start += count;
        if (start < block.numbers.length) nextColumn();
      }
      continue;
    }
    while (used + block.heightMm + 1 > height) nextColumn();
    page.columns[column].push(block);
    used += block.heightMm + 1;
  }
  pages.push(page);
  return pages;
}
