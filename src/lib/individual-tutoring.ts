import type { Chapter, KnowledgePoint, Question } from "@/types";
import type { KnowledgeMastery } from "@/services/analytics";

export type TutoringTopic = {
  id: string;
  name: string;
  level: "weak" | "untrained";
  questionCount: number;
};

export function chapterScope(chapters: Chapter[], selectedId: string): Set<string> {
  const selected = new Set<string>();
  if (!selectedId) return selected;
  const children = new Map<string, string[]>();
  for (const chapter of chapters) {
    if (!chapter.parentId) continue;
    children.set(chapter.parentId, [...(children.get(chapter.parentId) || []), chapter.id]);
  }
  const stack = [selectedId];
  while (stack.length) {
    const id = stack.pop()!;
    if (selected.has(id)) continue;
    selected.add(id);
    stack.push(...(children.get(id) || []));
  }
  return selected;
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
