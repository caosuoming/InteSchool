import { describe, expect, it } from "vitest";
import { emphasizeEnglishQuestionHtml } from "./english-question-format";

describe("English grouped question formatting", () => {
  it("colors option letters differently and emphasizes each subquestion number", () => {
    const html = emphasizeEnglishQuestionHtml("21. First? A. Yes B. No\n22. Second? C. True D. False");
    const template = document.createElement("template");
    template.innerHTML = html;
    const markers = [...template.content.querySelectorAll(".english-question-marker")];
    expect(markers.map((element) => element.textContent)).toEqual(["21.", "A.", "B.", "22.", "C.", "D."]);
    expect(markers[1].className).not.toBe(markers[2].className);
    expect(markers[0].className).toContain("font-bold");
  });

  it("highlights parenthesized question numbers without extra spaces", () => {
    const html = emphasizeEnglishQuestionHtml("（1）阅读材料\n（2）选择正确选项");
    expect(html.match(/english-question-marker/g)).toHaveLength(2);
    expect(html).toContain("（1）");
  });

  it("does not change formulas or existing markup and escapes source text", () => {
    const input = '<span title="A. ignored">21. Question</span><span class="katex">B. math</span>';
    const html = emphasizeEnglishQuestionHtml(input);
    expect(html).toContain('title="A. ignored"');
    expect(html).toContain('<span class="katex">B. math</span>');
    expect(html).toContain('english-question-marker');
  });
});
