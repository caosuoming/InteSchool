import { describe, expect, it } from "vitest";
import { detectQuestionCategories, questionCategories } from "./question-category-detection";

describe("detectQuestionCategories", () => {
  it.each(["法一：先分类讨论", "法二：使用反证法", "方法一 求导", "解法一：构造函数", "思路一：先换元", "方法 1：作辅助线", "【详解】（1）解法一：先研究单调性"])(
    "detects a multi-solution label in analysis: %s",
    (analysis) => {
      expect(detectQuestionCategories({ content: "证明结论。", analysis })).toContain("一题多解");
    },
  );

  it.each([
    "已知条件。（1）求值；（2）化简；（3）证明。",
    "（1）求解\n（2）证明\n（3）讨论",
    "① 求值 ② 判断 ③ 证明",
    "第1问：求值。第2问：比较。第3问：讨论。",
  ])("detects three subquestions: %s", (content) => {
    expect(detectQuestionCategories({ content })).toContain("一题多问");
  });

  it("allows both categories on the same question", () => {
    expect(detectQuestionCategories({
      content: "（1）计算 （2）证明 （3）判断",
      analysis: "方法一：代数法。方法二：几何法。",
    })).toEqual(["一题多解", "一题多问"]);
  });

  it("does not confuse two parts, duplicate indices or method mentions with a detection", () => {
    expect(detectQuestionCategories({ content: "（1）求值；（1）说明；（2）化简", analysis: "介绍两种常见方法。" })).toEqual([]);
    expect(detectQuestionCategories({ content: "只有一问", analysis: "算法一览" })).toEqual([]);
  });

  it("combines legacy and additive categories without duplicates", () => {
    expect(questionCategories({ category: "practice", categories: ["practice", "一题多解", "一题多问"] }))
      .toEqual(["practice", "一题多解", "一题多问"]);
  });
});
