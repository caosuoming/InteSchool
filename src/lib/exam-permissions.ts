import type { Teacher, TeacherAffiliation, TeacherRole } from "../types/index.js";

export const EXAM_MANAGER_ROLES: readonly TeacherRole[] = [
  "gradeLeader",
  "dean",
  "vicePrincipal",
  "principal",
];

export function isSchoolExamAdmin(
  teacher: Pick<Teacher, "role">,
  affiliation?: Pick<TeacherAffiliation, "role"> | null,
): boolean {
  const activeRole = affiliation?.role || teacher.role;
  return activeRole === "school_admin" || activeRole === "platform_admin";
}

export function canManageSchoolExams(
  teacher: Pick<Teacher, "role" | "roles">,
  affiliation?: Pick<TeacherAffiliation, "role" | "roles" | "schoolId"> | null,
): boolean {
  if (isSchoolExamAdmin(teacher, affiliation)) return true;
  if (affiliation && !affiliation.schoolId) return false;
  const roles = affiliation?.roles?.length ? affiliation.roles : teacher.roles;
  return roles.some((role) => EXAM_MANAGER_ROLES.includes(role));
}

export function canModifyExamRecord(
  teacher: Pick<Teacher, "id" | "role">,
  ownerTeacherId: string,
  affiliation?: Pick<TeacherAffiliation, "role"> | null,
): boolean {
  return teacher.id === ownerTeacherId || isSchoolExamAdmin(teacher, affiliation);
}
