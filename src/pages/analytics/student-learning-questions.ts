import type { StudentAnswerDetail } from "@/services/analytics";
import type { Chapter, KnowledgePoint, Question } from "@/types";

export type StudentQuestionDirectoryView = "chapter" | "knowledge";

type DirectoryNode = {
  id: string;
  parentId?: string | null;
};

export function expandSelectedDirectoryIds<T extends DirectoryNode>(
  nodes: readonly T[],
  selectedIds: ReadonlySet<string>,
): Set<string> {
  if (selectedIds.size === 0) return new Set();

  const childrenByParent = new Map<string, string[]>();
  for (const node of nodes) {
    if (!node.parentId) continue;
    const children = childrenByParent.get(node.parentId) ?? [];
    children.push(node.id);
    childrenByParent.set(node.parentId, children);
  }

  const expanded = new Set(selectedIds);
  const queue = [...selectedIds];
  for (let index = 0; index < queue.length; index += 1) {
    const id = queue[index];
    for (const childId of childrenByParent.get(id) ?? []) {
      if (expanded.has(childId)) continue;
      expanded.add(childId);
      queue.push(childId);
    }
  }
  return expanded;
}

export function questionMatchesSelectedDirectories(
  question: Question,
  view: StudentQuestionDirectoryView,
  selectedChapterIds: ReadonlySet<string>,
  selectedKnowledgePointIds: ReadonlySet<string>,
): boolean {
  const selectedIds = view === "chapter" ? selectedChapterIds : selectedKnowledgePointIds;
  if (selectedIds.size === 0) return true;

  const questionIds = view === "chapter" ? question.chapterIds : question.knowledgePointIds;
  return questionIds.some((id) => selectedIds.has(id));
}

export function filterAnsweredQuestionDetails(
  details: readonly StudentAnswerDetail[],
  view: StudentQuestionDirectoryView,
  selectedChapterIds: ReadonlySet<string>,
  selectedKnowledgePointIds: ReadonlySet<string>,
): StudentAnswerDetail[] {
  const hasSelection = view === "chapter"
    ? selectedChapterIds.size > 0
    : selectedKnowledgePointIds.size > 0;

  if (!hasSelection) return [...details];
  return details.filter((detail) => detail.question && questionMatchesSelectedDirectories(
    detail.question,
    view,
    selectedChapterIds,
    selectedKnowledgePointIds,
  ));
}

export function filterUnansweredQuestions(
  questions: readonly Question[],
  details: readonly StudentAnswerDetail[],
  view: StudentQuestionDirectoryView,
  selectedChapterIds: ReadonlySet<string>,
  selectedKnowledgePointIds: ReadonlySet<string>,
): Question[] {
  const answeredQuestionIds = new Set(details.map((detail) => detail.record.questionId));
  return questions.filter((question) => (
    !answeredQuestionIds.has(question.id)
    && questionMatchesSelectedDirectories(
      question,
      view,
      selectedChapterIds,
      selectedKnowledgePointIds,
    )
  ));
}

export function expandedChapterSelection(
  chapters: readonly Chapter[],
  selectedChapterIds: ReadonlySet<string>,
): Set<string> {
  return expandSelectedDirectoryIds(chapters, selectedChapterIds);
}

export function expandedKnowledgePointSelection(
  knowledgePoints: readonly KnowledgePoint[],
  selectedKnowledgePointIds: ReadonlySet<string>,
): Set<string> {
  return expandSelectedDirectoryIds(knowledgePoints, selectedKnowledgePointIds);
}
