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

function piecewiseFunctionWithLiteralBrace(): string {
  return `
    <m:oMath xmlns:m="${MATH_NS}">
      <m:r><m:t>sgn(x)=</m:t></m:r>
      <m:r><m:t>{</m:t></m:r>
      <m:m>
        <m:mPr>
          <m:mcs>
            <m:mc/><m:mc/>
          </m:mcs>
        </m:mPr>
        <m:mr>
          <m:e><m:r><m:t>1,</m:t></m:r></m:e>
          <m:e><m:r><m:t>x&gt;0</m:t></m:r></m:e>
        </m:mr>
        <m:mr>
          <m:e><m:r><m:t>0,</m:t></m:r></m:e>
          <m:e><m:r><m:t>x=0</m:t></m:r></m:e>
        </m:mr>
        <m:mr>
          <m:e><m:r><m:t>-1,</m:t></m:r></m:e>
          <m:e><m:r><m:t>x&lt;0</m:t></m:r></m:e>
        </m:mr>
      </m:m>
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

function literalBraceEquationSystem(): string {
  return `
    <m:oMath xmlns:m="${MATH_NS}">
      <m:r><m:t>{</m:t></m:r>
      <m:eqArr>
        <m:e><m:r><m:t>x=1</m:t></m:r></m:e>
        <m:e><m:r><m:t>y=2</m:t></m:r></m:e>
      </m:eqArr>
    </m:oMath>
  `;
}

function delimitedEquationSystem(): string {
  return `
    <m:oMath xmlns:m="${MATH_NS}">
      <m:d>
        <m:dPr>
          <m:begChr m:val="{"/>
          <m:endChr m:val=""/>
        </m:dPr>
        <m:e>
          <m:eqArr>
            <m:e><m:r><m:t>x=1</m:t></m:r></m:e>
            <m:e><m:r><m:t>y=2</m:t></m:r></m:e>
          </m:eqArr>
        </m:e>
      </m:d>
    </m:oMath>
  `;
}

function vectorAngleWithCjkDelimiters(): string {
  return `
    <m:oMath xmlns:m="${MATH_NS}">
      <m:d>
        <m:dPr>
          <m:begChr m:val="〈"/>
          <m:endChr m:val="〉"/>
        </m:dPr>
        <m:e>
          <m:acc>
            <m:accPr><m:chr m:val="⃗"/></m:accPr>
            <m:e><m:r><m:t>AB</m:t></m:r></m:e>
          </m:acc>
          <m:r><m:t>,</m:t></m:r>
          <m:acc>
            <m:accPr><m:chr m:val="⃗"/></m:accPr>
            <m:e><m:r><m:t>AC</m:t></m:r></m:e>
          </m:acc>
        </m:e>
      </m:d>
      <m:r><m:t>=θ</m:t></m:r>
    </m:oMath>
  `;
}

function finiteSum(): string {
  return `
    <m:oMath xmlns:m="${MATH_NS}">
      <m:nary>
        <m:naryPr><m:chr m:val="∑"/></m:naryPr>
        <m:sub><m:r><m:t>i=1</m:t></m:r></m:sub>
        <m:sup><m:r><m:t>n</m:t></m:r></m:sup>
        <m:e>
          <m:sSub>
            <m:e><m:r><m:t>b</m:t></m:r></m:e>
            <m:sub><m:r><m:t>i</m:t></m:r></m:sub>
          </m:sSub>
        </m:e>
      </m:nary>
    </m:oMath>
  `;
}

function intervalWithFragmentedEntries(): string {
  return `
    <m:oMath xmlns:m="${MATH_NS}">
      <m:d>
        <m:dPr>
          <m:begChr m:val="["/>
          <m:sepChr m:val=""/>
          <m:endChr m:val="]"/>
        </m:dPr>
        <m:e><m:r><m:t>−</m:t></m:r></m:e>
        <m:e><m:r><m:t>1</m:t></m:r></m:e>
        <m:e><m:r><m:t>,</m:t></m:r></m:e>
        <m:e>
          <m:f>
            <m:num><m:r><m:t>5</m:t></m:r></m:num>
            <m:den><m:r><m:t>4</m:t></m:r></m:den>
          </m:f>
        </m:e>
      </m:d>
    </m:oMath>
  `;
}

function superscriptWithFraction(): string {
  return `
    <m:oMath xmlns:m="${MATH_NS}">
      <m:sSup>
        <m:e><m:r><m:t>a</m:t></m:r></m:e>
        <m:sup>
          <m:f>
            <m:num><m:r><m:t>3</m:t></m:r></m:num>
            <m:den><m:r><m:t>2</m:t></m:r></m:den>
          </m:f>
        </m:sup>
      </m:sSup>
    </m:oMath>
  `;
}

function nestedRadicalWithoutEmptyDegree(): string {
  return `
    <m:oMath xmlns:m="${MATH_NS}">
      <m:rad>
        <m:radPr><m:degHide m:val="on"/></m:radPr>
        <m:e>
          <m:rad>
            <m:radPr><m:degHide m:val="off"/></m:radPr>
            <m:deg><m:r><m:t>3</m:t></m:r></m:deg>
            <m:e><m:r><m:t>x</m:t></m:r></m:e>
          </m:rad>
        </m:e>
      </m:rad>
    </m:oMath>
  `;
}

function unicodeVerticalDelimiter(delimiter: string): string {
  return `
    <m:oMath xmlns:m="${MATH_NS}">
      <m:d>
        <m:dPr>
          <m:begChr m:val="${delimiter}"/>
          <m:endChr m:val="${delimiter}"/>
        </m:dPr>
        <m:e><m:r><m:t>x-1</m:t></m:r></m:e>
      </m:d>
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
    expect(latex).not.toContain("\\left\\left\\{");
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

  it("preserves every expression inside a fragmented delimiter", () => {
    expect(ommlToLatex(intervalWithFragmentedEntries())).toBe(
      String.raw`\left[−1,\frac{5}{4}\right]`,
    );
  });

  it("stretches a literal one-sided brace across a following matrix", () => {
    expect(ommlToLatex(piecewiseFunctionWithLiteralBrace())).toBe(
      String.raw`sgn(x)=\left\{\begin{matrix} 1, & x>0 \\ 0, & x=0 \\ -1, & x<0 \end{matrix}\right.`,
    );
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

  it("does not duplicate a literal brace before an equation array", () => {
    expect(ommlToLatex(literalBraceEquationSystem())).toBe(
      String.raw`\begin{cases}
x=1 \\
y=2
\end{cases}`,
    );
  });

  it("does not duplicate a brace around a delimited equation array", () => {
    expect(ommlToLatex(delimitedEquationSystem())).toBe(
      String.raw`\left\{\begin{aligned} x=1 \\ y=2 \end{aligned}\right.`,
    );
  });

  it("normalizes CJK angle delimiters and stretches arrows across point-pair vectors", () => {
    expect(ommlToLatex(vectorAngleWithCjkDelimiters())).toBe(
      String.raw`\left\langle\overrightarrow{AB},\overrightarrow{AC}\right\rangle=\theta`,
    );
  });

  it("keeps finite-sum bounds above and below the operator in inline previews", () => {
    expect(ommlToLatex(finiteSum())).toBe(
      String.raw`\sum\limits_{i=1}^{n} {b}_{i}`,
    );
  });

  it("preserves structured fractions inside superscripts", () => {
    expect(ommlToLatex(superscriptWithFraction())).toBe(
      String.raw`{a}^{\frac{3}{2}}`,
    );
  });

  it("keeps nested radicals scoped to their direct degree elements", () => {
    expect(ommlToLatex(nestedRadicalWithoutEmptyDegree())).toBe(
      String.raw`\sqrt{\sqrt[3]{x}}`,
    );
  });

  it("normalizes Unicode vertical delimiters emitted by Word and MathType", () => {
    expect(ommlToLatex(unicodeVerticalDelimiter("∥"))).toBe(
      String.raw`\left\|x-1\right\|`,
    );
    expect(ommlToLatex(unicodeVerticalDelimiter("∣"))).toBe(
      String.raw`\left|x-1\right|`,
    );
  });
});
