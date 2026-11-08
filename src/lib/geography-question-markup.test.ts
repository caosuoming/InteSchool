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

  it("never reinterprets formula nodes or inserts unescaped HTML text", () => {
    const html = emphasizeGeographyLabels('<span class="katex">A. 数学公式</span>\n1. 题干 &lt;script&gt;bad&lt;/script&gt;');
    const container = element(html);
    expect(container.querySelector(".katex .geography-label")).toBeNull();
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector(".geography-label")).toHaveTextContent("1.");
  });
});
