import { describe, expect, it } from "vitest";
import {
  decorateFillBlankAnswerAreas,
  ensureFillBlankAnswerArea,
  hasFillBlankAnswerArea,
} from "./fill-blank";

describe("fill blank answer areas", () => {
  it("preserves and extends an existing underline to fit the answer", () => {
    expect(ensureFillBlankAnswerArea("若 x=___。", "123456")).toBe(
      "若 x=______。",
    );
  });

  it("turns three or more spaces into an answer-sized underline", () => {
    expect(ensureFillBlankAnswerArea("函数的值域为   。", "正无穷")).toBe(
      "函数的值域为______。",
    );
  });

  it("inserts a blank at an inferred answer location when none exists", () => {
    expect(ensureFillBlankAnswerArea("方程的根为。", "2")).toBe(
      "方程的根为____。",
    );
    expect(ensureFillBlankAnswerArea("若 x=。", "12")).toBe(
      "若 x=____。",
    );
  });

  it("does not treat subscripts inside math as blank areas", () => {
    expect(ensureFillBlankAnswerArea("求 $a_1$ 的值。", "3")).toBe(
      "求 $a_1$ 的值____。",
    );
  });

  it("recognizes whitespace gaps without confusing choice parentheses", () => {
    expect(hasFillBlankAnswerArea("结果为   。")).toBe(true);
    expect(hasFillBlankAnswerArea("结果为（ ）。")).toBe(false);
    expect(hasFillBlankAnswerArea("求 $a_1$ 的值。")).toBe(false);
  });

  it("wraps answer underlines without touching LaTeX subscripts", () => {
    expect(decorateFillBlankAnswerAreas("若 $a_1$ 的值为____。")).toBe(
      '若 $a_1$ 的值为<span class="answer-sheet-inline-blank">____</span>。',
    );
    expect(decorateFillBlankAnswerAreas("方程的根为。")).toBe(
      '方程的根为<span class="answer-sheet-inline-blank">____</span>。',
    );
  });
});
