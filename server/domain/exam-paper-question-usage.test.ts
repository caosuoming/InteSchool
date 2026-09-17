import { describe, expect, it } from "vitest";
import type { ExamPaperQuestion, Question } from "../../src/types/index.js";
import { runWithState } from "../runtime-db.js";
import type { AppState } from "../types.js";
import { examPaperService } from "./examPaper.js";
import { questionService } from "./question.js";

const now = "2026-09-17T12:00:00.000Z";

function question(): Question {
  return {
    id: "question-1",
    teacherId: "teacher-1",
    schoolId: "school-1",
    type: "single",
    stem: "1 + 1 = ?",
    options: ["1", "2"],
    answer: "2",
    analysis: "基础计算",
    chapterIds: [],
    knowledgePointIds: [],
    difficulty: 1,
    recommendation: 3,
    usageCount: 0,
    remark: "",
    isShared: false,
    createdAt: now,
    updatedAt: now,
  };
}

function paperQuestion(): ExamPaperQuestion {
  return {
    id: "paper-question-1",
    questionId: "question-1",
    stem: "1 + 1 = ?",
    options: ["1", "2"],
    answer: "2",
    analysis: "基础计算",
    score: 2,
    type: "single",
  };
}

function state(): AppState {
  return {
    teachers: [],
    currentTeacherId: null,
    questions: [question()],
    examPapers: [],
  };
}

describe("exam paper question usage", () => {
  it("counts question references when creating a paper from the resource basket", async () => {
    await runWithState(state(), async () => {
      await examPaperService.createPaper("teacher-1", "school-1", {
        title: "从资源篮生成的试卷",
        chapterIds: [],
        knowledgePointIds: [],
        grade: "高一",
        schoolYear: "2026-2027",
        duration: 60,
        totalScore: 2,
        questions: [paperQuestion()],
      });

      await expect(questionService.getQuestion("question-1")).resolves.toEqual(
        expect.objectContaining({ usageCount: 1, lastUsedAt: expect.any(String) }),
      );
    });
  });

  it("counts only newly added references when an existing paper is saved repeatedly", async () => {
    await runWithState(state(), async () => {
      const paper = await examPaperService.createPaper("teacher-1", "school-1", {
        title: "空白试卷",
        chapterIds: [],
        knowledgePointIds: [],
        grade: "高一",
        schoolYear: "2026-2027",
        duration: 60,
        totalScore: 0,
        questions: [],
      });

      await examPaperService.updatePaper(paper.id, { questions: [paperQuestion()] });
      await examPaperService.updatePaper(paper.id, { questions: [paperQuestion()] });

      await expect(questionService.getQuestion("question-1")).resolves.toEqual(
        expect.objectContaining({ usageCount: 1, lastUsedAt: expect.any(String) }),
      );
    });
  });
});
