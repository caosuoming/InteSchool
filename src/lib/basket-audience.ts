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
  audienceStudentCount?: number,
): string {
  const classCount = basket.classIds?.length || 0;
  const studentCount = basket.studentIds?.length || 0;
  if (classCount === 0 && studentCount === 0) return "尚未选择使用对象";

  const parts: string[] = [];
  if (classCount > 0) parts.push(`${classCount} 个班级`);
  if (studentCount > 0) parts.push(`${studentCount} 名指定学生`);
  if (typeof audienceStudentCount === "number") parts.push(`共 ${audienceStudentCount} 人`);
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
