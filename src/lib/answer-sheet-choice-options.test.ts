import { describe, expect, it } from "vitest";
import { layoutChoiceOptions } from "./answer-sheet-choice-options";

describe("layoutChoiceOptions", () => {
  it("prefers four choices per row when their total widths fit", () => {
    expect(layoutChoiceOptions([20, 55, 20, 20], 140)).toEqual([[0, 1, 2, 3]]);
    expect(layoutChoiceOptions([20, 55, 20, 20, 20], 140)).toEqual([[0, 1, 2, 3], [4]]);
  });

  it("uses two per row when a group of four cannot fit", () => {
    expect(layoutChoiceOptions([70, 70, 30, 30], 155)).toEqual([[0, 1], [2, 3]]);
  });

  it("never wraps an individual option and allows single-line fallbacks", () => {
    expect(layoutChoiceOptions([135, 40, 30, 40], 150)).toEqual([[0], [1, 2], [3]]);
  });

  it("allows explicit new-line and same-line overrides without overflow", () => {
    expect(layoutChoiceOptions([55, 55, 55, 55], 180, { 1: "new-line", 2: "same-line" }))
      .toEqual([[0], [1, 2], [3]]);
    expect(layoutChoiceOptions([25, 25, 25, 100], 150, { 2: "same-line" }))
      .toEqual([[0, 1, 2], [3]]);
    expect(layoutChoiceOptions([110, 110], 150, { 1: "same-line" }))
      .toEqual([[0], [1]]);
  });
});
