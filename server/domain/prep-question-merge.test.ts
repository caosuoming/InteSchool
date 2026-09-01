import { describe, expect, it } from "vitest";
import type { AppState } from "../types.js";
import { computeDuplicateHash, runWithState } from "../runtime-db.js";
import { prepService } from "./prep.js";
import type { Question } from "../../src/types/index.js";

const now = "2026-09-01T03:00:00.000Z";

function question(id: string, overrides: Partial<Question> = {}): Question {
  return {
    id,
    teacherId: "teacher-1",
    schoolId: "school-1",
    type: "short",
    stem: `${id} stem`,
    answer: `${id} answer`,
    analysis: `${id} analysis`,
    summary: `${id} summary`,
    chapterIds: [],
    knowledgePointIds: [],
    difficulty: 2,
    recommendation: 3,
    usageCount: 0,
    remark: "",
    isShared: false,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function state(): AppState {
  return {
    questions: [
      question("question-target", { stem: "target stem", answer: "target answer" }),
      question("question-source", { stem: "source stem", answer: "source answer" }),
    ],
    questionReferences: [{
      id: "ref-source",
      questionId: "question-source",
      teacherId: "teacher-1",
      sourceType: "personal",
      usedInStudentIds: ["student-1"],
      usageCount: 2,
      markedAsUsed: true,
    }],
    answerRecords: [{
      id: "answer-1",
      studentId: "student-1",
      questionId: "question-source",
      lectureId: "lecture-1",
      isCorrect: true,
      answeredAt: now,
    }],
    lectures: [{
      id: "lecture-1",
      sections: [{ id: "section-1", questionId: "question-source", children: [] }],
    }],
    baskets: [{
      id: "basket-1",
      teacherId: "teacher-1",
      name: "测试篮",
      questionIds: ["question-source"],
      materialIds: [],
      createdAt: now,
      updatedAt: now,
    }],
  } as unknown as AppState;
}

describe("prep question merge", () => {
  it("merges selected fields and migrates source references", async () => {
    const appState = state();

    await runWithState(appState, async () => {
      await prepService.mergeQuestions("question-target", "question-source", {
        stem: "incoming",
        answer: "both",
        analysis: "existing",
        summary: "incoming",
      });
    });

    expect(appState.questions).toHaveLength(1);
    expect(appState.questions[0]).toMatchObject({
      id: "question-target",
      stem: "source stem",
      answer: "target answer\n\n答案2：source answer",
      analysis: "question-target analysis",
      summary: "question-source summary",
      duplicateHash: computeDuplicateHash(
        "source stem",
        "target answer\n\n答案2：source answer",
      ),
    });
    expect(appState.questionReferences).toEqual([
      expect.objectContaining({
        questionId: "question-target",
        usedInStudentIds: ["student-1"],
        usageCount: 2,
      }),
    ]);
    expect(appState.answerRecords[0].questionId).toBe("question-target");
    expect(appState.lectures[0].sections[0].questionId).toBe("question-target");
    expect(appState.baskets[0].questionIds).toEqual(["question-target"]);
  });

  it("keeps the legacy merge behavior when fields are omitted", async () => {
    const appState = state();

    await runWithState(appState, async () => {
      await prepService.mergeQuestions("question-target", "question-source");
    });

    expect(appState.questions).toHaveLength(1);
    expect(appState.questions[0]).toMatchObject({
      id: "question-target",
      stem: "target stem",
      answer: "target answer",
    });
  });
});
