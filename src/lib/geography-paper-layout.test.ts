import { describe, expect, it } from "vitest";
import {
  geographyPaperNumberMap,
  geographyPaperQuestionCount,
  isGeographyChoiceGroup,
  renumberGeographyPaperAnswer,
  renumberGeographyPaperStem,
  splitGeographyChoiceGroup,
} from "./geography-paper-layout";

const group = [
  "读图完成下面4—6题。",
  "4. 第一小题\nA. 东\nB. 西",
  "5. 第二小题\nA. 甲\nB. 乙",
  "6. 第三小题\nA. 干\nB. 湿",
].join("\n");

describe("geography paper subquestion numbering", () => {
  it("recovers unnumbered subquestions from repeated option sets and numbers them in the question bank", () => {
    const unnumbered = [
      "阅读地理材料，据此完成16—18题。", "<img src=\"/map.png\">",
      "长顺镇兴起主要得益于（ ）", "A. 充足水源", "B. 地势平坦", "C. 交通便利", "D. 人口众多",
      "老城区内道路宽窄不一且不规则，原因是（ ）", "A. 地形", "B. 河流", "C. 土壤", "D. 气候",
      "长顺镇城镇空间结构演变模式为（ ）", "A. 团块", "B. 带状", "C. 环形", "D. 放射",
    ].join("\n");
    const group = splitGeographyChoiceGroup(unnumbered);
    expect(group?.originalNumbers).toEqual([16, 17, 18]);
    expect(group?.introduction).toContain('<img src="/map.png">');
    expect(group?.questions.map((question) => question.match(/^\d+\./)?.[0])).toEqual(["16.", "17.", "18."]);
    expect(geographyPaperQuestionCount(unnumbered, "single", "地理")).toBe(3);
    expect(renumberGeographyPaperStem(unnumbered, "single", "地理", 4)).toContain("4. 长顺镇兴起");
    expect(renumberGeographyPaperStem(unnumbered, "single", "地理", 4)).toContain("6. 长顺镇城镇");
    expect(renumberGeographyPaperAnswer(unnumbered, "（1）A\n（2）B\n（3）C", "single", "地理", 4))
      .toBe("（4）A\n（5）B\n（6）C");
    expect([...geographyPaperNumberMap([
      { id: "group", stem: unnumbered, type: "single" },
      { id: "next", stem: "20. 后续选择题", type: "single" },
    ], "地理").values()]).toEqual([1, 4]);
  });

  it("distinguishes original and local answer labels when inferred original numbers overlap", () => {
    const stem = "完成2—4题。\n甲地气候？\nA. 甲\nB. 乙\nC. 丙\n乙地气候？\nA. 甲\nB. 乙\nC. 丙\n丙地气候？\nA. 甲\nB. 乙\nC. 丙";
    expect(splitGeographyChoiceGroup(stem)?.originalNumbers).toEqual([2, 3, 4]);
    expect(renumberGeographyPaperAnswer(stem, "（2）A\n（3）B\n（4）C", "single", "地理", 8))
      .toBe("（8）A\n（9）B\n（10）C");
    expect(renumberGeographyPaperAnswer(stem, "（1）A\n（2）B\n（3）C", "single", "地理", 8))
      .toBe("（8）A\n（9）B\n（10）C");
  });

  it("does not infer a group from one choice set or a numbered multi-question stem with gaps", () => {
    expect(splitGeographyChoiceGroup("甲地气候（ ）\nA. 东\nB. 西\nC. 南\nD. 北")).toBeNull();
    expect(splitGeographyChoiceGroup("1. 甲地\nA. 东\nB. 西\nC. 南\nD. 北\n3. 乙地\nA. 甲\nB. 乙\nC. 丙\nD. 丁")).toBeNull();
  });

  it("replaces a standalone choice question's source number with the paper number", () => {
    const original = "16. 农耕聚落空间布局是？";
    expect(renumberGeographyPaperStem(original, "single", "地理", 4)).toBe("农耕聚落空间布局是？");
    expect(renumberGeographyPaperStem(original, "single", "历史", 4)).toBe(original);
    expect(geographyPaperQuestionCount(original, "single", "地理")).toBe(1);
    expect(renumberGeographyPaperStem("普通选择题", "single", "地理", 4)).toBe("普通选择题");
  });

  it("treats a selection group as three numbered questions without changing source text", () => {
    expect(splitGeographyChoiceGroup(group)).toMatchObject({
      introduction: "读图完成下面4—6题。",
      originalNumbers: [4, 5, 6],
    });
    expect(geographyPaperQuestionCount(group, "single", "地理")).toBe(3);
    expect(renumberGeographyPaperStem(group, "single", "地理", 7)).toContain("读图完成下面7—9题。");
    expect(renumberGeographyPaperStem(group, "single", "地理", 7)).toContain("7. 第一小题");
    expect(renumberGeographyPaperStem(group, "single", "地理", 7)).toContain("9. 第三小题");
    expect(group).toContain("4. 第一小题");
  });

  it("numbers subsequent comprehensive and choice questions continuously", () => {
    const ordered = [
      { id: "first", type: "single", stem: group },
      { id: "second", type: "comprehensive", stem: "（1）原因是什么？\n（2）请说明。" },
      { id: "third", type: "single", stem: "一道普通单选题" },
      { id: "fourth", type: "single", stem: "读图答题\n14. 甲\n15. 乙" },
    ];
    expect([...geographyPaperNumberMap(ordered, "地理").values()]).toEqual([1, 4, 5, 6]);
    expect([...geographyPaperNumberMap(ordered, "历史").values()]).toEqual([1, 2, 3, 4]);
    expect(geographyPaperQuestionCount(ordered[1].stem, "comprehensive", "地理")).toBe(1);
    expect(isGeographyChoiceGroup(ordered[1].stem, "comprehensive", "地理")).toBe(false);
  });

  it("keeps answer labels aligned with the new numbers, including legacy local labels", () => {
    expect(renumberGeographyPaperAnswer(group, "（1）B\n（2）A\n（3）D", "single", "地理", 7))
      .toBe("（7）B\n（8）A\n（9）D");
    expect(renumberGeographyPaperAnswer(group, "（4）B\n（5）A\n（6）D", "single", "地理", 1))
      .toBe("（1）B\n（2）A\n（3）D");
    expect(renumberGeographyPaperAnswer(group, "（4）B\n（6）D", "single", "地理", 1))
      .toBe("（1）B\n（3）D");
  });

  it("supports HTML paragraph boundaries and leaves unrelated subjects intact", () => {
    const rich = "<p>读图完成4—5题</p><p>４．甲地</p><p>５．乙地</p>";
    expect(splitGeographyChoiceGroup(rich)?.originalNumbers).toEqual([4, 5]);
    const display = renumberGeographyPaperStem(rich, "single", "地理", 1);
    expect(display).toContain("<p>1. 甲地");
    expect(display).toContain("<p>2. 乙地");
    expect(renumberGeographyPaperStem(rich, "single", "英语", 1)).toBe(rich);
    expect(splitGeographyChoiceGroup("材料\n1. 一道单选题")).toBeNull();
  });
});
