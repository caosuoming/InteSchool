import { describe, expect, it } from "vitest";
import type { AppState } from "../types.js";
import { runWithState } from "../runtime-db.js";
import { classService } from "./class.js";

function createState(): AppState {
  return {
    teachers: [],
    currentTeacherId: null,
    schoolClasses: [
      {
        id: "class-1",
        type: "school",
        schoolId: "school-1",
        name: "高三(1)班",
        grade: "高三",
        studentCount: 2,
        status: "active",
        createdBy: "teacher-1",
        createdAt: "2025-09-01T00:00:00.000Z",
      },
      {
        id: "class-2",
        type: "school",
        schoolId: "school-1",
        name: "高三(2)班",
        grade: "高三",
        studentCount: 1,
        status: "active",
        createdBy: "teacher-1",
        createdAt: "2025-09-01T00:00:00.000Z",
      },
      {
        id: "class-graduated",
        type: "school",
        schoolId: "school-1",
        name: "往届班级",
        grade: "高三",
        studentCount: 0,
        status: "graduated",
        graduatedAt: "2025-06-30T00:00:00.000Z",
        createdBy: "teacher-1",
        createdAt: "2024-09-01T00:00:00.000Z",
      },
    ],
    personalClasses: [],
    students: [
      {
        id: "student-early",
        name: "提前毕业学生",
        studentNo: "001",
        classId: "class-1",
        schoolId: "school-1",
        grade: "高三",
        status: "active",
      },
      {
        id: "student-transfer",
        name: "转校学生",
        studentNo: "002",
        classId: "class-1",
        schoolId: "school-1",
        grade: "高三",
        status: "active",
      },
      {
        id: "student-suspended",
        name: "休学学生",
        studentNo: "003",
        classId: "class-1",
        schoolId: "school-1",
        grade: "高三",
        status: "suspended",
        suspendedAt: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "student-regular",
        name: "正常毕业学生",
        studentNo: "004",
        classId: "class-2",
        schoolId: "school-1",
        grade: "高三",
        status: "active",
      },
    ],
  };
}

function getClass(state: AppState, classId: string) {
  return (state.schoolClasses as Array<Record<string, unknown>>).find((item) => item.id === classId);
}

function getStudent(state: AppState, studentId: string) {
  return (state.students as Array<Record<string, unknown>>).find((item) => item.id === studentId);
}

describe("class lifecycle service", () => {
  it("archives early graduates and transferred students while preserving their records", async () => {
    const state = createState();

    await runWithState(state, async () => {
      const earlyGraduate = await classService.graduateStudent("student-early");
      const transferred = await classService.transferOutStudent("student-transfer");
      const departed = await classService.listDepartedStudents("school-1");

      expect(earlyGraduate).toMatchObject({
        status: "graduated",
        graduationType: "early",
        graduatedAt: expect.any(String),
      });
      expect(transferred).toMatchObject({
        status: "transferred",
        transferredAt: expect.any(String),
      });
      expect(departed.map((student) => student.id)).toEqual([
        "student-early",
        "student-transfer",
      ]);
      expect(getClass(state, "class-1")).toMatchObject({ studentCount: 0 });
      expect(getStudent(state, "student-early")).toMatchObject({
        classId: "class-1",
        studentNo: "001",
      });
    });
  });

  it("graduates every active student in a class and leaves suspended students untouched", async () => {
    const state = createState();

    await runWithState(state, async () => {
      const result = await classService.graduateClass("class-1");

      expect(result.graduatedCount).toBe(2);
      expect(result.class).toMatchObject({
        status: "graduated",
        studentCount: 0,
        graduatedAt: expect.any(String),
      });
      expect(getStudent(state, "student-early")).toMatchObject({
        status: "graduated",
        graduationType: "regular",
      });
      expect(getStudent(state, "student-transfer")).toMatchObject({
        status: "graduated",
        graduationType: "regular",
      });
      expect(getStudent(state, "student-suspended")).toMatchObject({
        status: "suspended",
      });
      expect(await classService.listStudentsByClass("class-1")).toEqual([]);
    });
  });

  it("does not allow students to enter or resume into a graduated class", async () => {
    const state = createState();

    await runWithState(state, async () => {
      await expect(classService.addStudent("class-graduated", "school-1", {
        name: "新学生",
        studentNo: "005",
        grade: "高三",
      })).rejects.toThrow("已毕业班级不能新增学生");

      await expect(classService.transferStudent(
        "student-regular",
        "class-graduated",
      )).rejects.toThrow("不能转入已毕业班级");

      await expect(classService.resumeStudent(
        "student-suspended",
        "class-graduated",
      )).rejects.toThrow("不能恢复到已毕业班级");
    });
  });
});
