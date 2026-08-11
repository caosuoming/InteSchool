// @vitest-environment node

import katex from "katex";
import { describe, expect, it } from "vitest";
import { wordEqFieldToLatex } from "../lib/word-eq.js";

describe("legacy Word EQ fields", () => {
  it.each([
    [String.raw`eq \f(2,7)`, String.raw`\frac{2}{7}`],
    [String.raw`eq \s\up12(n－1)`, String.raw`{}^{n-1}`],
    [String.raw`eq \o\al(2,n＋1)`, String.raw`{}_{n+1}^{2}`],
    [
      String.raw`eq \r(2x＋1·\f(32,2x－1))`,
      String.raw`\sqrt{2x+1\cdot \frac{32}{2x-1}}`,
    ],
    [
      String.raw`eq \f(1－\f(2,7)n,1－\f(2,7)（n－1）)`,
      String.raw`\frac{1-\frac{2}{7}n}{1-\frac{2}{7}(n-1)}`,
    ],
  ])("converts %s", (instruction, expected) => {
    expect(wordEqFieldToLatex(instruction)).toBe(expected);
  });

  it("converts bracketed arrays used by legacy equation fields", () => {
    expect(
      wordEqFieldToLatex(
        String.raw`eq \b\lc\{(\a\vs4\al\co1(λ＋3≥0，,f（1）≥0，))`,
      ),
    ).toBe(
      String.raw`\left\{\begin{matrix}\lambda +3\ge 0,\\f(1)\ge 0,\end{matrix}\right.`,
    );
  });

  it("produces KaTeX-renderable output for representative nested fields", () => {
    const latex = wordEqFieldToLatex(
      String.raw`eq \b\lc\(\rc\)(\a\vs4\al\co1(\f(3,4)))`,
    );

    expect(latex).toBe(
      String.raw`\left(\begin{matrix}\frac{3}{4}\end{matrix}\right)`,
    );
    expect(() =>
      katex.renderToString(latex!, { throwOnError: true, strict: false }),
    ).not.toThrow();
  });

  it("ignores unrelated Word fields", () => {
    expect(wordEqFieldToLatex("DATE \\@ yyyy-MM-dd")).toBeNull();
  });
});
