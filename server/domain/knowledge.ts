import type {
  Chapter,
  DirectoryCatalog,
  DirectoryCatalogNode,
  DirectoryCatalogSummary,
  DirectoryDonation,
  DirectoryDonationAcceptMode,
  DirectoryDonationUpsertResult,
  KnowledgePoint,
  Question,
  TreeNode,
  TreeNodeType,
} from "../../src/types/index.js";
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

type DirectoryRecord = Chapter | KnowledgePoint;

type DirectoryTeacher = {
  id: string;
  schoolId?: string | null;
  subject?: string;
  nickname?: string;
  name?: string;
  affiliations?: Array<Record<string, unknown>>;
  currentAffiliationId?: string | null;
};

function directoryCollection(type: TreeNodeType): "chapters" | "knowledgePoints" {
  return type === "chapter" ? "chapters" : "knowledgePoints";
}

function directoryLabel(type: TreeNodeType): string {
  return type === "chapter" ? "章节课目录" : "知识点目录";
}

function directoryTeacher(teacherId: string): DirectoryTeacher {
  const teacher = ((db.read("teachers") || []) as DirectoryTeacher[]).find((item) => item.id === teacherId);
  if (!teacher) throw new Error("教师不存在");
  return teacher;
}

function currentAffiliation(teacher: DirectoryTeacher): Record<string, unknown> | undefined {
  return teacher.affiliations?.find((item) => item.id === teacher.currentAffiliationId)
    || teacher.affiliations?.find((item) => item.isCurrent === true);
}

function directoryTeacherContext(teacherId: string): {
  teacher: DirectoryTeacher;
  schoolId: string;
  subject: string;
  nickname: string;
} {
  const teacher = directoryTeacher(teacherId);
  const affiliation = currentAffiliation(teacher);
  const schoolId = (typeof affiliation?.schoolId === "string" ? affiliation.schoolId : teacher.schoolId)?.trim();
  if (!schoolId) throw new Error("请先完成学校认证");
  const subject = (typeof affiliation?.subject === "string" ? affiliation.subject : teacher.subject)?.trim() || "";
  const nickname = teacher.nickname?.trim() || teacher.name?.trim() || "匿名用户";
  return { teacher, schoolId, subject, nickname };
}

function directoryCatalogs(): DirectoryCatalog[] {
  return (db.read("directoryCatalogs") || []) as DirectoryCatalog[];
}

function directoryDonations(): DirectoryDonation[] {
  return (db.read("directoryDonations") || []) as DirectoryDonation[];
}

function snapshotDirectoryNodes(schoolId: string, type: TreeNodeType): DirectoryCatalogNode[] {
  const collection = directoryCollection(type);
  return ((db.read(collection) || []) as DirectoryRecord[])
    .filter((item) => item.schoolId === schoolId)
    .sort((left, right) => left.level - right.level || left.order - right.order)
    .map((item) => ({
      id: item.id,
      parentId: item.parentId,
      name: item.name,
      order: item.order,
      level: item.level,
      ...(type === "knowledge" && (item as KnowledgePoint).description
        ? { description: (item as KnowledgePoint).description }
        : {}),
    }));
}

function materializeDirectoryNodes(
  schoolId: string,
  type: TreeNodeType,
  nodes: DirectoryCatalogNode[],
): void {
  const collection = directoryCollection(type);
  const current = ((db.read(collection) || []) as DirectoryRecord[])
    .filter((item) => item.schoolId !== schoolId);
  const materialized: DirectoryRecord[] = nodes.map((node) => type === "chapter"
    ? {
        id: node.id,
        schoolId,
        parentId: node.parentId,
        name: node.name,
        order: node.order,
        level: node.level,
        questionCount: 0,
      } satisfies Chapter
    : {
        id: node.id,
        schoolId,
        parentId: node.parentId,
        name: node.name,
        description: node.description,
        order: node.order,
        level: node.level,
        questionCount: 0,
      } satisfies KnowledgePoint);
  db.write(collection, [...current, ...materialized]);
}

function toCatalogSummary(catalog: DirectoryCatalog): DirectoryCatalogSummary {
  return {
    id: catalog.id,
    schoolId: catalog.schoolId,
    type: catalog.type,
    name: catalog.name,
    nodeCount: catalog.nodes.length,
    isActive: catalog.isActive,
    createdAt: catalog.createdAt,
    updatedAt: catalog.updatedAt,
  };
}

function ensureDefaultDirectoryCatalog(schoolId: string, type: TreeNodeType): DirectoryCatalog {
  const scoped = directoryCatalogs().filter((item) => item.schoolId === schoolId && item.type === type);
  const active = scoped.find((item) => item.isActive);
  if (active) return active;

  if (scoped.length > 0) {
    const first = scoped[0];
    db.update("directoryCatalogs", (items: DirectoryCatalog[]) => items.map((item) =>
      item.schoolId === schoolId && item.type === type
        ? { ...item, isActive: item.id === first.id }
        : item,
    ));
    return { ...first, isActive: true };
  }

  const now = new Date().toISOString();
  const created: DirectoryCatalog = {
    id: genId("dircat"),
    schoolId,
    type,
    name: `默认${directoryLabel(type)}`,
    nodes: snapshotDirectoryNodes(schoolId, type),
    isActive: true,
    createdAt: now,
    updatedAt: now,
  };
  db.update("directoryCatalogs", (items: DirectoryCatalog[]) => [...(items || []), created]);
  return created;
}

function syncActiveDirectoryCatalog(schoolId: string, type: TreeNodeType): DirectoryCatalog {
  const active = ensureDefaultDirectoryCatalog(schoolId, type);
  const now = new Date().toISOString();
  const nodes = snapshotDirectoryNodes(schoolId, type);
  const updated = { ...active, nodes, updatedAt: now };
  db.update("directoryCatalogs", (items: DirectoryCatalog[]) => items.map((item) =>
    item.id === active.id ? updated : item,
  ));
  return updated;
}

function uniqueCatalogName(schoolId: string, type: TreeNodeType, baseName: string): string {
  const names = new Set(directoryCatalogs()
    .filter((item) => item.schoolId === schoolId && item.type === type)
    .map((item) => item.name));
  if (!names.has(baseName)) return baseName;
  let suffix = 2;
  while (names.has(`${baseName} ${suffix}`)) suffix += 1;
  return `${baseName} ${suffix}`;
}

function cloneDirectoryNodes(type: TreeNodeType, nodes: DirectoryCatalogNode[]): DirectoryCatalogNode[] {
  const idMap = new Map<string, string>();
  for (const node of nodes) idMap.set(node.id, genId(type === "chapter" ? "ch" : "kp"));
  return nodes.map((node) => ({
    ...structuredClone(node),
    id: idMap.get(node.id)!,
    parentId: node.parentId ? idMap.get(node.parentId) || null : null,
  }));
}

function mergeDirectorySnapshots(
  type: TreeNodeType,
  current: DirectoryCatalogNode[],
  incoming: DirectoryCatalogNode[],
): DirectoryCatalogNode[] {
  const merged = structuredClone(current);
  const incomingToMerged = new Map<string, string>();
  const ordered = [...incoming].sort((left, right) =>
    left.level - right.level || left.order - right.order,
  );

  for (const node of ordered) {
    const parentId = node.parentId ? incomingToMerged.get(node.parentId) || null : null;
    const existing = merged.find((candidate) =>
      candidate.parentId === parentId && candidate.name === node.name,
    );
    if (existing) {
      if (!existing.description && node.description) existing.description = node.description;
      incomingToMerged.set(node.id, existing.id);
      continue;
    }

    const order = merged
      .filter((candidate) => candidate.parentId === parentId)
      .reduce((maximum, candidate) => Math.max(maximum, candidate.order), 0) + 1;
    const created: DirectoryCatalogNode = {
      id: genId(type === "chapter" ? "ch" : "kp"),
      parentId,
      name: node.name,
      order,
      level: parentId
        ? (merged.find((candidate) => candidate.id === parentId)?.level ?? -1) + 1
        : 0,
      ...(node.description ? { description: node.description } : {}),
    };
    merged.push(created);
    incomingToMerged.set(node.id, created.id);
  }

  return merged;
}

const DIRECTORY_REFERENCE_COLLECTIONS = [
  "questions",
  "examPapers",
  "coursewares",
  "materials",
  "lectures",
  "lessonCoursewares",
  "schoolBackups",
] as const;

function replaceDirectoryIds(ids: string[], replacements: Map<string, string>): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    const replacement = replacements.get(id) ?? id;
    if (!seen.has(replacement)) {
      result.push(replacement);
      seen.add(replacement);
    }
  }
  return result;
}

function mergeDirectoryRecords<T extends DirectoryRecord>(
  input: T[],
  sourceId: string,
  targetId: string,
): { records: T[]; replacements: Map<string, string> } {
  if (sourceId === targetId) throw new Error("不能将节点合并到自身");

  const records = input.map((item) => ({ ...item }));
  const originalIndex = new Map(records.map((item, index) => [item.id, index]));
  const byId = new Map(records.map((item) => [item.id, item]));
  const source = byId.get(sourceId);
  const target = byId.get(targetId);
  if (!source || !target) throw new Error("待合并节点不存在");
  if (source.schoolId !== target.schoolId) throw new Error("不能合并不同学校的节点");
  if (source.parentId !== target.parentId) throw new Error("只能合并同一父节点下的子节点");

  const replacements = new Map<string, string>();

  const childrenOf = (parentId: string) => records
    .filter((item) => item.parentId === parentId && !replacements.has(item.id))
    .sort((left, right) =>
      left.order - right.order
      || (originalIndex.get(left.id) ?? 0) - (originalIndex.get(right.id) ?? 0));

  const mergePair = (currentSourceId: string, currentTargetId: string) => {
    const currentSource = byId.get(currentSourceId);
    const currentTarget = byId.get(currentTargetId);
    if (!currentSource || !currentTarget) throw new Error("待合并节点不存在");

    const targetChildren = childrenOf(currentTargetId);
    let nextOrder = targetChildren.reduce((maximum, child) => Math.max(maximum, child.order), 0);

    for (const sourceChild of childrenOf(currentSourceId)) {
      const sameNameTarget = targetChildren.find(
        (candidate) => candidate.name === sourceChild.name && !replacements.has(candidate.id),
      );
      if (sameNameTarget) {
        mergePair(sourceChild.id, sameNameTarget.id);
      } else {
        sourceChild.parentId = currentTargetId;
        sourceChild.order = ++nextOrder;
        targetChildren.push(sourceChild);
      }
    }

    const sourceDescription = (currentSource as KnowledgePoint).description;
    const targetDescription = (currentTarget as KnowledgePoint).description;
    if (!targetDescription && sourceDescription) {
      (currentTarget as KnowledgePoint).description = sourceDescription;
    }
    replacements.set(currentSourceId, currentTargetId);
  };

  mergePair(sourceId, targetId);

  const merged = records.filter((item) => !replacements.has(item.id));
  const siblingGroups = new Map<string, T[]>();
  for (const item of merged) {
    const key = `${item.schoolId}\u0000${item.parentId ?? ""}`;
    const group = siblingGroups.get(key) ?? [];
    group.push(item);
    siblingGroups.set(key, group);
  }
  for (const siblings of siblingGroups.values()) {
    siblings
      .sort((left, right) =>
        left.order - right.order
        || (originalIndex.get(left.id) ?? 0) - (originalIndex.get(right.id) ?? 0))
      .forEach((item, index) => {
        item.order = index + 1;
      });
  }

  return { records: merged, replacements };
}

function updateDirectoryReferences(
  type: "chapter" | "knowledge",
  replacements: Map<string, string>,
): void {
  const field = type === "chapter" ? "chapterIds" : "knowledgePointIds";
  for (const collection of DIRECTORY_REFERENCE_COLLECTIONS) {
    const records = db.read(collection);
    if (!Array.isArray(records)) continue;
    db.update(collection, (items: Array<Record<string, unknown>>) =>
      items.map((item) => {
        const ids = item[field];
        if (!Array.isArray(ids)) return item;
        const nextIds = replaceDirectoryIds(
          ids.filter((id): id is string => typeof id === "string"),
          replacements,
        );
        return nextIds.length === ids.length && nextIds.every((id, index) => id === ids[index])
          ? item
          : { ...item, [field]: nextIds };
      }),
    );
  }

  if (type === "chapter") {
    db.update("knowledgePoints", (points: KnowledgePoint[]) =>
      points.map((point) => {
        if (!point.chapterId || !replacements.has(point.chapterId)) return point;
        return { ...point, chapterId: replacements.get(point.chapterId) };
      }),
    );
  }
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

  async listDirectoryCatalogs(
    teacherId: string,
    type: TreeNodeType,
  ): Promise<DirectoryCatalogSummary[]> {
    await delay(100);
    const { schoolId } = directoryTeacherContext(teacherId);
    const scoped = directoryCatalogs()
      .filter((item) => item.schoolId === schoolId && item.type === type)
      .map(toCatalogSummary);
    if (scoped.length > 0) return scoped;

    const now = new Date().toISOString();
    return [{
      id: `current-${schoolId}-${type}`,
      schoolId,
      type,
      name: `默认${directoryLabel(type)}`,
      nodeCount: snapshotDirectoryNodes(schoolId, type).length,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    }];
  },

  async listDirectoryDonations(
    teacherId: string,
    type: TreeNodeType,
  ): Promise<DirectoryDonation[]> {
    await delay(100);
    const { subject } = directoryTeacherContext(teacherId);
    if (!subject) return [];
    return directoryDonations()
      .filter((item) => item.type === type && item.subject === subject)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .map((item) => structuredClone(item));
  },

  async donateDirectory(
    teacherId: string,
    type: TreeNodeType,
  ): Promise<DirectoryDonationUpsertResult> {
    await delay(150);
    const { schoolId, subject, nickname } = directoryTeacherContext(teacherId);
    if (!subject) throw new Error("请先在当前任教单位设置学科后再捐赠目录");
    const active = syncActiveDirectoryCatalog(schoolId, type);
    if (active.nodes.length === 0) throw new Error("目录为空，无法捐赠");

    const existing = directoryDonations().find((item) =>
      item.donorTeacherId === teacherId && item.subject === subject && item.type === type,
    );
    const now = new Date().toISOString();
    if (existing) {
      const updated: DirectoryDonation = {
        ...existing,
        donorSchoolId: schoolId,
        donorNickname: nickname,
        nodes: structuredClone(active.nodes),
        updatedAt: now,
      };
      db.update("directoryDonations", (items: DirectoryDonation[]) => (items || []).map((item) =>
        item.id === existing.id ? updated : item,
      ));
      return { donation: structuredClone(updated), replaced: true };
    }

    const created: DirectoryDonation = {
      id: genId("dirdonation"),
      donorTeacherId: teacherId,
      donorSchoolId: schoolId,
      donorNickname: nickname,
      subject,
      type,
      nodes: structuredClone(active.nodes),
      createdAt: now,
      updatedAt: now,
    };
    db.update("directoryDonations", (items: DirectoryDonation[]) => [...(items || []), created]);
    return { donation: structuredClone(created), replaced: false };
  },

  async acceptDirectoryDonation(
    teacherId: string,
    donationId: string,
    mode: DirectoryDonationAcceptMode,
  ): Promise<DirectoryCatalogSummary> {
    await delay(150);
    const { schoolId, subject } = directoryTeacherContext(teacherId);
    const donation = directoryDonations().find((item) => item.id === donationId);
    if (!donation) throw new Error("目录捐赠不存在");
    if (!subject || donation.subject !== subject) throw new Error("只能接受同学科的目录捐赠");
    if (mode !== "merge" && mode !== "new") throw new Error("目录接受方式不合法");

    const active = syncActiveDirectoryCatalog(schoolId, donation.type);
    const now = new Date().toISOString();
    if (mode === "merge") {
      const nodes = mergeDirectorySnapshots(donation.type, active.nodes, donation.nodes);
      const updated: DirectoryCatalog = { ...active, nodes, updatedAt: now };
      db.update("directoryCatalogs", (items: DirectoryCatalog[]) => (items || []).map((item) =>
        item.id === active.id ? updated : item,
      ));
      materializeDirectoryNodes(schoolId, donation.type, nodes);
      return toCatalogSummary(updated);
    }

    const nodes = cloneDirectoryNodes(donation.type, donation.nodes);
    const created: DirectoryCatalog = {
      id: genId("dircat"),
      schoolId,
      type: donation.type,
      name: uniqueCatalogName(schoolId, donation.type, `${donation.donorNickname}的${directoryLabel(donation.type)}`),
      nodes,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };
    db.update("directoryCatalogs", (items: DirectoryCatalog[]) => [
      ...(items || []).map((item) =>
        item.schoolId === schoolId && item.type === donation.type
          ? { ...item, isActive: false }
          : item,
      ),
      created,
    ]);
    materializeDirectoryNodes(schoolId, donation.type, nodes);
    return toCatalogSummary(created);
  },

  async activateDirectoryCatalog(
    teacherId: string,
    catalogId: string,
  ): Promise<DirectoryCatalogSummary> {
    await delay(150);
    const { schoolId } = directoryTeacherContext(teacherId);
    const target = directoryCatalogs().find((item) => item.id === catalogId);
    if (!target || target.schoolId !== schoolId) throw new Error("目录体系不存在");

    const current = syncActiveDirectoryCatalog(schoolId, target.type);
    if (current.id === target.id) return toCatalogSummary(current);

    const refreshedTarget = directoryCatalogs().find((item) => item.id === target.id) || target;
    const now = new Date().toISOString();
    db.update("directoryCatalogs", (items: DirectoryCatalog[]) => (items || []).map((item) =>
      item.schoolId === schoolId && item.type === target.type
        ? { ...item, isActive: item.id === target.id, updatedAt: item.id === target.id ? now : item.updatedAt }
        : item,
    ));
    materializeDirectoryNodes(schoolId, target.type, refreshedTarget.nodes);
    return toCatalogSummary({ ...refreshedTarget, isActive: true, updatedAt: now });
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

  // 将一个节点合并到同级目标节点；保留目标节点并迁移子节点和所有资源关联
  async mergeNodes(
    sourceId: string,
    targetId: string,
    type: "chapter" | "knowledge",
  ): Promise<void> {
    await delay(200);
    if (type === "chapter") {
      const { records, replacements } = mergeDirectoryRecords(
        db.read("chapters") as Chapter[],
        sourceId,
        targetId,
      );
      db.write("chapters", records);
      updateDirectoryReferences(type, replacements);
    } else {
      const { records, replacements } = mergeDirectoryRecords(
        db.read("knowledgePoints") as KnowledgePoint[],
        sourceId,
        targetId,
      );
      db.write("knowledgePoints", records);
      updateDirectoryReferences(type, replacements);
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
