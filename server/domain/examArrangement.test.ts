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
});
