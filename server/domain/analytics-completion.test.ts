import { describe, expect, it } from "vitest";
import type {
  AnswerRecord,
  Chapter,
  KnowledgePoint,
  Question,
  Student,
} from "../../src/types/index.js";
import type { AppState, TeacherRecord } from "../types.js";
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

describe("school question statistics", () => {
  it("scopes stats to the active school, counts unique students, and uses each student's latest answer", async () => {
    const appState = state();
    const sharedQuestion = {
      ...question("question-shared"),
      teacherId: "teacher-2",
      schoolId: "school-2",
      isShared: true,
    };
    const privateQuestion = {
      ...question("question-private"),
      teacherId: "teacher-2",
      schoolId: "school-2",
      isShared: false,
    };
    appState.questions = [...appState.questions as Question[], sharedQuestion, privateQuestion];
    appState.students = [
      ...appState.students as Student[],
      {
        id: "student-2",
        name: "同校学生二",
        studentNo: "002",
        classId: "class-1",
        schoolId: "school-1",
        grade: "高一",
        status: "active",
      },
      {
        id: "student-other-school",
        name: "外校学生",
        studentNo: "003",
        classId: "class-2",
        schoolId: "school-2",
        grade: "高一",
        status: "active",
      },
    ];
    appState.answerRecords = [
      ...appState.answerRecords as AnswerRecord[],
      {
        id: "shared-student-1-old",
        studentId: "student-1",
        questionId: sharedQuestion.id,
        lectureId: "lecture-old",
        isCorrect: false,
        score: "wrong",
        answeredAt: "2026-07-29T10:00:00.000Z",
      },
      {
        id: "shared-student-1-new",
        studentId: "student-1",
        questionId: sharedQuestion.id,
        lectureId: "lecture-new",
        isCorrect: true,
        score: "correct",
        answeredAt: "2026-07-30T10:00:00.000Z",
      },
      {
        id: "shared-student-2-scored",
        studentId: "student-2",
        questionId: sharedQuestion.id,
        lectureId: "lecture-score",
        isCorrect: false,
        score: "partial",
        answeredAt: "2026-07-30T09:00:00.000Z",
      },
      {
        id: "shared-student-2-done",
        studentId: "student-2",
        questionId: sharedQuestion.id,
        lectureId: "lecture-done",
        isCorrect: false,
        score: "done",
        answeredAt: "2026-07-30T11:00:00.000Z",
      },
      {
        id: "shared-other-school",
        studentId: "student-other-school",
        questionId: sharedQuestion.id,
        lectureId: "lecture-other",
        isCorrect: false,
        score: "wrong",
        answeredAt: "2026-07-30T11:15:00.000Z",
      },
      {
        id: "done-only",
        studentId: "student-1",
        questionId: "question-done",
        lectureId: "lecture-done-only",
        isCorrect: false,
        score: "done",
        answeredAt: "2026-07-30T11:20:00.000Z",
      },
    ];

    await runWithState(appState, async () => {
      const teacher = { id: "teacher-1" } as TeacherRecord;
      const stats = await analyticsService.getSchoolQuestionStats(
        "school-1",
        [sharedQuestion.id, "question-done", "question-scored", privateQuestion.id],
        teacher,
      );

      expect(stats.find((item) => item.questionId === sharedQuestion.id)).toEqual({
        questionId: sharedQuestion.id,
        scoreRate: 0.75,
        studentCount: 2,
      });
      expect(stats.find((item) => item.questionId === "question-done")).toEqual({
        questionId: "question-done",
        scoreRate: null,
        studentCount: 1,
      });
      expect(stats.find((item) => item.questionId === "question-scored")).toEqual({
        questionId: "question-scored",
        scoreRate: 1,
        studentCount: 1,
      });
      expect(stats.some((item) => item.questionId === privateQuestion.id)).toBe(false);
    });
  });
});

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
