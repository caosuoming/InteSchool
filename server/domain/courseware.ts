import type { Courseware, CoursewareType, ResourceFilter, ResourceSemester } from "../../src/types/index.js";
import { db } from "../runtime-db.js";
import { randomUUID } from "node:crypto";
import { delay, genId, maybeThrowError } from "../domain-shared.js";
import { reflectionService } from "./reflection.js";

function matchFilter(c: Courseware, filter: ResourceFilter): boolean {
  if (filter.keyword) {
    const kw = filter.keyword.toLowerCase();
    const haystack = `${c.title} ${c.description || ""} ${c.content}`.toLowerCase();
    if (!haystack.includes(kw)) return false;
  }
  if (filter.chapterIds?.length) {
    const logic = filter.chapterLogic || "or";
    if (logic === "and") {
      if (!filter.chapterIds.every((ch) => c.chapterIds.includes(ch))) return false;
    } else {
      if (!filter.chapterIds.some((ch) => c.chapterIds.includes(ch))) return false;
    }
  }
  if (filter.knowledgePointIds?.length) {
    const logic = filter.knowledgeLogic || "or";
    if (logic === "and") {
      if (!filter.knowledgePointIds.every((k) => c.knowledgePointIds.includes(k))) return false;
    } else {
      if (!filter.knowledgePointIds.some((k) => c.knowledgePointIds.includes(k))) return false;
    }
  }
  if (filter.grade && c.grade !== filter.grade) return false;
  if (filter.schoolYear && c.schoolYear !== filter.schoolYear) return false;
  if (filter.semester && (c.semester || "上学期") !== filter.semester) return false;
  if (filter.teacherId && c.teacherId !== filter.teacherId) return false;
  if (filter.schoolId && c.schoolId !== filter.schoolId) return false;
  return true;
}


function normalizeEditorUrl(value?: string): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error("在线编辑地址无效");
  }
  if (parsed.protocol !== "https:") throw new Error("在线编辑地址必须使用 HTTPS");
  return parsed.toString();
}

function ensureOnlineAccessToken(courseware: Courseware): Courseware {
  if (!courseware.fileUrl || courseware.onlineAccessToken) return courseware;
  const updated = { ...courseware, onlineAccessToken: randomUUID() };
  db.update("coursewares", (list) => list.map((item) => item.id === courseware.id ? updated : item));
  return updated;
}

export interface CoursewareInput {
  title: string;
  description?: string;
  chapterIds: string[];
  knowledgePointIds: string[];
  grade: string;
  schoolYear: string;
  semester?: ResourceSemester;
  type: CoursewareType;
  content: string;
  fileUrl?: string;
  fileName?: string;
  fileSize?: number;
  editorUrl?: string;
  tags: string[];
}

export const coursewareService = {
  async listCoursewares(filter: ResourceFilter = {}): Promise<Courseware[]> {
    await delay(300);
    return db
      .read("coursewares")
      .filter((c) => matchFilter(c, filter))
      .map(ensureOnlineAccessToken)
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  },

  async getCourseware(id: string): Promise<Courseware | null> {
    await delay(200);
    const courseware = db.read("coursewares").find((c) => c.id === id);
    return courseware ? ensureOnlineAccessToken(courseware) : null;
  },

  async createCourseware(
    teacherId: string,
    schoolId: string,
    input: CoursewareInput,
  ): Promise<Courseware> {
    await delay(400);
    maybeThrowError();
    const now = new Date().toISOString();
    const courseware: Courseware = {
      id: genId("cw"),
      teacherId,
      schoolId,
      title: input.title,
      description: input.description,
      chapterIds: input.chapterIds,
      knowledgePointIds: input.knowledgePointIds,
      grade: input.grade,
      schoolYear: input.schoolYear,
      semester: input.semester || "上学期",
      type: input.type,
      content: input.content,
      fileUrl: input.fileUrl,
      fileName: input.fileName,
      fileSize: input.fileSize,
      onlineAccessToken: input.fileUrl ? randomUUID() : undefined,
      editorUrl: normalizeEditorUrl(input.editorUrl),
      tags: input.tags,
      createdAt: now,
      updatedAt: now,
    };
    db.update("coursewares", (list) => [courseware, ...list]);
    return courseware;
  },

  async updateCourseware(id: string, patch: Partial<Courseware>): Promise<Courseware> {
    await delay(300);
    maybeThrowError();
    let updated: Courseware | null = null;
    const normalizedPatch = Object.prototype.hasOwnProperty.call(patch, "editorUrl")
      ? { ...patch, editorUrl: normalizeEditorUrl(patch.editorUrl) }
      : patch;
    db.update("coursewares", (list) =>
      list.map((c) => {
        if (c.id === id) {
          const nextFileUrl = normalizedPatch.fileUrl === undefined ? c.fileUrl : normalizedPatch.fileUrl;
          updated = {
            ...c,
            ...normalizedPatch,
            onlineAccessToken: nextFileUrl
              ? normalizedPatch.onlineAccessToken || c.onlineAccessToken || randomUUID()
              : undefined,
            updatedAt: new Date().toISOString(),
          };
          return updated;
        }
        return c;
      }),
    );
    if (!updated) throw new Error("课件不存在");
    return updated;
  },

  async deleteCourseware(id: string): Promise<void> {
    await delay(200);
    db.update("coursewares", (list) => list.filter((c) => c.id !== id));
  },

  /**
   * 创建副本：复制课件，并复制关联的课后反思
   */
  async duplicateCourseware(
    sourceId: string,
    newTitle?: string,
  ): Promise<Courseware> {
    await delay(400);
    maybeThrowError();
    const source = db.read("coursewares").find((c) => c.id === sourceId);
    if (!source) throw new Error("原课件不存在");
    const now = new Date().toISOString();
    const duplicated: Courseware = {
      ...source,
      id: genId("cw"),
      title: newTitle || `${source.title}（副本）`,
      onlineAccessToken: source.fileUrl ? randomUUID() : undefined,
      createdAt: now,
      updatedAt: now,
    };
    db.update("coursewares", (list) => [duplicated, ...list]);
    // 复制关联反思
    await reflectionService.copyToTarget(
      source.teacherId,
      source.schoolId,
      source.id,
      duplicated.id,
    );
    return duplicated;
  },
};
