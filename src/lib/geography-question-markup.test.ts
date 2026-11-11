import { describe, expect, it } from "vitest";
import { emphasizeGeographyLabels, renderGeographyChoiceGroups } from "./geography-question-markup";

const element = (html: string) => {
  const container = document.createElement("div");
  container.innerHTML = html;
  return container;
};

describe("geography question presentation", () => {
  it("lays out four independent choice lines in equal-width grid cells", () => {
    const html = renderGeographyChoiceGroups([
      "1. 根据下图选择", "A. 东", "B. 西", "C. 南", "D. 北", "2. 根据地形判断",
    ].join("\n"), (value) => value);
    const container = element(html);
    expect(container.querySelector(".geography-option-grid")).toHaveClass("grid-cols-4");
    expect(container.querySelectorAll(".geography-option-grid > div")).toHaveLength(4);
    expect(container.textContent).toContain("2. 根据地形判断");
  });

  it("retains variable-length choices in two columns and does not treat isolated letters as a group", () => {
    const longOption = "这一选项描述比较长且涉及多个区域的综合情况需要更多展示宽度与明确的区位因素及空间尺度的对比分析";
    const html = renderGeographyChoiceGroups(`A. ${longOption}\nB. ${longOption}`, (value) => value);
    expect(element(html).querySelector(".geography-option-grid")).toHaveClass("grid-cols-2");
    expect(renderGeographyChoiceGroups("A. 单个选项", (value) => value)).not.toContain("geography-option-grid");
  });

  it("renders the group reading in KaiTi and starts every subquestion on a new block", () => {
    const source = "读图完成4—5题。\n4. 甲地\nA. 东\nB. 西\n5. 乙地\nA. 南\nB. 北";
    const html = renderGeographyChoiceGroups(source, (value) => value, true);
    const container = element(html);
    expect(container.querySelector(".geography-reading")).toHaveTextContent("读图完成4—5题。");
    expect(container.querySelector(".geography-reading")?.getAttribute("style")).toContain("KaiTi");
    expect(container.querySelectorAll(".geography-subquestion")).toHaveLength(2);
    expect(container.querySelectorAll(".geography-subquestion .geography-option-grid")).toHaveLength(2);
    expect(container.querySelectorAll(".geography-subquestion")[0]).toHaveTextContent("4. 甲地");
    expect(container.querySelectorAll(".geography-subquestion")[1]).toHaveTextContent("5. 乙地");
  });

  it("shows missing geography subquestion numbers in the question-bank rendering", () => {
    const stem = "据此完成下列小题。\n第一问是什么？\nA. 甲\nB. 乙\nC. 丙\nD. 丁\n第二问是什么？\nA. 东\nB. 西\nC. 南\nD. 北";
    const html = renderGeographyChoiceGroups(stem, (value) => value, true);
    const container = element(html);
    expect(container.querySelectorAll(".geography-subquestion")).toHaveLength(2);
    expect(container.querySelectorAll(".geography-subquestion")[0]).toHaveTextContent("1. 第一问");
    expect(container.querySelectorAll(".geography-subquestion")[1]).toHaveTextContent("2. 第二问");
  });

  it("never reinterprets formula nodes or inserts unescaped HTML text", () => {
    const html = emphasizeGeographyLabels('<span class="katex">A. 数学公式</span>\n1. 题干 &lt;script&gt;bad&lt;/script&gt;');
    const container = element(html);
    expect(container.querySelector(".katex .geography-label")).toBeNull();
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector(".geography-label")).toHaveTextContent("1.");
  });
});
