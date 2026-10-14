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
 * Parent counts include descendants; direct counts exclude them.
 * Knowledge-point aliases with the same name are treated as one logical point.
 * Each question is counted at most once per node.
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

  const matchingQuestionIds = (ids: ReadonlySet<string>): Set<string> => {
    const matchingIds = new Set(ids);
    if (type === "knowledge") {
      for (const id of ids) {
        for (const aliasId of aliasesById.get(id) ?? []) matchingIds.add(aliasId);
      }
    }
    const matched = new Set<string>();
    for (const id of matchingIds) {
      for (const questionId of questionIdsByDirectoryId.get(id) ?? []) matched.add(questionId);
    }
    return matched;
  };

  const getProgress = (ids: ReadonlySet<string>) => {
    let doneCount: number | undefined;
    if (doneQuestionIds) {
      doneCount = 0;
      for (const id of ids) {
        if (doneQuestionIds.has(id)) doneCount += 1;
      }
    }
    let masteryRate: number | undefined;
    if (scoredProgressByQuestionId) {
      let correct = 0;
      let total = 0;
      for (const id of ids) {
        const progress = scoredProgressByQuestionId.get(id);
        if (!progress) continue;
        correct += progress.correct;
        total += progress.total;
      }
      if (total > 0) masteryRate = correct / total;
    }
    return { doneCount, masteryRate };
  };

  const annotate = (node: TreeNode): { node: TreeNode; subtreeIds: Set<string> } => {
    const annotatedChildren = node.children.map(annotate);
    const directIds = new Set(node.id === "root" ? [] : [node.id]);
    const subtreeIds = new Set(directIds);
    for (const child of annotatedChildren) {
      for (const id of child.subtreeIds) subtreeIds.add(id);
    }

    const directQuestionIds = matchingQuestionIds(directIds);
    const subtreeQuestionIds = matchingQuestionIds(subtreeIds);
    const directProgress = getProgress(directQuestionIds);
    const subtreeProgress = getProgress(subtreeQuestionIds);

    return {
      subtreeIds,
      node: {
        ...node,
        count: subtreeQuestionIds.size,
        directCount: directQuestionIds.size,
        doneCount: subtreeProgress.doneCount,
        directDoneCount: directProgress.doneCount,
        masteryRate: subtreeProgress.masteryRate,
        directMasteryRate: directProgress.masteryRate,
        children: annotatedChildren.map((child) => child.node),
      },
    };
  };

  return annotate(tree).node;
}
