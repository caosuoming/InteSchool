import { describe, expect, it } from "vitest";
import type { Question } from "@/types";
import { normalizeLegacyQuestionMeanNotation } from "./legacy-question-math";

function question(overrides: Partial<Question> = {}): Question {
  return {
    id: "q-738",
    teacherId: "teacher-1",
    schoolId: "school-1",
    type: "essay",
    stem: "求 a 的值，并估计正确识别图像数量的均值$\\vec{x}$。",
    answer: "$a=0.0125$，$\\vec{x}=67$。",
    analysis: "所以$\\vec{x}=20\\times(20\\times0.005+40\\times0.0075)=67$。",
    summary: "均值$\\vec{x}$的计算。",
    board: "$\\vec{x}=67$",
    options: undefined,
    chapterIds: [],
    knowledgePointIds: [],
    difficulty: 3,
    recommendation: 3,
    usageCount: 0,
    remark: "",
    isShared: false,
    duplicateHash: "legacy",
    hiddenByExamIds: [],
    createdAt: "2026-08-27T00:00:00.000Z",
    updatedAt: "2026-08-27T00:00:00.000Z",
    ...overrides,
  };
}

describe("normalizeLegacyQuestionMeanNotation", () => {
  it("repairs the mean symbol in the stem, answer, analysis, summary, and board", () => {
    const normalized = normalizeLegacyQuestionMeanNotation(question());

    expect(normalized.stem).toContain("均值$\\bar{x}$");
    expect(normalized.answer).toContain("$\\bar{x}=67$");
    expect(normalized.analysis).toContain("$\\bar{x}=20");
    expect(normalized.summary).toContain("均值$\\bar{x}$");
    expect(normalized.board).toBe("$\\bar{x}=67$");
    expect(JSON.stringify(normalized)).not.toContain("\\\\vec{x}");
  });

  it("leaves genuine vector notation unchanged when the stem does not call it a mean", () => {
    const original = question({
      stem: "已知向量$\\vec{x}$与向量$\\vec{y}$垂直。",
      answer: "$\\vec{x}=(1,2)$。",
      analysis: "由$\\vec{x}\\cdot\\vec{y}=0$可得。",
    });

    expect(normalizeLegacyQuestionMeanNotation(original)).toBe(original);
  });
});
