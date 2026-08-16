import { describe, expect, it } from "vitest";
import { ommlToLatex } from "./omml-to-latex";

const MATH_NS = "http://schemas.openxmlformats.org/officeDocument/2006/math";

function mathRun(text: string): string {
  return `<m:oMath xmlns:m="${MATH_NS}"><m:r><m:t>${text}</m:t></m:r></m:oMath>`;
}

function piecewiseFunction(endCharacter = "."): string {
  return `
    <m:oMath xmlns:m="${MATH_NS}">
      <m:r><m:t>f(x)=</m:t></m:r>
      <m:d>
        <m:dPr>
          <m:begChr m:val="{"/>
          <m:endChr m:val="${endCharacter}"/>
        </m:dPr>
        <m:e>
          <m:m>
            <m:mPr>
              <m:mcs>
                <m:mc/><m:mc/>
              </m:mcs>
            </m:mPr>
            <m:mr>
              <m:e><m:r><m:t>x+1</m:t></m:r></m:e>
              <m:e><m:r><m:t>x≥0</m:t></m:r></m:e>
            </m:mr>
            <m:mr>
              <m:e><m:r><m:t>x-1</m:t></m:r></m:e>
              <m:e><m:r><m:t>x&lt;0</m:t></m:r></m:e>
            </m:mr>
          </m:m>
        </m:e>
      </m:d>
    </m:oMath>
  `;
}

function determinantWithSubscripts(): string {
  return `
    <m:oMath xmlns:m="${MATH_NS}">
      <m:r><m:t>|</m:t></m:r>
      <m:m>
        <m:mPr><m:mcs><m:mc><m:mcPr><m:count m:val="2"/></m:mcPr></m:mc></m:mcs></m:mPr>
        <m:mr>
          <m:e>
            <m:r><m:t>4</m:t></m:r>
            <m:sSub>
              <m:e><m:r><m:t>a</m:t></m:r></m:e>
              <m:sub><m:r><m:t>5</m:t></m:r></m:sub>
            </m:sSub>
          </m:e>
          <m:e><m:r><m:t>1</m:t></m:r></m:e>
        </m:mr>
        <m:mr>
          <m:e>
            <m:sSub>
              <m:e><m:r><m:t>a</m:t></m:r></m:e>
              <m:sub><m:r><m:t>3</m:t></m:r></m:sub>
            </m:sSub>
          </m:e>
          <m:e><m:r><m:t>1</m:t></m:r></m:e>
        </m:mr>
      </m:m>
      <m:r><m:t>|=0</m:t></m:r>
    </m:oMath>
  `;
}

function vectorEquationSystem(): string {
  return `
    <m:oMath xmlns:m="${MATH_NS}">
      <m:eqArr>
        <m:e>
          <m:acc>
            <m:accPr><m:chr m:val="⃗"/></m:accPr>
            <m:e><m:r><m:t>a</m:t></m:r></m:e>
          </m:acc>
          <m:r><m:t>=</m:t></m:r>
          <m:acc>
            <m:accPr><m:chr m:val="⃗"/></m:accPr>
            <m:e><m:r><m:t>b</m:t></m:r></m:e>
          </m:acc>
        </m:e>
        <m:e>
          <m:acc>
            <m:accPr><m:chr m:val="⃗"/></m:accPr>
            <m:e><m:r><m:t>c</m:t></m:r></m:e>
          </m:acc>
          <m:r><m:t>=0</m:t></m:r>
        </m:e>
      </m:eqArr>
    </m:oMath>
  `;
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

  it("does not infer parentheses from matrix column properties", () => {
    const latex = ommlToLatex(piecewiseFunction());

    expect(latex).toContain("\\left\\{");
    expect(latex).toContain("\\begin{matrix}");
    expect(latex).toContain("\\right.");
    expect(latex).not.toContain("pmatrix");
    expect(latex).not.toContain("\\right)");
  });

  it("preserves an explicitly empty one-sided delimiter", () => {
    const latex = ommlToLatex(piecewiseFunction(""));

    expect(latex).toContain("\\right.");
    expect(latex).not.toContain("\\right)");
  });

  it("keeps nested subscript expressions inside their matrix cells", () => {
    expect(ommlToLatex(determinantWithSubscripts())).toBe(
      String.raw`\left|\begin{matrix} 4{a}_{5} & 1 \\ {a}_{3} & 1 \end{matrix}\right|=0`,
    );
  });

  it("does not turn nested vector operands into extra equation rows", () => {
    expect(ommlToLatex(vectorEquationSystem())).toBe(
      "\\begin{cases}\n\\vec{a}=\\vec{b} \\\\\n\\vec{c}=0\n\\end{cases}",
    );
  });
});
