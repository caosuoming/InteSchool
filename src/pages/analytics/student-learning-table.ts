import type { KnowledgeMastery } from "@/services/analytics";

export type KnowledgePointPlacement = "top" | "bottom";

const masteryOrder: Record<KnowledgeMastery["masteryLevel"], number> = {
  weak: 0,
  basic: 1,
  mastered: 2,
  untrained: 3,
};

const placementOrder: Record<KnowledgePointPlacement | "normal", number> = {
  top: 0,
  normal: 1,
  bottom: 2,
};

export function knowledgePointDisplayName(
  mastery: KnowledgeMastery,
  showParentNodes: boolean,
): string {
  if (!showParentNodes || !mastery.knowledgePointPath?.length) {
    return mastery.knowledgePointName;
  }
  return mastery.knowledgePointPath.join("\\");
}

export function orderKnowledgeMasteryRows(
  rows: KnowledgeMastery[],
  placements: Readonly<Record<string, KnowledgePointPlacement>>,
): KnowledgeMastery[] {
  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => {
      const aPlacement = placements[a.row.knowledgePointId] ?? "normal";
      const bPlacement = placements[b.row.knowledgePointId] ?? "normal";
      if (aPlacement !== bPlacement) {
        return placementOrder[aPlacement] - placementOrder[bPlacement];
      }
      if (masteryOrder[a.row.masteryLevel] !== masteryOrder[b.row.masteryLevel]) {
        return masteryOrder[a.row.masteryLevel] - masteryOrder[b.row.masteryLevel];
      }
      if (a.row.totalAttempts !== b.row.totalAttempts) {
        return b.row.totalAttempts - a.row.totalAttempts;
      }
      return a.index - b.index;
    })
    .map(({ row }) => row);
}
