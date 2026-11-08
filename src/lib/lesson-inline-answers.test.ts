import { describe, expect, it } from "vitest";
import { extractParenthesizedChoiceAnswer, extractUnderlinedAnswers, inlineAnswerAnimationOrders, renderKnowledgeInlineAnswers } from "./lesson-inline-answers";

describe("inline answer extraction and animation", () => {
  it("assigns an independent numbered reveal to each knowledge answer", () => {
    const extracted = extractUnderlinedAnswers("甲 <u>一</u>，乙 <u>二</u>", true);
    expect(extracted.answers).toEqual(["一", "二"]);
    const rendered = renderKnowledgeInlineAnswers(extracted.content, extracted.answers);
    expect(inlineAnswerAnimationOrders(rendered)).toEqual([1, 2]);
  });
  it("extracts underlined fraction, radical, and sum expressions without losing LaTeX", () => {
    const content = String.raw`解为 <u>$\frac{1}{2}$</u>，根式为 <u>$\sqrt{3}$</u>，求和为 <u>$\sum_{i=1}^{n}i$</u>。`;
    const extracted = extractUnderlinedAnswers(content);
    expect(extracted.answers).toEqual([
      String.raw`$\frac{1}{2}$`,
      String.raw`$\sqrt{3}$`,
      String.raw`$\sum_{i=1}^{n}i$`,
    ]);
    expect(extracted.content).toBe("解为 ____，根式为 ____，求和为 ____。");
  });

  it("preserves math comparisons inside underlined expressions", () => {
    const extracted = extractUnderlinedAnswers("取 <u>$x<2$</u>，另外 <u>____</u>");
    expect(extracted.answers).toEqual(["$x<2$"]);
    expect(extracted.content).toBe("取 ____，另外 ____");
  });

  it("replaces selected answers with four spaces and leaves ordinary math parentheses intact", () => {
    expect(extractParenthesizedChoiceAnswer("正确的是（<u>B</u>）。", "single"))
      .toEqual({ stem: "正确的是（    ）。", answer: "B" });
    expect(extractParenthesizedChoiceAnswer("在集合 (A) 中，正确的是（ ）。", "single"))
      .toEqual({ stem: "在集合 (A) 中，正确的是（ ）。" });
  });

  it("does not turn empty underlines into answers", () => {
    const extracted = extractUnderlinedAnswers("答案 <u>____</u>；<u>  </u>", true);
    expect(extracted.answers).toEqual([]);
  });
});
