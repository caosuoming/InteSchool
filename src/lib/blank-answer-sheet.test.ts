import { describe, expect, it } from "vitest";
import {
  BLANK_PAPER_MM, DEFAULT_BLANK_ANSWER_SHEET,
  blankAnswerSheetBlocks, blankAnswerSheetColumns, blankAnswerSheetTotal, paginateBlankAnswerSheet,
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
    expect(pages.every((page) => page.columns.length === 2)).toBe(true);
    expect(pages.map((page) => page.side)).toEqual(pages.map((_, index) => index % 2 === 0 ? "front" : "back"));
    expect(pages.flatMap((page) => page.columns).every((column) =>
      column.every((block) => block.heightMm <= BLANK_PAPER_MM["8K"].height - 29))).toBe(true);
  });

  it("supports zero questions, A3 and alternate identity without loops", () => {
    const config = {
      ...DEFAULT_BLANK_ANSWER_SHEET,
      identityMode: "examNumber" as const,
      paperSize: "A3" as const,
      showInstructions: false,
      sections: DEFAULT_BLANK_ANSWER_SHEET.sections.map((section) => ({ ...section, count: 0 })),
    };
    expect(paginateBlankAnswerSheet(config)).toEqual([{ side: "front", columns: [[], [], []] }]);
  });
  it("supports the three standard math sheet formats", () => {
    expect(BLANK_PAPER_MM["8K"]).toEqual({ width: 390, height: 270 });
    expect(blankAnswerSheetColumns(DEFAULT_BLANK_ANSWER_SHEET)).toBe(2);
    expect(blankAnswerSheetColumns({ ...DEFAULT_BLANK_ANSWER_SHEET, columns: 3 })).toBe(3);
    expect(blankAnswerSheetColumns({ ...DEFAULT_BLANK_ANSWER_SHEET, paperSize: "A3" })).toBe(3);
    expect(paginateBlankAnswerSheet({ ...DEFAULT_BLANK_ANSWER_SHEET, columns: 3 })[0].columns).toHaveLength(3);
  });

  it("does not add continuation headings and preserves each essay's own size", () => {
    const config = {
      ...DEFAULT_BLANK_ANSWER_SHEET,
      choiceDirection: "vertical" as const,
      essaySpaceByQuestion: { 1: 35, 2: 140, 3: 65 },
    };
    const blocks = blankAnswerSheetBlocks(config);
    expect(blocks.filter((block) => block.type === "single").map((block) => block.heading)).toEqual([
      expect.stringContaining("共55分"), "",
    ]);
    expect(blocks.filter((block) => block.type === "essay").map((block) => block.answerSpaceMm)).toEqual([35, 140, 65]);
    expect(blocks.find((block) => block.type === "single")?.heightMm).toBe(56);
    expect(blocks.flatMap((block) => block.numbers)).toEqual(Array.from({ length: 17 }, (_, i) => i + 1));
  });

  it("does not overflow either face at maximum essay height", () => {
    const config = {
      ...DEFAULT_BLANK_ANSWER_SHEET,
      paperSize: "8K" as const,
      columns: 3 as const,
      identityMode: "examNumber" as const,
      essaySpaceMm: 150,
      sections: DEFAULT_BLANK_ANSWER_SHEET.sections.map((section) => ({ ...section, count: section.type === "essay" ? 18 : 0 })),
    };
    const pages = paginateBlankAnswerSheet(config);
    expect(pages.length).toBeGreaterThanOrEqual(4);
    expect(pages.map((page) => page.side)).toEqual(pages.map((_, index) => index % 2 ? "back" : "front"));
    for (const page of pages) {
      for (const [index, column] of page.columns.entries()) {
        const reserved = page.side === "front" && index === 0 ? 70 : 0;
        expect(reserved + column.reduce((sum, block) => sum + block.heightMm + 1, 0)).toBeLessThanOrEqual(270 - 29);
      }
    }
    expect(pages.flatMap((page) => page.columns.flatMap((column) => column.flatMap((block) => block.numbers))))
      .toEqual(Array.from({ length: 18 }, (_, i) => i + 1));
  });
});
