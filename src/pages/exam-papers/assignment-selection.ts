import type { Basket, Question } from "@/types";

export function basketsForAudience(baskets: Basket[], classIds: string[], studentIds: string[]): Basket[] {
  if (classIds.length === 0) return [];
  const classes = new Set(classIds);
  const students = new Set(studentIds);
  return baskets.filter((basket) =>
    (basket.classIds || []).some((id) => classes.has(id))
    || (basket.studentIds || []).some((id) => students.has(id)),
  );
}

interface SelectionInput {
  questions: Question[];
  typeCounts: Record<string, number>;
  weakKnowledgeIds: Set<string>;
  untrainedKnowledgeIds: Set<string>;
  weakCount: number;
  untrainedCount: number;
  excludedIds: Set<string>;
}

export function selectAssignmentQuestions(input: SelectionInput) {
  const remaining = Object.fromEntries(Object.entries(input.typeCounts).map(([type, count]) => [type, Math.max(0, Math.floor(count))]));
  const seen = new Set(input.excludedIds);
  const selected: Question[] = [];
  const pool = input.questions.filter((q) => !seen.has(q.id) && (remaining[q.type] || 0) > 0)
    .map((q) => ({ question: q, random: Math.random() }))
    .sort((a, b) => b.question.recommendation - a.question.recommendation || a.random - b.random)
    .map(({ question }) => question);

  const pick = (count: number, predicate: (question: Question) => boolean) => {
    let picked = 0;
    for (const question of pool) {
      if (picked >= count) break;
      if (seen.has(question.id) || !remaining[question.type] || !predicate(question)) continue;
      selected.push(question);
      seen.add(question.id);
      remaining[question.type]--;
      picked++;
    }
    return picked;
  };

  const belongsTo = (question: Question, ids: Set<string>) =>
    question.knowledgePointIds.some((id) => ids.has(id));
  const weakPicked = pick(input.weakCount, (q) => belongsTo(q, input.weakKnowledgeIds));
  const untrainedPicked = pick(input.untrainedCount, (q) => belongsTo(q, input.untrainedKnowledgeIds));
  pick(Number.MAX_SAFE_INTEGER, () => true);

  return { questions: selected, weakPicked, untrainedPicked, remaining };
}

export function countSelectedQuestionFacets(questions: Question[]) {
  const types = new Map<string, number>();
  const knowledge = new Map<string, number>();
  for (const question of questions) {
    types.set(question.type, (types.get(question.type) || 0) + 1);
    for (const id of new Set(question.knowledgePointIds || [])) {
      knowledge.set(id, (knowledge.get(id) || 0) + 1);
    }
  }
  return { types, knowledge };
}

export function findSimilarAssignmentQuestions(
  source: Question,
  pool: Question[],
  excludedIds: ReadonlySet<string>,
): Question[] {
  const sourceKnowledge = new Set(source.knowledgePointIds || []);
  const similarity = (candidate: Question) => {
    const candidateKnowledge = new Set(candidate.knowledgePointIds || []);
    const overlap = [...candidateKnowledge].filter((id) => sourceKnowledge.has(id)).length;
    const exact = overlap === sourceKnowledge.size && overlap === candidateKnowledge.size;
    return { overlap, exact };
  };

  return pool.filter((candidate) => {
    if (candidate.id === source.id || excludedIds.has(candidate.id) || candidate.type !== source.type) return false;
    if (sourceKnowledge.size === 0) return (candidate.knowledgePointIds || []).length === 0;
    return similarity(candidate).overlap > 0;
  }).sort((a, b) => {
    const left = similarity(a);
    const right = similarity(b);
    return Number(right.exact) - Number(left.exact)
      || right.overlap - left.overlap
      || Math.abs(a.difficulty - source.difficulty) - Math.abs(b.difficulty - source.difficulty)
      || b.recommendation - a.recommendation
      || a.id.localeCompare(b.id);
  });
}
