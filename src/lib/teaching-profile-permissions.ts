export const TEACHING_PROFILE_MANAGER_ROLES = [
  "gradeLeader",
  "dean",
  "vicePrincipal",
  "principal",
] as const;

interface TeachingProfilePermissionAffiliation {
  id?: string;
  schoolId?: string | null;
  role?: string;
  roles?: readonly string[];
  isCurrent?: boolean;
}

interface TeachingProfilePermissionTeacher {
  role?: string;
  roles?: readonly string[];
  affiliations?: readonly TeachingProfilePermissionAffiliation[];
  currentAffiliationId?: string | null;
}

export function canManageTeachingProfiles(
  teacher: TeachingProfilePermissionTeacher,
  affiliation?: TeachingProfilePermissionAffiliation | null,
): boolean {
  const active = affiliation
    || teacher.affiliations?.find((item) => item.id === teacher.currentAffiliationId)
    || teacher.affiliations?.find((item) => item.isCurrent)
    || null;
  const role = active?.role || teacher.role;
  if (role === "school_admin" || role === "platform_admin") return true;
  if (active && !active.schoolId) return false;
  const roles = active?.roles?.length ? active.roles : teacher.roles || [];
  return roles.some((item) => TEACHING_PROFILE_MANAGER_ROLES.includes(
    item as (typeof TEACHING_PROFILE_MANAGER_ROLES)[number],
  ));
}
