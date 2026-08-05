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

export function normalizeTeacherRoles(roles: readonly TeacherRole[]): TeacherRole[] {
  const normalized: TeacherRole[] = [
    "teacher",
    ...roles.filter((role) => role !== "teacher"),
  ];
  return normalized.filter((role, index) => normalized.indexOf(role) === index);
}
