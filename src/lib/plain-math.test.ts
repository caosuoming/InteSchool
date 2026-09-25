import { describe, expect, it } from "vitest";
import { normalizePlainMathText } from "./plain-math";

describe("normalizePlainMathText", () => {
  it("canonicalizes plain line equations and Unicode subscripts", () => {
    expect(
      normalizePlainMathText(
        "若直线l₁:ax+(1-a)y=3与l₂:(a-1)x+(2a+3)y=2互相垂直，则实数a=。",
      ),
    ).toBe(
      "若直线$l_{1}:ax+(1-a)y=3$与$l_{2}:(a-1)x+(2a+3)y=2$互相垂直，则实数a=。",
    );
  });

  it("canonicalizes point coordinates without swallowing punctuation", () => {
    expect(
      normalizePlainMathText(
        "已知直线ax-b₁y+1=0和直线a₂x+b₂y+1=0都经过点A(2,1),则过P₁(a₁,b₁),P₂(a₂,b₂)两点。",
      ),
    ).toBe(
      "已知直线$ax-b_{1}y+1=0$和直线$a_{2}x+b_{2}y+1=0$都经过点$A(2,1)$,则过$P_{1}(a_{1},b_{1}),P_{2}(a_{2},b_{2})$两点。",
    );
  });

  it("does not cross line boundaries or rewrite prose-like equalities", () => {
    expect(normalizePlainMathText("ax=1\nA. 2")).toBe("$ax=1$\nA. 2");
    expect(normalizePlainMathText("DNA=RNA")).toBe("DNA=RNA");
    expect(normalizePlainMathText("函数 y = 2x + 1 的斜率")).toBe("函数 $y = 2x + 1$ 的斜率");
    expect(normalizePlainMathText("当 a < b 时")).toBe("当 a < b 时");
    expect(normalizePlainMathText("由 $x>0$ 得 $x<1")).toBe("由 $x>0$ 得 $x<1");
  });

  it("preserves formulas and rich markup that are already canonical", () => {
    const value = '<i class="math-variable">a</i> 与 $x^2=1$';
    expect(normalizePlainMathText(value)).toBe(value);
  });
});
