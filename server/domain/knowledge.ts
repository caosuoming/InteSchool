import type { Chapter, KnowledgePoint, Question, TreeNode } from "../../src/types/index.js";
import { db } from "../runtime-db.js";
import { delay, genId } from "../domain-shared.js";
import { annotateTreeWithQuestionCounts } from "./tree-counts.js";

// 收集某节点及其所有子孙 ID
function collectSubtree<T extends { id: string; parentId: string | null }>(
  list: T[],
  rootId: string,
): Set<string> {
  const result = new Set<string>([rootId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const item of list) {
      if (item.parentId && result.has(item.parentId) && !result.has(item.id)) {
        result.add(item.id);
        changed = true;
      }
    }
  }
  return result;
}

// 计算父节点的 level（null 表示顶级，返回 -1）
function getParentLevel<T extends { id: string; level: number }>(
  list: T[],
  parentId: string | null,
): number {
  return parentId ? list.find((item) => item.id === parentId)?.level ?? 0 : -1;
}

// 将扁平章节列表构建为树形结构
function buildChapterTree(chapters: Chapter[], parentId: string | null = null): TreeNode[] {
  return chapters
    .filter((c) => c.parentId === parentId)
    .sort((a, b) => a.order - b.order)
    .map((c) => ({
      id: c.id,
      name: c.name,
      type: "chapter" as const,
      count: 0,
      order: c.order,
      parentId: c.parentId,
      level: c.level,
      children: buildChapterTree(chapters, c.id),
    }));
}

function buildKnowledgeTree(
  points: KnowledgePoint[],
  parentId: string | null = null,
): TreeNode[] {
  return points
    .filter((p) => p.parentId === parentId)
    .sort((a, b) => a.order - b.order)
    .map((p) => ({
      id: p.id,
      name: p.name,
      type: "knowledge" as const,
      count: 0,
      order: p.order,
      parentId: p.parentId,
      level: p.level,
      children: buildKnowledgeTree(points, p.id),
    }));
}

// 获取与指定知识点同名的所有知识点ID（分身）
function getAliasIds(knowledgePointId: string, schoolId: string): string[] {
  const points = db.read("knowledgePoints").filter((p) => p.schoolId === schoolId);
  const target = points.find((p) => p.id === knowledgePointId);
  if (!target) return [knowledgePointId];
  return points.filter((p) => p.name === target.name).map((p) => p.id);
}

export const knowledgeService = {
  async listChapters(schoolId: string): Promise<Chapter[]> {
    await delay(200);
    return db.read("chapters").filter((c) => c.schoolId === schoolId);
  },

  async listKnowledgePoints(schoolId: string): Promise<KnowledgePoint[]> {
    await delay(200);
    return db.read("knowledgePoints").filter((p) => p.schoolId === schoolId);
  },

  // 获取与指定知识点同名的所有知识点ID（分身），供外部查询题目时使用
  getAliasIds(knowledgePointId: string, schoolId: string): string[] {
    return getAliasIds(knowledgePointId, schoolId);
  },

  async getChapterTree(schoolId: string): Promise<TreeNode> {
    await delay(300);
    const chapters = db.read("chapters").filter((c) => c.schoolId === schoolId);
    const questions = db.read("questions").filter((q: Question) => q.schoolId === schoolId);
    const tree: TreeNode = {
      id: "root",
      name: "全部章节",
      type: "chapter",
      count: 0,
      children: buildChapterTree(chapters, null),
    };
    return annotateTreeWithQuestionCounts(tree, questions, "chapter");
  },

  async getKnowledgeTree(schoolId: string): Promise<TreeNode> {
    await delay(300);
    const points = db.read("knowledgePoints").filter((p) => p.schoolId === schoolId);
    const questions = db.read("questions").filter((q: Question) => q.schoolId === schoolId);
    const tree: TreeNode = {
      id: "root",
      name: "全部知识点",
      type: "knowledge",
      count: 0,
      children: buildKnowledgeTree(points, null),
    };
    return annotateTreeWithQuestionCounts(tree, questions, "knowledge", points);
  },

  async addChapter(
    schoolId: string,
    parentId: string | null,
    name: string,
  ): Promise<Chapter> {
    await delay(300);
    const chapters = db.read("chapters");
    const parentLevel = parentId ? chapters.find((c) => c.id === parentId)?.level ?? 0 : -1;
    const siblings = chapters.filter((c) => c.parentId === parentId);
    const newChapter: Chapter = {
      id: genId("ch"),
      schoolId,
      parentId,
      name,
      order: siblings.length + 1,
      level: parentLevel + 1,
      questionCount: 0,
    };
    db.update("chapters", (list) => [...list, newChapter]);
    return newChapter;
  },

  async addKnowledgePoint(
    schoolId: string,
    parentId: string | null,
    name: string,
    questionCount: number = 0,
  ): Promise<KnowledgePoint> {
    await delay(300);
    const points = db.read("knowledgePoints");
    const parentLevel = parentId ? points.find((p) => p.id === parentId)?.level ?? 0 : -1;
    const siblings = points.filter((p) => p.parentId === parentId);
    const newPoint: KnowledgePoint = {
      id: genId("kp"),
      schoolId,
      parentId,
      name,
      order: siblings.length + 1,
      level: parentLevel + 1,
      questionCount,
    };
    db.update("knowledgePoints", (list) => [...list, newPoint]);
    return newPoint;
  },

  // 获取章节/知识点的全路径名（用于显示）
  getChapterPath(chapterId: string): string {
    const chapters = db.read("chapters");
    const path: string[] = [];
    let current: Chapter | undefined = chapters.find((c) => c.id === chapterId);
    while (current) {
      path.unshift(current.name);
      current = current.parentId ? chapters.find((c) => c.id === current!.parentId) : undefined;
    }
    return path.join(" / ");
  },

  getKnowledgePath(knowledgeId: string): string {
    const points = db.read("knowledgePoints");
    const path: string[] = [];
    let current: KnowledgePoint | undefined = points.find((p) => p.id === knowledgeId);
    while (current) {
      path.unshift(current.name);
      current = current.parentId ? points.find((p) => p.id === current!.parentId) : undefined;
    }
    return path.join(" / ");
  },

  // 改名
  async renameNode(id: string, type: "chapter" | "knowledge", newName: string): Promise<void> {
    await delay(200);
    if (type === "chapter") {
      db.update("chapters", (list) =>
        list.map((c) => (c.id === id ? { ...c, name: newName } : c)),
      );
    } else {
      db.update("knowledgePoints", (list) =>
        list.map((p) => (p.id === id ? { ...p, name: newName } : p)),
      );
    }
  },

  // 删除节点（级联删除所有子孙节点）
  async deleteNode(id: string, type: "chapter" | "knowledge"): Promise<void> {
    await delay(200);
    if (type === "chapter") {
      const list = db.read("chapters");
      const toDelete = collectSubtree(list, id);
      db.update("chapters", (l) => l.filter((c) => !toDelete.has(c.id)));
      // 清理题目中的章节关联
      db.update("questions", (l) =>
        l.map((q) => ({
          ...q,
          chapterIds: q.chapterIds.filter((cid) => !toDelete.has(cid)),
        })),
      );
    } else {
      const list = db.read("knowledgePoints");
      const toDelete = collectSubtree(list, id);

      // 删除前收集所有被删除节点的名称对应的其他分身ID
      const remainingAliasMap = new Map<string, string[]>();
      for (const deletedId of toDelete) {
        const deletedPoint = list.find((p) => p.id === deletedId);
        if (deletedPoint) {
          const schoolId = deletedPoint.schoolId;
          const remaining = list.filter(
            (p) => p.name === deletedPoint.name
              && !toDelete.has(p.id)
              && p.schoolId === schoolId,
          ).map((p) => p.id);
          if (remaining.length > 0) {
            remainingAliasMap.set(deletedId, remaining);
          }
        }
      }

      db.update("knowledgePoints", (l) => l.filter((p) => !toDelete.has(p.id)));

      // 清理题目中的知识点关联，并保留其他同名分身的关联
      db.update("questions", (l) =>
        l.map((q) => {
          const newKpIds = new Set<string>();
          for (const kid of q.knowledgePointIds) {
            if (!toDelete.has(kid)) {
              newKpIds.add(kid);
            } else {
              // 如果被删除的知识点有同名分身，添加分身ID
              const aliases = remainingAliasMap.get(kid);
              if (aliases) {
                aliases.forEach((aid) => newKpIds.add(aid));
              }
            }
          }
          return {
            ...q,
            knowledgePointIds: Array.from(newKpIds),
          };
        }),
      );
    }
  },

  // 移动节点到新的父节点下（null 表示顶级），并递归更新 level
  async moveNode(
    id: string,
    type: "chapter" | "knowledge",
    newParentId: string | null,
  ): Promise<void> {
    await delay(200);
    if (type === "chapter") {
      const list = db.read("chapters");
      const newLevel = getParentLevel(list, newParentId) + 1;
      const subtree = collectSubtree(list, id);
      const oldRootLevel = list.find((c) => c.id === id)?.level ?? newLevel;
      const levelDelta = newLevel - oldRootLevel;
      db.update("chapters", (l) =>
        l.map((c) => {
          if (c.id === id) return { ...c, parentId: newParentId, level: newLevel };
          if (subtree.has(c.id)) return { ...c, level: c.level + levelDelta };
          return c;
        }),
      );
    } else {
      const list = db.read("knowledgePoints");
      const newLevel = getParentLevel(list, newParentId) + 1;
      const subtree = collectSubtree(list, id);
      const oldRootLevel = list.find((p) => p.id === id)?.level ?? newLevel;
      const levelDelta = newLevel - oldRootLevel;
      db.update("knowledgePoints", (l) =>
        l.map((p) => {
          if (p.id === id) return { ...p, parentId: newParentId, level: newLevel };
          if (subtree.has(p.id)) return { ...p, level: p.level + levelDelta };
          return p;
        }),
      );
    }
  },

  // 重排同级节点顺序（按 ids 数组顺序写入 order 1,2,3...）
  async reorderSiblings(ids: string[], type: "chapter" | "knowledge"): Promise<void> {
    await delay(200);
    const orderMap = new Map<string, number>();
    ids.forEach((nid, idx) => orderMap.set(nid, idx + 1));
    if (type === "chapter") {
      db.update("chapters", (l) =>
        l.map((c) => (orderMap.has(c.id) ? { ...c, order: orderMap.get(c.id)! } : c)),
      );
    } else {
      db.update("knowledgePoints", (l) =>
        l.map((p) => (orderMap.has(p.id) ? { ...p, order: orderMap.get(p.id)! } : p)),
      );
    }
  },
};
