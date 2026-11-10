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
