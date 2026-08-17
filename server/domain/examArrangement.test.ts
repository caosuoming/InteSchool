import { describe, expect, it } from "vitest";
import type { AppState } from "../types.js";
import { runWithState } from "../runtime-db.js";
import { examArrangementService } from "./examArrangement.js";

function state(): AppState {
  return {
    teachers: [],
    currentTeacherId: null,
    schoolClasses: [
      {
        id: "class-1",
        type: "school",
        schoolId: "school-1",
        name: "高三（1）班",
        grade: "高三",
        gradeYear: 2023,
        gradYear: 2026,
        studentCount: 2,
        createdBy: "teacher-1",
        createdAt: "2025-09-01T00:00:00.000Z",
      },
    ],
    students: [
      { id: "student-1", name: "甲", studentNo: "001", classId: "class-1", schoolId: "school-1", grade: "高三", status: "active" },
      { id: "student-2", name: "乙", studentNo: "002", classId: "class-1", schoolId: "school-1", grade: "高三", status: "active" },
    ],
    gradeExams: [],
    examArrangements: [],
  };
}

describe("exam arrangement service", () => {
  it("saves, updates, lists, and deletes generated arrangements", async () => {
    const appState = state();
    await runWithState(appState, async () => {
      const input = {
        cohortKey: "grad-2026",
        name: "高考模拟",
        examDate: "2026-05-10",
        mode: "combination" as const,
        subjects: ["物理", "化学"],
        rooms: [{ id: "room-1", name: "第一考场", capacity: 2 }],
        groupRoomIds: { "combined:物理|化学": ["room-1"] },
        classRules: [{
          classId: "class-1",
          defaultSubjects: ["物理", "化学"],
          subjectRoomIds: { 物理: ["room-1"], 化学: ["room-1"] },
        }],
        studentSubjects: [
          { studentId: "student-1", subjects: ["物理", "化学"] },
          { studentId: "student-2", subjects: ["物理"] },
        ],
      };

      const saved = await examArrangementService.saveArrangement("school-1", "teacher-1", input);
      expect(saved.assignments).toHaveLength(2);
      expect(saved.groupRoomIds).toEqual({ "combined:物理|化学": ["room-1"] });
      expect(await examArrangementService.listArrangements("school-1", "grad-2026")).toEqual([saved]);

      const updated = await examArrangementService.saveArrangement("school-1", "teacher-1", {
        ...input,
        id: saved.id,
        name: "高考模拟（二）",
      });
      expect(updated.id).toBe(saved.id);
      expect(updated.name).toBe("高考模拟（二）");
      expect(appState.examArrangements).toHaveLength(1);

      await examArrangementService.deleteArrangement(saved.id);
      expect(appState.examArrangements).toEqual([]);
    });
  });

  it("does not allow one teacher to overwrite another teacher's plan", async () => {
    const appState = state();
    await runWithState(appState, async () => {
      const saved = await examArrangementService.saveArrangement("school-1", "teacher-1", {
        cohortKey: "grad-2026",
        name: "第一次模拟",
        mode: "combination",
        subjects: ["物理"],
        rooms: [{ id: "room-1", name: "第一考场", capacity: 2 }],
        classRules: [{ classId: "class-1", defaultSubjects: ["物理"], subjectRoomIds: { 物理: ["room-1"] } }],
        studentSubjects: [
          { studentId: "student-1", subjects: ["物理"] },
          { studentId: "student-2", subjects: ["物理"] },
        ],
      });
      await expect(examArrangementService.saveArrangement("school-1", "teacher-2", {
        ...saved,
        name: "非法修改",
      })).rejects.toThrow("无权修改");
    });
  });

  it("persists invigilation teachers, subject times, and manual overrides", async () => {
    const appState = state();
    await runWithState(appState, async () => {
      const saved = await examArrangementService.saveArrangement("school-1", "teacher-1", {
        cohortKey: "grad-2026",
        name: "监考测试",
        examDate: "2026-10-20",
        mode: "subject",
        subjects: ["物理"],
        rooms: [{ id: "room-1", name: "第一考场", capacity: 2 }],
        classRules: [{ classId: "class-1", defaultSubjects: ["物理"], subjectRoomIds: { 物理: ["room-1"] } }],
        studentSubjects: [
          { studentId: "student-1", subjects: ["物理"] },
          { studentId: "student-2", subjects: ["物理"] },
        ],
      });
      const updated = await examArrangementService.saveInvigilationConfig("school-1", saved.id, {
        teachers: [
          { id: "teacher-physics", name: "张老师", subject: "物理" },
          { id: "teacher-prep", name: "李老师", subject: "物理", isPrepLeader: true },
        ],
        subjectTimes: [{
          subject: "物理",
          date: "2026-10-20",
          period: "morning",
          time: "08:00",
          durationMinutes: 90,
        }],
        overrides: {
          "2026-10-20|morning|08:00|物理": {
            roomTeacherIds: { "room-1": "teacher-physics" },
            outsideTeacherId: "teacher-prep",
          },
        },
        teacherNotes: {
          "teacher-physics": "巡回另计 30 分钟",
          missing: "不应保存",
        },
      });

      expect(updated.invigilation?.teachers).toHaveLength(2);
      expect(updated.invigilation?.subjectTimes[0].durationMinutes).toBe(90);
      expect((appState.examArrangements as any[])[0].invigilation.overrides).toEqual({
        "2026-10-20|morning|08:00|物理": {
          roomTeacherIds: { "room-1": "teacher-physics" },
          outsideTeacherId: "teacher-prep",
        },
      });
      expect((appState.examArrangements as any[])[0].invigilation.teacherNotes).toEqual({
        "teacher-physics": "巡回另计 30 分钟",
      });
      expect((await examArrangementService.listArrangements("school-1", "grad-2026"))[0].invigilation).toEqual(updated.invigilation);
    });
  });

  it("exposes grade ranks from the latest exam in the same cohort", async () => {
    const appState = state();
    appState.gradeExams = [
      {
        id: "exam-old",
        schoolId: "school-1",
        teacherId: "teacher-1",
        cohortKey: "grad-2026",
        cohortLabel: "2026届高三",
        name: "期中考试",
        examDate: "2026-03-01",
        sourceFileName: "old.xlsx",
        sourceSheetName: "成绩",
        subjects: ["物理"],
        records: [
          {
            id: "record-old-1",
            studentId: "student-1",
            studentName: "甲",
            studentNo: "001",
            classId: "class-1",
            className: "高三（1）班",
            scores: { 物理: 90 },
            assignedScores: { 物理: 90 },
            rawTotal: 90,
            assignedTotal: 90,
            gradeRank: 2,
            classRank: 2,
          },
          {
            id: "record-old-2",
            studentId: "student-2",
            studentName: "乙",
            studentNo: "002",
            classId: "class-1",
            className: "高三（1）班",
            scores: { 物理: 95 },
            assignedScores: { 物理: 95 },
            rawTotal: 95,
            assignedTotal: 95,
            gradeRank: 1,
            classRank: 1,
          },
        ],
        settings: { subjectTeacherIds: {}, assignmentRules: {}, classSubjects: [], templates: [] },
        createdAt: "2026-03-01T00:00:00.000Z",
        updatedAt: "2026-03-01T00:00:00.000Z",
      },
      {
        id: "exam-latest",
        schoolId: "school-1",
        teacherId: "teacher-1",
        cohortKey: "grad-2026",
        cohortLabel: "2026届高三",
        name: "第一次模拟",
        examDate: "2026-05-01",
        sourceFileName: "latest.xlsx",
        sourceSheetName: "成绩",
        subjects: ["物理"],
        records: [
          {
            id: "record-latest-1",
            studentId: "student-1",
            studentName: "甲",
            studentNo: "001",
            classId: "class-1",
            className: "高三（1）班",
            scores: { 物理: 98 },
            assignedScores: { 物理: 98 },
            rawTotal: 98,
            assignedTotal: 98,
            gradeRank: 1,
            classRank: 1,
          },
          {
            id: "record-latest-2",
            studentId: "student-2",
            studentName: "乙",
            studentNo: "002",
            classId: "class-1",
            className: "高三（1）班",
            scores: { 物理: 88 },
            assignedScores: { 物理: 88 },
            rawTotal: 88,
            assignedTotal: 88,
            gradeRank: 2,
            classRank: 2,
          },
        ],
        settings: { subjectTeacherIds: {}, assignmentRules: {}, classSubjects: [], templates: [] },
        createdAt: "2026-05-01T00:00:00.000Z",
        updatedAt: "2026-05-01T00:00:00.000Z",
      },
    ];

    await runWithState(appState, async () => {
      const context = await examArrangementService.getContext("school-1", "grad-2026");
      expect(context.previousGradeRanks).toEqual({ "student-1": 1, "student-2": 2 });
    });
  });
});
