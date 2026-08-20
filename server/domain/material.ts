import type {
  Material,
  MaterialType,
  QuestionVideoReference,
  ResourceFilter,
  ResourceSemester,
} from "../../src/types/index.js";
import { db } from "../runtime-db.js";
import { delay, genId, maybeThrowError } from "../domain-shared.js";
import { assertResourceCapacity } from "./quota.js";

function matchFilter(m: Material, filter: ResourceFilter): boolean {
  if (filter.keyword) {
    const kw = filter.keyword.toLowerCase();
    const haystack = `${m.title} ${m.description || ""} ${m.content}`.toLowerCase();
    if (!haystack.includes(kw)) return false;
  }
  if (filter.ids?.length && !filter.ids.includes(m.id)) return false;
  if (filter.chapterIds?.length) {
    const logic = filter.chapterLogic || "or";
    if (logic === "and") {
      if (!filter.chapterIds.every((c) => m.chapterIds.includes(c))) return false;
    } else {
      if (!filter.chapterIds.some((c) => m.chapterIds.includes(c))) return false;
    }
  }
  if (filter.knowledgePointIds?.length) {
    const logic = filter.knowledgeLogic || "or";
    if (logic === "and") {
      if (!filter.knowledgePointIds.every((k) => m.knowledgePointIds.includes(k))) return false;
    } else {
      if (!filter.knowledgePointIds.some((k) => m.knowledgePointIds.includes(k))) return false;
    }
  }
  if (filter.grade && m.grade !== filter.grade) return false;
  if (filter.schoolYear && m.schoolYear !== filter.schoolYear) return false;
  if (filter.semester && (m.semester || "上学期") !== filter.semester) return false;
  if (filter.teacherId && m.teacherId !== filter.teacherId) return false;
  if (filter.schoolId && m.schoolId !== filter.schoolId) return false;
  return true;
}

export interface MaterialInput {
  title: string;
  description?: string;
  chapterIds: string[];
  knowledgePointIds: string[];
  grade: string;
  schoolYear: string;
  semester?: ResourceSemester;
  type: MaterialType;
  content: string;
  fileUrl?: string;
  fileName?: string;
  fileSize?: number;
  explanationVideo?: QuestionVideoReference | null;
  tags: string[];
}

export const materialService = {
  async listMaterials(filter: ResourceFilter = {}): Promise<Material[]> {
    await delay(300);
    return db
      .read("materials")
      .filter((m) => matchFilter(m, filter))
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  },

  async getMaterial(id: string): Promise<Material | null> {
    await delay(200);
    return db.read("materials").find((m) => m.id === id) || null;
  },

  async createMaterial(
    teacherId: string,
    schoolId: string,
    input: MaterialInput,
  ): Promise<Material> {
    await delay(400);
    maybeThrowError();
    assertResourceCapacity(teacherId, "material");
    const now = new Date().toISOString();
    const material: Material = {
      id: genId("mat"),
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
      explanationVideo: input.explanationVideo ? { ...input.explanationVideo } : null,
      tags: input.tags,
      duplicateHash: input.type === "knowledgeBlock"
        ? computeKnowledgeHash(input.title, input.content)
        : undefined,
      createdAt: now,
      updatedAt: now,
    };
    db.update("materials", (list) => [material, ...list]);
    return material;
  },

  async updateMaterial(id: string, patch: Partial<Material>): Promise<Material> {
    await delay(300);
    maybeThrowError();
    let updated: Material | null = null;
    db.update("materials", (list) =>
      list.map((m) => {
        if (m.id === id) {
          updated = {
            ...m,
            ...patch,
            updatedAt: new Date().toISOString(),
          };
          return updated;
        }
        return m;
      }),
    );
    if (!updated) throw new Error("素材不存在");
    return updated;
  },

  async deleteMaterial(id: string): Promise<void> {
    await delay(200);
    db.update("materials", (list) => list.filter((m) => m.id !== id));
  },

  /**
   * 知识块查重：基于标题+内容计算哈希
   */
  async checkKnowledgeBlockDuplicate(
    title: string,
    content: string,
    schoolId?: string,
  ): Promise<Material[]> {
    const hash = computeKnowledgeHash(title, content);
    return db
      .read("materials")
      .filter((m) => {
        if (m.type !== "knowledgeBlock") return false;
        if (m.duplicateHash !== hash) return false;
        if (schoolId && m.schoolId !== schoolId) return false;
        return true;
      });
  },
};

function computeKnowledgeHash(title: string, content: string): string {
  const normalized = `${title.trim().toLowerCase()}|${content.trim().toLowerCase()}`;
  let hash = 0;
  for (let i = 0; i < normalized.length; i++) {
    const char = normalized.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return `kh_${Math.abs(hash).toString(36)}`;
}
