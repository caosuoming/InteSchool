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

  it("does not reclassify questions created earlier in the same reviewed batch as library duplicates", async () => {
    await runWithState(state([]), async () => {
      const result = await extractService.confirmExtract(
        "teacher-1",
        "school-1",
        {
          questions: [
            {
              id: "uploaded-question-1",
              type: "short",
              stem: "已知函数 f(x)=x²，求其最小值。",
              answer: "0",
              analysis: "当 x=0 时取得最小值。",
              summary: "二次函数最值",
              difficulty: 2,
              status: "new",
            },
            {
              id: "uploaded-question-2",
              type: "short",
              stem: "已知函数 f(x)=x²，求其最小值。",
              answer: "0",
              analysis: "当 x=0 时取得最小值。",
              summary: "二次函数最值",
              difficulty: 2,
              status: "new",
            },
          ],
          knowledgeBlocks: [],
        },
        [],
        [],
        "高一",
        "2026-2027",
        "上学期",
        "lecture-1",
      );

      expect(result.createdQuestions).toHaveLength(2);
      expect(result.questionIdByItemId["uploaded-question-1"]).toBeTruthy();
      expect(result.questionIdByItemId["uploaded-question-2"]).toBeTruthy();
    });
  });

  it("checks all unresolved library duplicates before writing any question", async () => {
    const appState = state([existingQuestion()]);
    await runWithState(appState, async () => {
      await expect(extractService.confirmExtract(
        "teacher-1",
        "school-1",
        {
          questions: [
            {
              id: "safe-question",
              type: "short",
              stem: "计算 1+1。",
              answer: "2",
              analysis: "直接计算。",
              summary: "整数加法",
              difficulty: 1,
              status: "new",
            },
            {
              id: "unresolved-duplicate",
              type: "short",
              stem: "已知函数 f(x)=x²，求其最小值。",
              answer: "0",
              analysis: "当 x=0 时取得最小值。",
              summary: "二次函数最值",
              difficulty: 2,
              status: "new",
            },
          ],
          knowledgeBlocks: [],
        },
        [],
        [],
        "高一",
        "2026-2027",
        "上学期",
        "lecture-1",
      )).rejects.toThrow(/发现高度相似题目/);

      expect(appState.questions).toHaveLength(1);
      expect(appState.questions[0].id).toBe("question-existing");
    });
  });
});
