import { describe, expect, it } from "vitest";
import type { ExamPaper, Lecture, PersonalClass, Student } from "../../src/types/index.js";
import type { AppState } from "../types.js";
import { runWithState } from "../runtime-db.js";
import { analyticsService } from "./analytics.js";

const now = "2026-08-25T09:00:00.000Z";

function lecture(
  id: string,
  classIds: string[],
  studentIds: string[],
  questionIds: string[],
): Lecture {
  return {
    id,
    teacherId: "teacher-1",
    schoolId: "school-1",
    title: id,
    chapterIds: [],
    knowledgePointIds: [],
    grade: "高一",
    schoolYear: "2026-2027",
    classIds,
    studentIds,
    sections: [
      {
        id: `${id}-chapter`,
        title: "栏目",
        type: "chapter",
        content: "",
        children: questionIds.map((questionId) => ({
          id: `${id}-${questionId}`,
          title: questionId,
          type: "question" as const,
          content: "",
          questionId,
          children: [],
        })),
      },
    ],
    version: 1,
    status: "draft",
    createdAt: now,
    updatedAt: now,
  };
}

function paper(id: string, classIds: string[], studentIds: string[], questionIds: string[]): ExamPaper {
  return {
    id,
    teacherId: "teacher-1",
    schoolId: "school-1",
    title: id,
    chapterIds: [],
    knowledgePointIds: [],
    grade: "高一",
    schoolYear: "2026-2027",
    duration: 90,
    totalScore: 100,
    questions: questionIds.map((questionId, index) => ({
      id: `${id}-${index}`,
      questionId,
      stem: questionId,
      answer: "A",
      analysis: "",
      score: 10,
      type: "single",
    })),
    status: "draft",
    classIds,
    studentIds,
    createdAt: now,
    updatedAt: now,
  };
}

function state(): AppState {
  const schoolStudent: Student = {
    id: "student-school",
    name: "学校班学生",
    studentNo: "001",
    classId: "class-1",
    schoolId: "school-1",
    grade: "高一",
    status: "active",
  };
  const personalStudent: Student = {
    id: "student-personal",
    name: "个人班学生",
    studentNo: "002",
    classId: "class-other",
    schoolId: "school-1",
    grade: "高一",
    status: "active",
  };
  const inactiveStudent: Student = {
    id: "student-inactive",
    name: "非在读学生",
    studentNo: "003",
    classId: "class-1",
    schoolId: "school-1",
    grade: "高一",
    status: "graduated",
  };
  const personalClass: PersonalClass = {
    id: "personal-1",
    type: "personal",
    teacherId: "teacher-1",
    name: "个人班",
    description: "",
    studentIds: [personalStudent.id],
    createdAt: now,
  };

  return {
    teachers: [],
    currentTeacherId: null,
    students: [schoolStudent, personalStudent, inactiveStudent],
    personalClasses: [personalClass],
    lectures: [
      lecture("lecture-school", ["class-1"], [], ["q-school", "q-shared"]),
      lecture("lecture-legacy", [], [personalStudent.id], ["q-legacy"]),
      lecture("lecture-no-audience", [], [], ["q-unassigned"]),
    ],
    examPapers: [
      paper("paper-personal", [personalClass.id], [], ["q-personal", "q-shared"]),
    ],
    answerRecords: [],
  };
}

function asKeys(items: Array<{ studentId: string; questionId: string }>): string[] {
  return items.map((item) => `${item.studentId}:${item.questionId}`).sort();
}

describe("pending question assignments", () => {
  it("derives pending questions from school classes, personal classes, and legacy direct students", async () => {
    const appState = state();

    await runWithState(appState, async () => {
      const assignments = await analyticsService.listPendingQuestionAssignments([
        "student-school",
        "student-personal",
        "student-inactive",
      ]);

      expect(asKeys(assignments)).toEqual([
        "student-personal:q-legacy",
        "student-personal:q-personal",
        "student-personal:q-shared",
        "student-school:q-school",
        "student-school:q-shared",
      ]);
    });
  });

  it("removes the derived pending state when the document audience is cleared", async () => {
    const appState = state();

    await runWithState(appState, async () => {
      const before = await analyticsService.listPendingQuestionAssignments(["student-school"]);
      expect(asKeys(before)).toEqual([
        "student-school:q-school",
        "student-school:q-shared",
      ]);

      (appState.lectures as Lecture[])[0].classIds = [];

      const after = await analyticsService.listPendingQuestionAssignments(["student-school"]);
      expect(after).toEqual([]);
    });
  });
});
