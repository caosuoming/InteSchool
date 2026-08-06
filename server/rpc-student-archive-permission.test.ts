// @vitest-environment node

import { describe, expect, it } from "vitest";
import type { AppState, TeacherRecord } from "./types.js";
import {
  canHomeroomUpdateStudentStatus,
  canManageStudentArchive,
  isHomeroomStudent,
} from "./student-archive-permissions.js";

function teacher(
  id: string,
  roles: string[],
  options: {
    role?: TeacherRecord["role"];
    homeroomClassIds?: string[];
  } = {},
): TeacherRecord {
  const homeroomClassIds = options.homeroomClassIds || [];
  return {
    id,
    email: `${id}@example.com`,
    name: id,
    avatar: id.slice(0, 1),
    schoolId: "school-1",
    subject: "数学",
    homeroomClassIds,
    status: "active",
    role: options.role || "teacher",
    roles,
    subjectGroupIds: [],
    prepGroupIds: [],
    affiliations: [{
      id: `aff-${id}`,
      teacherId: id,
      schoolId: "school-1",
      schoolName: "测试学校",
      subject: "数学",
      homeroomClassIds,
      status: "active",
      role: options.role || "teacher",
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

function state(
  archiveStatus: string = "attending",
  patch: Record<string, unknown> = {},
): AppState {
  return {
    currentTeacherId: null,
    teachers: [],
    students: [{
      id: "student-1",
      name: "测试学生",
      studentNo: "001",
      classId: "class-1",
      schoolId: "school-1",
      grade: "高一",
      status: "active",
      archiveStatus,
      ...patch,
    }],
  };
}

describe("student archive RPC permission rules", () => {
  it("reserves full archive operations for grade leaders and higher roles", () => {
    expect(canManageStudentArchive(teacher("ordinary", []))).toBe(false);
    expect(canManageStudentArchive(teacher("homeroom", ["headTeacher"], {
      homeroomClassIds: ["class-1"],
    }))).toBe(false);
    expect(canManageStudentArchive(teacher("leader", ["gradeLeader"]))).toBe(true);
    expect(canManageStudentArchive(teacher("dean", ["dean"]))).toBe(true);
    expect(canManageStudentArchive(teacher("vice", ["vicePrincipal"]))).toBe(true);
    expect(canManageStudentArchive(teacher("principal", ["principal"]))).toBe(true);
    expect(canManageStudentArchive(teacher("admin", [], { role: "school_admin" }))).toBe(true);
  });

  it("identifies only students in the teacher's own homeroom class", () => {
    const homeroom = teacher("homeroom", ["headTeacher"], { homeroomClassIds: ["class-1"] });
    const other = teacher("other", ["headTeacher"], { homeroomClassIds: ["class-2"] });

    expect(isHomeroomStudent(state(), homeroom, "student-1")).toBe(true);
    expect(isHomeroomStudent(state(), other, "student-1")).toBe(false);
    expect(isHomeroomStudent(state(), homeroom, "missing")).toBe(false);
  });

  it("allows homeroom teachers to register leave and end an existing leave only", () => {
    const homeroom = teacher("homeroom", ["headTeacher"], { homeroomClassIds: ["class-1"] });

    expect(canHomeroomUpdateStudentStatus(
      state("attending"),
      homeroom,
      "student-1",
      { status: "leave" },
    )).toBe(true);
    expect(canHomeroomUpdateStudentStatus(
      state("leave"),
      homeroom,
      "student-1",
      { status: "attending" },
    )).toBe(true);
    expect(canHomeroomUpdateStudentStatus(
      state("studyAway", { externalSchool: "外校" }),
      homeroom,
      "student-1",
      { status: "leave" },
    )).toBe(true);
    expect(canHomeroomUpdateStudentStatus(
      state("leave", {
        archiveStatusBeforeLeave: "visiting",
        isExternal: true,
        externalSchool: "外校",
      }),
      homeroom,
      "student-1",
      { status: "visiting" },
    )).toBe(true);
    expect(canHomeroomUpdateStudentStatus(
      state("leave", {
        archiveStatusBeforeLeave: "visiting",
        isExternal: true,
        externalSchool: "外校",
      }),
      homeroom,
      "student-1",
      { status: "attending" },
    )).toBe(false);
    expect(canHomeroomUpdateStudentStatus(
      state("attending"),
      homeroom,
      "student-1",
      { status: "studyAway", externalSchool: "外校" },
    )).toBe(false);
    expect(canHomeroomUpdateStudentStatus(
      state("attending"),
      homeroom,
      "student-1",
      { status: "suspended" },
    )).toBe(false);
    expect(canHomeroomUpdateStudentStatus(
      state("suspended"),
      homeroom,
      "student-1",
      { status: "leave" },
    )).toBe(false);
    expect(canHomeroomUpdateStudentStatus(
      state("attending"),
      homeroom,
      "student-1",
      { status: "attending" },
    )).toBe(false);
  });
});
