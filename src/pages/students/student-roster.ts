import type { AnyClass, Student } from "@/types";

export interface StudentRosterGroup {
  id: string;
  name: string;
  students: Student[];
}

export function buildStudentRosterGroups(
  students: Student[],
  classes: AnyClass[],
  followedStudentIds: ReadonlySet<string>,
  lastInteractionMap: Readonly<Record<string, string>>,
): StudentRosterGroup[] {
  const sortStudents = (items: Student[]) => [...items].sort((a, b) => {
    const aFollowed = followedStudentIds.has(a.id);
    const bFollowed = followedStudentIds.has(b.id);
    if (aFollowed !== bFollowed) return aFollowed ? -1 : 1;
    const aTime = lastInteractionMap[a.id] ? new Date(lastInteractionMap[a.id]).getTime() : 0;
    const bTime = lastInteractionMap[b.id] ? new Date(lastInteractionMap[b.id]).getTime() : 0;
    return aTime - bTime;
  });

  const groupedStudentIds = new Set<string>();
  const groups = classes.flatMap((classInfo) => {
    const members = students.filter((student) => {
      const included = classInfo.type === "school"
        ? student.classId === classInfo.id
        : classInfo.studentIds.includes(student.id);
      if (included) groupedStudentIds.add(student.id);
      return included;
    });
    const sortedMembers = sortStudents(members);
    return sortedMembers.length > 0
      ? [{ id: classInfo.id, name: classInfo.name, students: sortedMembers }]
      : [];
  });

  const ungrouped = sortStudents(students.filter((student) => !groupedStudentIds.has(student.id)));
  if (ungrouped.length > 0) {
    groups.push({ id: "ungrouped", name: "其他学生", students: ungrouped });
  }
  return groups;
}
