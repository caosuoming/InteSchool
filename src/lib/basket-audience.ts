import type { AnyClass, Basket, Student, TreeNode } from "@/types";

export function resolveBasketAudienceStudentIds(
  basket: Pick<Basket, "classIds" | "studentIds">,
  classes: AnyClass[],
  students: Student[],
): string[] {
  const availableStudentIds = new Set(students.map((student) => student.id));
  const result = new Set(
    (basket.studentIds || []).filter((studentId) => availableStudentIds.has(studentId)),
  );
  const selectedClassIds = new Set(basket.classIds || []);

  for (const cls of classes) {
    if (!selectedClassIds.has(cls.id)) continue;
    if (cls.type === "personal") {
      cls.studentIds.forEach((studentId) => {
        if (availableStudentIds.has(studentId)) result.add(studentId);
      });
      continue;
    }
    students.forEach((student) => {
      if (student.classId === cls.id) result.add(student.id);
    });
  }

  return Array.from(result);
}

export function basketAudienceLabel(
  basket: Pick<Basket, "classIds" | "studentIds">,
  classes: AnyClass[],
  students: Student[],
): string {
  const classIds = basket.classIds || [];
  const studentIds = basket.studentIds || [];
  if (classIds.length === 0 && studentIds.length === 0) return "尚未选择使用对象";

  const classNameById = new Map(classes.map((cls) => [cls.id, cls.name]));
  const studentNameById = new Map(students.map((student) => [student.id, student.name]));
  const classNames = classIds.map((id) => classNameById.get(id)).filter(Boolean) as string[];
  const studentNames = studentIds.map((id) => studentNameById.get(id)).filter(Boolean) as string[];

  const parts: string[] = [];
  if (classIds.length > 0) {
    parts.push(
      classNames.length === classIds.length
        ? `班级：${classNames.join("、")}`
        : `${classIds.length} 个班级`,
    );
  }
  if (studentIds.length > 0) {
    parts.push(
      studentNames.length === studentIds.length
        ? `学生：${studentNames.join("、")}`
        : `${studentIds.length} 名指定学生`,
    );
  }
  return parts.join(" · ");
}

export function treeNameMap(tree: TreeNode | null): Map<string, string> {
  const result = new Map<string, string>();
  const visit = (node: TreeNode) => {
    if (node.id !== "root") result.set(node.id, node.name);
    node.children.forEach(visit);
  };
  if (tree) visit(tree);
  return result;
}
