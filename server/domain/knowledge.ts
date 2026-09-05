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

type MovableDirectoryRecord = {
  id: string;
  schoolId: string;
  teacherId?: string;
  parentId: string | null;
  name: string;
  order: number;
  level: number;
};

function moveDirectoryRecord<T extends MovableDirectoryRecord>(
  list: T[],
  id: string,
  newParentId: string | null,
): T[] {
  const source = list.find((item) => item.id === id);
  if (!source) throw new Error("节点不存在");
  if (source.parentId === newParentId) return list;

  const subtree = collectSubtree(list, id);
  if (newParentId && subtree.has(newParentId)) {
    throw new Error("不能将节点移动到自身或其子节点下");
  }

  const parent = newParentId
    ? list.find((item) => item.id === newParentId)
    : undefined;
  if (newParentId && !parent) throw new Error("目标父节点不存在");
  if (parent && parent.schoolId !== source.schoolId) {
    throw new Error("不能跨学校移动目录节点");
  }

  const duplicateSibling = list.some(
    (item) =>
      item.id !== id &&
      item.schoolId === source.schoolId &&
      item.parentId === newParentId &&
      item.name === source.name,
  );
  if (duplicateSibling) throw new Error("目标父节点下已存在同名节点");

  const newLevel = parent ? parent.level + 1 : 0;
  const levelDelta = newLevel - source.level;
  const targetSiblings = list.filter(
    (item) =>
      item.id !== id &&
      item.schoolId === source.schoolId &&
      item.parentId === newParentId,
  );
  const newOrder =
    targetSiblings.reduce((max, item) => Math.max(max, item.order), 0) + 1;

  return list.map((item) => {
    if (item.id === id) {
      return {
        ...item,
        parentId: newParentId,
        level: newLevel,
        order: newOrder,
      };
    }
    if (subtree.has(item.id))
      return { ...item, level: item.level + levelDelta };
    return item;
  });
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

function directoryCollection(
  type: TreeNodeType,
): "chapters" | "knowledgePoints" {
  return type === "chapter" ? "chapters" : "knowledgePoints";
}

function directoryLabel(type: TreeNodeType): string {
  return type === "chapter" ? "章节课目录" : "知识点目录";
}

function directoryTeacher(teacherId: string): DirectoryTeacher {
  const teacher = ((db.read("teachers") || []) as DirectoryTeacher[]).find(
    (item) => item.id === teacherId,
  );
  if (!teacher) throw new Error("教师不存在");
  return teacher;
}

function currentAffiliation(
  teacher: DirectoryTeacher,
): Record<string, unknown> | undefined {
  return (
    teacher.affiliations?.find(
      (item) => item.id === teacher.currentAffiliationId,
    ) || teacher.affiliations?.find((item) => item.isCurrent === true)
  );
}

function directoryTeacherContext(teacherId: string): {
  teacher: DirectoryTeacher;
  schoolId: string | null;
  subject: string;
  nickname: string;
} {
  const teacher = directoryTeacher(teacherId);
  const affiliation = currentAffiliation(teacher);
  const schoolId =
    (typeof affiliation?.schoolId === "string"
      ? affiliation.schoolId
      : teacher.schoolId
    )?.trim() || null;
  const subject =
    (typeof affiliation?.subject === "string"
      ? affiliation.subject
      : teacher.subject
    )?.trim() || "";
  const nickname =
    teacher.nickname?.trim() || teacher.name?.trim() || "匿名用户";
  return { teacher, schoolId, subject, nickname };
}

function directoryCatalogs(): DirectoryCatalog[] {
  return (db.read("directoryCatalogs") || []) as DirectoryCatalog[];
}

function directoryDonations(): DirectoryDonation[] {
  return (db.read("directoryDonations") || []) as DirectoryDonation[];
}

const PERSONAL_DIRECTORY_PREFIX = "personal-directory:";
const DIRECTORY_OWNER_KEYS = [
  "teacherId",
  "ownerId",
  "createdBy",
  "fromTeacherId",
  "publisherId",
] as const;

function personalDirectorySchoolId(teacherId: string): string {
  return `${PERSONAL_DIRECTORY_PREFIX}${teacherId}`;
}

function directoryTeacherSchoolIds(teacher: DirectoryTeacher): Set<string> {
  const result = new Set<string>();
  if (teacher.schoolId?.trim()) result.add(teacher.schoolId.trim());
  for (const affiliation of teacher.affiliations || []) {
    if (
      typeof affiliation.schoolId === "string" &&
      affiliation.schoolId.trim()
    ) {
      result.add(affiliation.schoolId.trim());
    }
  }
  return result;
}

function directoryRecordOwner(record: Record<string, unknown>): string | null {
  for (const key of DIRECTORY_OWNER_KEYS) {
    if (typeof record[key] === "string") return record[key] as string;
  }
  return null;
}

function remapTeacherDirectoryReferences(
  teacherId: string,
  type: TreeNodeType,
  replacements: Map<string, string>,
): void {
  if (replacements.size === 0) return;
  const field = type === "chapter" ? "chapterIds" : "knowledgePointIds";
  for (const collection of DIRECTORY_REFERENCE_COLLECTIONS) {
    const records = db.read(collection);
    if (!Array.isArray(records)) continue;
    db.update(collection, (items: Array<Record<string, unknown>>) =>
      items.map((item) => {
        if (
          directoryRecordOwner(item) !== teacherId ||
          !Array.isArray(item[field])
        )
          return item;
        const ids = (item[field] as unknown[]).filter(
          (id): id is string => typeof id === "string",
        );
        const nextIds = replaceDirectoryIds(ids, replacements);
        return nextIds.length === ids.length &&
          nextIds.every((id, index) => id === ids[index])
          ? item
          : { ...item, [field]: nextIds };
      }),
    );
  }
}

function ensurePersonalDirectoryCatalogs(teacherId: string, type: TreeNodeType): void {
  if (directoryCatalogs().some((item) => item.teacherId === teacherId && item.type === type)) return;

  const teacher = directoryTeacher(teacherId);
  const schoolIds = directoryTeacherSchoolIds(teacher);
  const affiliation = currentAffiliation(teacher);
  const currentSchoolId = typeof affiliation?.schoolId === "string" ? affiliation.schoolId : teacher.schoolId;
  const legacy = directoryCatalogs().filter(
    (item) => !item.teacherId && item.type === type && schoolIds.has(item.schoolId),
  );
  if (legacy.length === 0) return;

  const preferred = legacy.find((item) => item.schoolId === currentSchoolId && item.isActive)
    || legacy.find((item) => item.schoolId === currentSchoolId)
    || legacy.find((item) => item.isActive)
    || legacy[0];
  const ordered = [preferred, ...legacy.filter((item) => item.id !== preferred.id)];
  const names = new Set<string>();
  const schoolId = personalDirectorySchoolId(teacherId);
  const migrated = ordered.map((item) => {
    const baseName = item.name;
    let name = baseName;
    let suffix = 2;
    while (names.has(name)) {
      name = `${baseName} ${suffix}`;
      suffix += 1;
    }
    names.add(name);
    return {
      ...item,
      id: genId("dircat"),
      schoolId,
      teacherId,
      name,
      nodes: cloneDirectoryNodes(type, item.nodes),
      isActive: false,
    } satisfies DirectoryCatalog;
  });
  db.update("directoryCatalogs", (items: DirectoryCatalog[]) => [...(items || []), ...migrated]);
}

function ensurePersonalDirectory(teacherId: string, type: TreeNodeType): void {
  const teacher = directoryTeacher(teacherId);
  const collection = directoryCollection(type);
  const records = (db.read(collection) || []) as DirectoryRecord[];
  const hasPersonalCatalog = directoryCatalogs().some(
    (item) => item.teacherId === teacherId && item.type === type,
  );
  if (records.some((item) => item.teacherId === teacherId) || hasPersonalCatalog) {
    ensurePersonalDirectoryCatalogs(teacherId, type);
    return;
  }

  const schoolIds = directoryTeacherSchoolIds(teacher);
  const legacy = records
    .filter((item) => !item.teacherId && schoolIds.has(item.schoolId))
    .sort(
      (left, right) => left.level - right.level || left.order - right.order,
    );
  if (legacy.length === 0) {
    ensurePersonalDirectoryCatalogs(teacherId, type);
    return;
  }

  const storageSchoolId = personalDirectorySchoolId(teacherId);
  const personal: DirectoryRecord[] = [];
  const scopedIdMap = new Map<string, string>();
  const replacements = new Map<string, string>();

  for (const item of legacy) {
    const parentId = item.parentId
      ? scopedIdMap.get(`${item.schoolId}\u0000${item.parentId}`) || null
      : null;
    let target = personal.find(
      (candidate) =>
        candidate.parentId === parentId && candidate.name === item.name,
    );
    if (!target) {
      target =
        type === "chapter"
          ? ({
              ...item,
              id: genId("ch"),
              schoolId: storageSchoolId,
              teacherId,
              parentId,
              order:
                personal.filter((candidate) => candidate.parentId === parentId)
                  .length + 1,
            } satisfies Chapter)
          : ({
              ...item,
              id: genId("kp"),
              schoolId: storageSchoolId,
              teacherId,
              parentId,
              order:
                personal.filter((candidate) => candidate.parentId === parentId)
                  .length + 1,
            } satisfies KnowledgePoint);
      personal.push(target);
    } else if (
      type === "knowledge" &&
      !(target as KnowledgePoint).description &&
      (item as KnowledgePoint).description
    ) {
      (target as KnowledgePoint).description = (
        item as KnowledgePoint
      ).description;
    }
    scopedIdMap.set(`${item.schoolId}\u0000${item.id}`, target.id);
    replacements.set(item.id, target.id);
  }

  db.write(collection, [...records, ...personal]);
  remapTeacherDirectoryReferences(teacherId, type, replacements);
  ensurePersonalDirectoryCatalogs(teacherId, type);
}

function directoryRecords(
  scopeId: string,
  type: TreeNodeType,
): DirectoryRecord[] {
  const collection = directoryCollection(type);
  const teacher = ((db.read("teachers") || []) as DirectoryTeacher[]).find(
    (item) => item.id === scopeId,
  );
  if (teacher) {
    ensurePersonalDirectory(scopeId, type);
    return ((db.read(collection) || []) as DirectoryRecord[]).filter(
      (item) => item.teacherId === scopeId,
    );
  }
  return ((db.read(collection) || []) as DirectoryRecord[]).filter(
    (item) => !item.teacherId && item.schoolId === scopeId,
  );
}

function snapshotDirectoryNodes(
  scopeId: string,
  type: TreeNodeType,
): DirectoryCatalogNode[] {
  return directoryRecords(scopeId, type)
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
  teacherId: string,
  type: TreeNodeType,
  nodes: DirectoryCatalogNode[],
): void {
  const collection = directoryCollection(type);
  const current = ((db.read(collection) || []) as DirectoryRecord[]).filter(
    (item) => item.teacherId !== teacherId,
  );
  const schoolId = personalDirectorySchoolId(teacherId);
  const materialized: DirectoryRecord[] = nodes.map((node) =>
    type === "chapter"
      ? ({
          id: node.id,
          schoolId,
          teacherId,
          parentId: node.parentId,
          name: node.name,
          order: node.order,
          level: node.level,
          questionCount: 0,
        } satisfies Chapter)
      : ({
          id: node.id,
          schoolId,
          teacherId,
          parentId: node.parentId,
          name: node.name,
          description: node.description,
          order: node.order,
          level: node.level,
          questionCount: 0,
        } satisfies KnowledgePoint),
  );
  db.write(collection, [...current, ...materialized]);
}

function toCatalogSummary(catalog: DirectoryCatalog): DirectoryCatalogSummary {
  return {
    id: catalog.id,
    schoolId: catalog.schoolId,
    teacherId: catalog.teacherId,
    type: catalog.type,
    name: catalog.name,
    nodeCount: catalog.nodes.length,
    isActive: catalog.isActive,
    createdAt: catalog.createdAt,
    updatedAt: catalog.updatedAt,
  };
}

function ensureDefaultDirectoryCatalog(
  teacherId: string,
  type: TreeNodeType,
): DirectoryCatalog {
  ensurePersonalDirectory(teacherId, type);
  const scoped = directoryCatalogs().filter(
    (item) => item.teacherId === teacherId && item.type === type,
  );
  const active = scoped.find((item) => item.isActive);
  if (active) return active;

  if (scoped.length > 0) {
    const first = scoped[0];
    db.update("directoryCatalogs", (items: DirectoryCatalog[]) =>
      items.map((item) =>
        item.teacherId === teacherId && item.type === type
          ? { ...item, isActive: item.id === first.id }
          : item,
      ),
    );
    return { ...first, isActive: true };
  }

  const now = new Date().toISOString();
  const created: DirectoryCatalog = {
    id: genId("dircat"),
    schoolId: personalDirectorySchoolId(teacherId),
    teacherId,
    type,
    name: `默认${directoryLabel(type)}`,
    nodes: snapshotDirectoryNodes(teacherId, type),
    isActive: true,
    createdAt: now,
    updatedAt: now,
  };
  db.update("directoryCatalogs", (items: DirectoryCatalog[]) => [
    ...(items || []),
    created,
  ]);
  return created;
}

function syncActiveDirectoryCatalog(
  teacherId: string,
  type: TreeNodeType,
): DirectoryCatalog {
  const active = ensureDefaultDirectoryCatalog(teacherId, type);
  const now = new Date().toISOString();
  const nodes = snapshotDirectoryNodes(teacherId, type);
  const updated = { ...active, nodes, updatedAt: now };
  db.update("directoryCatalogs", (items: DirectoryCatalog[]) =>
    items.map((item) => (item.id === active.id ? updated : item)),
  );
  return updated;
}

function uniqueCatalogName(
  teacherId: string,
  type: TreeNodeType,
  baseName: string,
): string {
  const names = new Set(
    directoryCatalogs()
      .filter((item) => item.teacherId === teacherId && item.type === type)
      .map((item) => item.name),
  );
  if (!names.has(baseName)) return baseName;
  let suffix = 2;
  while (names.has(`${baseName} ${suffix}`)) suffix += 1;
  return `${baseName} ${suffix}`;
}

function cloneDirectoryNodes(
  type: TreeNodeType,
  nodes: DirectoryCatalogNode[],
): DirectoryCatalogNode[] {
  const idMap = new Map<string, string>();
  for (const node of nodes)
    idMap.set(node.id, genId(type === "chapter" ? "ch" : "kp"));
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
  const ordered = [...incoming].sort(
    (left, right) => left.level - right.level || left.order - right.order,
  );

  for (const node of ordered) {
    const parentId = node.parentId
      ? incomingToMerged.get(node.parentId) || null
      : null;
    const existing = merged.find(
      (candidate) =>
        candidate.parentId === parentId && candidate.name === node.name,
    );
    if (existing) {
      if (!existing.description && node.description)
        existing.description = node.description;
      incomingToMerged.set(node.id, existing.id);
      continue;
    }

    const order =
      merged
        .filter((candidate) => candidate.parentId === parentId)
        .reduce((maximum, candidate) => Math.max(maximum, candidate.order), 0) +
      1;
    const created: DirectoryCatalogNode = {
      id: genId(type === "chapter" ? "ch" : "kp"),
      parentId,
      name: node.name,
      order,
      level: parentId
        ? (merged.find((candidate) => candidate.id === parentId)?.level ?? -1) +
          1
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

function replaceDirectoryIds(
  ids: string[],
  replacements: Map<string, string>,
): string[] {
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
  if (source.schoolId !== target.schoolId)
    throw new Error("不能合并不同学校的节点");
  if (source.parentId !== target.parentId)
    throw new Error("只能合并同一父节点下的子节点");

  const replacements = new Map<string, string>();

  const childrenOf = (parentId: string) =>
    records
      .filter(
        (item) => item.parentId === parentId && !replacements.has(item.id),
      )
      .sort(
        (left, right) =>
          left.order - right.order ||
          (originalIndex.get(left.id) ?? 0) -
            (originalIndex.get(right.id) ?? 0),
      );

  const mergePair = (currentSourceId: string, currentTargetId: string) => {
    const currentSource = byId.get(currentSourceId);
    const currentTarget = byId.get(currentTargetId);
    if (!currentSource || !currentTarget) throw new Error("待合并节点不存在");

    const targetChildren = childrenOf(currentTargetId);
    let nextOrder = targetChildren.reduce(
      (maximum, child) => Math.max(maximum, child.order),
      0,
    );

    for (const sourceChild of childrenOf(currentSourceId)) {
      const sameNameTarget = targetChildren.find(
        (candidate) =>
          candidate.name === sourceChild.name &&
          !replacements.has(candidate.id),
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
      .sort(
        (left, right) =>
          left.order - right.order ||
          (originalIndex.get(left.id) ?? 0) -
            (originalIndex.get(right.id) ?? 0),
      )
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
        return nextIds.length === ids.length &&
          nextIds.every((id, index) => id === ids[index])
          ? item
          : { ...item, [field]: nextIds };
      }),
    );
  }

  if (type === "chapter") {
    db.update("knowledgePoints", (points: KnowledgePoint[]) =>
      points.map((point) => {
        if (!point.chapterId || !replacements.has(point.chapterId))
          return point;
        return { ...point, chapterId: replacements.get(point.chapterId) };
      }),
    );
  }
}

// 将扁平章节列表构建为树形结构
function buildChapterTree(
  chapters: Chapter[],
  parentId: string | null = null,
): TreeNode[] {
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
function getAliasIds(knowledgePointId: string, scopeId: string): string[] {
  const points = directoryRecords(scopeId, "knowledge") as KnowledgePoint[];
  const target = points.find((p) => p.id === knowledgePointId);
  if (!target) return [knowledgePointId];
  return points.filter((p) => p.name === target.name).map((p) => p.id);
}

function directoryQuestions(scopeId: string): Question[] {
  const isTeacherScope = ((db.read("teachers") || []) as DirectoryTeacher[]).some((item) => item.id === scopeId);
  return (db.read("questions") as Question[]).filter((question) =>
    isTeacherScope ? question.teacherId === scopeId : question.schoolId === scopeId,
  );
}

export const knowledgeService = {
  async listChapters(scopeId: string): Promise<Chapter[]> {
    await delay(200);
    return directoryRecords(scopeId, "chapter") as Chapter[];
  },

  async listKnowledgePoints(scopeId: string): Promise<KnowledgePoint[]> {
    await delay(200);
    return directoryRecords(scopeId, "knowledge") as KnowledgePoint[];
  },

  // 获取与指定知识点同名的所有知识点ID（分身），供外部查询题目时使用
  getAliasIds(knowledgePointId: string, scopeId: string): string[] {
    return getAliasIds(knowledgePointId, scopeId);
  },

  async getChapterTree(scopeId: string): Promise<TreeNode> {
    await delay(300);
    const chapters = directoryRecords(scopeId, "chapter") as Chapter[];
    const tree: TreeNode = {
      id: "root",
      name: "全部章节",
      type: "chapter",
      count: 0,
      children: buildChapterTree(chapters, null),
    };
    return annotateTreeWithQuestionCounts(tree, directoryQuestions(scopeId), "chapter");
  },

  async getKnowledgeTree(scopeId: string): Promise<TreeNode> {
    await delay(300);
    const points = directoryRecords(scopeId, "knowledge") as KnowledgePoint[];
    const tree: TreeNode = {
      id: "root",
      name: "全部知识点",
      type: "knowledge",
      count: 0,
      children: buildKnowledgeTree(points, null),
    };
    return annotateTreeWithQuestionCounts(tree, directoryQuestions(scopeId), "knowledge", points);
  },

  async listDirectoryCatalogs(
    teacherId: string,
    type: TreeNodeType,
  ): Promise<DirectoryCatalogSummary[]> {
    await delay(100);
    syncActiveDirectoryCatalog(teacherId, type);
    return directoryCatalogs()
      .filter((item) => item.teacherId === teacherId && item.type === type)
      .map(toCatalogSummary);
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
    const active = syncActiveDirectoryCatalog(teacherId, type);
    if (active.nodes.length === 0) throw new Error("目录为空，无法捐赠");

    const existing = directoryDonations().find(
      (item) =>
        item.donorTeacherId === teacherId &&
        item.subject === subject &&
        item.type === type,
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
      db.update("directoryDonations", (items: DirectoryDonation[]) =>
        (items || []).map((item) => (item.id === existing.id ? updated : item)),
      );
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
    db.update("directoryDonations", (items: DirectoryDonation[]) => [
      ...(items || []),
      created,
    ]);
    return { donation: structuredClone(created), replaced: false };
  },

  async acceptDirectoryDonation(
    teacherId: string,
    donationId: string,
    mode: DirectoryDonationAcceptMode,
  ): Promise<DirectoryCatalogSummary> {
    await delay(150);
    const { subject } = directoryTeacherContext(teacherId);
    const donation = directoryDonations().find(
      (item) => item.id === donationId,
    );
    if (!donation) throw new Error("目录捐赠不存在");
    if (!subject || donation.subject !== subject)
      throw new Error("只能接受同学科的目录捐赠");
    if (mode !== "merge" && mode !== "new")
      throw new Error("目录接受方式不合法");

    const active = syncActiveDirectoryCatalog(teacherId, donation.type);
    const now = new Date().toISOString();
    if (mode === "merge") {
      const nodes = mergeDirectorySnapshots(
        donation.type,
        active.nodes,
        donation.nodes,
      );
      const updated: DirectoryCatalog = { ...active, nodes, updatedAt: now };
      db.update("directoryCatalogs", (items: DirectoryCatalog[]) =>
        (items || []).map((item) => (item.id === active.id ? updated : item)),
      );
      materializeDirectoryNodes(teacherId, donation.type, nodes);
      return toCatalogSummary(updated);
    }

    const nodes = cloneDirectoryNodes(donation.type, donation.nodes);
    const created: DirectoryCatalog = {
      id: genId("dircat"),
      schoolId: personalDirectorySchoolId(teacherId),
      teacherId,
      type: donation.type,
      name: uniqueCatalogName(
        teacherId,
        donation.type,
        `${donation.donorNickname}的${directoryLabel(donation.type)}`,
      ),
      nodes,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };
    db.update("directoryCatalogs", (items: DirectoryCatalog[]) => [
      ...(items || []).map((item) =>
        item.teacherId === teacherId && item.type === donation.type
          ? { ...item, isActive: false }
          : item,
      ),
      created,
    ]);
    materializeDirectoryNodes(teacherId, donation.type, nodes);
    return toCatalogSummary(created);
  },

  async activateDirectoryCatalog(
    teacherId: string,
    catalogId: string,
  ): Promise<DirectoryCatalogSummary> {
    await delay(150);
    const target = directoryCatalogs().find((item) => item.id === catalogId);
    if (!target || target.teacherId !== teacherId) throw new Error("目录体系不存在");

    const current = syncActiveDirectoryCatalog(teacherId, target.type);
    if (current.id === target.id) return toCatalogSummary(current);

    const refreshedTarget = directoryCatalogs().find((item) => item.id === target.id) || target;
    const now = new Date().toISOString();
    db.update("directoryCatalogs", (items: DirectoryCatalog[]) =>
      (items || []).map((item) =>
        item.teacherId === teacherId && item.type === target.type
          ? {
              ...item,
              isActive: item.id === target.id,
              updatedAt: item.id === target.id ? now : item.updatedAt,
            }
          : item,
      ),
    );
    materializeDirectoryNodes(teacherId, target.type, refreshedTarget.nodes);
    return toCatalogSummary({ ...refreshedTarget, isActive: true, updatedAt: now });
  },

  async addChapter(
    scopeId: string,
    parentId: string | null,
    name: string,
  ): Promise<Chapter> {
    await delay(300);
    const chapters = directoryRecords(scopeId, "chapter") as Chapter[];
    const teacher = ((db.read("teachers") || []) as DirectoryTeacher[]).find((item) => item.id === scopeId);
    const parent = parentId ? chapters.find((c) => c.id === parentId) : undefined;
    if (parentId && !parent) throw new Error("父章节不存在");
    const parentLevel = parent?.level ?? -1;
    const siblings = chapters.filter((c) => c.parentId === parentId);
    const newChapter: Chapter = {
      id: genId("ch"),
      schoolId: teacher ? personalDirectorySchoolId(scopeId) : scopeId,
      ...(teacher ? { teacherId: scopeId } : {}),
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
    scopeId: string,
    parentId: string | null,
    name: string,
    questionCount: number = 0,
  ): Promise<KnowledgePoint> {
    await delay(300);
    const points = directoryRecords(scopeId, "knowledge") as KnowledgePoint[];
    const teacher = ((db.read("teachers") || []) as DirectoryTeacher[]).find((item) => item.id === scopeId);
    const parent = parentId ? points.find((p) => p.id === parentId) : undefined;
    if (parentId && !parent) throw new Error("父知识点不存在");
    const parentLevel = parent?.level ?? -1;
    const siblings = points.filter((p) => p.parentId === parentId);
    const newPoint: KnowledgePoint = {
      id: genId("kp"),
      schoolId: teacher ? personalDirectorySchoolId(scopeId) : scopeId,
      ...(teacher ? { teacherId: scopeId } : {}),
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
      current = current.parentId
        ? chapters.find((c) => c.id === current!.parentId)
        : undefined;
    }
    return path.join(" / ");
  },

  getKnowledgePath(knowledgeId: string): string {
    const points = db.read("knowledgePoints");
    const path: string[] = [];
    let current: KnowledgePoint | undefined = points.find(
      (p) => p.id === knowledgeId,
    );
    while (current) {
      path.unshift(current.name);
      current = current.parentId
        ? points.find((p) => p.id === current!.parentId)
        : undefined;
    }
    return path.join(" / ");
  },

  // 改名
  async renameNode(
    id: string,
    type: "chapter" | "knowledge",
    newName: string,
  ): Promise<void> {
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
      const target = list.find((item) => item.id === id);
      if (target?.teacherId) ensureDefaultDirectoryCatalog(target.teacherId, "chapter");
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
      const target = list.find((item) => item.id === id);
      if (target?.teacherId) ensureDefaultDirectoryCatalog(target.teacherId, "knowledge");
      const toDelete = collectSubtree(list, id);

      // 删除前收集所有被删除节点的名称对应的其他分身ID
      const remainingAliasMap = new Map<string, string[]>();
      for (const deletedId of toDelete) {
        const deletedPoint = list.find((p) => p.id === deletedId);
        if (deletedPoint) {
          const schoolId = deletedPoint.schoolId;
          const remaining = list
            .filter(
              (p) =>
                p.name === deletedPoint.name &&
                !toDelete.has(p.id) &&
                p.schoolId === schoolId,
            )
            .map((p) => p.id);
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
      db.update("chapters", (list) =>
        moveDirectoryRecord(list, id, newParentId),
      );
    } else {
      db.update("knowledgePoints", (list) =>
        moveDirectoryRecord(list, id, newParentId),
      );
    }
  },

  // 重排同级节点顺序（按 ids 数组顺序写入 order 1,2,3...）
  async reorderSiblings(
    ids: string[],
    type: "chapter" | "knowledge",
  ): Promise<void> {
    await delay(200);
    const orderMap = new Map<string, number>();
    ids.forEach((nid, idx) => orderMap.set(nid, idx + 1));
    if (type === "chapter") {
      db.update("chapters", (l) =>
        l.map((c) =>
          orderMap.has(c.id) ? { ...c, order: orderMap.get(c.id)! } : c,
        ),
      );
    } else {
      db.update("knowledgePoints", (l) =>
        l.map((p) =>
          orderMap.has(p.id) ? { ...p, order: orderMap.get(p.id)! } : p,
        ),
      );
    }
  },
};
