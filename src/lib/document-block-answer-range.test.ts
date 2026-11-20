import { describe, expect, it } from "vitest";
import { parseDocumentBlocks, type DocumentParseConfig } from "./document-block-parser";

const config: DocumentParseConfig = {
  subject: "数学",
  headingKeywords: ["一", "二", "三"],
  questionKeywords: ["例题", "第"],
  answerKeywords: ["答案", "【答案】", "答："],
  analysisKeywords: ["解析", "【解析】"],
  summaryKeywords: ["总结"],
  singleChoiceKeywords: ["单选"],
  multipleChoiceKeywords: ["多选"],
  fillBlankKeywords: ["填空"],
  essayKeywords: ["解答"],
};

function choiceQuestions(count: number): string[] {
  return Array.from({ length: count }, (_, index) =>
    `${index + 1}. 第${index + 1}题：下列选项正确的是 A. 甲 B. 乙 C. 丙 D. 丁`);
}

describe("trailing answer ranges", () => {
  it("maps consecutive choice keys and standalone answers on the same two lines", () => {
    const blocks = parseDocumentBlocks([
      ...choiceQuestions(14),
      "15. 已知集合 A，求满足条件的元素个数。",
      "襄阳五中2029届高一上学期9月月考",
      "数学考试答案",
      "1-4. DACB   5-8. DCDA   9. BC   10. AC   11. ACD",
      "12. $2<a\\le3$   13. 4   14. 2",
      "15. （1）当 m=0 时成立。",
      "（2）因此 m≤0。",
    ].join("\n"), config);
    const questions = blocks.filter((block) => block.type === "question");
    expect(questions).toHaveLength(15);
    expect(questions.slice(0, 11).map((block) => block.answer)).toEqual([
      "D", "A", "C", "B", "D", "C", "D", "A", "BC", "AC", "ACD",
    ]);
    expect(questions.slice(11, 14).map((block) => block.answer)).toEqual([
      "$2<a\\le3$", "4", "2",
    ]);
    expect(questions[14].answer).toBe("（1）当 m=0 时成立。\n（2）因此 m≤0。");
    expect(questions[8].questionType).toBe("multiple");
    expect(questions[10].questionType).toBe("multiple");
  });

  it("supports full-width ranges and separated answer letters", () => {
    const blocks = parseDocumentBlocks([
      ...choiceQuestions(4),
      "参考答案",
      "１～４．D、A、C、B",
    ].join("\n"), config);
    expect(blocks.filter((block) => block.type === "question")
      .map((block) => block.answer)).toEqual(["D", "A", "C", "B"]);
  });

  it("does not assign an incomplete answer range to the first question", () => {
    const blocks = parseDocumentBlocks([
      ...choiceQuestions(5),
      "参考答案",
      "1. B",
      "2-4. AC",
      "5. D",
    ].join("\n"), config);
    expect(blocks.filter((block) => block.type === "question")
      .map((block) => block.answer)).toEqual(["B", undefined, undefined, undefined, "D"]);
  });
});
