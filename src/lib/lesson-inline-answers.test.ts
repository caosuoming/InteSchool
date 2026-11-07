import { describe, expect, it } from "vitest";
import { extractUnderlinedAnswers, inlineAnswerAnimationOrders, renderKnowledgeInlineAnswers } from "./lesson-inline-answers";

describe("inline answer extraction and animation", () => {
  it("assigns an independent numbered reveal to each knowledge answer", () => {
    const extracted = extractUnderlinedAnswers("甲 <u>一</u>，乙 <u>二</u>", true);
    expect(extracted.answers).toEqual(["一", "二"]);
    const rendered = renderKnowledgeInlineAnswers(extracted.content, extracted.answers);
    expect(inlineAnswerAnimationOrders(rendered)).toEqual([1, 2]);
  });
  it("does not turn empty underlines into answers", () => {
    const extracted = extractUnderlinedAnswers("答案 <u>____</u>；<u>  </u>", true);
    expect(extracted.answers).toEqual([]);
  });
});
