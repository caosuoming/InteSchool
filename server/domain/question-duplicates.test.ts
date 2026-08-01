import { describe, expect, it } from "vitest";
import type { AppState } from "../types.js";
import type { Question } from "../../src/types/index.js";
import { computeDuplicateHash, runWithState } from "../runtime-db.js";
import { questionService } from "./question.js";

const now = "2026-08-01T12:00:00.000Z";

function existingQuestion(overrides: Partial<Question> = {}): Question {
  const stem = overrides.stem || "已知函数 f(x)=x²，求其最小值。";
  const answer = overrides.answer || "0";
  const options = overrides.options;
  return {
    id: "question-existing",
    teacherId: "teacher-1",
    schoolId: "school-1",
    type: "short",
    stem,
    options,
    answer,
    analysis: "当 x=0 时取得最小值。",
    summary: "二次函数最值",
    chapterIds: [],
    knowledgePointIds: [],
    difficulty: 2,
    recommendation: 3,
    usageCount: 0,
    remark: "",
    isShared: false,
    duplicateHash: computeDuplicateHash(stem, answer, options),
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function state(questions: Question[]): AppState {
  return {
    teachers: [],
    currentTeacherId: null,
    questions,
  };
}

const input = {
  type: "short" as const,
  stem: "已知函数 f(x) = x² 求其最小值",
  answer: "0",
  analysis: "当 x=0 时取得最小值。",
  chapterIds: [],
  knowledgePointIds: [],
  difficulty: 2 as const,
  recommendation: 3 as const,
};

describe("question duplicate review", () => {
  it("finds highly similar stems despite formatting differences", async () => {
    await runWithState(state([existingQuestion()]), async () => {
      const candidates = await questionService.findSimilarQuestions(
        "<p>已知函数 f(x)=x²，求其最小值</p>![图](/api/files/a/assets/rId1)",
        "school-1",
      );

      expect(candidates).toHaveLength(1);
      expect(candidates[0].question.id).toBe("question-existing");
      expect(candidates[0].similarity).toBeGreaterThanOrEqual(0.8);
    });
  });

  it("requires an explicit add decision before creating a similar question", async () => {
    await runWithState(state([existingQuestion()]), async () => {
      await expect(
        questionService.createQuestion("teacher-1", "school-1", input),
      ).rejects.toThrow(/发现高度相似题目/);

      const created = await questionService.createQuestion("teacher-1", "school-1", {
        ...input,
        duplicateDecision: "add",
      });
      expect(created.id).not.toBe("question-existing");
    });
  });

  it("requires duplicate review when the stem is edited", async () => {
    const questions = [
      existingQuestion(),
      existingQuestion({
        id: "question-editing",
        stem: "原始的不相似题干",
        answer: "原答案",
      }),
    ];
    await runWithState(state(questions), async () => {
      await expect(
        questionService.updateQuestion("question-editing", { stem: input.stem }),
      ).rejects.toThrow(/发现高度相似题目/);

      const updated = await questionService.updateQuestion(
        "question-editing",
        { stem: input.stem },
        "add",
      );
      expect(updated.stem).toBe(input.stem);
    });
  });
});
