import { describe, expect, it } from "vitest";
import { containsMathDelimiter, renderMathHtml } from "./math-html";

describe("renderMathHtml", () => {
  it("renders inline formulas in plain question text", () => {
    const container = document.createElement("div");
    container.innerHTML = renderMathHtml("已知 $x^2+y^2=1$，求 $x+y$。");

    const formulas = container.querySelectorAll<HTMLElement>(".katex-formula");
    expect(formulas).toHaveLength(2);
    expect(formulas[0].dataset.latex).toBe("x^2+y^2=1");
    expect(formulas[1].dataset.latex).toBe("x+y");
    expect(container.textContent).not.toContain("$");
  });

  it("preserves rich HTML while rendering formulas in its text nodes", () => {
    const container = document.createElement("div");
    container.innerHTML = renderMathHtml("<p><strong>计算</strong> $\\frac{1}{2}$。</p>");

    expect(container.querySelector("strong")).toHaveTextContent("计算");
    expect(container.querySelector(".katex-formula")).toHaveAttribute(
      "data-latex",
      "\\frac{1}{2}",
    );
  });

  it("does not render formulas that are already KaTeX markup", () => {
    const existing = '<span class="katex-formula" data-latex="x"><span class="katex">$x$</span></span>';
    const container = document.createElement("div");
    container.innerHTML = renderMathHtml(existing);

    expect(container.querySelectorAll(".katex-formula")).toHaveLength(1);
    expect(container.querySelectorAll(".katex")).toHaveLength(1);
  });

  it("supports block formulas and escaped dollar signs", () => {
    const container = document.createElement("div");
    container.innerHTML = renderMathHtml("费用为 \\$5，且 $$x=1$$。");

    expect(container.textContent).toContain("费用为 $5");
    expect(container.querySelector(".katex-formula-block")).toHaveAttribute("data-latex", "x=1");
    expect(container.querySelector(".katex-formula-block")?.tagName).toBe("SPAN");
  });

  it("keeps angle brackets in plain text instead of treating them as HTML", () => {
    const container = document.createElement("div");
    container.innerHTML = renderMathHtml("当 a < b 时，$a-b<0$。");

    expect(container.textContent).toContain("当 a < b 时");
    expect(container.querySelector(".katex-formula")).toHaveAttribute("data-latex", "a-b<0");
  });

  it("preserves safe question images", () => {
    const container = document.createElement("div");
    container.innerHTML = renderMathHtml(
      '<p>观察下图：</p><img src="/api/files/file-1/assets/figure.png" alt="函数图像">',
    );

    expect(container.querySelector("img")).toHaveAttribute(
      "src",
      "/api/files/file-1/assets/figure.png",
    );
    expect(container.querySelector("img")).toHaveAttribute("alt", "函数图像");
    expect(container.querySelector("img")).toHaveAttribute("loading", "lazy");
  });

  it("removes executable rich-text content", () => {
    const container = document.createElement("div");
    container.innerHTML = renderMathHtml(
      '<img src="javascript:alert(1)" onerror="alert(2)"><script>alert(3)</script><p onclick="alert(4)">安全文本</p>',
    );

    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("img")).not.toHaveAttribute("src");
    expect(container.querySelector("img")).not.toHaveAttribute("onerror");
    expect(container.querySelector("p")).not.toHaveAttribute("onclick");
    expect(container).toHaveTextContent("安全文本");
  });
});

describe("containsMathDelimiter", () => {
  it("recognizes formulas but ignores escaped dollar signs", () => {
    expect(containsMathDelimiter("$x$")).toBe(true);
    expect(containsMathDelimiter("价格为 \\$5")).toBe(false);
  });
});
