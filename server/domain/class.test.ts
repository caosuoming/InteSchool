import { describe, expect, it } from "vitest";
import type { AppState } from "../types.js";
import { runWithState } from "../runtime-db.js";
import { classService } from "./class.js";

function createState(): AppState {
  return {
    teachers: [],
    currentTeacherId: null,
    schoolGrades: [
      {
        id: "grade-2026",
        schoolId: "school-1",
        name: "2026届高三",
        grade: "高三",
        gradYear: 2026,
        status: "active",
        createdBy: "teacher-1",
        createdAt: "2025-09-01T00:00:00.000Z",
        updatedAt: "2025-09-01T00:00:00.000Z",
      },
      {
        id: "grade-2027",
        schoolId: "school-1",
        name: "2027届高二",
        grade: "高二",
        gradYear: 2027,
        status: "active",
        createdBy: "teacher-1",
        createdAt: "2025-09-01T00:00:00.000Z",
        updatedAt: "2025-09-01T00:00:00.000Z",
      },
    ],
    schoolClasses: [
      {
        id: "class-1",
        type: "school",
        schoolId: "school-1",
        gradeId: "grade-2026",
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
        gradeId: "grade-2026",
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
        gradeId: "grade-2026",
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

  it("restores both suspended and transferred students to active enrollment", async () => {
    const state = createState();

    await runWithState(state, async () => {
      await classService.transferOutStudent("student-transfer");

      const resumed = await classService.resumeStudent("student-suspended", "class-1");
      const transferRestored = await classService.resumeStudent("student-transfer", "class-1");

      expect(resumed).toMatchObject({
        id: "student-suspended",
        status: "active",
        archiveStatus: "attending",
        classId: "class-1",
      });
      expect(transferRestored).toMatchObject({
        id: "student-transfer",
        status: "active",
        archiveStatus: "attending",
        classId: "class-1",
      });
      expect(getClass(state, "class-1")).toMatchObject({ studentCount: 3 });
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

  it("adds one student to a school class and rejects duplicate student numbers", async () => {
    const state = createState();

    await runWithState(state, async () => {
      const created = await classService.addStudent("class-2", "school-1", {
        name: " 新学生 ",
        studentNo: " 005 ",
        gender: "female",
        subjectSelection: " 物化地 ",
      });

      expect(created).toMatchObject({
        name: "新学生",
        studentNo: "005",
        classId: "class-2",
        schoolId: "school-1",
        grade: "高三",
        gender: "female",
        subjectSelection: "物化地",
        status: "active",
      });
      expect((state.schoolClasses as Array<{ id: string; studentCount: number }>).find((item) => item.id === "class-2")?.studentCount).toBe(2);

      await expect(classService.addStudent("class-1", "school-1", {
        name: "重复学号",
        studentNo: "005",
      })).rejects.toThrow("学号 005 已被“新学生”使用");
    });
  });

  it("imports a roster, creates missing classes, and skips duplicate student numbers", async () => {
    const state = createState();

    await runWithState(state, async () => {
      const result = await classService.bulkImportStudents("grade-2027", "teacher-1", [
        { className: "高二(3)班", name: "新学生甲", studentNo: "101", isExternal: false },
        { className: "高二(3)班", name: "重复学号", studentNo: "101", isExternal: true },
        { className: "高二(4)班", name: "新学生乙", studentNo: "102", isExternal: true },
      ]);

      expect(result).toEqual({
        createdClasses: 2,
        createdStudents: 2,
        updatedStudents: 0,
        deletedStudents: 0,
        skippedStudents: 1,
      });
      const classes = state.schoolClasses as Array<Record<string, unknown>>;
      expect(classes.filter((item) => item.gradeId === "grade-2027")).toEqual(expect.arrayContaining([
        expect.objectContaining({ name: "高二(3)班", studentCount: 1 }),
        expect.objectContaining({ name: "高二(4)班", studentCount: 1 }),
      ]));
      expect(state.students).toEqual(expect.arrayContaining([
        expect.objectContaining({ name: "新学生甲", studentNo: "101", grade: "高二" }),
        expect.objectContaining({ name: "新学生乙", studentNo: "102", isExternal: true }),
      ]));
    });
  });

  it("imports numeric classes and students without numbers, including subject selections", async () => {
    const state = createState();

    await runWithState(state, async () => {
      const result = await classService.bulkImportStudents("grade-2027", "teacher-1", [
        { className: "1", name: "无学号学生甲", subjectSelection: "物化生" },
        { className: "1", name: "无学号学生乙", subjectSelection: "史政地" },
      ]);

      expect(result).toEqual({
        createdClasses: 1,
        createdStudents: 2,
        updatedStudents: 0,
        deletedStudents: 0,
        skippedStudents: 0,
      });
      expect(state.schoolClasses).toEqual(expect.arrayContaining([
        expect.objectContaining({ name: "1班", studentCount: 2 }),
      ]));
      expect(state.students).toEqual(expect.arrayContaining([
        expect.objectContaining({ name: "无学号学生甲", studentNo: "", subjectSelection: "物化生" }),
        expect.objectContaining({ name: "无学号学生乙", studentNo: "", subjectSelection: "史政地" }),
      ]));
    });
  });

  it("reconciles a repeated grade roster by name and keeps unmatched old students when requested", async () => {
    const state = createState();
    (state.schoolClasses as Array<Record<string, unknown>>).push(
      {
        id: "class-2027-a",
        type: "school",
        schoolId: "school-1",
        gradeId: "grade-2027",
        name: "高二(1)班",
        grade: "高二",
        studentCount: 2,
        status: "active",
        createdBy: "teacher-1",
        createdAt: "2025-09-01T00:00:00.000Z",
      },
      {
        id: "class-2027-b",
        type: "school",
        schoolId: "school-1",
        gradeId: "grade-2027",
        name: "高二(2)班",
        grade: "高二",
        studentCount: 0,
        status: "active",
        createdBy: "teacher-1",
        createdAt: "2025-09-01T00:00:00.000Z",
      },
    );
    (state.students as Array<Record<string, unknown>>).push(
      {
        id: "student-match",
        name: "张三",
        studentNo: "OLD-001",
        classId: "class-2027-a",
        schoolId: "school-1",
        grade: "高二",
        status: "active",
      },
      {
        id: "student-missing",
        name: "旧名单学生",
        studentNo: "OLD-002",
        classId: "class-2027-a",
        schoolId: "school-1",
        grade: "高二",
        status: "active",
      },
    );

    await runWithState(state, async () => {
      const result = await classService.bulkImportStudents("grade-2027", "teacher-1", [
        { className: "高二(2)班", name: "张三", studentNo: "NEW-001", subjectSelection: "物化地" },
        { className: "高二(2)班", name: "新增学生", studentNo: "NEW-002" },
      ], { missingStudents: "keep", matchStudentIds: { "0": "student-match" } });

      expect(result).toEqual({
        createdClasses: 0,
        createdStudents: 1,
        updatedStudents: 1,
        deletedStudents: 0,
        skippedStudents: 0,
      });
      expect(getStudent(state, "student-match")).toMatchObject({
        id: "student-match",
        name: "张三",
        studentNo: "NEW-001",
        classId: "class-2027-b",
        subjectSelection: "物化地",
        status: "active",
        classHistory: [expect.objectContaining({
          fromClassId: "class-2027-a",
          toClassId: "class-2027-b",
          studentNoChanged: true,
        })],
      });
      expect(getStudent(state, "student-missing")).toMatchObject({ status: "active" });
      expect(getClass(state, "class-2027-a")).toMatchObject({ studentCount: 1 });
      expect(getClass(state, "class-2027-b")).toMatchObject({ studentCount: 2 });
    });
  });

  it("requires explicit resolution for same-name class changes and permits creating a distinct student", async () => {
    const state = createState();
    (state.schoolClasses as Array<Record<string, unknown>>).push(
      {
        id: "class-2027-same-a",
        type: "school",
        schoolId: "school-1",
        gradeId: "grade-2027",
        name: "高二(1)班",
        grade: "高二",
        studentCount: 1,
        status: "active",
        createdBy: "teacher-1",
        createdAt: "2025-09-01T00:00:00.000Z",
      },
      {
        id: "class-2027-same-b",
        type: "school",
        schoolId: "school-1",
        gradeId: "grade-2027",
        name: "高二(2)班",
        grade: "高二",
        studentCount: 0,
        status: "active",
        createdBy: "teacher-1",
        createdAt: "2025-09-01T00:00:00.000Z",
      },
    );
    (state.students as Array<Record<string, unknown>>).push({
      id: "student-same-name",
      name: "张三",
      studentNo: "",
      classId: "class-2027-same-a",
      schoolId: "school-1",
      grade: "高二",
      status: "active",
    });

    await runWithState(state, async () => {
      await expect(classService.bulkImportStudents("grade-2027", "teacher-1", [
        { className: "高二(2)班", name: "张三" },
      ])).rejects.toThrow("同名学生或班级变化");

      const result = await classService.bulkImportStudents("grade-2027", "teacher-1", [
        { className: "高二(2)班", name: "张三" },
      ], { matchStudentIds: { "0": null }, missingStudents: "keep" });
      expect(result).toMatchObject({ createdStudents: 1, updatedStudents: 0 });
      expect((state.students as Array<Record<string, unknown>>).filter((item) => item.name === "张三" && item.status === "active")).toHaveLength(2);
    });
  });

  it("maps a renamed student explicitly and generates parent authorizations from imported contacts", async () => {
    const state = createState();
    (state.schoolClasses as Array<Record<string, unknown>>).push({
      id: "class-2027-parent",
      type: "school",
      schoolId: "school-1",
      gradeId: "grade-2027",
      name: "高二(1)班",
      grade: "高二",
      studentCount: 1,
      status: "active",
      createdBy: "teacher-1",
      createdAt: "2025-09-01T00:00:00.000Z",
    });
    (state.students as Array<Record<string, unknown>>).push({
      id: "student-renamed",
      name: "旧姓名",
      studentNo: "301",
      classId: "class-2027-parent",
      schoolId: "school-1",
      grade: "高二",
      status: "active",
    });

    await runWithState(state, async () => {
      const result = await classService.bulkImportStudents("grade-2027", "teacher-1", [{
        className: "高二(1)班",
        name: "新姓名",
        studentNo: "302",
        guardian1Name: "家长甲",
        guardian1Phone: "13800138000",
        guardian2Name: "家长乙",
        guardian2Phone: "13900139000",
      }], { matchStudentIds: { "0": "student-renamed" }, missingStudents: "keep" });

      expect(result).toMatchObject({ createdStudents: 0, updatedStudents: 1 });
      expect(getStudent(state, "student-renamed")).toMatchObject({
        name: "新姓名",
        studentNo: "302",
        contacts: {
          guardian1Name: "家长甲",
          guardian1Phone: "13800138000",
          guardian2Name: "家长乙",
          guardian2Phone: "13900139000",
        },
      });
      expect(state.parentAuthorizations).toEqual(expect.arrayContaining([
        expect.objectContaining({ studentId: "student-renamed", phone: "13800138000", guardianName: "家长甲" }),
        expect.objectContaining({ studentId: "student-renamed", phone: "13900139000", guardianName: "家长乙" }),
      ]));
    });
  });

  it("moves old roster students unmatched by name to the recycle bin when requested", async () => {
    const state = createState();
    (state.schoolClasses as Array<Record<string, unknown>>).push({
      id: "class-2027",
      type: "school",
      schoolId: "school-1",
      gradeId: "grade-2027",
      name: "高二(1)班",
      grade: "高二",
      studentCount: 2,
      status: "active",
      createdBy: "teacher-1",
      createdAt: "2025-09-01T00:00:00.000Z",
    });
    (state.students as Array<Record<string, unknown>>).push(
      {
        id: "student-keep",
        name: "保留学生",
        studentNo: "201",
        classId: "class-2027",
        schoolId: "school-1",
        grade: "高二",
        status: "active",
      },
      {
        id: "student-remove",
        name: "名单外学生",
        studentNo: "202",
        classId: "class-2027",
        schoolId: "school-1",
        grade: "高二",
        status: "active",
      },
    );

    await runWithState(state, async () => {
      const result = await classService.bulkImportStudents("grade-2027", "teacher-1", [
        { className: "高二(1)班", name: "保留学生", studentNo: "201" },
      ], { missingStudents: "delete" });

      expect(result).toMatchObject({ updatedStudents: 1, deletedStudents: 1 });
      expect(getStudent(state, "student-remove")).toMatchObject({
        status: "deleted",
        deletedFromStatus: "active",
        deletedAt: expect.any(String),
      });
      expect(getClass(state, "class-2027")).toMatchObject({ studentCount: 1 });
      const recycleBin = await classService.listSchoolRosterRecycleBin("school-1");
      expect(recycleBin.students.map((item) => item.id)).toContain("student-remove");
    });
  });

  it("advances a whole grade and synchronizes its classes and students", async () => {
    const state = createState();
    (state.schoolClasses as Array<Record<string, unknown>>).push({
      id: "class-2027",
      type: "school",
      schoolId: "school-1",
      gradeId: "grade-2027",
      name: "高二(1)班",
      grade: "高二",
      gradYear: 2027,
      studentCount: 1,
      status: "active",
      createdBy: "teacher-1",
      createdAt: "2025-09-01T00:00:00.000Z",
    });
    (state.students as Array<Record<string, unknown>>).push({
      id: "student-2027",
      name: "待升学学生",
      studentNo: "201",
      classId: "class-2027",
      schoolId: "school-1",
      grade: "高二",
      status: "active",
    });

    await runWithState(state, async () => {
      const result = await classService.advanceSchoolGrade("grade-2027");

      expect(result).toMatchObject({ updatedClasses: 1, updatedStudents: 1 });
      expect(result.grade).toMatchObject({ name: "2027届高三", grade: "高三" });
      expect(getClass(state, "class-2027")).toMatchObject({ name: "高三(1)班", grade: "高三" });
      expect(getStudent(state, "student-2027")).toMatchObject({ grade: "高三" });
    });
  });

  it("decreases a whole grade while preserving a customized grade name", async () => {
    const state = createState();
    (state.schoolClasses as Array<Record<string, unknown>>).push({
      id: "class-2027",
      type: "school",
      schoolId: "school-1",
      gradeId: "grade-2027",
      name: "高二(1)班",
      grade: "高二",
      gradYear: 2027,
      studentCount: 1,
      status: "active",
      createdBy: "teacher-1",
      createdAt: "2025-09-01T00:00:00.000Z",
    });
    (state.students as Array<Record<string, unknown>>).push({
      id: "student-2027",
      name: "待调整学生",
      studentNo: "201",
      classId: "class-2027",
      schoolId: "school-1",
      grade: "高二",
      status: "active",
    });

    await runWithState(state, async () => {
      const renamed = await classService.updateSchoolGrade("grade-2027", { name: "创新年级" });
      const result = await classService.decreaseSchoolGrade("grade-2027");

      expect(renamed.name).toBe("创新年级");
      expect(result).toMatchObject({ updatedClasses: 1, updatedStudents: 1 });
      expect(result.grade).toMatchObject({ name: "创新年级", grade: "高一" });
      expect(getClass(state, "class-2027")).toMatchObject({ name: "高一(1)班", grade: "高一" });
      expect(getStudent(state, "student-2027")).toMatchObject({ grade: "高一" });
      await expect(classService.decreaseSchoolGrade("grade-2027")).rejects.toThrow("高一年级不能继续降学年");
    });
  });

  it("graduates a whole grade and archives its active classes and students", async () => {
    const state = createState();

    await runWithState(state, async () => {
      const result = await classService.graduateSchoolGrade("grade-2026");

      expect(result).toMatchObject({ updatedClasses: 2, graduatedStudents: 3 });
      expect(result.grade).toMatchObject({ status: "graduated" });
      expect(getClass(state, "class-1")).toMatchObject({ status: "graduated", studentCount: 0 });
      expect(getClass(state, "class-2")).toMatchObject({ status: "graduated", studentCount: 0 });
      expect(getStudent(state, "student-early")).toMatchObject({ status: "graduated", graduationType: "regular" });
      expect(getStudent(state, "student-transfer")).toMatchObject({ status: "graduated", graduationType: "regular" });
      expect(getStudent(state, "student-regular")).toMatchObject({ status: "graduated", graduationType: "regular" });
      expect(getStudent(state, "student-suspended")).toMatchObject({ status: "suspended" });
      await expect(classService.advanceSchoolGrade("grade-2026")).rejects.toThrow("已毕业年级不能调整学年");
    });
  });

  it("moves a school class and its students into the recycle bin and restores both", async () => {
    const state = createState();

    await runWithState(state, async () => {
      await classService.deleteClass("class-1", false);
      const recycleBin = await classService.listSchoolRosterRecycleBin("school-1");

      expect(recycleBin.classes.map((item) => item.id)).toContain("class-1");
      expect(recycleBin.students.map((item) => item.id)).toEqual(expect.arrayContaining([
        "student-early",
        "student-transfer",
        "student-suspended",
      ]));
      expect(await classService.listSchoolClasses("school-1")).not.toEqual(expect.arrayContaining([
        expect.objectContaining({ id: "class-1" }),
      ]));

      const restored = await classService.restoreSchoolClass("class-1");
      expect(restored).toMatchObject({ restoredStudents: 3 });
      expect(restored.class).toMatchObject({ status: "active", studentCount: 2 });
      expect(getStudent(state, "student-suspended")).toMatchObject({ status: "suspended" });
    });
  });

  it("lists only assigned school classes plus the teacher's personal classes", async () => {
    const state = createState();
    state.teachers = [{
      id: "teacher-1",
      schoolId: "school-1",
      teachingClassIds: ["class-1"],
      affiliations: [{
        id: "aff-1",
        teacherId: "teacher-1",
        schoolId: "school-1",
        teachingClassIds: ["class-1"],
        homeroomClassIds: [],
        isCurrent: true,
      }],
      currentAffiliationId: "aff-1",
    } as any];
    state.personalClasses = [{
      id: "personal-1",
      type: "personal",
      teacherId: "teacher-1",
      name: "竞赛辅导班",
      description: "个人教学班",
      studentIds: ["student-personal"],
      createdAt: "2025-09-01T00:00:00.000Z",
    }];
    (state.students as Array<Record<string, unknown>>).push({
      id: "student-personal",
      name: "个人班学生",
      studentNo: "P001",
      classId: "personal-1",
      schoolId: "school-1",
      grade: "高三",
      status: "active",
    });

    await runWithState(state, async () => {
      const classes = await classService.listMyClasses("school-1", "teacher-1");
      const students = await classService.listMyStudents("school-1", "teacher-1");

      expect(classes.map((item) => item.id)).toEqual(["class-1", "personal-1"]);
      expect(students.map((item) => item.id)).toEqual(expect.arrayContaining([
        "student-early",
        "student-transfer",
        "student-personal",
      ]));
      expect(students.map((item) => item.id)).not.toContain("student-regular");
    });
  });
});
