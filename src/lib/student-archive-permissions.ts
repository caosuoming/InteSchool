import type { Teacher, TeacherAffiliation } from "@/types";

export const STUDENT_ARCHIVE_MANAGER_ROLES = [
  "gradeLeader",
  "dean",
  "vicePrincipal",
  "principal",
] as const;

function activeAffiliation(
  teacher: Teacher,
  affiliation?: TeacherAffiliation | null,
): TeacherAffiliation | null {
  return affiliation
    || teacher.affiliations.find((item) => item.id === teacher.currentAffiliationId)
    || teacher.affiliations.find((item) => item.isCurrent)
    || null;
}

export function canManageStudentArchive(
  teacher: Teacher,
  affiliation?: TeacherAffiliation | null,
): boolean {
  const active = activeAffiliation(teacher, affiliation);
  const role = active?.role || teacher.role;
  if (role === "school_admin" || role === "platform_admin") return true;
  const roles = active?.roles || teacher.roles;
  return roles.some((item) => STUDENT_ARCHIVE_MANAGER_ROLES.includes(
    item as (typeof STUDENT_ARCHIVE_MANAGER_ROLES)[number],
  ));
}

export function getHomeroomClassIds(
  teacher: Teacher,
  affiliation?: TeacherAffiliation | null,
): Set<string> {
  const active = activeAffiliation(teacher, affiliation);
  return new Set(active?.homeroomClassIds || teacher.homeroomClassIds || []);
}
