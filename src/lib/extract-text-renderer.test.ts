import { describe, expect, it } from "vitest";
import { renderExtractText } from "./extract-text-renderer";

function asElement(html: string): HTMLDivElement {
  const container = document.createElement("div");
  container.innerHTML = html;
  return container;
}

describe("extract text renderer", () => {
  it("renders double-escaped formulas in highlighted knowledge text", () => {
    const html = renderExtractText(
      "核心结论：若 &amp;dollar;x\\neq 0&amp;dollar;，则 &dollar;\\Delta > 0&dollar;。",
      ["核心结论"],
      true,
    );
    const container = asElement(html);

    expect(container.querySelectorAll(".formula-inline")).toHaveLength(2);
    expect(container.querySelectorAll(".katex")).toHaveLength(2);
    expect(container.querySelector(".bg-ink-700")).toHaveTextContent(
      "核心结论",
    );
    expect(container.textContent).toContain("x≠0");
    expect(container.textContent).toContain("Δ>0");
    expect(html).not.toContain("$x");
  });

  it("keeps inline formulas on the surrounding text baseline", () => {
    const html = renderExtractText("如图，$P-ABCD$ 中", [], false);
    const formula = asElement(html).querySelector<HTMLElement>(".formula-inline");

    expect(formula).not.toBeNull();
    expect(formula?.style.verticalAlign).toBe("0");
  });

  it("preserves extracted superscript and subscript markup", () => {
    const html = renderExtractText("a<sub>n</sub><sup>2</sup>+1", [], false);
    const container = asElement(html);

    expect(container.querySelector("sub")).toHaveTextContent("n");
    expect(container.querySelector("sup")).toHaveTextContent("2");
    expect(container.textContent).toBe("an2+1");
  });

  it("preserves extracted Times New Roman italic math-variable markers", () => {
    const html = renderExtractText(
      '<i class="math-variable">a</i><sub><i class="math-variable">n</i></sub>=1',
      [],
      false,
    );
    const container = asElement(html);

    expect(container.querySelectorAll(".math-variable")).toHaveLength(2);
    expect(container.querySelector(".math-variable")).toHaveTextContent("a");
    expect(container.querySelector("sub .math-variable")).toHaveTextContent("n");
    expect(container.textContent).toBe("an=1");
  });

  it("preserves extracted bold italic print-vector markers", () => {
    const html = renderExtractText(
      '向量 <i class="math-vector">a</i> 与 <i class="math-vector">b</i>，A. '
        + '<i class="math-vector">a</i>+<i class="math-vector">b</i>',
      [],
      false,
    );
    const container = asElement(html);

    expect(container.querySelectorAll("i.math-vector")).toHaveLength(4);
    expect(container.querySelector("i.math-vector")).toHaveTextContent("a");
    expect(container.textContent).toBe("向量 a 与 b，A. a+b");
    expect(html).not.toContain("&lt;i");
  });

  it("renders safe markdown images and leaves unsafe sources as text", () => {
    const html = renderExtractText(
      "![示意图](https://example.com/figure.png)\n![危险](javascript:alert(1))",
      [],
      false,
    );
    const container = asElement(html);

    expect(container.querySelector("img")).toHaveAttribute(
      "src",
      "https://example.com/figure.png",
    );
    expect(container.textContent).toContain("![危险](javascript:alert(1))");
  });

  it("uses the Word layout size for ordinary document images", () => {
    const html = renderExtractText(
      "![示意图](/api/files/file-1/assets/rId6?officeWidth=320.00&officeHeight=180.00)",
      [],
      false,
    );
    const image = asElement(html).querySelector("img");

    expect(image).toHaveAttribute("data-office-width", "320");
    expect(image).toHaveAttribute("data-office-height", "180");
    expect(image).toHaveClass("office-document-image", "inline-block");
    expect(image).toHaveStyle({
      width: "320px",
      maxWidth: "100%",
      height: "auto",
      aspectRatio: "320/180",
      objectFit: "contain",
    });
  });

  it("preserves the Office metafile marker for extraction review conversion", () => {
    const html = renderExtractText(
      "![公式](/api/files/file-1/assets/rId5?officeMetafile=wmf)",
      [],
      false,
    );
    const image = asElement(html).querySelector("img");

    expect(image).toHaveAttribute("data-office-metafile", "wmf");
    expect(image).toHaveAttribute(
      "src",
      "/api/files/file-1/assets/rId5?officeMetafile=wmf",
    );
  });

  it("uses the Word layout size for legacy formula previews", () => {
    const html = renderExtractText(
      "![公式](/api/files/file-1/assets/rId5?officeMetafile=wmf&officeWidth=96.00&officeHeight=24.00)",
      [],
      false,
    );
    const image = asElement(html).querySelector("img");

    expect(image).toHaveAttribute("data-office-metafile", "wmf");
    expect(image).toHaveAttribute("data-office-width", "96");
    expect(image).toHaveAttribute("data-office-height", "24");
    expect(image).toHaveStyle({
      width: "96px",
      maxWidth: "100%",
      height: "auto",
      aspectRatio: "96/24",
      objectFit: "contain",
    });
    expect(image).toHaveClass("office-metafile-image", "inline-block");
    expect(image).not.toHaveClass("border");
  });

  it("renders preserved tables with formulas and safe spans", () => {
    const html = renderExtractText(
      '<table class="document-table"><tbody>'
        + '<tr><td rowspan="2">X</td><td>0</td><td>1</td></tr>'
        + '<tr><td>$k(1-\\alpha)^2$</td><td>$k\\alpha$</td></tr>'
        + '</tbody></table>',
      [],
      false,
    );
    const container = asElement(html);

    expect(container.querySelector("table.document-table")).not.toBeNull();
    expect(container.querySelector("td[rowspan='2']")).toHaveTextContent("X");
    expect(container.querySelectorAll(".katex")).toHaveLength(2);
    expect(container.textContent).not.toContain("<table");
  });

  it("escapes decoded HTML and handles empty input and formulas", () => {
    expect(renderExtractText("")).toBe("");

    const html = renderExtractText(
      "&lt;script&gt;bad()&lt;/script&gt; $$",
      [],
      false,
    );
    const container = asElement(html);

    expect(container.querySelector("script")).toBeNull();
    expect(container.textContent).toBe("<script>bad()</script> ");
  });

  it("keeps unmatched formula delimiters as plain text", () => {
    const html = renderExtractText("普通文本 $x+1", [], true);
    expect(asElement(html).textContent).toBe("普通文本 $x+1");
  });

  it("repairs legacy curve labels in stored extraction text", () => {
    const html = renderExtractText(
      "椭圆 $\\mathbb{C}_1$ 与点 $\\mathbb{Q}$",
      [],
      false,
    );
    const container = asElement(html);

    const formulas = Array.from(container.querySelectorAll(".katex-html")).map(
      (element) => element.textContent?.replace(/\u200b/g, ""),
    );
    expect(formulas).toEqual(["C1", "Q"]);
    expect(container.querySelector(".mathbb")).toBeNull();
  });

  it("renders stored formulas containing Unicode vertical delimiters", () => {
    const html = renderExtractText(
      "$S=\\left\\{y\\left| y=\\sqrt{{x}^{2}-5}\\right.\\right\\},"
        + "T=\\left\\{x\\in Z\\left∥\\begin{aligned} x-1 \\end{aligned}\\right∥\\neq 1\\right\\}$",
      [],
      false,
    );
    const container = asElement(html);

    expect(container.querySelector(".katex")).not.toBeNull();
    expect(container.querySelector(".katex-error")).toBeNull();
  });
});
