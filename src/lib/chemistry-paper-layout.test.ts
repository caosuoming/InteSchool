import { describe, expect, it } from "vitest";
import { chemistrySubQuestionNumbers, isChemistryCompositeGroup, renumberChemistryGroupField, renumberChemistryGroupStem } from "./chemistry-paper-layout";
import { geographyPaperNumberMap, geographyPaperQuestionCount, renumberGeographyPaperAnswer, renumberGeographyPaperStem } from "./geography-paper-layout";

describe("Shanghai chemistry paper numbering (#1532)", () => {
  const first = "制备过程如下。\n1. 选择离子。A. 甲 B. 乙 C. 丙 D. 丁\n（1）判断正误。\n①实验步骤。\n2. 写出化学方程式。\n（2）分析现象。";
  const second = "24. 浸出反应。\n（1）计算浓度。\n25. 铜离子转化。";
  it("counts only top-level Arabic question numbers, not nested parentheses, circles or A-D options", () => {
    expect(chemistrySubQuestionNumbers(first)).toEqual([1, 2]);
    expect(chemistrySubQuestionNumbers(second)).toEqual([24, 25]);
    expect(isChemistryCompositeGroup(first, "essay", "化学")).toBe(true);
    expect(isChemistryCompositeGroup(first, "single", "化学")).toBe(false);
    expect(isChemistryCompositeGroup("24. 单独小题", "essay", "化学")).toBe(true);
    expect(geographyPaperQuestionCount(first, "essay", "化学")).toBe(2);
    expect(geographyPaperQuestionCount(second, "essay", "化学")).toBe(2);
  });

  it("renumbers continuously across sections and when selecting/reordering bank entries", () => {
    const ordered = [
      { id: "a", stem: first, type: "essay" },
      { id: "b", stem: second, type: "essay" },
    ];
    expect([...geographyPaperNumberMap(ordered, "化学").values()]).toEqual([1, 3]);
    expect(renumberGeographyPaperStem(second, "essay", "化学", 3)).toContain("3. 浸出反应");
    expect(renumberGeographyPaperStem(second, "essay", "化学", 3)).toContain("4. 铜离子");
    expect([...geographyPaperNumberMap(ordered.reverse(), "化学").values()]).toEqual([1, 3]);
    expect(renumberChemistryGroupStem(second, 1)).toContain("1. 浸出反应");
    expect(renumberChemistryGroupStem(second, 1)).toContain("2. 铜离子");
    expect(renumberChemistryGroupStem(second, 1)).toContain("（1）计算浓度");
  });

  it("keeps fixed subpart labels and renumbers answer/analysis items consistently", () => {
    const answer = "24. C\n（1）原因是……\n25. D\n①原理……";
    expect(renumberChemistryGroupField(second, answer, 7)).toBe("7. C\n（1）原因是……\n8. D\n①原理……");
    expect(renumberGeographyPaperAnswer(second, answer, "essay", "化学", 7))
      .toBe("7. C\n（1）原因是……\n8. D\n①原理……");
    // Extract copies keep the source paper's 24/25 stem, while the bank stores
    // relative answer labels 1/2. Both must render against the current layout.
    expect(renumberGeographyPaperAnswer(second, "1. C\n（1）原因是……\n2. D", "essay", "化学", 7))
      .toBe("7. C\n（1）原因是……\n8. D");
    expect(renumberGeographyPaperStem(first, "essay", "物理", 5)).toBe(first);
    expect(renumberGeographyPaperAnswer(second, answer, "essay", "数学", 7)).toBe(answer);
  });
});
