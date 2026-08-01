export const ASSIGNABLE_GRADE_SUBJECTS = ["化学", "生物", "政治", "地理"] as const;

export function isAssignableGradeSubject(subject: string): boolean {
  return ASSIGNABLE_GRADE_SUBJECTS.includes(subject as (typeof ASSIGNABLE_GRADE_SUBJECTS)[number]);
}
