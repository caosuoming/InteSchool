import type { Question, QuestionFilter, QuestionType, QuestionRemark } from "@/types";
import { db, computeDuplicateHash } from "./db";
import { delay, genId, maybeThrowError } from "./_shared";
import { knowledgeService } from "./knowledge";

export interface QuestionInput {
  type: QuestionType;
  stem: string;
  options?: string[];
  answer: string;
  analysis: string;
  summary: string;
  chapterIds: string[];
  knowledgePointIds: string[];
  difficulty: 1 | 2 | 3 | 4 | 5;
  recommendation: 1 | 2 | 3 | 4 | 5;
  remark?: string;
  isShared?: boolean;
}

// 扩展知识点ID列表，将每个知识点替换为其所有同名分身ID
function expandKnowledgePointAliases(ids: string[], schoolId: string): string[] {
  const expanded = new Set<string>();
  for (const id of ids) {
    for (const aliasId of knowledgeService.getAliasIds(id, schoolId)) {
      expanded.add(aliasId);
    }
  }
  return Array.from(expanded);
}

function matchFilter(q: Question, filter: QuestionFilter): boolean {
  if (filter.keyword) {
    const kw = filter.keyword.toLowerCase();
    const haystack = `${q.stem} ${q.answer} ${q.remark || ""} ${q.analysis || ""}`.toLowerCase();
    if (!haystack.includes(kw)) {
      return false;
    }
  }
  if (filter.ids?.length && !filter.ids.includes(q.id)) return false;
  if (filter.noChapter && (q.chapterIds?.length || 0) > 0) return false;
  if (filter.chapterIds?.length) {
    const logic = filter.chapterLogic || "or";
    if (logic === "and") {
      if (!filter.chapterIds.every((c) => q.chapterIds.includes(c))) return false;
    } else {
      if (!filter.chapterIds.some((c) => q.chapterIds.includes(c))) return false;
    }
  }
  if (filter.noKnowledge && (q.knowledgePointIds?.length || 0) > 0) return false;
  if (filter.knowledgePointIds?.length) {
    const logic = filter.knowledgeLogic || "or";
    if (logic === "and") {
      if (!filter.knowledgePointIds.every((k) => q.knowledgePointIds.includes(k))) return false;
    } else {
      if (!filter.knowledgePointIds.some((k) => q.knowledgePointIds.includes(k))) return false;
    }
  }
  if (filter.difficulty?.length) {
    if (!filter.difficulty.includes(q.difficulty)) return false;
  }
  if (filter.recommendation?.length) {
    if (!filter.recommendation.includes(q.recommendation)) return false;
  }
  if (filter.type?.length) {
    if (!filter.type.includes(q.type)) return false;
  }
  if (filter.teacherId && q.teacherId !== filter.teacherId) return false;
  if (filter.schoolId && q.schoolId !== filter.schoolId) return false;
  if (filter.grade && q.grade !== filter.grade) return false;
  if (filter.schoolYear && q.schoolYear !== filter.schoolYear) return false;
  if (filter.sourceType?.length) {
    if (!q.sourceType || !filter.sourceType.includes(q.sourceType)) return false;
  }
  if (filter.category?.length) {
    if (!q.category || !filter.category.includes(q.category)) return false;
  }
  if (filter.excludeQuestionIds?.length) {
    if (filter.excludeQuestionIds.includes(q.id)) return false;
  }
  return true;
}

export const questionService = {
  async listQuestions(filter: QuestionFilter = {}): Promise<Question[]> {
    await delay(300);
    const all = db.read("questions");
    return all.filter((q) => matchFilter(q, filter));
  },

  async getQuestion(id: string): Promise<Question | null> {
    await delay(150);
    return db.read("questions").find((q) => q.id === id) || null;
  },

  /**
   * 查重：检测题库中是否已存在相同题目（基于题干+选项+答案的哈希）
   * 返回匹配的已有题目列表
   */
  async checkDuplicate(
    stem: string,
    answer: string,
    options?: string[],
    schoolId?: string,
  ): Promise<Question[]> {
    const hash = computeDuplicateHash(stem, answer, options);
    return db
      .read("questions")
      .filter((q) => {
        if (q.duplicateHash !== hash) return false;
        // 如果指定了学校，只查本校和共享题目
        if (schoolId && q.schoolId !== schoolId && !q.isShared) return false;
        return true;
      });
  },

  async createQuestion(
    teacherId: string,
    schoolId: string,
    input: QuestionInput,
  ): Promise<Question> {
    await delay(400);
    maybeThrowError();
    const now = new Date().toISOString();
    const duplicateHash = computeDuplicateHash(input.stem, input.answer, input.options);
    // 扩展知识点ID，关联所有同名分身
    const expandedKpIds = expandKnowledgePointAliases(input.knowledgePointIds, schoolId);
    const question: Question = {
      id: genId("q"),
      teacherId,
      schoolId,
      type: input.type,
      stem: input.stem,
      options: input.options,
      answer: input.answer,
      analysis: input.analysis,
      summary: input.summary || "",
      chapterIds: input.chapterIds,
      knowledgePointIds: expandedKpIds,
      difficulty: input.difficulty,
      recommendation: input.recommendation,
      usageCount: 0,
      remark: input.remark || "",
      isShared: input.isShared ?? false,
      duplicateHash,
      hiddenByExamIds: [],
      createdAt: now,
      updatedAt: now,
    };
    db.update("questions", (list) => [question, ...list]);
    return question;
  },

  async updateQuestion(id: string, patch: Partial<Question>): Promise<Question> {
    await delay(300);
    maybeThrowError();
    let updated: Question | null = null;
    db.update("questions", (list) =>
      list.map((q) => {
        if (q.id === id) {
          // 如果更新了知识点ID，扩展为所有同名分身
          const finalPatch = { ...patch };
          if (finalPatch.knowledgePointIds) {
            finalPatch.knowledgePointIds = expandKnowledgePointAliases(
              finalPatch.knowledgePointIds,
              q.schoolId,
            );
          }
          if (
            finalPatch.stem !== undefined
            || finalPatch.answer !== undefined
            || finalPatch.options !== undefined
          ) {
            finalPatch.duplicateHash = computeDuplicateHash(
              finalPatch.stem ?? q.stem,
              finalPatch.answer ?? q.answer,
              finalPatch.options ?? q.options,
            );
          }
          updated = { ...q, ...finalPatch, updatedAt: new Date().toISOString() };
          return updated;
        }
        return q;
      }),
    );
    if (!updated) throw new Error("题目不存在");
    return updated;
  },

  async deleteQuestion(id: string): Promise<void> {
    await delay(200);
    db.update("questions", (list) => list.filter((q) => q.id !== id));
  },

  async addRemark(questionId: string, content: string): Promise<QuestionRemark> {
    await delay(200);
    const now = new Date().toISOString();
    const remark: QuestionRemark = {
      id: genId("rm"),
      content,
      createdAt: now,
      updatedAt: now,
    };
    let added: QuestionRemark | null = null;
    db.update("questions", (list) =>
      list.map((q) => {
        if (q.id === questionId) {
          const remarks = [...(q.remarks || []), remark];
          added = remark;
          return { ...q, remarks, remark: content, updatedAt: now };
        }
        return q;
      }),
    );
    if (!added) throw new Error("题目不存在");
    return added;
  },

  async updateRemark(questionId: string, remarkId: string, content: string): Promise<QuestionRemark> {
    await delay(200);
    const now = new Date().toISOString();
    let updated: QuestionRemark | null = null;
    db.update("questions", (list) =>
      list.map((q) => {
        if (q.id === questionId) {
          const remarks = (q.remarks || []).map((r) => {
            if (r.id === remarkId) {
              updated = { ...r, content, updatedAt: now };
              return updated;
            }
            return r;
          });
          return {
            ...q,
            remarks,
            remark: remarks[remarks.length - 1]?.content || "",
            updatedAt: now,
          };
        }
        return q;
      }),
    );
    if (!updated) throw new Error("备注不存在");
    return updated;
  },

  async deleteRemark(questionId: string, remarkId: string): Promise<void> {
    await delay(200);
    db.update("questions", (list) =>
      list.map((q) => {
        if (q.id === questionId) {
          const remarks = (q.remarks || []).filter((r) => r.id !== remarkId);
          const latestRemark = remarks[remarks.length - 1];
          return {
            ...q,
            remarks,
            remark: latestRemark?.content || "",
            updatedAt: new Date().toISOString(),
          };
        }
        return q;
      }),
    );
  },

  async batchImport(
    teacherId: string,
    schoolId: string,
    questions: QuestionInput[],
  ): Promise<Question[]> {
    await delay(800);
    maybeThrowError();
    const now = new Date().toISOString();
    const created: Question[] = questions.map((input) => ({
      id: genId("q"),
      teacherId,
      schoolId,
      type: input.type,
      stem: input.stem,
      options: input.options,
      answer: input.answer,
      analysis: input.analysis,
      chapterIds: input.chapterIds,
      knowledgePointIds: expandKnowledgePointAliases(input.knowledgePointIds, schoolId),
      difficulty: input.difficulty,
      recommendation: input.recommendation,
      usageCount: 0,
      remark: input.remark || "",
      isShared: input.isShared ?? false,
      duplicateHash: computeDuplicateHash(input.stem, input.answer, input.options),
      hiddenByExamIds: [],
      createdAt: now,
      updatedAt: now,
    }));
    db.update("questions", (list) => [...created, ...list]);
    return created;
  },

  async incrementUsage(questionId: string): Promise<void> {
    const now = new Date().toISOString();
    db.update("questions", (list) =>
      list.map((q) =>
        q.id === questionId ? { ...q, usageCount: q.usageCount + 1, lastUsedAt: now } : q,
      ),
    );
  },
};
