import { describe, expect, it } from "vitest";
import { normalizeLegacyOmmlMathText } from "./legacy-omml-formulas";

describe("normalizeLegacyOmmlMathText", () => {
  it("repairs legacy curve and point labels", () => {
    expect(
      normalizeLegacyOmmlMathText(
        "椭圆 $\\mathbb{C}_1$ 与双曲线 $\\mathbb{C}_2$ 交于 $P,\\mathbb{Q}$，点 $\\mathbb{N}$ 在第一象限。",
      ),
    ).toBe("椭圆 $C_1$ 与双曲线 $C_2$ 交于 $P,Q$，点 $N$ 在第一象限。");
  });

  it("preserves explicit set notation", () => {
    expect(
      normalizeLegacyOmmlMathText(
        "设 $x\\in\\mathbb{N}$，$f:\\mathbb{N}\\to\\mathbb{Q}$，复数集为 $\\mathbb{C}$。",
      ),
    ).toBe("设 $x\\in\\mathbb{N}$，$f:\\mathbb{N}\\to\\mathbb{Q}$，复数集为 $\\mathbb{C}$。");
  });

  it("leaves ambiguous standalone letters unchanged", () => {
    expect(normalizeLegacyOmmlMathText("记 $\\mathbb{Q}$ 为给定对象。"))
      .toBe("记 $\\mathbb{Q}$ 为给定对象。");
  });

  it("repairs Unicode vertical delimiters in stored OMML formulas", () => {
    expect(
      normalizeLegacyOmmlMathText(
        "$T=\\left\\{x\\in Z\\left∥x-1\\right∥\\neq 1\\right\\}$",
      ),
    ).toBe(
      "$T=\\left\\{x\\in Z\\left\\|x-1\\right\\|\\neq 1\\right\\}$",
    );
  });

  it("collapses legacy piecewise formulas that contain two left braces", () => {
    expect(
      normalizeLegacyOmmlMathText(
        "已知函数 $f\\left(x\\right)=\\left\\{\\begin{aligned} \\begin{cases} a\\cdot 2^x,&x\\le 0\\\\ \\log_{2}x,&x>0 \\end{cases} \\end{aligned}\\right.若关于x的方程 f\\left(f\\left(x\\right)\\right)=0 有且仅有两个实数根，则实数a$ 的取值范围是（ ）。",
      ),
    ).toBe(
      "已知函数 $f\\left(x\\right)=\\begin{cases} a\\cdot 2^x,&x\\le 0\\\\ \\log_{2}x,&x>0 \\end{cases}若关于x的方程 f\\left(f\\left(x\\right)\\right)=0 有且仅有两个实数根，则实数a$ 的取值范围是（ ）。",
    );
  });

  it("repairs missing delimiters on multiline systems from a legacy Word import", () => {
    const input = String.raw`联立 $\left\begin{cases}
n\cdot\overrightarrow{AE}=3\sqrt{3}x+y+\frac{3}{2}z=0, \\
n\cdot\overrightarrow{AB}=4\sqrt{3}x=0,
\end{cases}\right.$。`;
    const expected = input.replace(String.raw`\left\begin{cases}`, String.raw`\begin{cases}`)
      .replace(String.raw`\end{cases}\right.`, String.raw`\end{cases}`);

    expect(normalizeLegacyOmmlMathText(input)).toBe(expected);
    expect(normalizeLegacyOmmlMathText(expected)).toBe(expected);
  });

  it("wraps unmarked equation systems from historical math extraction", () => {
    const source = String.raw`得\begin{cases}x-y-z=0 2x-z=0\end{cases}，取`;
    expect(normalizeLegacyOmmlMathText(source)).toBe(
      String.raw`得$\begin{cases}x-y-z=0\\2x-z=0\end{cases}$，取`,
    );
  });

  it("recovers comma-separated equations without changing delimited math", () => {
    const bare = String.raw`解得\begin{cases}x=4, y=3\end{cases} 或 \begin{cases}x=4, y=-3\end{cases}`;
    expect(normalizeLegacyOmmlMathText(bare)).toBe(
      String.raw`解得$\begin{cases}x=4\\y=3\end{cases}$ 或 $\begin{cases}x=4\\y=-3\end{cases}$`,
    );
    const alreadyMarked = String.raw`由 $\begin{cases}x=4, y=3\end{cases}$ 得证`;
    expect(normalizeLegacyOmmlMathText(alreadyMarked)).toBe(alreadyMarked);
  });

  it("leaves unrelated LaTeX, incomplete systems and HTML tags untouched", () => {
    const original = String.raw`价格 $5，公式 \frac{a}{b}，未完成 \begin{cases}x=1，<code>\begin{cases}y=2\end{cases}</code>`;
    expect(normalizeLegacyOmmlMathText(original)).toBe(original);
    const escaped = String.raw`\(\begin{cases}x=1\\y=2\end{cases}\)`;
    expect(normalizeLegacyOmmlMathText(escaped)).toBe(escaped);
  });

  it("preserves correctly delimited braces around equation arrays", () => {
    const input = String.raw`$\left\{\begin{aligned}x=1\\y=2\end{aligned}\right.$`;
    expect(normalizeLegacyOmmlMathText(input)).toBe(input);
  });

  it("repairs legacy arc formulas only in explicit arc context", () => {
    expect(normalizeLegacyOmmlMathText("圆弧 $\\vec{AB}$ 的长度为 2。"))
      .toBe("圆弧 $\\overgroup{AB}$ 的长度为 2。");
    expect(normalizeLegacyOmmlMathText("向量 $\\vec{AB}$ 与向量 $\\overrightarrow{CD}$。"))
      .toBe("向量 $\\vec{AB}$ 与向量 $\\overrightarrow{CD}$。");
  });

  it("recovers bare cases environments from saved extraction text", () => {
    const source = String.raw`解得 \begin{cases}b=2\\c=-1\end{cases}，所以 b=2。`;
    const expected = String.raw`解得 $\begin{cases}b=2\\c=-1\end{cases}$，所以 b=2。`;
    expect(normalizeLegacyOmmlMathText(source)).toBe(expected);
    expect(normalizeLegacyOmmlMathText(expected)).toBe(expected);
  });

  it("recovers one-sided equation systems with an invalid outer brace", () => {
    const source = String.raw`即 \left\{\begin{cases}x=1\\y=2\end{cases}\right.。`;
    expect(normalizeLegacyOmmlMathText(source)).toBe(
      String.raw`即 $\begin{cases}x=1\\y=2\end{cases}$。`,
    );
  });

  it("does not double-wrap parentheses nested inside a bare cases environment", () => {
    const input = String.raw`联立 \begin{cases}\left(x+1\right)=2\\y=3\end{cases}。`;
    const expected = String.raw`联立 $\begin{cases}\left(x+1\right)=2\\y=3\end{cases}$。`;
    expect(normalizeLegacyOmmlMathText(input)).toBe(expected);
    expect(normalizeLegacyOmmlMathText(expected)).toBe(expected);
  });

  it("repairs a crossed matrix delimiter without losing either row", () => {
    const source = String.raw`$f(x)=\left\{\begin{matrix}\begin{matrix}-1,&x\leq0\\\log_{2}x-\frac{1}{x},&x>0\end{matrix}\right.\end{matrix}$`;
    expect(normalizeLegacyOmmlMathText(source)).toBe(
      String.raw`$f(x)=\left\{\begin{matrix}-1,&x\leq0\\\log_{2}x-\frac{1}{x},&x>0\end{matrix}\right.$`,
    );
    const bare = source.slice(1, -1);
    expect(normalizeLegacyOmmlMathText(bare)).toBe(
      String.raw`f(x)=$\left\{\begin{matrix}-1,&x\leq0\\\log_{2}x-\frac{1}{x},&x>0\end{matrix}\right.$`,
    );
  });

  it("repairs malformed negative implication symbols in stored answers", () => {
    expect(normalizeLegacyOmmlMathText(String.raw`所以p\overset{}\Rightarrow }q。`))
      .toBe(String.raw`所以$p\nRightarrow q$。`);
    expect(normalizeLegacyOmmlMathText(String.raw`$p\overset{}\Rightarrow }q$`))
      .toBe(String.raw`$p\nRightarrow q$`);
  });

  it("recovers an unwrapped parenthesized equation without modifying regular prose", () => {
    const source = String.raw`所以\left(k-n\right)^{2}=0，即 k=n。`;
    expect(normalizeLegacyOmmlMathText(source))
      .toBe(String.raw`所以$\left(k-n\right)^{2}=0$，即 k=n。`);
    expect(normalizeLegacyOmmlMathText(String.raw`路径 C:\Users\math，价格为 $5`))
      .toBe(String.raw`路径 C:\Users\math，价格为 $5`);
  });

});
