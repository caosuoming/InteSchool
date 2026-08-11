import type { TeacherRole } from "../types/index.js";

export const TEACHER_ROLES = [
  "teacher",
  "headTeacher",
  "prepLeader",
  "subjectLeader",
  "gradeLeader",
  "dean",
  "vicePrincipal",
  "principal",
] as const satisfies readonly TeacherRole[];

export const TEACHER_ROLE_LEVEL: Record<TeacherRole, number> = {
  teacher: 0,
  headTeacher: 1,
  prepLeader: 2,
  subjectLeader: 3,
  gradeLeader: 4,
  dean: 5,
  vicePrincipal: 6,
  principal: 7,
};

export function isTeacherRole(role: unknown): role is TeacherRole {
  return typeof role === "string" && (TEACHER_ROLES as readonly string[]).includes(role);
}

export function highestTeacherRoleLevel(roles: readonly TeacherRole[]): number {
  return roles.reduce((highest, role) => Math.max(highest, TEACHER_ROLE_LEVEL[role]), 0);
}

export function normalizeTeacherRoles(roles: readonly TeacherRole[]): TeacherRole[] {
  const normalized: TeacherRole[] = [
    "teacher",
    ...roles.filter((role) => role !== "teacher"),
  ];
  return normalized.filter((role, index) => normalized.indexOf(role) === index);
}
