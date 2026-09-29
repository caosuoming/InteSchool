import type { Question } from "@/types";

export type RelatedQuestionGroupKey = "foundation" | "same" | "extension";

export type RelatedQuestionGroups = Record<RelatedQuestionGroupKey, Question[]>;

function normalizedKnowledgeIds(question: Question): Set<string> {
  return new Set((question.knowledgePointIds || []).filter(Boolean));
}

function isSubset(left: Set<string>, right: Set<string>): boolean {
  for (const id of left) {
    if (!right.has(id)) return false;
  }
  return true;
}

function rankQuestions(left: Question, right: Question): number {
  return (right.recommendation || 0) - (left.recommendation || 0)
    || (right.usageCount || 0) - (left.usageCount || 0)
    || right.updatedAt.localeCompare(left.updatedAt);
}

/**
 * Group replacement candidates by the relation between their knowledge-point
 * set and the source question's set.
 *
 * foundation: candidate is a proper subset of the source
 * same:       candidate has exactly the same knowledge points
 * extension:  candidate is a proper superset of the source
 */
export function groupRelatedQuestions(
  source: Question,
  candidates: Question[],
  excludedQuestionIds: ReadonlySet<string> = new Set(),
): RelatedQuestionGroups {
  const sourceKnowledgeIds = normalizedKnowledgeIds(source);
  const groups: RelatedQuestionGroups = {
    foundation: [],
    same: [],
    extension: [],
  };

  if (sourceKnowledgeIds.size === 0) return groups;

  for (const candidate of candidates) {
    if (candidate.id === source.id || excludedQuestionIds.has(candidate.id)) continue;
    const candidateKnowledgeIds = normalizedKnowledgeIds(candidate);
    if (candidateKnowledgeIds.size === 0) continue;

    const candidateWithinSource = isSubset(candidateKnowledgeIds, sourceKnowledgeIds);
    const sourceWithinCandidate = isSubset(sourceKnowledgeIds, candidateKnowledgeIds);

    if (candidateWithinSource && sourceWithinCandidate) {
      groups.same.push(candidate);
    } else if (candidateWithinSource) {
      groups.foundation.push(candidate);
    } else if (sourceWithinCandidate) {
      groups.extension.push(candidate);
    }
  }

  groups.foundation.sort(rankQuestions);
  groups.same.sort(rankQuestions);
  groups.extension.sort(rankQuestions);
  return groups;
}
