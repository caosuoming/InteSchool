import { describe, expect, it } from "vitest";
import type { Teacher } from "../../src/types/index.js";
import type { AppState, TeacherRecord } from "../types.js";
import { runWithState } from "../runtime-db.js";
import { classService } from "./class.js";

function teacher(
  id: string,
  roles: string[],
  options: { teachingClassIds?: string[]; homeroomClassIds?: string[] } = {},
): TeacherRecord {
  return {
    id,
    email: `${id}@example.com`,
    name: id,
    avatar: id.slice(0, 1),
    schoolId: "school-1",
    subject: "数学",
    status: "active",
    role: "teacher",
    roles,
    subjectGroupIds: [],
    prepGroupIds: [],
    teachingClassIds: options.teachingClassIds || [],
    homeroomClassIds: options.homeroomClassIds || [],
    affiliations: [{
      id: `aff-${id}`,
      teacherId: id,
      schoolId: "school-1",
      schoolName: "测试学校",
      subject: "数学",
      teachingClassIds: options.teachingClassIds || [],
      homeroomClassIds: options.homeroomClassIds || [],
      status: "active",
      role: "teacher",
      roles,
      subjectGroupIds: [],
      prepGroupIds: [],
      isCurrent: true,
      joinedAt: "2025-09-01T00:00:00.000Z",
    }],
    currentAffiliationId: `aff-${id}`,
    createdAt: "2025-09-01T00:00:00.000Z",
  };
}

function createState(): AppState {
  return {
    currentTeacherId: null,
    teachers: [
      teacher("ordinary", [], { teachingClassIds: ["class-1"] }),
      teacher("leader", ["gradeLeader"]),
    ],
    schoolClasses: [
      {
        id: "class-1",
        type: "school",
        schoolId: "school-1",
        name: "高一(1)班",
        grade: "高一",
        studentCount: 2,
        status: "active",
        createdBy: "leader",
        createdAt: "2025-09-01T00:00:00.000Z",
      },
      {
        id: "class-2",
        type: "school",
        schoolId: "school-1",
        name: "高一(2)班",
        grade: "高一",
        studentCount: 1,
        status: "active",
        createdBy: "leader",
        createdAt: "2025-09-01T00:00:00.000Z",
      },
    ],
    personalClasses: [],
    students: [
      {
        id: "student-active",
        name: "在读学生",
        studentNo: "001",
        classId: "class-1",
        schoolId: "school-1",
        grade: "高一",
        status: "active",
      },
      {
        id: "student-visiting",
        name: "借读学生",
        studentNo: "002",
        classId: "class-1",
        schoolId: "school-1",
        grade: "高一",
        status: "active",
        isExternal: true,
        externalSchool: "外校",
      },
      {
        id: "student-other",
        name: "其他班学生",
        studentNo: "003",
        classId: "class-2",
        schoolId: "school-1",
        grade: "高一",
        status: "suspended",
      },
    ],
    studentArchiveRecords: [],
  };
}

describe("student archive service", () => {
  it("limits ordinary teachers to assigned classes and lets archive managers view the school", async () => {
    const state = createState();

    await runWithState(state, async () => {
      const ordinary = await classService.listMyStudentArchives("school-1", "ordinary");
      const leader = await classService.listMyStudentArchives("school-1", "leader");

      expect(ordinary.classes.map((item) => item.id)).toEqual(["class-1"]);
      expect(ordinary.students.map((item) => item.id)).toEqual([
        "student-active",
        "student-visiting",
      ]);
      expect(ordinary.students.find((item) => item.id === "student-visiting")?.archiveStatus).toBe("visiting");
      expect(leader.classes.map((item) => item.id)).toEqual(["class-1", "class-2"]);
      expect(leader.students.map((item) => item.id)).toEqual([
        "student-active",
        "student-visiting",
        "student-other",
      ]);
      expect(leader.students.find((item) => item.id === "student-other")?.archiveStatus).toBe("suspended");
    });
  });

  it("records contact changes with the acting teacher", async () => {
    const state = createState();
    const actor = state.teachers[1] as unknown as Teacher;

    await runWithState(state, async () => {
      const updated = await classService.updateStudentContacts("student-active", {
        guardianName: "张家长",
        guardianPhone: "13800000000",
        note: "班主任核实",
      }, actor);

      expect(updated.contacts).toMatchObject({
        guardianName: "张家长",
        guardianPhone: "13800000000",
      });
      expect(state.studentArchiveRecords).toEqual([
        expect.objectContaining({
          studentId: "student-active",
          type: "contact",
          createdBy: "leader",
          createdByName: "leader",
          note: "班主任核实",
        }),
      ]);
    });
  });

  it("keeps class counts consistent across leave, suspension and resumption", async () => {
    const state = createState();
    const actor = state.teachers[1] as unknown as Teacher;

    await runWithState(state, async () => {
      const leave = await classService.updateStudentArchiveStatus("student-active", {
        status: "leave",
        startDate: "2026-08-06",
        endDate: "2026-08-07",
      }, actor);
      expect(leave).toMatchObject({ status: "active", archiveStatus: "leave" });
      expect((state.schoolClasses as Array<{ id: string; studentCount: number }>)[0].studentCount).toBe(2);

      const suspended = await classService.updateStudentArchiveStatus("student-active", {
        status: "suspended",
        note: "办理休学",
      }, actor);
      expect(suspended).toMatchObject({ status: "suspended", archiveStatus: "suspended" });
      expect((state.schoolClasses as Array<{ id: string; studentCount: number }>)[0].studentCount).toBe(1);

      const resumed = await classService.updateStudentArchiveStatus("student-active", {
        status: "attending",
      }, actor);
      expect(resumed).toMatchObject({ status: "active", archiveStatus: "attending" });
      expect((state.schoolClasses as Array<{ id: string; studentCount: number }>)[0].studentCount).toBe(2);
      expect(state.studentArchiveRecords).toHaveLength(3);
    });
  });

  it("restores a visiting student's status after leave", async () => {
    const state = createState();
    const actor = state.teachers[1] as unknown as Teacher;

    await runWithState(state, async () => {
      const leave = await classService.updateStudentArchiveStatus("student-visiting", {
        status: "leave",
        note: "请假一天",
      }, actor);
      expect(leave).toMatchObject({
        archiveStatus: "leave",
        archiveStatusBeforeLeave: "visiting",
        isExternal: true,
        externalSchool: "外校",
      });

      const returned = await classService.updateStudentArchiveStatus("student-visiting", {
        status: "visiting",
        externalSchool: "外校",
      }, actor);
      expect(returned).toMatchObject({
        archiveStatus: "visiting",
        isExternal: true,
        externalSchool: "外校",
      });
      expect(returned.archiveStatusBeforeLeave).toBeUndefined();
    });
  });

  it("rejects missing schools and unknown archive statuses", async () => {
    const state = createState();
    const actor = state.teachers[1] as unknown as Teacher;

    await runWithState(state, async () => {
      await expect(classService.updateStudentArchiveStatus("student-active", {
        status: "studyAway",
      }, actor)).rejects.toThrow("请填写借读学校");
      await expect(classService.updateStudentArchiveStatus("student-active", {
        status: "unknown",
      } as never, actor)).rejects.toThrow("无效的学生档案状态");
    });
  });
});
