import type { Chapter, KnowledgePoint, Question, TreeNode } from "@/types";
import type { KnowledgeMastery } from "@/services/analytics";

export type TutoringTopic = {
  id: string;
  name: string;
  level: "weak" | "untrained";
  questionCount: number;
};

export function chapterScope(chapters: Pick<Chapter, "id" | "parentId">[], selectedIds: string | string[]): Set<string> {
  const selected = new Set<string>();
  const ids = typeof selectedIds === "string" ? (selectedIds ? [selectedIds] : []) : selectedIds;
  if (!ids.length) return selected;
  const children = new Map<string, string[]>();
  for (const chapter of chapters) {
    if (!chapter.parentId) continue;
    children.set(chapter.parentId, [...(children.get(chapter.parentId) || []), chapter.id]);
  }
  const stack = [...ids];
  while (stack.length) {
    const id = stack.pop()!;
    if (selected.has(id)) continue;
    selected.add(id);
    stack.push(...(children.get(id) || []));
  }
  return selected;
}

/** Compact a fully expanded checked set into parent selections only when every
 * descendant is checked. This preserves partial branches when a child is unchecked. */
export function compactChapterSelection(
  chapters: Pick<Chapter, "id" | "parentId">[],
  checkedIds: Iterable<string>,
): string[] {
  const checked = new Set(checkedIds);
  const byId = new Map(chapters.map((chapter) => [chapter.id, chapter]));
  const children = new Map<string, string[]>();
  for (const chapter of chapters) {
    if (!chapter.parentId || !byId.has(chapter.parentId)) continue;
    children.set(chapter.parentId, [...(children.get(chapter.parentId) || []), chapter.id]);
  }
  const fullyChecked = new Map<string, boolean>();
  const isFull = (id: string): boolean => {
    if (fullyChecked.has(id)) return fullyChecked.get(id)!;
    // Guard against malformed cyclic chapter data.
    fullyChecked.set(id, false);
    const full = checked.has(id) && (children.get(id) || []).every(isFull);
    fullyChecked.set(id, full);
    return full;
  };
  const result: string[] = [];
  const visit = (id: string) => {
    if (isFull(id)) result.push(id);
    else for (const child of children.get(id) || []) visit(child);
  };
  for (const chapter of chapters) {
    if (!chapter.parentId || !byId.has(chapter.parentId)) visit(chapter.id);
  }
  return result;
}

export function flattenChapterTree(tree: TreeNode | null): { id: string; name: string; parentId: string | null }[] {
  if (!tree) return [];
  const chapters: { id: string; name: string; parentId: string | null }[] = [];
  const visit = (node: TreeNode, parentId: string | null) => {
    chapters.push({ id: node.id, name: node.name, parentId });
    node.children.forEach((child) => visit(child, node.id));
  };
  tree.children.forEach((child) => visit(child, null));
  return chapters;
}

export function tutoringSuggestions(
  questions: Question[],
  scope: Set<string>,
  points: KnowledgePoint[],
  mastery: KnowledgeMastery[],
): { topics: TutoringTopic[]; questions: Question[] } {
  if (scope.size === 0) return { topics: [], questions: [] };
  const selectedQuestions = questions.filter((q) => q.chapterIds.some((id) => scope.has(id)));
  const rates = new Map(mastery.map((item) => [item.knowledgePointId, item]));
  const topicQuestions = new Map<string, number>();
  for (const question of selectedQuestions) {
    for (const id of new Set(question.knowledgePointIds)) {
      topicQuestions.set(id, (topicQuestions.get(id) || 0) + 1);
    }
  }
  const topics = points.filter((p) => topicQuestions.has(p.id))
    .map((p): TutoringTopic => ({
      id: p.id,
      name: p.name,
      level: rates.get(p.id)?.masteryLevel === "weak" ? "weak" : "untrained",
      questionCount: topicQuestions.get(p.id) || 0,
    }))
    .filter((p) => rates.get(p.id)?.masteryLevel === "weak"
      || rates.get(p.id)?.masteryLevel === "untrained"
      || !rates.has(p.id));
  const priority = new Map(topics.map((p) => [p.id, p.level === "weak" ? 2 : 1]));
  const eligible = selectedQuestions.filter((q) => q.knowledgePointIds.some((id) => priority.has(id)));
  eligible.sort((a, b) => {
    const aPriority = Math.max(0, ...a.knowledgePointIds.map((id) => priority.get(id) || 0));
    const bPriority = Math.max(0, ...b.knowledgePointIds.map((id) => priority.get(id) || 0));
    return bPriority - aPriority || b.recommendation - a.recommendation;
  });
  topics.sort((a, b) => (a.level === "weak" ? 0 : 1) - (b.level === "weak" ? 0 : 1));
  return { topics, questions: eligible };
}
