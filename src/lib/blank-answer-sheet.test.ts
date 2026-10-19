import { describe, expect, it } from "vitest";
import {
  BLANK_PAPER_MM, DEFAULT_BLANK_ANSWER_SHEET,
  blankAnswerSheetBlocks, blankAnswerSheetTotal, paginateBlankAnswerSheet,
} from "./blank-answer-sheet";

describe("空白答题卡排版", () => {
  it("generates continuous numbers and section scores without a bound paper", () => {
    const blocks = blankAnswerSheetBlocks(DEFAULT_BLANK_ANSWER_SHEET);
    expect(blocks.flatMap((block) => block.numbers)).toEqual(Array.from({ length: 17 }, (_, i) => i + 1));
    expect(blocks.find((block) => block.type === "single")?.heading).toContain("共55分");
    expect(blocks.find((block) => block.type === "essay")?.numbers).toEqual([15]);
    expect(blankAnswerSheetTotal(DEFAULT_BLANK_ANSWER_SHEET.sections)).toBe(106);
  });

  it("flows long answer sheets into multiple pages preserving questions", () => {
    const config = {
      ...DEFAULT_BLANK_ANSWER_SHEET,
      sections: DEFAULT_BLANK_ANSWER_SHEET.sections.map((section) => ({ ...section, count: section.type === "essay" ? 22 : 20 })),
      essaySpaceMm: 140,
    };
    const pages = paginateBlankAnswerSheet(config);
    expect(pages.length).toBeGreaterThan(2);
    const all = pages.flatMap((page) => page.columns.flatMap((column) => column.flatMap((block) => block.numbers)));
    expect(all).toEqual(Array.from({ length: 102 }, (_, index) => index + 1));
    expect(pages.every((page) => page.columns.length === 3)).toBe(true);
    expect(pages.flatMap((page) => page.columns).every((column) =>
      column.every((block) => block.heightMm <= BLANK_PAPER_MM.A4.height - 29))).toBe(true);
  });

  it("supports zero questions, A3 and alternate identity without loops", () => {
    const config = {
      ...DEFAULT_BLANK_ANSWER_SHEET,
      identityMode: "examNumber" as const,
      paperSize: "A3" as const,
      showInstructions: false,
      sections: DEFAULT_BLANK_ANSWER_SHEET.sections.map((section) => ({ ...section, count: 0 })),
    };
    expect(paginateBlankAnswerSheet(config)).toEqual([{ columns: [[], [], []] }]);
  });
});
