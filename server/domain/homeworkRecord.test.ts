import { describe, expect, it } from "vitest";
import type { AppState } from "../types.js";
import { runWithState } from "../runtime-db.js";
import { analyticsService } from "./analytics.js";
import { homeworkRecordService } from "./homeworkRecord.js";

const teacher = {
  id: "teacher-1",
  email: "teacher@example.com",
  name: "任课教师",
  avatar: "任",
  schoolId: "school-1",
  subject: "数学",
  status: "active",
  role: "teacher",
  roles: ["teacher"],
  subjectGroupIds: [],
  prepGroupIds: [],
  teachingClassIds: ["class-1"],
  homeroomClassIds: [],
  affiliations: [{
    id: "aff-1",
    teacherId: "teacher-1",
    schoolId: "school-1",
    schoolName: "测试学校",
    subject: "数学",
    status: "active",
    role: "teacher",
    roles: ["teacher"],
    subjectGroupIds: [],
    prepGroupIds: [],
    teachingClassIds: ["class-1"],
    homeroomClassIds: [],
    isCurrent: true,
    joinedAt: "2026-01-01T00:00:00.000Z",
  }],
  currentAffiliationId: "aff-1",
  createdAt: "2026-01-01T00:00:00.000Z",
} as any;

function state(): AppState {
  return {
    currentTeacherId: null,
    teachers: [teacher],
    schoolClasses: [{
      id: "class-1",
      type: "school",
      schoolId: "school-1",
      name: "高一（1）班",
      grade: "高一",
      studentCount: 1,
      status: "active",
      createdBy: "admin-1",
      createdAt: "2026-01-01T00:00:00.000Z",
    }, {
      id: "class-2",
      type: "school",
      schoolId: "school-1",
      name: "高一（2）班",
      grade: "高一",
      studentCount: 1,
      status: "active",
      createdBy: "admin-1",
      createdAt: "2026-01-01T00:00:00.000Z",
    }],
    personalClasses: [],
    students: [{
      id: "student-1",
      name: "甲同学",
      studentNo: "001",
      classId: "class-1",
      schoolId: "school-1",
      grade: "高一",
      status: "active",
    }, {
      id: "student-2",
      name: "乙同学",
      studentNo: "002",
      classId: "class-2",
      schoolId: "school-1",
      grade: "高一",
      status: "active",
    }],
    knowledgePoints: [{
      id: "kp-1",
      schoolId: "personal-directory:teacher-1",
      teacherId: "teacher-1",
      parentId: null,
      name: "函数单调性",
      order: 1,
      level: 0,
    }, {
      id: "kp-2",
      schoolId: "personal-directory:teacher-1",
      teacherId: "teacher-1",
      parentId: "kp-1",
      name: "单调区间",
      order: 1,
      level: 1,
    }, {
      id: "kp-other",
      schoolId: "personal-directory:teacher-2",
      teacherId: "teacher-2",
      parentId: null,
      name: "其他教师知识点",
      order: 1,
      level: 0,
    }],
    questions: [],
    answerRecords: [],
    homeworkKnowledgeRecords: [],
    homeworkRecordPreferences: [],
  } as AppState;
}

describe("homeworkRecordService", () => {
  it("persists a teacher's pinned knowledge points and validates directory ownership", async () => {
    const appState = state();
    await runWithState(appState, async () => {
      await expect(homeworkRecordService.listPinnedKnowledgePointIds(teacher)).resolves.toEqual([]);
      await expect(homeworkRecordService.setPinnedKnowledgePointIds(
        ["kp-1", "kp-1", "kp-2"],
        teacher,
      )).resolves.toEqual(["kp-1", "kp-2"]);
      await expect(homeworkRecordService.listPinnedKnowledgePointIds(teacher))
        .resolves.toEqual(["kp-1", "kp-2"]);
      await expect(homeworkRecordService.setPinnedKnowledgePointIds(["kp-other"], teacher))
        .rejects.toThrow("只能选择自己当前知识点目录中的知识点");
    });
  });

  it("creates, updates and clears one status per student and knowledge point", async () => {
    const appState = state();
    await runWithState(appState, async () => {
      const created = await homeworkRecordService.setRecord({
        studentId: "student-1",
        knowledgePointId: "kp-1",
        status: "done",
      }, teacher);
      expect(created).toMatchObject({
        teacherId: "teacher-1",
        studentId: "student-1",
        knowledgePointId: "kp-1",
        status: "done",
      });

      const updated = await homeworkRecordService.setRecord({
        studentId: "student-1",
        knowledgePointId: "kp-1",
        status: "correct",
      }, teacher);
      expect(updated).toMatchObject({ id: created!.id, status: "correct" });
      await expect(homeworkRecordService.listByStudent("student-1", teacher))
        .resolves.toHaveLength(1);

      await expect(homeworkRecordService.setRecord({
        studentId: "student-2",
        knowledgePointId: "kp-1",
        status: "wrong",
      }, teacher)).rejects.toThrow("只能记录自己任教班级或个人教学班的学生");

      await expect(homeworkRecordService.setRecord({
        studentId: "student-1",
        knowledgePointId: "kp-1",
        status: null,
      }, teacher)).resolves.toBeNull();
      await expect(homeworkRecordService.listByStudent("student-1", teacher))
        .resolves.toEqual([]);
    });
  });

  it("feeds scored homework into mastery while keeping done-only records neutral", async () => {
    const appState = state();
    await runWithState(appState, async () => {
      await homeworkRecordService.setRecord({
        studentId: "student-1",
        knowledgePointId: "kp-1",
        status: "done",
      }, teacher);
      await homeworkRecordService.setRecord({
        studentId: "student-1",
        knowledgePointId: "kp-2",
        status: "partial",
      }, teacher);

      const mastery = await analyticsService.getKnowledgeMastery(
        ["student-1"],
        "school-1",
        undefined,
        teacher,
      );
      expect(mastery.find((item) => item.knowledgePointId === "kp-1")).toMatchObject({
        totalAttempts: 0,
        doneCount: 1,
        correctCount: 0,
        partialCount: 0,
        wrongCount: 0,
        correctRate: 0,
        masteryLevel: "untrained",
      });
      expect(mastery.find((item) => item.knowledgePointId === "kp-2")).toMatchObject({
        knowledgePointPath: ["函数单调性", "单调区间"],
        totalAttempts: 1,
        doneCount: 0,
        correctCount: 0,
        partialCount: 1,
        wrongCount: 0,
        correctRate: 0,
        masteryLevel: "weak",
      });
    });
  });
});
