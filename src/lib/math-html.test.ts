import { describe, expect, it } from "vitest";
import { containsMathDelimiter, renderMathHtml, serializeMathHtml } from "./math-html";

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

  it("renders comparison formulas beside structured math-variable markup", () => {
    const container = document.createElement("div");
    container.innerHTML = renderMathHtml(
      '若$0<a<{e}^{3}$，关于<i class="math-variable">x</i>的方程$g(x)=\\frac{a}{x}$恰有三个不等实根${x}_{1}$，${x}_{2}$，${x}_{3}$，其中${x}_{1}<{x}_{2}<{x}_{3}$。',
    );

    expect(container.querySelector("i.math-variable")).toHaveTextContent("x");
    expect(
      Array.from(container.querySelectorAll<HTMLElement>(".katex-formula")).map(
        (formula) => formula.dataset.latex,
      ),
    ).toEqual([
      "0<a<{e}^{3}",
      "g(x)=\\frac{a}{x}",
      "{x}_{1}",
      "{x}_{2}",
      "{x}_{3}",
      "{x}_{1}<{x}_{2}<{x}_{3}",
    ]);
    expect(container.textContent).not.toContain("\\frac");
    expect(container.textContent).not.toContain("$");
  });

  it("restores trusted math-variable markup escaped inside document tables", () => {
    const container = document.createElement("div");
    container.innerHTML = renderMathHtml(
      '<table class="document-table"><tbody><tr><td>月份序号&lt;i class=&quot;math-variable&quot;&gt;x&lt;/i&gt;</td><td>1</td></tr></tbody></table>',
    );

    const firstCell = container.querySelector("td");
    expect(firstCell).toHaveTextContent("月份序号x");
    expect(firstCell?.querySelector("i.math-variable")).toHaveTextContent("x");
    expect(firstCell?.textContent).not.toContain("<i");
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

  it("repairs a trailing formula with a missing closing delimiter", () => {
    const container = document.createElement("div");
    container.innerHTML = renderMathHtml(
      "由 $f(x)>0$ 及减函数得 $x\\left(x-1\\right)<2\\Rightarrow {x}^{2}-x-2<0\\Rightarrow -1<x<2",
    );

    expect(container).toHaveTextContent("及减函数得");
    const formulas = container.querySelectorAll(".katex-formula");
    expect(formulas).toHaveLength(2);
    expect(formulas[1]).toHaveAttribute(
      "data-latex",
      "x\\left(x-1\\right)<2\\Rightarrow {x}^{2}-x-2<0\\Rightarrow -1<x<2",
    );
    expect(container.textContent).not.toContain("\\Rightarrow");
  });

  it("does not treat an unmatched currency marker as a formula", () => {
    const container = document.createElement("div");
    container.innerHTML = renderMathHtml("资料费为 $5");

    expect(container.querySelector(".katex-formula")).toBeNull();
    expect(container).toHaveTextContent("资料费为 $5");
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
    expect(container.querySelector("img")).toHaveStyle({ border: "0px" });
  });

  it("renders document-extraction markdown images", () => {
    const container = document.createElement("div");
    container.innerHTML = renderMathHtml(
      "观察下图：\n![文档图片](/api/files/file-1/assets/rId7?officeWidth=320&officeHeight=180)",
    );

    expect(container).toHaveTextContent("观察下图");
    expect(container.querySelector("img")).toHaveAttribute(
      "src",
      "/api/files/file-1/assets/rId7?officeWidth=320&officeHeight=180",
    );
    expect(container.querySelector("img")).toHaveAttribute("alt", "文档图片");
    expect(container.querySelector("img")).toHaveAttribute("loading", "lazy");
    expect(container.querySelector("img")).toHaveStyle({
      width: "320px",
      maxWidth: "100%",
      height: "auto",
      aspectRatio: "320/180",
      objectFit: "contain",
    });
  });

  it("restores document image dimensions in stored rich HTML", () => {
    const container = document.createElement("div");
    container.innerHTML = renderMathHtml(
      '<img src="/api/files/file-1/assets/rId8?officeWidth=240&officeHeight=135" alt="几何图">',
    );

    expect(container.querySelector("img")).toHaveStyle({
      width: "240px",
      maxWidth: "100%",
      height: "auto",
      aspectRatio: "240/135",
    });
  });

  it("leaves unsafe markdown image sources as text", () => {
    const container = document.createElement("div");
    container.innerHTML = renderMathHtml("![危险图片](javascript:alert(1))");

    expect(container.querySelector("img")).toBeNull();
    expect(container).toHaveTextContent("![危险图片](javascript:alert(1))");
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

describe("serializeMathHtml", () => {
  it("restores editable inline and block formulas to dollar-delimited LaTeX", () => {
    const rendered = renderMathHtml(
      "集合 $\\{x\\mid 0\\le x<5\\}$<br>结论：$$A\\cap B$$",
    );

    expect(serializeMathHtml(rendered)).toBe(
      "集合 $\\{x\\mid 0\\le x<5\\}$<br>结论：$$A\\cap B$$",
    );
  });

  it("preserves surrounding rich text while removing expanded KaTeX markup", () => {
    const rendered = renderMathHtml("<strong>已知</strong> $x^2=1$");
    const serialized = serializeMathHtml(rendered);

    expect(serialized).toBe("<strong>已知</strong> $x^2=1$");
    expect(serialized).not.toContain("class=\"katex\"");
  });
});
