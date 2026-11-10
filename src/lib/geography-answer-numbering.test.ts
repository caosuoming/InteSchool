import { describe, expect, it } from "vitest";
import { alignGeographyGroupAnswerNumbers } from "./geography-answer-numbering";

const stem = [
  "读图完成下面4—6题。",
  "4. 降水量 A. 甲 B. 乙",
  "5. 原因 A. 甲 B. 乙",
  "6. 作用 A. 甲 B. 乙",
].join("\n");

describe("geography grouped answer numbering", () => {
  it("aligns legacy local answer labels with the original paper numbers", () => {
    expect(alignGeographyGroupAnswerNumbers(stem, "（1）B\n（2）A\n（3）D"))
      .toBe("（4）B\n（5）A\n（6）D");
  });

  it("leaves already aligned and non-group answers untouched", () => {
    const aligned = "（4）B\n（5）A\n（6）D";
    expect(alignGeographyGroupAnswerNumbers(stem, aligned)).toBe(aligned);
    expect(alignGeographyGroupAnswerNumbers("4. 单选题", "（1）B")).toBe("（1）B");
  });

  it("never silently rewrites incomplete or mismatched answer keys", () => {
    expect(alignGeographyGroupAnswerNumbers(stem, "（1）B\n（3）D")).toBe("（1）B\n（3）D");
    expect(alignGeographyGroupAnswerNumbers(stem, "（4）B\n（2）A\n（6）D"))
      .toBe("（4）B\n（2）A\n（6）D");
  });

  it("supports HTML-wrapped and full-width question numbers", () => {
    expect(alignGeographyGroupAnswerNumbers("<p>４．甲</p><p>５．乙</p>", "（1）A\n（2）B"))
      .toBe("（4）A\n（5）B");
  });
});
