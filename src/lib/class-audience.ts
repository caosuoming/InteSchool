import type { AnyClass, Student } from "@/types";

export function resolveClassAudienceStudents(
  classIds: string[],
  classes: AnyClass[],
  students: Student[],
): Student[] {
  if (classIds.length === 0) return [];

  const activeStudents = students.filter((student) => student.status === "active");
  const selectedClassIds = new Set(classIds);
  const selectedStudentIds = new Set<string>();
  const availableStudentIds = new Set(activeStudents.map((student) => student.id));

  for (const cls of classes) {
    if (!selectedClassIds.has(cls.id)) continue;
    if (cls.type === "personal") {
      cls.studentIds.forEach((studentId) => {
        if (availableStudentIds.has(studentId)) selectedStudentIds.add(studentId);
      });
      continue;
    }
    activeStudents.forEach((student) => {
      if (student.classId === cls.id) selectedStudentIds.add(student.id);
    });
  }

  return activeStudents.filter((student) => selectedStudentIds.has(student.id));
}

export function classAudienceLabel(classIds: string[], classes: AnyClass[]): string {
  const selected = classes.filter((item) => classIds.includes(item.id));
  if (selected.length === 0) return "";
  if (selected.length <= 2) return selected.map((item) => item.name).join("、");
  return `${selected[0].name}等${selected.length}个班级`;
}
