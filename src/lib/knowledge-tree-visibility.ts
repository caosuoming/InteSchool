import type { Teacher, TreeNodeType } from "@/types";

export const knowledgeTreeKinds: { kind: TreeNodeType; label: string }[] = [
  { kind: "chapter", label: "章节目录" },
  { kind: "knowledge", label: "知识点" },
  { kind: "method", label: "思想方法" },
  { kind: "error", label: "错因字典" },
];

export function isKnowledgeTreeEnabled(teacher: Teacher | null, kind: TreeNodeType): boolean {
  return teacher?.knowledgeTreeEnabled?.[kind] ?? (kind === "chapter" || kind === "knowledge");
}
