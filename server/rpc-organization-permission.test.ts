// @vitest-environment node

import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildApp, type BuiltApp } from "./app.js";
import { invokeRpc } from "./rpc.js";
import type { SessionUser } from "./types.js";

let built: BuiltApp;
let workDir: string;

function teacher(
  id: string,
  schoolId: string,
  roles: string[],
  options: { role?: "teacher" | "school_admin" | "platform_admin"; grades?: string[] } = {},
) {
  const role = options.role || "teacher";
  const grades = options.grades || [];
  return {
    id,
    email: `${id}@example.com`,
    name: id,
    avatar: id.slice(0, 1),
    schoolId,
    subject: "数学",
    teachingGrades: grades,
    teachingClassIds: [],
    homeroomClassIds: [],
    status: "active",
    role,
    roles,
    subjectGroupIds: [],
    prepGroupIds: [],
    affiliations: [{
      id: `aff-${id}`,
      teacherId: id,
      schoolId,
      schoolName: schoolId === "school-1" ? "一中" : "二中",
      subject: "数学",
      teachingGrades: grades,
      teachingClassIds: [],
      homeroomClassIds: [],
      status: "active",
      role,
      roles,
      subjectGroupIds: [],
      prepGroupIds: [],
      isCurrent: true,
      joinedAt: "2026-08-01T00:00:00.000Z",
    }],
    currentAffiliationId: `aff-${id}`,
    createdAt: "2026-08-01T00:00:00.000Z",
  };
}

function session(teacherId: string): SessionUser {
  return {
    userId: `user-${teacherId}`,
    teacherId,
    email: `${teacherId}@example.com`,
    csrfToken: "csrf",
    expiresAt: "2099-01-01T00:00:00.000Z",
  };
}

function affiliationRoles(teacherId: string): string[] {
  const target = built.store.loadState().teachers.find((item) => item.id === teacherId);
  const affiliation = target?.affiliations.find((item) => item.id === target.currentAffiliationId);
  return Array.isArray(affiliation?.roles) ? affiliation.roles as string[] : [];
}

beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), "inteschool-organization-permission-"));
  const seedPath = join(workDir, "seed.json");
  await writeFile(seedPath, JSON.stringify({
    currentTeacherId: null,
    schools: [
      { id: "school-1", name: "一中", code: "ONE" },
      { id: "school-2", name: "二中", code: "TWO" },
    ],
    teachers: [
      teacher("ordinary", "school-1", ["teacher"], { grades: ["高一"] }),
      teacher("grade-leader", "school-1", ["teacher", "gradeLeader"], { grades: ["高一"] }),
      teacher("high-one", "school-1", ["teacher"], { grades: ["高一"] }),
      teacher("high-two", "school-1", ["teacher"], { grades: ["高二"] }),
      teacher("school-admin", "school-1", ["teacher"], { role: "school_admin" }),
      teacher("platform-admin", "school-1", ["teacher"], { role: "platform_admin" }),
      teacher("school-two-teacher", "school-2", ["teacher"], { grades: ["高一"] }),
    ],
    organizationDepartments: [],
  }), "utf8");
  built = await buildApp({
    databasePath: join(workDir, "inteschool.sqlite"),
    uploadsDir: join(workDir, "uploads"),
    seedStatePath: seedPath,
    seedDemoData: true,
    enableDemoAccount: false,
    serveStatic: false,
    logger: false,
  });
  await built.app.ready();
});

afterEach(async () => {
  await built.app.close();
  await rm(workDir, { recursive: true, force: true });
});

describe("organization RPC hierarchical permissions", () => {
  it("denies ordinary teachers and lets school administrators assign all school roles", async () => {
    await expect(invokeRpc(
      built.store,
      session("ordinary"),
      "organization",
      "updateTeacherRoles",
      ["high-one", "school-1", ["teacher", "subjectLeader"]],
    )).rejects.toThrow("无权执行该组织或教师权限操作");

    await expect(invokeRpc(
      built.store,
      session("school-admin"),
      "organization",
      "updateTeacherRoles",
      ["high-one", "school-1", ["teacher", "principal"]],
    )).resolves.toBeUndefined();

    expect(affiliationRoles("high-one")).toEqual(["teacher", "principal"]);
  });

  it("lets grade leaders delegate lower roles only inside their own grade", async () => {
    await expect(invokeRpc(
      built.store,
      session("grade-leader"),
      "organization",
      "updateTeacherRoles",
      ["high-one", "school-1", ["teacher", "subjectLeader"]],
    )).resolves.toBeUndefined();
    expect(affiliationRoles("high-one")).toEqual(["teacher", "subjectLeader"]);

    await expect(invokeRpc(
      built.store,
      session("grade-leader"),
      "organization",
      "updateTeacherRoles",
      ["high-one", "school-1", ["teacher", "vicePrincipal"]],
    )).rejects.toThrow("无权执行该组织或教师权限操作");

    await expect(invokeRpc(
      built.store,
      session("grade-leader"),
      "organization",
      "updateTeacherRoles",
      ["high-two", "school-1", ["teacher", "headTeacher"]],
    )).rejects.toThrow("无权执行该组织或教师权限操作");

    await expect(invokeRpc(
      built.store,
      session("grade-leader"),
      "organization",
      "updateTeacherRoles",
      ["grade-leader", "school-1", ["teacher"]],
    )).rejects.toThrow("无权执行该组织或教师权限操作");
  });

  it("inherits department leader roles and removes them when the leader changes", async () => {
    const department = await invokeRpc(
      built.store,
      session("school-admin"),
      "organization",
      "createDepartment",
      ["school-1", {
        name: "教务处",
        leaderId: "high-one",
        roles: ["dean"],
      }],
    ) as { id: string };

    expect(affiliationRoles("high-one")).toEqual(["teacher", "dean"]);

    await invokeRpc(
      built.store,
      session("school-admin"),
      "organization",
      "updateDepartment",
      [department.id, { leaderId: "high-two" }],
    );

    expect(affiliationRoles("high-one")).toEqual(["teacher"]);
    expect(affiliationRoles("high-two")).toEqual(["teacher", "dean"]);
  });

  it("lets platform admins directly designate administrators across schools", async () => {
    const schoolTwoTeachers = await invokeRpc(
      built.store,
      session("platform-admin"),
      "organization",
      "listTeachers",
      ["school-2"],
    ) as Array<{ id: string }>;
    expect(schoolTwoTeachers.map((item) => item.id)).toContain("school-two-teacher");

    await expect(invokeRpc(
      built.store,
      session("platform-admin"),
      "organization",
      "updateTeacherRoles",
      ["school-two-teacher", "school-2", ["teacher", "principal"]],
    )).rejects.toThrow("无权执行该组织或教师权限操作");

    await expect(invokeRpc(
      built.store,
      session("platform-admin"),
      "organization",
      "setTeacherSchoolRole",
      ["school-two-teacher", "school-2", "school_admin"],
    )).resolves.toBeUndefined();

    const target = built.store.loadState().teachers.find((item) => item.id === "school-two-teacher");
    expect(target?.affiliations[0]?.role).toBe("school_admin");

    await expect(invokeRpc(
      built.store,
      session("school-admin"),
      "organization",
      "setTeacherSchoolRole",
      ["high-one", "school-1", "school_admin"],
    )).rejects.toThrow("无权执行该组织或教师权限操作");
  });
});
