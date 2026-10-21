import { describe, expect, it } from "vitest";
import {
  expandQuestionCategoryFilter,
  mergeQuestionCategoryOptions,
  normalizeQuestionCategory,
} from "./question-category-options";

describe("mergeQuestionCategoryOptions", () => {
  it("merges school-defined and automatic labels while preserving legacy filter values", () => {
    const { options, aliases } = mergeQuestionCategoryOptions([
      { value: "classic", label: "典型题" },
      { value: "multi-solution", label: "一题多解" },
      { value: "multi-part", label: "一题多问" },
      { value: "一题多解", label: "一题多解" },
    ]);
    expect(options).toEqual([
      { value: "classic", label: "典型题" },
      { value: "一题多解", label: "一题多解" },
      { value: "一题多问", label: "一题多问" },
    ]);
    expect(expandQuestionCategoryFilter(["一题多解", "classic", "一题多问"], aliases))
      .toEqual(["multi-solution", "一题多解", "classic", "multi-part", "一题多问"]);
    expect(normalizeQuestionCategory("multi-solution", aliases)).toBe("一题多解");
    expect(normalizeQuestionCategory("multi-part", aliases)).toBe("一题多问");
  });

  it("includes built-ins without configured entries and does not merge other categories", () => {
    const { options, aliases } = mergeQuestionCategoryOptions([
      { value: "x", label: "典型题" },
      { value: "y", label: "典型题" },
    ]);
    expect(options.map((option) => option.value)).toEqual(["x", "y", "一题多解", "一题多问"]);
    expect(expandQuestionCategoryFilter(["一题多问"], aliases)).toEqual(["一题多问"]);
    expect(normalizeQuestionCategory("other", aliases)).toBe("other");
  });
});
