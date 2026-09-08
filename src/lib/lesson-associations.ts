import type { KnowledgeMastery } from "@/services/analytics";
import type { Question, Student } from "@/types";

export function getStudentKnowledgeWeakness(
  mastery: readonly KnowledgeMastery[],
  knowledgePointIds: readonly string[],
): number | null {
  const targetIds = new Set(knowledgePointIds);
  if (targetIds.size === 0) return null;

  let attempts = 0;
  let earned = 0;
  for (const item of mastery) {
    if (!targetIds.has(item.knowledgePointId) || item.totalAttempts <= 0) continue;
    attempts += item.totalAttempts;
    earned += item.correctCount + item.partialCount * 0.5;
  }

  if (attempts === 0) return null;
  return Math.max(0, Math.min(1, 1 - earned / attempts));
}

export function rankLessonStudents(
  students: readonly Student[],
  followedStudentIds: ReadonlySet<string>,
  weaknessByStudentId: Readonly<Record<string, number | null | undefined>>,
  prioritizeWeakness: boolean,
): Student[] {
  return [...students].sort((left, right) => {
    if (prioritizeWeakness) {
      const leftWeakness = weaknessByStudentId[left.id];
      const rightWeakness = weaknessByStudentId[right.id];
      const leftKnown = leftWeakness !== null && leftWeakness !== undefined;
      const rightKnown = rightWeakness !== null && rightWeakness !== undefined;
      if (leftKnown !== rightKnown) return leftKnown ? -1 : 1;
      if (leftKnown && rightKnown && leftWeakness !== rightWeakness) {
        return rightWeakness! - leftWeakness!;
      }
    }

    const leftFollowed = followedStudentIds.has(left.id);
    const rightFollowed = followedStudentIds.has(right.id);
    if (leftFollowed !== rightFollowed) return leftFollowed ? -1 : 1;
    return left.name.localeCompare(right.name, "zh-CN");
  });
}

export function rankRelatedQuestions(
  source: Pick<Question, "id" | "chapterIds" | "knowledgePointIds">,
  candidates: readonly Question[],
): Question[] {
  const knowledgePointIds = new Set(source.knowledgePointIds || []);
  const chapterIds = new Set(source.chapterIds || []);

  return candidates
    .filter((question) => question.id !== source.id)
    .map((question) => ({
      question,
      knowledgeOverlap: (question.knowledgePointIds || []).filter((id) => knowledgePointIds.has(id)).length,
      chapterOverlap: (question.chapterIds || []).filter((id) => chapterIds.has(id)).length,
    }))
    .filter(({ knowledgeOverlap }) => knowledgeOverlap > 0)
    .sort((left, right) => (
      right.knowledgeOverlap - left.knowledgeOverlap
      || right.chapterOverlap - left.chapterOverlap
      || (right.question.recommendation || 0) - (left.question.recommendation || 0)
      || (right.question.usageCount || 0) - (left.question.usageCount || 0)
    ))
    .map(({ question }) => question);
}
