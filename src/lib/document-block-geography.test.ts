import { describe, expect, it } from "vitest";
import { parseDocumentBlocks, type DocumentParseConfig } from "./document-block-parser";

const config: DocumentParseConfig = {
  subject: "地理",
  headingKeywords: ["一", "二", "三", "四"],
  questionKeywords: ["例", "练习", "第"],
  answerKeywords: ["答案", "【答案】", "参考答案", "答："],
  analysisKeywords: ["解析", "【解析】", "详解", "【详解】"],
  summaryKeywords: ["总结", "【总结】"],
  singleChoiceKeywords: ["单选"],
  multipleChoiceKeywords: ["多选"],
  fillBlankKeywords: ["填空", "___"],
  essayKeywords: ["解答", "计算", "证明", "说明"],
};

const questions = (text: string, subject = "地理") => parseDocumentBlocks(text, { ...config, subject })
  .filter((item) => item.type === "question");

describe("geography paper decomposition", () => {
  it("groups consecutive numbered choice questions under a reading passage and respects blank-line boundaries", () => {
    const parsed = questions([
      "一、单选题", "", "读图回答下列1—2题。",
      "1. 甲地气温较高的原因是（ ） A. 纬度低 B. 海拔高 C. 距海远 D. 洋流影响",
      "2. 乙地降水最多的季节是（ ） A. 春季 B. 夏季 C. 秋季 D. 冬季",
      "", "3. 第三题（ ） A. 东 B. 西 C. 南 D. 北",
    ].join("\n"));
    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toMatchObject({ questionType: "single", categories: ["单选题·2个小题"] });
    expect(parsed[0].content).toContain("读图回答下列1—2题");
    expect(parsed[0].content).toContain("2. 乙地降水");
    expect(parsed[0].content).toContain("A. 纬度低");
    expect(parsed[1]).toMatchObject({ questionType: "single", categories: ["单选题·1个小题"] });
  });

  it("groups a reading passage directly after a section heading without a blank line", () => {
    const parsed = questions([
      "一、单选题", "读图回答1—2题。",
      "1. 甲地位于（ ） A. 东 B. 南 C. 西 D. 北",
      "2. 乙地位于（ ） A. 东 B. 南 C. 西 D. 北",
    ].join("\n"));
    expect(parsed).toHaveLength(1);
    expect(parsed[0].categories).toContain("单选题·2个小题");
  });

  it("joins numbered questions referenced by a shared reading prompt across blank lines", () => {
    const table = '<table class="document-table"><tbody>'
      + '<tr><td>题号</td><td>1</td><td>2</td></tr>'
      + '<tr><td>答案</td><td>A</td><td>B</td></tr>'
      + '</tbody></table>';
    const parsed = questions([
      "一、单选题", "", "读图完成1～2题。", "",
      "1. 甲地位于（ ） A. 东 B. 南 C. 西 D. 北", "",
      "2. 乙地位于（ ） A. 东 B. 南 C. 西 D. 北", "",
      "参考答案", table,
    ].join("\n"));
    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchObject({
      questionType: "single", categories: ["单选题·2个小题"],
      answer: "（1）A\n（2）B",
    });
    expect(parsed[0].content).toContain("读图完成1～2题");
  });

  it("keeps standalone labeled notes in the preceding question summary", () => {
    const parsed = questions([
      "二、综合题", "24. 阅读地图，说明该地的气候成因。",
      "【答案】受季风影响。", "【详解】地处亚欧大陆东部。",
      "【难度】", "中等", "【知识点】", "季风环流", "【点睛】分析海陆热力差异。",
      "25. 描述下一区域的地形。",
    ].join("\n"));
    expect(parsed).toHaveLength(2);
    expect(parsed[0].summary).toContain("【难度】");
    expect(parsed[0].summary).toContain("中等");
    expect(parsed[0].summary).toContain("【知识点】");
    expect(parsed[0].summary).toContain("季风环流");
    expect(parsed[0].summary).toContain("【点睛】分析海陆热力差异");
  });

  it.each([1, 2, 3, 4, 5])("tags %i nested single-choice items with the right band", (count) => {
    const content = ["一、单选题", "1. 阅读材料，完成下列小题。",
      ...Array.from({ length: count }, (_, index) => `（${index + 1}）问题${index + 1} A. 甲 B. 乙 C. 丙 D. 丁`),
    ].join("\n");
    const parsed = questions(content);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].questionType).toBe("single");
    expect(parsed[0].categories).toContain(`单选题·${count >= 4 ? "4个及以上" : count + "个"}小题`);
  });

  it("distinguishes multiple-choice single questions and groups", () => {
    const parsed = questions([
      "一、多选题", "1. 关于季风，正确的是（多选） A. 甲 B. 乙 C. 丙 D. 丁", "",
      "2. 阅读材料，回答小题。", "（1）第一问（多选） A. 甲 B. 乙 C. 丙 D. 丁",
      "（2）第二问（多选） A. 甲 B. 乙 C. 丙 D. 丁",
    ].join("\n"));
    expect(parsed).toHaveLength(2);
    expect(parsed.map((block) => block.questionType)).toEqual(["multiple", "multiple"]);
    expect(parsed.map((block) => block.categories)).toEqual([["多选单题"], ["多选题组"]]);
  });

  it.each([1, 2, 3, 4, 5, 6, 7])("recognizes comprehensive questions with %i prompts", (count) => {
    const parsed = questions([
      "二、综合题", "24. 阅读气候图，回答问题。",
      ...Array.from({ length: count }, (_, index) => `（${index + 1}）说明第${index + 1}项成因。`),
      "答案：（1）海陆分布。",
    ].join("\n"));
    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchObject({ questionType: "comprehensive" });
    expect(parsed[0].categories).toContain(`综合题·${count >= 6 ? "6问及以上" : count + "问"}`);
    expect(parsed[0].content).toContain(`（${count}）`);
  });

  it("routes detailed answers, explanations and labeled notes without losing the labels", () => {
    const parsed = questions([
      "一、单选题", "1. 我国东部地区降水最多的季节是（ ） A. 春 B. 夏 C. 秋 D. 冬", "",
      "二、综合题", "24. 根据示意图回答问题。", "（1）说明气候特征。", "（2）分析形成原因。", "",
      "参考答案", "1. 【答案】B 【详解】东部季风区夏季降水多。 【难度】中等 【知识点】季风气候 【点睛】考虑季风环流。",
      "24. 【答案】（1）温暖湿润（2）海陆热力差异", "【解析】海陆热力性质不同。", "【难度】较难", "【知识点】大气环流", "【点睛】联系风带季节移动。",
    ].join("\n"));
    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toMatchObject({ questionType: "single", answer: "B", analysis: "东部季风区夏季降水多。" });
    expect(parsed[0].summary).toContain("【难度】中等");
    expect(parsed[0].summary).toContain("【知识点】季风气候");
    expect(parsed[1]).toMatchObject({ questionType: "comprehensive", answer: "（1）温暖湿润（2）海陆热力差异", analysis: "海陆热力性质不同。" });
    expect(parsed[1].summary).toContain("【点睛】联系风带季节移动。");
  });

  it("distributes horizontal answer-table entries using the original paper numbers", () => {
    const table = '<table class="document-table"><tbody>'
      + '<tr><td>题号</td><td>1</td><td>2</td><td>24</td></tr>'
      + '<tr><td>答案</td><td>A</td><td>B</td><td>见解析</td></tr>'
      + '</tbody></table>';
    const parsed = questions([
      "一、单选题", "1. 第一题 A. 甲 B. 乙 C. 丙 D. 丁",
      "2. 第二题 A. 甲 B. 乙 C. 丙 D. 丁", "二、综合题", "24. 描述该地区的气候。",
      "", "参考答案", table,
    ].join("\n"));
    expect(parsed.map((block) => block.answer)).toEqual(["A", "B", "见解析"]);
    expect(parsed.at(-1)?.questionType).toBe("comprehensive");
  });

  it("does not group unrelated questions or apply geography categories to other subjects", () => {
    const source = ["一、单选题", "1. 第一题 A. 甲 B. 乙 C. 丙 D. 丁", "2. 第二题 A. 甲 B. 乙 C. 丙 D. 丁"].join("\n");
    expect(questions(source)).toHaveLength(2);
    expect(questions(source, "数学").every((item) => !item.categories?.length)).toBe(true);
  });
});
