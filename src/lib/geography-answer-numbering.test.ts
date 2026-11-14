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
      .toBe("4. B\n5. A\n6. D");
  });

  it("leaves already aligned and non-group answers untouched", () => {
    const aligned = "4. B\n5. A\n6. D";
    expect(alignGeographyGroupAnswerNumbers(stem, aligned)).toBe(aligned);
    expect(alignGeographyGroupAnswerNumbers("4. 单选题", "（1）B")).toBe("（1）B");
  });

  it("never silently rewrites incomplete or mismatched answer keys", () => {
    expect(alignGeographyGroupAnswerNumbers(stem, "（1）B\n（3）D")).toBe("（1）B\n（3）D");
    expect(alignGeographyGroupAnswerNumbers(stem, "（4）B\n（2）A\n（6）D"))
      .toBe("（4）B\n（2）A\n（6）D");
    expect(alignGeographyGroupAnswerNumbers(stem, "（7）B\n（8）A\n（9）D"))
      .toBe("（7）B\n（8）A\n（9）D");
  });

  it("supports HTML-wrapped and full-width question numbers", () => {
    expect(alignGeographyGroupAnswerNumbers("<p>４．甲</p><p>５．乙</p>", "（1）A\n（2）B"))
      .toBe("4. A\n5. B");
  });

  it("aligns complete imported keys numbered from another source, including inline answers and analyses", () => {
    const newlyNumbered = "1. 影响鲭鱼洄游路线\n2. 产卵场优势\n3. 势力增强的年份";
    expect(alignGeographyGroupAnswerNumbers(newlyNumbered, "（7）B\n（8）D\n（9）B", [1, 2, 3]))
      .toBe("1. B\n2. D\n3. B");
    expect(alignGeographyGroupAnswerNumbers(newlyNumbered, "（7）B （8）D （9）B", [1, 2, 3]))
      .toBe("1. B 2. D 3. B");
    expect(alignGeographyGroupAnswerNumbers(newlyNumbered, "<p>（7）气候</p><p>（8）洋流</p><p>（9）位置</p>", [1, 2, 3]))
      .toBe("<p>1. 气候</p><p>2. 洋流</p><p>3. 位置</p>");
    expect(alignGeographyGroupAnswerNumbers(newlyNumbered, "（7）B （9）D", [1, 2, 3]))
      .toBe("（7）B （9）D");
  });
});
