import type { Courseware, CoursewareType, ResourceFilter } from "../../src/types/index.js";
import { db } from "../runtime-db.js";
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
  if (filter.teacherId && c.teacherId !== filter.teacherId) return false;
  if (filter.schoolId && c.schoolId !== filter.schoolId) return false;
  return true;
}

export interface CoursewareInput {
  title: string;
  description?: string;
  chapterIds: string[];
  knowledgePointIds: string[];
  grade: string;
  schoolYear: string;
  type: CoursewareType;
  content: string;
  fileUrl?: string;
  fileSize?: number;
  tags: string[];
}

export const coursewareService = {
  async listCoursewares(filter: ResourceFilter = {}): Promise<Courseware[]> {
    await delay(300);
    return db
      .read("coursewares")
      .filter((c) => matchFilter(c, filter))
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  },

  async getCourseware(id: string): Promise<Courseware | null> {
    await delay(200);
    return db.read("coursewares").find((c) => c.id === id) || null;
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
      type: input.type,
      content: input.content,
      fileUrl: input.fileUrl,
      fileSize: input.fileSize,
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
    db.update("coursewares", (list) =>
      list.map((c) => {
        if (c.id === id) {
          updated = {
            ...c,
            ...patch,
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
   * 另存为：复制课件，并复制关联的课后反思
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
