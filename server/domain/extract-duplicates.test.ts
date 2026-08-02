import { describe, expect, it } from "vitest";
import type { AppState } from "../types.js";
import type { Question } from "../../src/types/index.js";
import { computeDuplicateHash, runWithState } from "../runtime-db.js";
import { extractService } from "./extract.js";

const now = "2026-08-02T08:00:00.000Z";

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
    materials: [],
  };
}

describe("extracted question duplicate merge", () => {
  it("merges selected fields into the owned existing question", async () => {
    await runWithState(state([existingQuestion()]), async () => {
      const result = await extractService.confirmExtract(
        "teacher-1",
        "school-1",
        {
          questions: [{
            id: "uploaded-question",
            type: "short",
            stem: "已知函数 f(x) = x² 求其最小值",
            answer: "最小值为 0",
            analysis: "配方法可得最小值为 0。",
            summary: "上传题总结",
            difficulty: 2,
            status: "duplicate",
            duplicateAction: "merge",
            duplicateTargetId: "question-existing",
            duplicateFields: {
              stem: "incoming",
              answer: "both",
              analysis: "incoming",
              summary: "both",
            },
          }],
          knowledgeBlocks: [],
        },
        [],
        [],
        "高一",
        "2026-2027",
        "上学期",
        "lecture-1",
      );

      expect(result.createdQuestions).toEqual([]);
      expect(result.mergedQuestions).toHaveLength(1);
      expect(result.questionIdByItemId).toEqual({
        "uploaded-question": "question-existing",
      });
      expect(result.mergedQuestions[0]).toMatchObject({
        id: "question-existing",
        stem: "已知函数 f(x) = x² 求其最小值",
        answer: "0\n\n答案2：最小值为 0",
        analysis: "配方法可得最小值为 0。",
        summary: "二次函数最值\n\n总结2：上传题总结",
      });
    });
  });

  it("rejects merging into another teacher's question", async () => {
    await runWithState(state([existingQuestion({ teacherId: "teacher-2" })]), async () => {
      await expect(extractService.confirmExtract(
        "teacher-1",
        "school-1",
        {
          questions: [{
            id: "uploaded-question",
            type: "short",
            stem: "已知函数 f(x) = x² 求其最小值",
            answer: "0",
            analysis: "解析",
            summary: "总结",
            difficulty: 2,
            status: "duplicate",
            duplicateAction: "merge",
            duplicateTargetId: "question-existing",
            duplicateFields: {
              stem: "existing",
              answer: "existing",
              analysis: "existing",
              summary: "existing",
            },
          }],
          knowledgeBlocks: [],
        },
        [],
        [],
        "高一",
        "2026-2027",
        "上学期",
        "lecture-1",
      )).rejects.toThrow("只能将上传题合并到自己的题目");
    });
  });
});
