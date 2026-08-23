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
});
