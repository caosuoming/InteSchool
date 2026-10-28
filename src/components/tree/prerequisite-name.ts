import type { Chapter, KnowledgePoint, NodePrerequisite } from "@/types";

export function prerequisiteName(
  reference: NodePrerequisite,
  chapters: Chapter[],
  points: KnowledgePoint[],
): string | null {
  return (reference.type === "chapter" ? chapters : points)
    .find((item) => item.id === reference.id)?.name ?? null;
}
