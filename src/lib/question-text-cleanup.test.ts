import { describe, expect, it } from "vitest";
import { stripLeadingScoreLabels } from "./question-text-cleanup";

describe("question text cleanup", () => {
  it("removes common leading score labels", () => {
    expect(stripLeadingScoreLabels("（本小题12分）求函数的定义域。"))
      .toEqual({ text: "求函数的定义域。", labels: ["（本小题12分）"] });
    expect(stripLeadingScoreLabels("  (5分) 计算 1+1。"))
      .toEqual({ text: "计算 1+1。", labels: ["(5分)"] });
    expect(stripLeadingScoreLabels("【本题共１０分】证明命题成立。"))
      .toEqual({ text: "证明命题成立。", labels: ["【本题共１０分】"] });
  });

  it("removes consecutive score labels", () => {
    expect(stripLeadingScoreLabels("（本题5分）（本问2分）写出答案。"))
      .toEqual({
        text: "写出答案。",
        labels: ["（本题5分）", "（本问2分）"],
      });
  });

  it("keeps ordinary parenthetical content", () => {
    const text = "（分情况讨论）求参数的取值范围。";
    expect(stripLeadingScoreLabels(text)).toEqual({ text, labels: [] });
  });
});
