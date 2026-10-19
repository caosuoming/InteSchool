export type BlankQuestionType = "single" | "multiple" | "judge" | "fill" | "essay";
export type BlankPaperSize = "A4" | "A3";
export type BlankIdentityMode = "barcode" | "examNumber";

export interface BlankQuestionSection {
  type: BlankQuestionType;
  count: number;
  score: number;
}

export interface BlankAnswerSheetConfig {
  title: string;
  subtitle: string;
  paperSize: BlankPaperSize;
  identityMode: BlankIdentityMode;
  examNumberDigits: number;
  showInstructions: boolean;
  instructions: string;
  essaySpaceMm: number;
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
  paperSize: "A4",
  identityMode: "barcode",
  examNumberDigits: 8,
  showInstructions: true,
  instructions: "答题前，请填写姓名、班级和考号。\n选择题请用2B铅笔填涂，修改时擦净原答案。\n请在指定答题区域内作答，保持卡面整洁。",
  essaySpaceMm: 65,
  sections: [
    { type: "single", count: 11, score: 5 },
    { type: "multiple", count: 0, score: 5 },
    { type: "judge", count: 0, score: 2 },
    { type: "fill", count: 3, score: 5 },
    { type: "essay", count: 3, score: 12 },
  ],
};

export const BLANK_PAPER_MM: Record<BlankPaperSize, { width: number; height: number }> = {
  A4: { width: 297, height: 210 },
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
  columns: BlankSheetBlock[][];
}

export function blankAnswerSheetTotal(sections: BlankQuestionSection[]) {
  return sections.reduce((sum, section) => sum + section.count * section.score, 0);
}

export function blankAnswerSheetBlocks(config: BlankAnswerSheetConfig): BlankSheetBlock[] {
  const blocks: BlankSheetBlock[] = [];
  let nextNumber = 1;
  for (const section of config.sections) {
    if (section.count <= 0) continue;
    const label = BLANK_QUESTION_TYPES.find((item) => item.type === section.type)?.label || section.type;
    const heading = label + "（共" + section.count + "题，每题" + section.score + "分，共" + section.count * section.score + "分）";
    const chunk = section.type === "essay" ? 1 : section.type === "fill" ? 3 : 10;
    for (let start = 0; start < section.count; start += chunk) {
      const count = Math.min(chunk, section.count - start);
      const numbers = Array.from({ length: count }, (_, i) => nextNumber + start + i);
      const answerSpaceMm = section.type === "essay" ? config.essaySpaceMm : 0;
      const heightMm = section.type === "essay"
        ? 8 + answerSpaceMm
        : section.type === "fill" ? 9 + count * 10
          : 9 + Math.min(5, count) * 4.7;
      blocks.push({
        type: section.type,
        numbers,
        heightMm,
        answerSpaceMm,
        heading: start === 0 ? heading : label + "（续）",
      });
    }
    nextNumber += section.count;
  }
  return blocks;
}

export function blankIdentityHeight(config: BlankAnswerSheetConfig) {
  return 27 + (config.identityMode === "examNumber" ? 40 : 25);
}

export function paginateBlankAnswerSheet(config: BlankAnswerSheetConfig): BlankSheetPage[] {
  const blocks = blankAnswerSheetBlocks(config);
  const height = BLANK_PAPER_MM[config.paperSize].height - 29;
  const pages: BlankSheetPage[] = [];
  let page: BlankSheetPage = { columns: [[], [], []] };
  let column = 0;
  let used = blankIdentityHeight(config);
  for (const block of blocks) {
    while (used + block.heightMm > height) {
      column += 1;
      if (column === 3) {
        pages.push(page);
        page = { columns: [[], [], []] };
        column = 0;
      }
      used = column === 0 ? blankIdentityHeight(config) : 0;
    }
    page.columns[column].push(block);
    used += block.heightMm + 1;
  }

  pages.push(page);
  return pages;
}
