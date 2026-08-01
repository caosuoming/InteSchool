import type { Teacher, TeacherAffiliation, TeacherRole } from "../types/index.js";

export const EXAM_MANAGER_ROLES: readonly TeacherRole[] = [
  "gradeLeader",
  "dean",
  "vicePrincipal",
  "principal",
];

export function canManageSchoolExams(
  teacher: Pick<Teacher, "role" | "roles">,
  affiliation?: Pick<TeacherAffiliation, "role" | "roles" | "schoolId"> | null,
): boolean {
  const activeRole = affiliation?.role || teacher.role;
  if (activeRole === "school_admin" || activeRole === "platform_admin") return true;
  if (affiliation && !affiliation.schoolId) return false;
  const roles = affiliation?.roles?.length ? affiliation.roles : teacher.roles;
  return roles.some((role) => EXAM_MANAGER_ROLES.includes(role));
}
