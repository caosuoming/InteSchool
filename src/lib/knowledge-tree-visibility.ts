import type { Teacher, TreeNodeType } from "@/types";

export const knowledgeTreeKinds: { kind: TreeNodeType; label: string }[] = [
  { kind: "chapter", label: "章节目录" },
  { kind: "knowledge", label: "知识点" },
  { kind: "method", label: "思想方法" },
  { kind: "error", label: "错因字典" },
];

export function knowledgeTreeSubject(teacher: Teacher | null): string {
  if (!teacher) return "";
  const current = teacher.affiliations?.find((item) => item.id === teacher.currentAffiliationId)
    || teacher.affiliations?.find((item) => item.isCurrent);
  return (current?.subject || teacher.subject || "").trim();
}

export function isKnowledgeTreeEnabled(teacher: Teacher | null, kind: TreeNodeType): boolean {
  const subject = knowledgeTreeSubject(teacher);
  const scoped = teacher?.knowledgeTreeEnabledBySubject;
  if (scoped) {
    const preferences = Object.prototype.hasOwnProperty.call(scoped, subject) ? scoped[subject] : undefined;
    return preferences?.[kind] ?? (kind === "chapter" || kind === "knowledge");
  }
  // 旧版账号尚未产生学科配置时，沿用此前的个人设置。
  return teacher?.knowledgeTreeEnabled?.[kind] ?? (kind === "chapter" || kind === "knowledge");
}
