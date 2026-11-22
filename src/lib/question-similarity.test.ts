import { describe, expect, it } from "vitest";
import { normalizeQuestionStem, questionStemSimilarity, questionContentSimilarity } from "./question-similarity";

describe("question stem similarity", () => {
  it("ignores formatting, punctuation, and document image URLs", () => {
    const left = "<p>已知函数 f(x)=x²，求最小值。</p>![图](/api/files/a/assets/rId1)";
    const right = "已知函数 f(x)=x² 求最小值";

    expect(normalizeQuestionStem(left)).toBe(normalizeQuestionStem(right));
    expect(questionStemSimilarity(left, right)).toBe(1);
  });

  it("distinguishes materially different questions", () => {
    expect(questionStemSimilarity("求函数的最大值", "证明三角形全等")).toBeLessThan(0.5);
  });
});


describe("choice question duplicate similarity", () => {
  const stem = "计算下列方程的解";
  const original = { stem, options: ["A. 1", "B. 2", "C. 3", "D. 4"] };

  it("considers the stem and all options, independently of option order and labels", () => {
    expect(questionContentSimilarity(original, { stem, options: ["4", "3", "2", "1"] })).toBe(1);
    expect(questionContentSimilarity(original, { stem, options: ["1", "2", "3", "5"] })).toBeCloseTo(0.9);
    expect(questionContentSimilarity(original, { stem, options: ["5", "6", "7", "8"] })).toBeCloseTo(0.6);
  });

  it("penalizes missing and partially populated choices", () => {
    expect(questionContentSimilarity(original, { stem })).toBeCloseTo(0.6);
    expect(questionContentSimilarity(original, { stem, options: ["1", "2"] })).toBeCloseTo(0.8);
  });

  it("distinguishes mathematical operators and image-only options", () => {
    const stem = "选择正确的表达式";
    expect(questionContentSimilarity({ stem, options: ["x+1", "x-1"] },
      { stem, options: ["x-1", "x+1"] })).toBe(1);
    expect(questionContentSimilarity({ stem, options: ["x+1", "x-1"] },
      { stem, options: ["x=1", "x-1"] })).toBeCloseTo(0.8);
    expect(questionContentSimilarity({ stem, options: ["![图](/assets/a.png)"] },
      { stem, options: ["![图](/assets/b.png)"] })).toBeLessThan(0.8);
  });

  it("preserves original scoring for non-choice questions", () => {
    const otherStem = "计算下列方程的所有解";
    expect(questionContentSimilarity({ stem }, { stem: otherStem }))
      .toBe(questionStemSimilarity(stem, otherStem));
  });
});
