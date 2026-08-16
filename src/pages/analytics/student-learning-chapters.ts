import type { StudentAnswerDetail } from "@/services/analytics";
import type { Chapter } from "@/types";

export interface ChapterMastery {
  chapterId: string;
  chapterName: string;
  parentId: string | null;
  chapterPath: string[];
  level: number;
  totalAttempts: number;
  correctCount: number;
  partialCount: number;
  wrongCount: number;
  correctRate: number;
  masteryLevel: "mastered" | "basic" | "weak" | "untrained";
}

export type ChapterPlacement = "top" | "normal" | "bottom";

const placementOrder: Record<ChapterPlacement, number> = {
  top: 0,
  normal: 1,
  bottom: 2,
};

interface ChapterTreeEntry {
  chapter: Chapter;
  path: string[];
  subtreeIds: Set<string>;
}

function buildChapterEntries(chapters: Chapter[]): ChapterTreeEntry[] {
  const childrenByParent = new Map<string | null, Chapter[]>();
  for (const chapter of chapters) {
    const siblings = childrenByParent.get(chapter.parentId) ?? [];
    siblings.push(chapter);
    childrenByParent.set(chapter.parentId, siblings);
  }
  for (const siblings of childrenByParent.values()) {
    siblings.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, "zh-CN"));
  }

  const entries: ChapterTreeEntry[] = [];
  const visited = new Set<string>();
  const visit = (chapter: Chapter, parentPath: string[]): Set<string> => {
    if (visited.has(chapter.id)) return new Set([chapter.id]);
    visited.add(chapter.id);

    const path = [...parentPath, chapter.name];
    const entry: ChapterTreeEntry = {
      chapter,
      path,
      subtreeIds: new Set([chapter.id]),
    };
    entries.push(entry);

    for (const child of childrenByParent.get(chapter.id) ?? []) {
      for (const id of visit(child, path)) entry.subtreeIds.add(id);
    }
    return entry.subtreeIds;
  };

  for (const chapter of childrenByParent.get(null) ?? []) visit(chapter, []);
  // Keep malformed/orphaned legacy rows visible instead of silently dropping them.
  for (const chapter of chapters) {
    if (!visited.has(chapter.id)) visit(chapter, []);
  }
  return entries;
}

export function buildChapterMastery(
  chapters: Chapter[],
  answerDetails: StudentAnswerDetail[],
): ChapterMastery[] {
  return buildChapterEntries(chapters).map(({ chapter, path, subtreeIds }) => {
    let total = 0;
    let correct = 0;
    let partial = 0;
    let wrong = 0;

    for (const detail of answerDetails) {
      const { record, question } = detail;
      if (!question || record.score === "done") continue;
      if (!question.chapterIds.some((chapterId) => subtreeIds.has(chapterId))) continue;

      total += 1;
      const score = record.score ?? (record.isCorrect ? "correct" : "wrong");
      if (score === "correct") correct += 1;
      else if (score === "partial") partial += 1;
      else wrong += 1;
    }

    const correctRate = total > 0 ? correct / total : 0;
    const masteryLevel: ChapterMastery["masteryLevel"] = total === 0
      ? "untrained"
      : correctRate >= 0.8
        ? "mastered"
        : correctRate >= 0.6
          ? "basic"
          : "weak";

    return {
      chapterId: chapter.id,
      chapterName: chapter.name,
      parentId: chapter.parentId,
      chapterPath: path,
      level: chapter.level,
      totalAttempts: total,
      correctCount: correct,
      partialCount: partial,
      wrongCount: wrong,
      correctRate,
      masteryLevel,
    };
  });
}

export function chapterSubtreeIds(
  mastery: ChapterMastery[],
  chapterId: string,
): Set<string> {
  const childrenByParent = new Map<string, string[]>();
  for (const item of mastery) {
    if (!item.parentId) continue;
    const children = childrenByParent.get(item.parentId) ?? [];
    children.push(item.chapterId);
    childrenByParent.set(item.parentId, children);
  }

  const subtree = new Set<string>();
  const pending = [chapterId];
  while (pending.length > 0) {
    const current = pending.pop()!;
    if (subtree.has(current)) continue;
    subtree.add(current);
    pending.push(...(childrenByParent.get(current) ?? []));
  }
  return subtree;
}

export function applyChapterPlacement(
  mastery: ChapterMastery[],
  placements: Readonly<Record<string, ChapterPlacement>>,
  selectedChapterIds: ReadonlySet<string>,
  placement: ChapterPlacement,
): Record<string, ChapterPlacement> {
  const next = { ...placements };
  for (const chapterId of selectedChapterIds) {
    for (const affectedId of chapterSubtreeIds(mastery, chapterId)) {
      next[affectedId] = placement;
    }
  }
  return next;
}

export function orderVisibleChapterMastery(
  mastery: ChapterMastery[],
  placements: Readonly<Record<string, ChapterPlacement>>,
  collapsedChapterIds: ReadonlySet<string>,
): ChapterMastery[] {
  const itemById = new Map(mastery.map((item) => [item.chapterId, item] as const));
  const originalIndex = new Map(mastery.map((item, index) => [item.chapterId, index] as const));
  const childrenByParent = new Map<string | null, ChapterMastery[]>();

  for (const item of mastery) {
    const effectiveParent = item.parentId && itemById.has(item.parentId) ? item.parentId : null;
    const siblings = childrenByParent.get(effectiveParent) ?? [];
    siblings.push(item);
    childrenByParent.set(effectiveParent, siblings);
  }

  const sortSiblings = (siblings: ChapterMastery[]) => siblings.sort((a, b) => {
    const aPlacement = placements[a.chapterId] ?? "normal";
    const bPlacement = placements[b.chapterId] ?? "normal";
    if (aPlacement !== bPlacement) {
      return placementOrder[aPlacement] - placementOrder[bPlacement];
    }
    return (originalIndex.get(a.chapterId) ?? 0) - (originalIndex.get(b.chapterId) ?? 0);
  });

  const ordered: ChapterMastery[] = [];
  const visited = new Set<string>();
  const reachableFromRoots = new Set<string>();
  const markReachable = (item: ChapterMastery) => {
    if (reachableFromRoots.has(item.chapterId)) return;
    reachableFromRoots.add(item.chapterId);
    for (const child of childrenByParent.get(item.chapterId) ?? []) markReachable(child);
  };
  const visit = (item: ChapterMastery) => {
    if (visited.has(item.chapterId)) return;
    visited.add(item.chapterId);
    ordered.push(item);
    if (collapsedChapterIds.has(item.chapterId)) return;
    for (const child of sortSiblings([...(childrenByParent.get(item.chapterId) ?? [])])) {
      visit(child);
    }
  };

  const roots = sortSiblings([...(childrenByParent.get(null) ?? [])]);
  for (const root of roots) markReachable(root);
  for (const root of roots) visit(root);
  // Cyclic legacy data can have no root. Keep any remaining rows visible once.
  for (const item of mastery) {
    if (reachableFromRoots.has(item.chapterId)) continue;
    markReachable(item);
    visit(item);
  }

  return ordered;
}
