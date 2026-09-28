export const PERSONAL_RESOURCE_SCOPE_PREFIX = "personal-directory:";

export function personalResourceScopeId(teacherId: string): string {
  return `${PERSONAL_RESOURCE_SCOPE_PREFIX}${teacherId}`;
}

export function teacherResourceScopeId(teacher: { id: string; schoolId?: string | null }): string {
  return teacher.schoolId || personalResourceScopeId(teacher.id);
}
