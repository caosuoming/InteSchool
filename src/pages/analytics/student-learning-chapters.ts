import type { StudentAnswerDetail } from "@/services/analytics";
import type { Chapter } from "@/types";
import {
  applyLearningTreePlacement,
  orderVisibleLearningTree,
  type LearningTreePlacement,
} from "./student-learning-tree";

export interface ChapterMastery {
  id: string;
  chapterId: string;
  chapterName: string;
  parentId: string | null;
  chapterPath: string[];
  level: number;
  order: number;
  totalAttempts: number;
  correctCount: number;
  partialCount: number;
  wrongCount: number;
  correctRate: number;
  masteryLevel: "mastered" | "basic" | "weak" | "untrained";
}

export type ChapterPlacement = LearningTreePlacement;

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
      id: chapter.id,
      chapterId: chapter.id,
      chapterName: chapter.name,
      parentId: chapter.parentId,
      chapterPath: path,
      level: chapter.level,
      order: chapter.order,
      totalAttempts: total,
      correctCount: correct,
      partialCount: partial,
      wrongCount: wrong,
      correctRate,
      masteryLevel,
    };
  });
}

export function applyChapterPlacement(
  placements: Readonly<Record<string, ChapterPlacement>>,
  selectedChapterIds: ReadonlySet<string>,
  placement: ChapterPlacement,
): Record<string, ChapterPlacement> {
  return applyLearningTreePlacement(placements, selectedChapterIds, placement);
}

export function orderVisibleChapterMastery(
  mastery: ChapterMastery[],
  placements: Readonly<Record<string, ChapterPlacement>>,
  collapsedChapterIds: ReadonlySet<string>,
): ChapterMastery[] {
  return orderVisibleLearningTree(mastery, placements, collapsedChapterIds);
}
