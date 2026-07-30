import { describe, expect, it } from "vitest";
import { ommlToLatex } from "./omml-to-latex";

const MATH_NS = "http://schemas.openxmlformats.org/officeDocument/2006/math";

function mathRun(text: string): string {
  return `<m:oMath xmlns:m="${MATH_NS}"><m:r><m:t>${text}</m:t></m:r></m:oMath>`;
}

describe("ommlToLatex", () => {
  it("keeps ordinary Latin set-name letters as ordinary variables", () => {
    expect(ommlToLatex(mathRun("C+Q+N+R+Z"))).toBe("C+Q+N+R+Z");
  });

  it("preserves explicit double-struck Unicode set symbols", () => {
    expect(ommlToLatex(mathRun("ℂ+ℚ+ℕ+ℝ+ℤ"))).toBe(
      "\\mathbb{C}+\\mathbb{Q}+\\mathbb{N}+\\mathbb{R}+\\mathbb{Z}",
    );
  });
});
