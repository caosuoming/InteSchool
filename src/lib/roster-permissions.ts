import type { Teacher, TeacherAffiliation } from "@/types";

export const SCHOOL_ROSTER_MANAGER_ROLES = ["gradeLeader", "vicePrincipal", "principal"] as const;

export function canManageSchoolRoster(
  teacher: Teacher,
  affiliation?: TeacherAffiliation | null,
): boolean {
  const active = affiliation
    || teacher.affiliations.find((item) => item.id === teacher.currentAffiliationId)
    || teacher.affiliations.find((item) => item.isCurrent)
    || null;
  const role = active?.role || teacher.role;
  if (role === "school_admin" || role === "platform_admin") return true;
  const roles = active?.roles || teacher.roles;
  return roles.some((item) => SCHOOL_ROSTER_MANAGER_ROLES.includes(
    item as (typeof SCHOOL_ROSTER_MANAGER_ROLES)[number],
  ));
}
