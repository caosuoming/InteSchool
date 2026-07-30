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
    expect(container.querySelector(".bg-ink-700")).toHaveTextContent("核心结论");
    expect(container.textContent).toContain("x≠0");
    expect(container.textContent).toContain("Δ>0");
    expect(html).not.toContain("$x");
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

  it("escapes decoded HTML and handles empty input and formulas", () => {
    expect(renderExtractText("")).toBe("");

    const html = renderExtractText("&lt;script&gt;bad()&lt;/script&gt; $$", [], false);
    const container = asElement(html);

    expect(container.querySelector("script")).toBeNull();
    expect(container.textContent).toBe("<script>bad()</script> ");
  });

  it("keeps unmatched formula delimiters as plain text", () => {
    const html = renderExtractText("普通文本 $x+1", [], true);
    expect(asElement(html).textContent).toBe("普通文本 $x+1");
  });

  it("repairs legacy curve labels in stored extraction text", () => {
    const html = renderExtractText("椭圆 $\\mathbb{C}_1$ 与点 $\\mathbb{Q}$", [], false);
    const container = asElement(html);

    const formulas = Array.from(container.querySelectorAll(".katex-html"))
      .map((element) => element.textContent?.replace(/\u200b/g, ""));
    expect(formulas).toEqual(["C1", "Q"]);
    expect(container.querySelector(".mathbb")).toBeNull();
  });
});
