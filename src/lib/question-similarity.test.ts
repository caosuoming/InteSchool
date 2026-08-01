import { describe, expect, it } from "vitest";
import { normalizeQuestionStem, questionStemSimilarity } from "./question-similarity";

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
