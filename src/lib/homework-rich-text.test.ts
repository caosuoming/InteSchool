import { describe, expect, it } from "vitest";
import { encodeHomeworkMarkup, homeworkMarkup, homeworkPlainText, validateHomeworkContent } from "./homework-rich-text";

describe("classroom homework rich text", () => {
  it("keeps legacy plain text and script-looking homework safe", () => {
    const legacy = "完成第 3 页 <script>alert(1)</script>";
    expect(homeworkMarkup(legacy)).toBeNull();
    expect(homeworkPlainText(legacy)).toBe(legacy);
    expect(validateHomeworkContent(legacy)).toBe(legacy);
  });

  it("preserves only the allowed typography and strips untrusted tags and handlers", () => {
    const encoded = encodeHomeworkMarkup('<b>重点</b><font color="#ff0000" size="5">大字</font><img src="x" onerror="alert(1)"><span style="background-color: #fff3a6;position:fixed">高亮</span><script>alert(1)</script>');
    const output = homeworkMarkup(encoded)!;
    expect(output).toContain("<b>重点</b>");
    expect(output).toContain("color:#ff0000");
    expect(output).toContain("font-size:24px");
    expect(output).toContain("background-color");
    expect(output).not.toMatch(/<script|<img|onerror|position:fixed|alert/);
    expect(homeworkPlainText(encoded)).toContain("重点大字高亮");
  });

  it("rejects excessive visible text and markup", () => {
    expect(() => encodeHomeworkMarkup("<b>" + "字".repeat(4001) + "</b>")).toThrow("4000");
    expect(() => validateHomeworkContent("字".repeat(4001))).toThrow("4000");
    expect(() => validateHomeworkContent("inteschool-homework-html:v1:" + "<b></b>".repeat(5000))).toThrow("过长");
  });
});
