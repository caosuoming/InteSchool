import type {
  Question,
  QuestionAdaptationInput,
  QuestionFilter,
  QuestionLink,
  QuestionType,
  QuestionRemark,
  QuestionVideoReference,
  ResourceSemester,
  SimilarQuestionCandidate,
} from "../../src/types/index.js";
import type { TeacherRecord } from "../types.js";
import { db, computeDuplicateHash } from "../runtime-db.js";
import { delay, genId, maybeThrowError } from "../domain-shared.js";
import { knowledgeService } from "./knowledge.js";
import { assertResourceCapacity } from "./quota.js";
import {
  HIGH_SIMILARITY_THRESHOLD,
  questionStemSimilarity,
} from "../../src/lib/question-similarity.js";

export interface QuestionInput {
  type: QuestionType;
  stem: string;
  options?: string[];
  answer: string;
  analysis: string;
  summary?: string;
  board?: string;
  boardImages?: string[];
  links?: QuestionLink[];
  explanationVideo?: QuestionVideoReference | null;
  chapterIds: string[];
  knowledgePointIds: string[];
  grade?: string;
  schoolYear?: string;
  semester?: ResourceSemester;
  sourceType?: string;
  category?: string;
  difficulty: 1 | 2 | 3 | 4 | 5;
  recommendation: 1 | 2 | 3 | 4 | 5;
  remark?: string;
  isShared?: boolean;
  /** 用户发现高度相似题后仍明确选择新增。 */
  duplicateDecision?: "add";
}

export function recordQuestionUsage(questionIds: readonly string[]): void {
  const uniqueQuestionIds = new Set(questionIds);
  if (uniqueQuestionIds.size === 0) return;
  const now = new Date().toISOString();
  db.update("questions", (list) =>
    list.map((question) =>
      uniqueQuestionIds.has(question.id)
        ? { ...question, usageCount: question.usageCount + 1, lastUsedAt: now }
        : question,
    ),
  );
}

function similarQuestionCandidates(
  stem: string,
  schoolId: string,
  excludeQuestionIds: readonly string[] = [],
): SimilarQuestionCandidate[] {
  const excludedQuestionIds = new Set(excludeQuestionIds);
  return db
    .read("questions")
    .filter((question) =>
      !excludedQuestionIds.has(question.id)
      && (question.schoolId === schoolId || question.isShared),
    )
    .map((question) => ({
      question,
      similarity: questionStemSimilarity(stem, question.stem),
    }))
    .filter((candidate) => candidate.similarity >= HIGH_SIMILARITY_THRESHOLD)
    .sort((left, right) => right.similarity - left.similarity)
    .slice(0, 5);
}

export function createDuplicateConfirmationError(candidate: SimilarQuestionCandidate): Error {
  return new Error(
    `发现高度相似题目（相似度 ${(candidate.similarity * 100).toFixed(1)}%，ID：${candidate.question.id}），请先确认使用已有题目或仍然新增`,
  );
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
    const kw = filter.keyword.trim().toLowerCase();
    const searchFields = filter.searchFields?.length
      ? filter.searchFields
      : ["stem", "analysis", "summary", "remark"] as const;
    const remarkText = [
      q.remark,
      ...(q.remarks?.map((remark) => remark.content) ?? []),
    ].filter(Boolean).join(" ");
    const fieldText = {
      stem: q.stem,
      analysis: q.analysis,
      summary: q.summary ?? "",
      remark: remarkText,
    };
    if (kw && !searchFields.some((field) => fieldText[field].toLowerCase().includes(kw))) {
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
  if (filter.semester && (q.semester || "上学期") !== filter.semester) return false;
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

type QuestionSortKey = "usage" | "weakness" | "recommendation" | "newest" | "recentUse";

function sortQuestions(questions: Question[], sortKey: QuestionSortKey): Question[] {
  const sorted = [...questions];
  switch (sortKey) {
    case "usage":
    case "weakness":
      sorted.sort((a, b) => b.usageCount - a.usageCount);
      break;
    case "recentUse":
      sorted.sort((a, b) => {
        const ta = a.lastUsedAt ? new Date(a.lastUsedAt).getTime() : 0;
        const tb = b.lastUsedAt ? new Date(b.lastUsedAt).getTime() : 0;
        return tb - ta || b.usageCount - a.usageCount;
      });
      break;
    case "recommendation":
      sorted.sort((a, b) => b.recommendation - a.recommendation || b.usageCount - a.usageCount);
      break;
    case "newest":
    default:
      sorted.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      break;
  }
  return sorted;
}

export const questionService = {
  async listQuestions(filter: QuestionFilter = {}): Promise<Question[]> {
    const indexed = await db.searchQuestions(filter);
    if (indexed) return indexed;
    await delay(300);
    const all = db.read("questions");
    return all.filter((q) => matchFilter(q, filter));
  },

  async listQuestionPage(
    filter: QuestionFilter = {},
    page = 1,
    pageSize = 20,
    sortKey: QuestionSortKey = "newest",
    teacher: TeacherRecord,
  ): Promise<{ items: Question[]; total: number }> {
    const data = await this.listQuestions(filter);
    const visible = data.filter((question) => question.teacherId === teacher.id || question.isShared);
    const sorted = sortQuestions(visible, sortKey);
    const safePageSize = Math.max(1, Math.min(200, Math.floor(pageSize) || 20));
    const total = sorted.length;
    const totalPages = Math.max(1, Math.ceil(total / safePageSize));
    const safePage = Math.max(1, Math.min(totalPages, Math.floor(page) || 1));
    const start = (safePage - 1) * safePageSize;
    return {
      items: sorted.slice(start, start + safePageSize),
      total,
    };
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

  async findSimilarQuestions(
    stem: string,
    schoolId: string,
    excludeQuestionId?: string,
  ): Promise<SimilarQuestionCandidate[]> {
    await delay(100);
    return similarQuestionCandidates(
      stem,
      schoolId,
      excludeQuestionId ? [excludeQuestionId] : [],
    );
  },

  async createQuestion(
    teacherId: string,
    schoolId: string,
    input: QuestionInput,
    excludeDuplicateQuestionIds: readonly string[] = [],
  ): Promise<Question> {
    await delay(400);
    maybeThrowError();
    assertResourceCapacity(teacherId, "question");
    const similar = similarQuestionCandidates(
      input.stem,
      schoolId,
      excludeDuplicateQuestionIds,
    );
    if (similar.length > 0 && input.duplicateDecision !== "add") {
      throw createDuplicateConfirmationError(similar[0]);
    }
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
      board: input.board || "",
      boardImages: input.boardImages ? [...input.boardImages] : [],
      links: input.links?.map((link) => ({ ...link })) || [],
      explanationVideo: input.explanationVideo ? { ...input.explanationVideo } : null,
      chapterIds: input.chapterIds,
      knowledgePointIds: expandedKpIds,
      grade: input.grade,
      schoolYear: input.schoolYear,
      semester: input.semester || "上学期",
      sourceType: input.sourceType,
      category: input.category,
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

  async adaptQuestion(id: string, input: QuestionAdaptationInput): Promise<Question> {
    await delay(300);
    maybeThrowError();
    const source = db.read("questions").find((question) => question.id === id);
    if (!source) throw new Error("题目不存在");
    assertResourceCapacity(source.teacherId, "question");

    const adaptedFields: QuestionAdaptationInput = {
      stem: input.stem.trim(),
      answer: input.answer.trim(),
      analysis: input.analysis.trim(),
      summary: input.summary.trim(),
    };
    const fieldLabels: Record<keyof QuestionAdaptationInput, string> = {
      stem: "题干",
      answer: "答案",
      analysis: "解析",
      summary: "总结",
    };
    const emptyField = (Object.keys(adaptedFields) as Array<keyof QuestionAdaptationInput>)
      .find((field) => !adaptedFields[field]);
    if (emptyField) throw new Error(`${fieldLabels[emptyField]}不能为空`);

    const unchangedFields = (Object.keys(adaptedFields) as Array<keyof QuestionAdaptationInput>)
      .filter((field) => adaptedFields[field] === String(source[field] ?? "").trim());
    if (unchangedFields.length > 0) {
      throw new Error(`请同步修改${unchangedFields.map((field) => fieldLabels[field]).join("、")}`);
    }

    const now = new Date().toISOString();
    const adapted: Question = {
      ...structuredClone(source),
      id: genId("q"),
      ...adaptedFields,
      usageCount: 0,
      lastUsedAt: undefined,
      duplicateHash: computeDuplicateHash(
        adaptedFields.stem,
        adaptedFields.answer,
        source.options,
      ),
      hiddenByExamIds: [],
      createdAt: now,
      updatedAt: now,
    };
    db.update("questions", (list) => [adapted, ...list]);
    return adapted;
  },

  async updateQuestion(
    id: string,
    patch: Partial<Question>,
    duplicateDecision?: "add",
  ): Promise<Question> {
    await delay(300);
    maybeThrowError();
    const existing = db.read("questions").find((question) => question.id === id);
    if (!existing) throw new Error("题目不存在");
    if (patch.stem !== undefined && patch.stem !== existing.stem) {
      const similar = similarQuestionCandidates(patch.stem, existing.schoolId, [id]);
      if (similar.length > 0 && duplicateDecision !== "add") {
        throw createDuplicateConfirmationError(similar[0]);
      }
    }
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
          const existingRemarks = q.remarks?.length
            ? q.remarks
            : q.remark.trim()
              ? [{
                  id: genId("rm"),
                  content: q.remark,
                  createdAt: q.updatedAt || q.createdAt || now,
                  updatedAt: q.updatedAt || q.createdAt || now,
                }]
              : [];
          const remarks = [...existingRemarks, remark];
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
    assertResourceCapacity(teacherId, "question", questions.length);
    const acceptedStems: string[] = [];
    for (const input of questions) {
      const existingSimilar = similarQuestionCandidates(input.stem, schoolId)[0];
      const batchSimilarStem = acceptedStems.find(
        (stem) => questionStemSimilarity(input.stem, stem) >= HIGH_SIMILARITY_THRESHOLD,
      );
      if ((existingSimilar || batchSimilarStem) && input.duplicateDecision !== "add") {
        if (existingSimilar) throw createDuplicateConfirmationError(existingSimilar);
        throw new Error("本次导入中存在高度相似题目，请先确认是否仍然新增");
      }
      acceptedStems.push(input.stem);
    }
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
      summary: input.summary || "",
      board: input.board || "",
      boardImages: input.boardImages ? [...input.boardImages] : [],
      links: input.links?.map((link) => ({ ...link })) || [],
      explanationVideo: input.explanationVideo ? { ...input.explanationVideo } : null,
      chapterIds: input.chapterIds,
      knowledgePointIds: expandKnowledgePointAliases(input.knowledgePointIds, schoolId),
      grade: input.grade,
      schoolYear: input.schoolYear,
      semester: input.semester || "上学期",
      sourceType: input.sourceType,
      category: input.category,
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
    recordQuestionUsage([questionId]);
  },
};
