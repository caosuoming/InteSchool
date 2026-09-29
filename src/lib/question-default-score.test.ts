import { describe, expect, it } from "vitest";
import { subjectAwareDefaultQuestionScore } from "./question-default-score";

describe("subjectAwareDefaultQuestionScore", () => {
  it("uses math defaults for single choice, fill-in, and multiple choice questions", () => {
    expect(subjectAwareDefaultQuestionScore("single", "数学", 2)).toBe(5);
    expect(subjectAwareDefaultQuestionScore("short", "数学", 3)).toBe(5);
    expect(subjectAwareDefaultQuestionScore("multiple", "数学", 3)).toBe(6);
  });

  it("preserves the caller fallback for other math question types", () => {
    expect(subjectAwareDefaultQuestionScore("essay", "数学", 12)).toBe(12);
    expect(subjectAwareDefaultQuestionScore("judge", "数学", 2)).toBe(2);
  });

  it("preserves existing defaults for other subjects", () => {
    expect(subjectAwareDefaultQuestionScore("single", "物理", 2)).toBe(2);
    expect(subjectAwareDefaultQuestionScore("multiple", "语文", 3)).toBe(3);
  });

  it("normalizes surrounding whitespace in the subject", () => {
    expect(subjectAwareDefaultQuestionScore("multiple", " 数学 ", 3)).toBe(6);
  });
});
