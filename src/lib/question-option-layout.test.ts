import { describe, expect, it } from "vitest";
import { getQuestionOptionGridColumns } from "@/lib/question-option-layout";

describe("getQuestionOptionGridColumns", () => {
  it("uses visible text length instead of rich HTML markup length", () => {
    expect(getQuestionOptionGridColumns([
      "<strong>短选项</strong>",
      "<span class=\"formula\">另一个短选项</span>",
    ])).toBe("grid-cols-4");
  });

  it("keeps image choices at two columns", () => {
    expect(getQuestionOptionGridColumns([
      '<img src="/assets/choice-a.png" alt="选项 A" />',
      '<img src="/assets/choice-b.png" alt="选项 B" />',
      '<img src="/assets/choice-c.png" alt="选项 C" />',
      '<img src="/assets/choice-d.png" alt="选项 D" />',
    ])).toBe("grid-cols-2");
  });
});
