import type { KnowledgePoint, Question, TreeNode } from "../../src/types/index.js";

type DirectoryType = "chapter" | "knowledge";

function buildKnowledgeAliasMap(points: KnowledgePoint[]): Map<string, Set<string>> {
  const idsByName = new Map<string, Set<string>>();
  for (const point of points) {
    const ids = idsByName.get(point.name) ?? new Set<string>();
    ids.add(point.id);
    idsByName.set(point.name, ids);
  }

  const aliasesById = new Map<string, Set<string>>();
  for (const point of points) {
    aliasesById.set(point.id, idsByName.get(point.name) ?? new Set([point.id]));
  }
  return aliasesById;
}

/**
 * Derive directory counts from the current question collection.
 * Parent counts include descendants, while each question is counted at most once.
 */
export function annotateTreeWithQuestionCounts(
  tree: TreeNode,
  questions: Question[],
  type: DirectoryType,
  knowledgePoints: KnowledgePoint[] = [],
  doneQuestionIds?: ReadonlySet<string>,
  scoredProgressByQuestionId?: ReadonlyMap<string, { correct: number; total: number }>,
): TreeNode {
  const aliasesById = type === "knowledge"
    ? buildKnowledgeAliasMap(knowledgePoints)
    : new Map<string, Set<string>>();
  const field: "chapterIds" | "knowledgePointIds" = type === "chapter"
    ? "chapterIds"
    : "knowledgePointIds";
  const questionIdsByDirectoryId = new Map<string, Set<string>>();
  for (const question of questions) {
    for (const directoryId of question[field]) {
      const questionIds = questionIdsByDirectoryId.get(directoryId) ?? new Set<string>();
      questionIds.add(question.id);
      questionIdsByDirectoryId.set(directoryId, questionIds);
    }
  }

  const annotate = (node: TreeNode): { node: TreeNode; subtreeIds: Set<string> } => {
    const annotatedChildren = node.children.map(annotate);
    const subtreeIds = new Set<string>();
    if (node.id !== "root") subtreeIds.add(node.id);
    for (const child of annotatedChildren) {
      for (const id of child.subtreeIds) subtreeIds.add(id);
    }

    const matchingIds = new Set(subtreeIds);
    if (type === "knowledge") {
      for (const id of subtreeIds) {
        for (const aliasId of aliasesById.get(id) ?? []) matchingIds.add(aliasId);
      }
    }

    const matchedQuestionIds = new Set<string>();
    for (const id of matchingIds) {
      for (const questionId of questionIdsByDirectoryId.get(id) ?? []) {
        matchedQuestionIds.add(questionId);
      }
    }
    let doneCount: number | undefined;
    if (doneQuestionIds) {
      doneCount = 0;
      for (const questionId of matchedQuestionIds) {
        if (doneQuestionIds.has(questionId)) doneCount += 1;
      }
    }

    let masteryRate: number | undefined;
    if (scoredProgressByQuestionId) {
      let correct = 0;
      let total = 0;
      for (const questionId of matchedQuestionIds) {
        const progress = scoredProgressByQuestionId.get(questionId);
        if (!progress) continue;
        correct += progress.correct;
        total += progress.total;
      }
      if (total > 0) masteryRate = correct / total;
    }

    return {
      subtreeIds,
      node: {
        ...node,
        count: matchedQuestionIds.size,
        doneCount,
        masteryRate,
        children: annotatedChildren.map((child) => child.node),
      },
    };
  };

  return annotate(tree).node;
}
