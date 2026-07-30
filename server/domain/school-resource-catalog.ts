import type {
  Chapter,
  KnowledgePoint,
  SchoolResourceBackup,
  TreeNode,
} from "../../src/types/index.js";
import { genId } from "../domain-shared.js";
import { db } from "../runtime-db.js";

type DirectoryKind = "chapter" | "knowledge";

interface CatalogTransfer {
  sourceChapters: string;
  sourceKnowledgePoints: string;
  targetChapters: string;
  targetKnowledgePoints: string;
  chapterIdPrefix: string;
  knowledgePointIdPrefix: string;
}

export interface DirectoryMapping {
  chapterIds: string[];
  knowledgePointIds: string[];
}

function list<T>(collection: string): T[] {
  return db.read(collection) as T[];
}

function normalizedName(name: string): string {
  return name.trim();
}

function nextLevel<T extends { id: string; level: number }>(
  entries: T[],
  parentId: string | null,
): number {
  if (!parentId) return 0;
  return (entries.find((item) => item.id === parentId)?.level || 0) + 1;
}

function transferDirectories(
  schoolId: string,
  selectedChapterIds: string[],
  selectedKnowledgePointIds: string[],
  config: CatalogTransfer,
): DirectoryMapping {
  const sourceChapters = list<Chapter>(config.sourceChapters);
  const sourcePoints = list<KnowledgePoint>(config.sourceKnowledgePoints);
  const targetChapters = [...list<Chapter>(config.targetChapters)];
  const targetPoints = [...list<KnowledgePoint>(config.targetKnowledgePoints)];
  const chapterMap = new Map<string, string>();
  const pointMap = new Map<string, string>();

  const ensureChapter = (sourceId: string): string | null => {
    const mapped = chapterMap.get(sourceId);
    if (mapped) return mapped;

    const existingById = targetChapters.find(
      (item) => item.id === sourceId && item.schoolId === schoolId,
    );
    if (existingById) {
      chapterMap.set(sourceId, existingById.id);
      return existingById.id;
    }

    const source = sourceChapters.find(
      (item) => item.id === sourceId && item.schoolId === schoolId,
    );
    if (!source) return null;

    const parentId = source.parentId ? ensureChapter(source.parentId) : null;
    const name = normalizedName(source.name);
    let target = targetChapters.find(
      (item) =>
        item.schoolId === schoolId &&
        item.parentId === parentId &&
        normalizedName(item.name) === name,
    );
    if (!target) {
      target = {
        id: genId(config.chapterIdPrefix),
        schoolId,
        parentId,
        name,
        order:
          targetChapters.filter(
            (item) => item.schoolId === schoolId && item.parentId === parentId,
          ).length + 1,
        level: nextLevel(targetChapters, parentId),
        questionCount: 0,
      };
      targetChapters.push(target);
    }

    chapterMap.set(sourceId, target.id);
    return target.id;
  };

  const ensureKnowledgePoint = (sourceId: string): string | null => {
    const mapped = pointMap.get(sourceId);
    if (mapped) return mapped;

    const existingById = targetPoints.find(
      (item) => item.id === sourceId && item.schoolId === schoolId,
    );
    if (existingById) {
      pointMap.set(sourceId, existingById.id);
      return existingById.id;
    }

    const source = sourcePoints.find(
      (item) => item.id === sourceId && item.schoolId === schoolId,
    );
    if (!source) return null;

    const chapterId = ensureChapter(source.chapterId);
    if (!chapterId) return null;
    const parentId = source.parentId
      ? ensureKnowledgePoint(source.parentId)
      : null;
    const name = normalizedName(source.name);
    let target = targetPoints.find(
      (item) =>
        item.schoolId === schoolId &&
        item.parentId === parentId &&
        item.chapterId === chapterId &&
        normalizedName(item.name) === name,
    );
    if (!target) {
      target = {
        id: genId(config.knowledgePointIdPrefix),
        schoolId,
        parentId,
        chapterId,
        name,
        description: source.description,
        order:
          targetPoints.filter(
            (item) => item.schoolId === schoolId && item.parentId === parentId,
          ).length + 1,
        level: nextLevel(targetPoints, parentId),
        questionCount: 0,
      };
      targetPoints.push(target);
    }

    pointMap.set(sourceId, target.id);
    return target.id;
  };

  const chapterIds = selectedChapterIds
    .map(ensureChapter)
    .filter((id): id is string => Boolean(id));
  const knowledgePointIds = selectedKnowledgePointIds
    .map(ensureKnowledgePoint)
    .filter((id): id is string => Boolean(id));

  db.write(config.targetChapters, targetChapters);
  db.write(config.targetKnowledgePoints, targetPoints);
  return {
    chapterIds: [...new Set(chapterIds)],
    knowledgePointIds: [...new Set(knowledgePointIds)],
  };
}

export function syncSchoolResourceDirectories(
  schoolId: string,
  chapterIds: string[],
  knowledgePointIds: string[],
): DirectoryMapping {
  return transferDirectories(schoolId, chapterIds, knowledgePointIds, {
    sourceChapters: "chapters",
    sourceKnowledgePoints: "knowledgePoints",
    targetChapters: "schoolChapters",
    targetKnowledgePoints: "schoolKnowledgePoints",
    chapterIdPrefix: "sch-ch",
    knowledgePointIdPrefix: "sch-kp",
  });
}

export function syncPersonalResourceDirectories(
  schoolId: string,
  chapterIds: string[],
  knowledgePointIds: string[],
): DirectoryMapping {
  return transferDirectories(schoolId, chapterIds, knowledgePointIds, {
    sourceChapters: "schoolChapters",
    sourceKnowledgePoints: "schoolKnowledgePoints",
    targetChapters: "chapters",
    targetKnowledgePoints: "knowledgePoints",
    chapterIdPrefix: "ch",
    knowledgePointIdPrefix: "kp",
  });
}

function compareEntries(
  left: Chapter | KnowledgePoint,
  right: Chapter | KnowledgePoint,
): number {
  return left.order - right.order || left.name.localeCompare(right.name, "zh-CN");
}

function buildCatalogTree(type: DirectoryKind, schoolId: string): TreeNode {
  const chapters = list<Chapter>("schoolChapters").filter(
    (item) => item.schoolId === schoolId,
  );
  const points = list<KnowledgePoint>("schoolKnowledgePoints").filter(
    (item) => item.schoolId === schoolId,
  );
  const backups = list<SchoolResourceBackup>("schoolBackups").filter(
    (item) => item.schoolId === schoolId,
  );
  const entries = type === "chapter" ? chapters : points;
  const selectedField = type === "chapter" ? "chapterIds" : "knowledgePointIds";

  const buildNode = (
    entry: Chapter | KnowledgePoint,
  ): { node: TreeNode; descendantIds: Set<string> } => {
    const children = entries
      .filter((item) => item.parentId === entry.id)
      .sort(compareEntries)
      .map(buildNode);
    const descendantIds = new Set<string>([entry.id]);
    for (const child of children) {
      for (const id of child.descendantIds) descendantIds.add(id);
    }

    return {
      descendantIds,
      node: {
        id: entry.id,
        name: entry.name,
        type,
        count: backups.filter((backup) =>
          backup[selectedField].some((id) => descendantIds.has(id)),
        ).length,
        parentId: entry.parentId,
        order: entry.order,
        level: entry.level,
        chapterId:
          type === "knowledge"
            ? (entry as KnowledgePoint).chapterId
            : undefined,
        description:
          type === "knowledge"
            ? chapters.find(
                (chapter) => chapter.id === (entry as KnowledgePoint).chapterId,
              )?.name
            : undefined,
        children: children.map((child) => child.node),
      },
    };
  };

  return {
    id: "root",
    name: type === "chapter" ? "全部章节" : "全部知识点",
    type,
    count: backups.length,
    children: entries
      .filter((entry) => entry.parentId === null)
      .sort(compareEntries)
      .map(buildNode)
      .map((item) => item.node),
  };
}

export function getSchoolResourceChapterTree(schoolId: string): TreeNode {
  return buildCatalogTree("chapter", schoolId);
}

export function getSchoolResourceKnowledgeTree(schoolId: string): TreeNode {
  return buildCatalogTree("knowledge", schoolId);
}
