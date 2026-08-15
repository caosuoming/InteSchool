// @vitest-environment node

import { mkdtemp, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildApp, type BuiltApp } from "../app.js";
import type { TeacherRecord } from "../types.js";

let built: BuiltApp;
let workDir: string;

function cookie(response: { headers: Record<string, unknown> }): string {
  const header = response.headers["set-cookie"];
  const value = Array.isArray(header) ? header[0] : String(header || "");
  return value.split(";")[0];
}

beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), "inteschool-parent-"));
  built = await buildApp({
    databasePath: join(workDir, "inteschool.sqlite"),
    uploadsDir: join(workDir, "uploads"),
    seedStatePath: resolve("server/seed-state.json"),
    serveStatic: false,
    logger: false,
    enableDemoAccount: true,
    demoPassword: "demo123456",
    cookieSecure: false,
  });
});

afterEach(async () => {
  await built.app.close();
  await rm(workDir, { recursive: true, force: true });
});

function seedParentScenario(phone: string): void {
  const before = built.store.loadState();
  const after = structuredClone(before);

  const school1 = (after.schools as Array<Record<string, unknown>>)[0];
  const school2 = (after.schools as Array<Record<string, unknown>>)[1] || school1;
  const school1Id = String(school1.id);
  const school2Id = String(school2.id);
  school1.name = "第一中学";
  school2.name = "第二中学";

  after.schoolClasses = [
    ...(after.schoolClasses as Array<Record<string, unknown>>),
    { id: "parent-class-1", schoolId: school1Id, name: "高二(1)班", grade: "高二", status: "active", type: "school" },
    { id: "parent-class-2", schoolId: school2Id, name: "高一(3)班", grade: "高一", status: "active", type: "school" },
  ];
  after.students = [
    ...(after.students as Array<Record<string, unknown>>),
    { id: "parent-child-1", name: "孩子甲", studentNo: "S001", classId: "parent-class-1", schoolId: school1Id, grade: "高二", status: "active" },
    { id: "parent-peer-1", name: "同年级同学", studentNo: "S002", classId: "parent-class-1", schoolId: school1Id, grade: "高二", status: "active" },
    { id: "parent-child-2", name: "孩子乙", studentNo: "S101", classId: "parent-class-2", schoolId: school2Id, grade: "高一", status: "active" },
    { id: "parent-outsider", name: "未授权学生", studentNo: "S999", classId: "parent-class-1", schoolId: school1Id, grade: "高二", status: "active" },
  ];
  after.parentAuthorizations = [
    { id: "parent-auth-1", phone, guardianName: "家长", studentId: "parent-child-1", schoolId: school1Id, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    { id: "parent-auth-2", phone, guardianName: "家长", studentId: "parent-child-2", schoolId: school2Id, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  ];
  after.gradeExams = [
    ...(after.gradeExams as Array<Record<string, unknown>>),
    {
      id: "parent-exam-published",
      schoolId: school1Id,
      teacherId: "tch-1",
      cohortKey: "2027",
      cohortLabel: "2027届高二",
      name: "期中考试",
      examDate: "2026-05-10",
      sourceFileName: "scores.xlsx",
      sourceSheetName: "Sheet1",
      subjects: ["语文", "数学"],
      records: [{
        id: "grade-record-1",
        studentId: "parent-child-1",
        studentName: "孩子甲",
        studentNo: "S001",
        classId: "parent-class-1",
        className: "高二(1)班",
        scores: { 语文: 92, 数学: 96 },
        assignedScores: { 语文: 92, 数学: 96 },
        rawTotal: 188,
        assignedTotal: 188,
        gradeRank: 3,
        classRank: 1,
      }],
      publication: {
        shareToken: "parent-share-published",
        publishedAt: "2026-05-11T00:00:00.000Z",
        publishedByTeacherId: "tch-1",
        publishedByName: "教师",
        publishToParents: true,
      },
      settings: { subjectTeacherIds: {}, assignmentRules: {}, classSubjects: [], templates: [] },
      createdAt: "2026-05-10T00:00:00.000Z",
      updatedAt: "2026-05-11T00:00:00.000Z",
    },
    {
      id: "parent-exam-private",
      schoolId: school1Id,
      teacherId: "tch-1",
      cohortKey: "2027",
      cohortLabel: "2027届高二",
      name: "未同步考试",
      subjects: ["数学"],
      records: [{
        id: "grade-record-2",
        studentId: "parent-child-1",
        studentName: "孩子甲",
        studentNo: "S001",
        classId: "parent-class-1",
        className: "高二(1)班",
        scores: { 数学: 100 },
        assignedScores: { 数学: 100 },
        rawTotal: 100,
        assignedTotal: 100,
        gradeRank: 1,
        classRank: 1,
      }],
      publication: {
        shareToken: "parent-share-private",
        publishedAt: "2026-06-11T00:00:00.000Z",
        publishedByTeacherId: "tch-1",
        publishedByName: "教师",
        publishToParents: false,
      },
      settings: { subjectTeacherIds: {}, assignmentRules: {}, classSubjects: [], templates: [] },
      sourceFileName: "scores.xlsx",
      sourceSheetName: "Sheet1",
      createdAt: "2026-06-10T00:00:00.000Z",
      updatedAt: "2026-06-11T00:00:00.000Z",
    },
  ];
  after.schoolChapters = [
    ...(after.schoolChapters as Array<Record<string, unknown>>),
    { id: "chapter-parent", schoolId: school1Id, name: "函数" },
  ];
  after.schoolKnowledgePoints = [
    ...(after.schoolKnowledgePoints as Array<Record<string, unknown>>),
    { id: "kp-parent", schoolId: school1Id, name: "函数单调性" },
  ];
  after.questions = [
    ...(after.questions as Array<Record<string, unknown>>),
    { id: "question-parent", schoolId: school1Id, chapterIds: ["chapter-parent"], knowledgePointIds: ["kp-parent"] },
  ];
  after.answerRecords = [
    ...(after.answerRecords as Array<Record<string, unknown>>),
    { id: "answer-child", studentId: "parent-child-1", questionId: "question-parent", lectureId: "lecture-x", score: "correct", isCorrect: true, answeredAt: "2026-08-01T00:00:00.000Z" },
    { id: "answer-peer", studentId: "parent-peer-1", questionId: "question-parent", lectureId: "lecture-x", score: "wrong", isCorrect: false, answeredAt: "2026-08-01T00:00:00.000Z" },
  ];
  built.store.saveState(before, after);
}

describe("parent accounts", () => {
  it("supports a phone with both teacher and parent identities, cross-school children, published grades and scoped learning data", async () => {
    const phone = "13800138888";
    seedParentScenario(phone);

    const baseTeacher = built.store.getTeacherById("tch-1") || built.store.loadState().teachers[0];
    const teacher: TeacherRecord = {
      ...baseTeacher,
      id: "teacher-dual-role",
      email: "dual-role@example.com",
      name: "双身份教师",
      schoolId: baseTeacher.schoolId,
      createdAt: new Date().toISOString(),
    };
    built.store.insertTeacher(teacher);
    built.store.createUser(teacher.id, teacher.email, "TeacherPass123", phone);

    const context = await built.app.inject({ method: "GET", url: `/api/parent/registration-context?phone=${phone}` });
    expect(context.statusCode).toBe(200);
    expect(context.json().children).toHaveLength(2);

    const registered = await built.app.inject({
      method: "POST",
      url: "/api/parent/register",
      payload: { name: "家长", phone, password: "ParentPass123" },
    });
    expect(registered.statusCode).toBe(200);
    const parentCookie = cookie(registered);

    const identities = await built.app.inject({ method: "GET", url: `/api/auth/identity-context?phone=${phone}` });
    expect(identities.statusCode).toBe(200);
    expect(identities.json()).toMatchObject({ teacher: true, parent: true });

    const children = await built.app.inject({ method: "GET", url: "/api/parent/children", headers: { cookie: parentCookie } });
    expect(children.statusCode).toBe(200);
    expect(children.json()).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "parent-child-1", schoolName: "第一中学" }),
      expect.objectContaining({ id: "parent-child-2", schoolName: "第二中学" }),
    ]));

    const grades = await built.app.inject({ method: "GET", url: "/api/parent/children/parent-child-1/grades", headers: { cookie: parentCookie } });
    expect(grades.statusCode).toBe(200);
    expect(grades.json()).toEqual([
      expect.objectContaining({
        examId: "parent-exam-published",
        result: expect.objectContaining({ assignedTotal: 188, classRank: 1, gradeRank: 3 }),
      }),
    ]);

    const learning = await built.app.inject({ method: "GET", url: "/api/parent/children/parent-child-1/learning", headers: { cookie: parentCookie } });
    expect(learning.statusCode).toBe(200);
    expect(learning.json().chapter).toEqual([
      expect.objectContaining({ id: "chapter-parent", name: "函数", correctRate: 1, gradeCorrectRate: 0.5, gap: 0.5 }),
    ]);
    expect(learning.json().knowledge).toEqual([
      expect.objectContaining({ id: "kp-parent", name: "函数单调性", correctRate: 1, gradeCorrectRate: 0.5 }),
    ]);

    const forbidden = await built.app.inject({ method: "GET", url: "/api/parent/children/parent-outsider/grades", headers: { cookie: parentCookie } });
    expect(forbidden.statusCode).toBe(403);
  });

  it("rejects registration for a phone absent from the parent authorization directory", async () => {
    const response = await built.app.inject({
      method: "POST",
      url: "/api/parent/register",
      payload: { name: "未授权家长", phone: "13800137777", password: "ParentPass123" },
    });
    expect(response.statusCode).toBe(403);
  });
});
