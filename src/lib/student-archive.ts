import type { Student, StudentArchiveStatus } from "../types/index.js";

export const STUDENT_ARCHIVE_STATUS_META: Record<
  StudentArchiveStatus,
  { label: string; description: string }
> = {
  attending: { label: "在籍 · 在读", description: "学籍在本校并正常到校就读" },
  studyAway: { label: "外出借读", description: "学籍在本校，当前在外校借读" },
  visiting: { label: "到校借读", description: "学籍在外校，当前在本校借读" },
  leave: { label: "请假", description: "学生处于请假状态" },
  suspended: { label: "休学", description: "学生已办理休学" },
  transferred: { label: "转学", description: "学生已转出本校" },
  graduated: { label: "毕业", description: "学生已毕业" },
};

export function getStudentArchiveStatus(student: Student): StudentArchiveStatus {
  if (student.status === "transferred") return "transferred";
  if (student.status === "graduated") return "graduated";
  if (student.status === "suspended") return "suspended";
  if (student.archiveStatus) return student.archiveStatus;
  return student.isExternal ? "visiting" : "attending";
}

export function getStudentArchiveStatusLabel(student: Student): string {
  return STUDENT_ARCHIVE_STATUS_META[getStudentArchiveStatus(student)].label;
}

export function getStudentStatusAfterLeave(
  student: Student,
): Exclude<StudentArchiveStatus, "leave" | "graduated" | "transferred" | "suspended"> {
  if (["attending", "studyAway", "visiting"].includes(student.archiveStatusBeforeLeave || "")) {
    return student.archiveStatusBeforeLeave as "attending" | "studyAway" | "visiting";
  }
  if (student.isExternal) return "visiting";
  if (student.externalSchool) return "studyAway";
  return "attending";
}
