import { describe, expect, it } from "vitest";
import type {
  AnswerRecord,
  Chapter,
  KnowledgePoint,
  Question,
  Student,
} from "../../src/types/index.js";
import type { AppState } from "../types.js";
import { runWithState } from "../runtime-db.js";
import { analyticsService } from "./analytics.js";

const now = "2026-07-30T11:30:00.000Z";

function question(id: string): Question {
  return {
    id,
    teacherId: "teacher-1",
    schoolId: "school-1",
    type: "single",
    stem: id,
    options: ["A", "B"],
    answer: "A",
    analysis: "",
    chapterIds: ["chapter-1"],
    knowledgePointIds: ["point-1"],
    difficulty: 2,
    recommendation: 3,
    usageCount: 0,
    remark: "",
    isShared: false,
    hiddenByExamIds: [],
    createdAt: now,
    updatedAt: now,
  };
}

function state(): AppState {
  const student: Student = {
    id: "student-1",
    name: "测试学生",
    studentNo: "001",
    classId: "class-1",
    schoolId: "school-1",
    grade: "高一",
    status: "active",
  };
  const chapter: Chapter = {
    id: "chapter-1",
    schoolId: "school-1",
    parentId: null,
    name: "集合",
    order: 1,
    level: 0,
    questionCount: 2,
  };
  const point: KnowledgePoint = {
    id: "point-1",
    schoolId: "school-1",
    parentId: null,
    chapterId: "chapter-1",
    name: "集合的概念",
    order: 1,
    level: 0,
    questionCount: 2,
  };
  const childPoint: KnowledgePoint = {
    id: "point-child",
    schoolId: "school-1",
    parentId: point.id,
    name: "子集",
    order: 2,
    level: 1,
    questionCount: 0,
  };
  const existing: AnswerRecord = {
    id: "answer-correct",
    studentId: student.id,
    questionId: "question-scored",
    lectureId: "lecture-1",
    isCorrect: true,
    score: "correct",
    source: "manual",
    answeredAt: now,
  };

  return {
    teachers: [],
    currentTeacherId: null,
    students: [student],
    chapters: [chapter],
    knowledgePoints: [point, childPoint],
    questions: [question("question-scored"), question("question-done")],
    answerRecords: [existing],
  };
}

describe("neutral completed answer records", () => {
  it("stores completed records while excluding them from correctness and mastery denominators", async () => {
    const appState = state();

    await runWithState(appState, async () => {
      const saved = await analyticsService.batchSaveAnswerRecords([
        {
          studentId: "student-1",
          questionId: "question-done",
          lectureId: "lecture-1",
          score: "done",
          source: "manual",
        },
      ]);

      expect(saved).toHaveLength(1);
      expect(saved[0]).toMatchObject({ score: "done", isCorrect: false });

      const records = await analyticsService.listAnswerRecordsByStudent("student-1");
      expect(records.map((record) => record.score).sort()).toEqual(["correct", "done"]);

      const [studentStat] = await analyticsService.getStudentStats("school-1");
      expect(studentStat).toMatchObject({ answerCount: 2, correctRate: 1 });

      const questionStats = await analyticsService.getQuestionStats("school-1");
      expect(questionStats.find((item) => item.question.id === "question-done")).toMatchObject({
        answerCount: 1,
        correctRate: 0,
      });

      const weakness = await analyticsService.getQuestionWeaknessScore(
        "school-1",
        ["student-1"],
      );
      expect(weakness.get("question-done")).toBe(0.5);

      const mastery = await analyticsService.getKnowledgeMastery(["student-1"], "school-1");
      expect(mastery[0]).toMatchObject({
        knowledgePointPath: ["集合的概念"],
        totalAttempts: 1,
        correctCount: 1,
        partialCount: 0,
        wrongCount: 0,
        correctRate: 1,
      });
      expect(mastery.find((item) => item.knowledgePointId === "point-child")).toMatchObject({
        knowledgePointPath: ["集合的概念", "子集"],
      });
    });
  });
});
