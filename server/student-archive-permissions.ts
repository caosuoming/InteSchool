import type { AppState, TeacherRecord } from "./types.js";

export const STUDENT_ARCHIVE_MANAGER_ROLES = new Set([
  "gradeLeader",
  "dean",
  "vicePrincipal",
  "principal",
]);

function activeAffiliation(teacher: TeacherRecord): Record<string, unknown> | undefined {
  return teacher.affiliations?.find((item) => item.id === teacher.currentAffiliationId)
    || teacher.affiliations?.find((item) => item.isCurrent);
}

function activeRole(teacher: TeacherRecord): string {
  const affiliation = activeAffiliation(teacher);
  return typeof affiliation?.role === "string" ? affiliation.role : teacher.role;
}

function findStudent(state: AppState, studentId: unknown): Record<string, unknown> | null {
  if (typeof studentId !== "string") return null;
  return ((state.students || []) as Array<Record<string, unknown>>)
    .find((student) => student.id === studentId) || null;
}

function studentArchiveStatus(student: Record<string, unknown>): string {
  if (student.status === "transferred") return "transferred";
  if (student.status === "graduated") return "graduated";
  if (student.status === "suspended") return "suspended";
  if (typeof student.archiveStatus === "string") return student.archiveStatus;
  return student.isExternal === true ? "visiting" : "attending";
}

export function canManageStudentArchive(teacher: TeacherRecord): boolean {
  if (["school_admin", "platform_admin"].includes(activeRole(teacher))) return true;
  const affiliation = activeAffiliation(teacher);
  const roles = Array.isArray(affiliation?.roles) ? affiliation.roles : teacher.roles;
  return roles.some((role) => STUDENT_ARCHIVE_MANAGER_ROLES.has(String(role)));
}

export function isHomeroomStudent(
  state: AppState,
  teacher: TeacherRecord,
  studentId: unknown,
): boolean {
  const student = findStudent(state, studentId);
  if (!student || student.schoolId !== teacher.schoolId || typeof student.classId !== "string") return false;
  const affiliation = activeAffiliation(teacher);
  const classIds = Array.isArray(affiliation?.homeroomClassIds)
    ? affiliation.homeroomClassIds
    : teacher.homeroomClassIds || [];
  return classIds.some((classId) => classId === student.classId);
}

export function canHomeroomUpdateStudentStatus(
  state: AppState,
  teacher: TeacherRecord,
  studentId: unknown,
  input: unknown,
): boolean {
  if (!isHomeroomStudent(state, teacher, studentId)) return false;
  if (!input || typeof input !== "object" || Array.isArray(input)) return false;
  const requested = (input as Record<string, unknown>).status;
  const student = findStudent(state, studentId);
  if (!student) return false;
  const current = studentArchiveStatus(student);
  const statusBeforeLeave = typeof student.archiveStatusBeforeLeave === "string"
    ? student.archiveStatusBeforeLeave
    : student.isExternal === true
      ? "visiting"
      : typeof student.externalSchool === "string" && student.externalSchool.length > 0
        ? "studyAway"
        : "attending";
  const homeroomAttendanceStatuses = ["attending", "studyAway", "visiting"];
  return (requested === "leave" && homeroomAttendanceStatuses.includes(current))
    || (
      current === "leave"
      && homeroomAttendanceStatuses.includes(statusBeforeLeave)
      && requested === statusBeforeLeave
    );
}
