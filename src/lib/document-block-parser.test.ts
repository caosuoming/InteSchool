import { describe, expect, it } from "vitest";
import { parseDocumentBlocks, type DocumentParseConfig } from "./document-block-parser";

const config: DocumentParseConfig = {
  headingKeywords: ["一", "二", "三"],
  questionKeywords: ["例", "例题", "练习", "习题", "第"],
  answerKeywords: ["答案", "【答案】", "答案：", "答："],
  analysisKeywords: ["解析", "【解析】", "解析："],
  summaryKeywords: ["总结", "【总结】", "总结："],
  singleChoiceKeywords: ["单选", "单项选择"],
  multipleChoiceKeywords: ["多选", "多项选择", "多个正确", "不止一个"],
  fillBlankKeywords: ["填空", "___"],
  essayKeywords: ["解答", "计算", "证明"],
};

describe("document block parser", () => {
  it("keeps formulas and extracts inline options", () => {
    const blocks = parseDocumentBlocks(
      [
        "一、单项选择题",
        "1. 已知 $\\frac{x}{2}=1$，则 x 的值为 A. 1 B. 2 C. 3 D. 4",
        "答案：B",
        "解析：由等式两边同乘 2 得 x=2。",
      ].join("\n"),
      config,
    );

    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toMatchObject({ type: "heading", content: "一、单项选择题" });
    expect(blocks[1]).toMatchObject({
      type: "question",
      questionType: "single",
      content: "1. 已知 $\\frac{x}{2}=1$，则 x 的值为",
      options: ["1", "2", "3", "4"],
      answer: "B",
      analysis: "由等式两边同乘 2 得 x=2。",
    });
  });

  it("uses section context and multi-letter answers to distinguish multiple choice", () => {
    const blocks = parseDocumentBlocks(
      [
        "一、多项选择题",
        "1. 下列结论正确的是",
        "A. 集合 A 是集合 B 的子集",
        "B. 点 A 在直线 l 上",
        "C. 函数 f(x) 单调递增",
        "D. 向量 a 与 b 平行",
        "答案：A、C",
      ].join("\n"),
      config,
    );

    expect(blocks[1]).toMatchObject({
      type: "question",
      questionType: "multiple",
      options: [
        "集合 A 是集合 B 的子集",
        "点 A 在直线 l 上",
        "函数 f(x) 单调递增",
        "向量 a 与 b 平行",
      ],
      answer: "A、C",
    });
  });

  it("recognizes parenthesized and circled option labels", () => {
    const blocks = parseDocumentBlocks(
      [
        "1. 请选择正确答案",
        "(A) 甲 (B) 乙 (C) 丙 (D) 丁",
        "答案：D",
        "2. 请选择正确答案",
        "① 甲 ② 乙 ③ 丙 ④ 丁",
        "答案：B",
      ].join("\n"),
      config,
    );

    expect(blocks[0].options).toEqual(["甲", "乙", "丙", "丁"]);
    expect(blocks[1].options).toEqual(["甲", "乙", "丙", "丁"]);
  });

  it("keeps prose as a knowledge block instead of inventing a question", () => {
    const blocks = parseDocumentBlocks(
      "集合是由确定对象组成的整体。\n集合中的对象称为元素。",
      config,
    );

    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({
      type: "knowledge",
      content: "集合是由确定对象组成的整体。\n集合中的对象称为元素。",
    });
  });
});
