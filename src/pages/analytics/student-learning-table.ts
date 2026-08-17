import type { KnowledgeMastery } from "@/services/analytics";
import type { KnowledgePoint } from "@/types";
import {
  applyLearningTreePlacement,
  orderVisibleLearningTree,
  type LearningTreePlacement,
  type LearningTreeNode,
} from "./student-learning-tree";

export type KnowledgePointPlacement = LearningTreePlacement;

export interface KnowledgeMasteryTreeRow extends LearningTreeNode {
  mastery: KnowledgeMastery;
  level: number;
}

const masteryOrder: Record<KnowledgeMastery["masteryLevel"], number> = {
  weak: 0,
  basic: 1,
  mastered: 2,
  untrained: 3,
};

const placementOrder: Record<KnowledgePointPlacement, number> = {
  top: 0,
  normal: 1,
  bottom: 2,
};

export function knowledgePointDisplayName(mastery: KnowledgeMastery): string {
  const path = mastery.knowledgePointPath?.filter(Boolean) ?? [];
  if (path.length <= 1) return mastery.knowledgePointName;
  return `...\\${path[path.length - 1]}`;
}

export function knowledgePointFullPath(mastery: KnowledgeMastery): string {
  const path = mastery.knowledgePointPath?.filter(Boolean) ?? [];
  return path.length > 0 ? path.join("\\") : mastery.knowledgePointName;
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

export function buildKnowledgeMasteryTreeRows(
  rows: KnowledgeMastery[],
  knowledgePoints: KnowledgePoint[],
): KnowledgeMasteryTreeRow[] {
  const pointById = new Map(knowledgePoints.map((point) => [point.id, point] as const));
  const rowIds = new Set(rows.map((row) => row.knowledgePointId));

  return rows.map((mastery, index) => {
    const point = pointById.get(mastery.knowledgePointId);
    const parentId = point?.parentId && rowIds.has(point.parentId) ? point.parentId : null;
    return {
      id: mastery.knowledgePointId,
      parentId,
      order: point?.order ?? index,
      level: point?.level ?? Math.max((mastery.knowledgePointPath?.length ?? 1) - 1, 0),
      mastery,
    };
  });
}

export function applyKnowledgePointPlacement(
  placements: Readonly<Record<string, KnowledgePointPlacement>>,
  selectedKnowledgePointIds: ReadonlySet<string>,
  placement: KnowledgePointPlacement,
): Record<string, KnowledgePointPlacement> {
  return applyLearningTreePlacement(placements, selectedKnowledgePointIds, placement);
}

export function orderVisibleKnowledgeMasteryRows(
  rows: KnowledgeMastery[],
  knowledgePoints: KnowledgePoint[],
  placements: Readonly<Record<string, KnowledgePointPlacement>>,
  collapsedKnowledgePointIds: ReadonlySet<string>,
): KnowledgeMasteryTreeRow[] {
  return orderVisibleLearningTree(
    buildKnowledgeMasteryTreeRows(rows, knowledgePoints),
    placements,
    collapsedKnowledgePointIds,
  );
}
