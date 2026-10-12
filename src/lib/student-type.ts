import type { Student, StudentType } from "../types/index.js";

export const STUDENT_TYPE_OPTIONS: Array<{ value: StudentType; label: string }> = [
  { value: "regular", label: "本校生" },
  { value: "visiting", label: "借读生" },
  { value: "resumed", label: "复学生" },
];

export function studentTypeOf(student: Pick<Student, "studentType" | "isExternal">): StudentType {
  return student.studentType || (student.isExternal ? "visiting" : "regular");
}

export function studentTypeLabel(student: Pick<Student, "studentType" | "isExternal">): string {
  return STUDENT_TYPE_OPTIONS.find((option) => option.value === studentTypeOf(student))!.label;
}
