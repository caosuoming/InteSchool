import { describe, expect, it } from "vitest";
import { parseDocumentBlocks, type DocumentParseConfig } from "./document-block-parser";
const config: DocumentParseConfig = {
  headingKeywords: ["一", "二"], questionKeywords: ["例", "第"], answerKeywords: ["答案", "答："],
  analysisKeywords: ["解析", "分析"], summaryKeywords: ["总结"],
  singleChoiceKeywords: ["单选"], multipleChoiceKeywords: ["多选"],
  fillBlankKeywords: ["填空"], essayKeywords: ["计算", "证明"],
};

describe("Shanghai chemistry composite extraction (#1532)", () => {
  const shanghai = { ...config, subject: "化学", chemistryComprehensiveSections: true };

  it("stores each Chinese-numbered section as one non-choice question, preserving fixed nested labels and choices", () => {
    const blocks = parseDocumentBlocks([
      "2026年上海市普通高中化学试卷",
      "注意事项：本卷共100分",
      "一、硝普钠的制备",
      "硝普钠是一种血管扩张药，按以下流程制备。",
      "①氧化步骤中加入酸。",
      "1. 中心离子和配位数分别为_____。",
      "A. Fe2+、5 B. Fe2+、6 C. Fe3+、5 D. Fe3+、6",
      "2. 根据流程分析加入试剂的目的。",
      "（1）写出反应方程式。",
      "（2）说明实验现象。",
      "二、黄铜矿的浸出",
      "24. 黄铜矿湿法冶金的流程如图。",
      "（1）分析氧化过程。",
      "①矿石破碎。",
      "（2）简述浸出原理。",
      "25. 写出离子方程式。",
    ].join("\n"), shanghai);
    const headings = blocks.filter((block) => block.type === "groupTitle");
    const questions = blocks.filter((block) => block.type === "question");
    expect(headings.map((block) => block.content)).toEqual(["一、硝普钠的制备", "二、黄铜矿的浸出"]);
    expect(questions).toHaveLength(2);
    expect(questions.every((block) => block.questionType === "essay")).toBe(true);
    expect(questions.every((block) => (block.options || []).length === 0)).toBe(true);
    expect(questions[0].content).toContain("1. 中心离子");
    expect(questions[0].content).toContain("2. 根据流程");
    expect(questions[0].content).toContain("A. Fe2+、5 B. Fe2+、6");
    expect(questions[0].content).toContain("（1）写出反应");
    expect(questions[0].content).toContain("①氧化步骤");
    expect(questions[1].content).toContain("24. 黄铜矿");
    expect(questions[1].content).toContain("25. 写出");
    expect(questions[1].content).toContain("（2）简述");
  });

  it("keeps chemistry lecture/legacy parsing unchanged unless section mode is enabled", () => {
    const text = [
      "一、硝普钠的制备",
      "1. 选择正确离子 A. 甲 B. 乙 C. 丙 D. 丁",
      "2. 选择氧化条件 A. 高温 B. 低温 C. 高压 D. 常压",
    ].join("\n");
    expect(parseDocumentBlocks(text, { ...config, subject: "化学" })
      .filter((block) => block.type === "question")).toHaveLength(2);
    expect(parseDocumentBlocks(text, shanghai)
      .filter((block) => block.type === "question")).toHaveLength(1);
  });

  it("matches separately supplied answers to all paper-wide question numbers", () => {
    const blocks = parseDocumentBlocks([
      "一、硝普钠的制备",
      "1. 选择中心离子。A. Fe B. Cu C. Zn D. Ni",
      "2. 说明试剂作用。",
      "二、黄铜矿的浸出",
      "24. 说明反应条件。",
      "25. 写出方程式。",
      "答案与解析",
      "1. A解析：铁是中心离子。",
      "2. B解析：提供反应条件。",
      "24. C解析：反应需要酸。",
      "25. D解析：符合质量守恒。",
    ].join("\n"), shanghai);
    const questions = blocks.filter((block) => block.type === "question");
    expect(questions).toHaveLength(2);
    expect(questions[0].answer).toContain("1. A");
    expect(questions[0].answer).toContain("2. B");
    expect(questions[1].answer).toContain("24. C");
    expect(questions[1].answer).toContain("25. D");
    expect(questions[1].analysis).toContain("25.");
  });
});
