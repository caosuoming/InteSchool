import type {
  ExamPaper,
  ExamPaperQuestion,
  ResourceFilter,
} from "@/types";
import { db } from "./db";
import { delay, genId, maybeThrowError } from "./_shared";
import { questionService } from "./question";
import { reflectionService } from "./reflection";

function matchFilter(p: ExamPaper, filter: ResourceFilter): boolean {
  if (filter.keyword) {
    const kw = filter.keyword.toLowerCase();
    const haystack = `${p.title} ${p.description || ""}`.toLowerCase();
    if (!haystack.includes(kw)) return false;
  }
  if (filter.chapterIds?.length) {
    const logic = filter.chapterLogic || "or";
    if (logic === "and") {
      if (!filter.chapterIds.every((c) => p.chapterIds.includes(c))) return false;
    } else {
      if (!filter.chapterIds.some((c) => p.chapterIds.includes(c))) return false;
    }
  }
  if (filter.knowledgePointIds?.length) {
    const logic = filter.knowledgeLogic || "or";
    if (logic === "and") {
      if (!filter.knowledgePointIds.every((k) => p.knowledgePointIds.includes(k))) return false;
    } else {
      if (!filter.knowledgePointIds.some((k) => p.knowledgePointIds.includes(k))) return false;
    }
  }
  if (filter.grade && p.grade !== filter.grade) return false;
  if (filter.schoolYear && p.schoolYear !== filter.schoolYear) return false;
  if (filter.teacherId && p.teacherId !== filter.teacherId) return false;
  if (filter.schoolId && p.schoolId !== filter.schoolId) return false;
  return true;
}

export interface ExamPaperInput {
  title: string;
  description?: string;
  chapterIds: string[];
  knowledgePointIds: string[];
  grade: string;
  schoolYear: string;
  duration: number;
  totalScore: number;
  questions: ExamPaperQuestion[];
  typeId?: string;
  status?: "draft" | "published";
  originalFileUrl?: string;
  originalFileName?: string;
  originalFileType?: "word" | "pdf";
  originalFileSize?: number;
}

export const examPaperService = {
  async listPapers(filter: ResourceFilter = {}): Promise<ExamPaper[]> {
    await delay(300);
    return db
      .read("examPapers")
      .filter((p) => matchFilter(p, filter))
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  },

  async getPaper(id: string): Promise<ExamPaper | null> {
    await delay(200);
    return db.read("examPapers").find((p) => p.id === id) || null;
  },

  async createPaper(
    teacherId: string,
    schoolId: string,
    input: ExamPaperInput,
  ): Promise<ExamPaper> {
    await delay(400);
    maybeThrowError();
    const now = new Date().toISOString();
    const paper: ExamPaper = {
      id: genId("exam"),
      teacherId,
      schoolId,
      title: input.title,
      description: input.description,
      chapterIds: input.chapterIds,
      knowledgePointIds: input.knowledgePointIds,
      grade: input.grade,
      schoolYear: input.schoolYear,
      duration: input.duration,
      totalScore: input.totalScore,
      questions: input.questions,
      typeId: input.typeId,
      status: input.status || "draft",
      originalFileUrl: input.originalFileUrl,
      originalFileName: input.originalFileName,
      originalFileType: input.originalFileType,
      originalFileSize: input.originalFileSize,
      createdAt: now,
      updatedAt: now,
    };
    db.update("examPapers", (list) => [paper, ...list]);
    return paper;
  },

  async updatePaper(id: string, patch: Partial<ExamPaper>): Promise<ExamPaper> {
    await delay(300);
    maybeThrowError();
    let updated: ExamPaper | null = null;
    db.update("examPapers", (list) =>
      list.map((p) => {
        if (p.id === id) {
          updated = {
            ...p,
            ...patch,
            updatedAt: new Date().toISOString(),
          };
          return updated;
        }
        return p;
      }),
    );
    if (!updated) throw new Error("试卷不存在");
    return updated;
  },

  async deletePaper(id: string): Promise<void> {
    await delay(200);
    db.update("examPapers", (list) => list.filter((p) => p.id !== id));
  },

  /**
   * 另存为：复制试卷（含题目），并复制关联的课后反思
   */
  async duplicatePaper(
    sourceId: string,
    newTitle?: string,
  ): Promise<ExamPaper> {
    await delay(400);
    maybeThrowError();
    const source = db.read("examPapers").find((p) => p.id === sourceId);
    if (!source) throw new Error("原试卷不存在");
    const now = new Date().toISOString();
    // 复制题目项，生成新id（保留 questionId 关联到题库的引用）
    const copiedQuestions: ExamPaperQuestion[] = source.questions.map((q) => ({
      ...q,
      id: genId("epq"),
    }));
    const duplicated: ExamPaper = {
      ...source,
      id: genId("exam"),
      title: newTitle || `${source.title}（副本）`,
      status: "draft",
      questions: copiedQuestions,
      createdAt: now,
      updatedAt: now,
    };
    db.update("examPapers", (list) => [duplicated, ...list]);
    // 复制关联反思
    await reflectionService.copyToTarget(
      source.teacherId,
      source.schoolId,
      source.id,
      duplicated.id,
    );
    return duplicated;
  },

  /**
   * 将试卷中的题目拆解到题库（调用 questionService.createQuestion），
   * 并把创建出的题库题目ID回写到试卷的 ExamPaperQuestion.questionId 字段。
   * 返回创建出的题目ID列表。
   */
  async extractToQuestionBank(paperId: string): Promise<string[]> {
    await delay(500);
    maybeThrowError();
    const paper = db.read("examPapers").find((p) => p.id === paperId);
    if (!paper) throw new Error("试卷不存在");

    const createdQuestionIds: string[] = [];
    const updatedQuestions: ExamPaperQuestion[] = [];

    for (const eq of paper.questions) {
      // 已关联过题库题目的，跳过避免重复拆解
      if (eq.questionId) {
        updatedQuestions.push(eq);
        continue;
      }
      const created = await questionService.createQuestion(
        paper.teacherId,
        paper.schoolId,
        {
          type: eq.type,
          stem: eq.stem,
          options: eq.options,
          answer: eq.answer,
          analysis: eq.analysis,
          chapterIds: paper.chapterIds,
          knowledgePointIds: paper.knowledgePointIds,
          difficulty: 3,
          recommendation: 3,
        },
      );
      createdQuestionIds.push(created.id);
      updatedQuestions.push({ ...eq, questionId: created.id });
    }

    // 回写试卷中题目的关联ID
    await this.updatePaper(paperId, { questions: updatedQuestions });

    return createdQuestionIds;
  },

  /**
   * 创建拆解副本：复制源试卷结构，标记为拆解副本，关联源资源ID
   */
  async createExtractCopy(sourceId: string): Promise<ExamPaper> {
    await delay(400);
    maybeThrowError();
    const source = db.read("examPapers").find((p) => p.id === sourceId);
    if (!source) throw new Error("源试卷不存在");
    const now = new Date().toISOString();
    const copiedQuestions: ExamPaperQuestion[] = source.questions.map((q) => ({
      ...q,
      id: genId("epq"),
    }));
    const copy: ExamPaper = {
      ...source,
      id: genId("exam"),
      title: `${source.title}（拆解版）`,
      questions: copiedQuestions,
      isExtractCopy: true,
      sourceResourceId: sourceId,
      extractStatus: "done",
      originalFileUrl: undefined,
      originalFileName: undefined,
      originalFileType: undefined,
      originalFileSize: undefined,
      status: "draft",
      createdAt: now,
      updatedAt: now,
    };
    db.update("examPapers", (list) => [copy, ...list]);
    // 标记源试卷已拆解
    await this.updatePaper(sourceId, { extractStatus: "done" });
    return copy;
  },

  /**
   * 获取试卷的拆解副本
   */
  async getExtractCopy(sourceId: string): Promise<ExamPaper | null> {
    await delay(200);
    return db.read("examPapers").find(
      (p) => p.sourceResourceId === sourceId && p.isExtractCopy,
    ) || null;
  },

  /**
   * 将试卷转换为讲义
   * 将试卷的题目转换为讲义的题目类型section
   */
  async convertToLecture(paperId: string): Promise<{ lectureId: string }> {
    await delay(500);
    maybeThrowError();
    const paper = db.read("examPapers").find((p) => p.id === paperId);
    if (!paper) throw new Error("试卷不存在");

    const now = new Date().toISOString();

    // 将试卷题目转换为讲义sections
    const sections: import("@/types").LectureSection[] = paper.questions.map((q, idx) => ({
      id: genId("sec"),
      title: `第${idx + 1}题`,
      type: "question",
      content: q.stem,
      questionId: q.questionId,
      children: [],
    }));

    const lecture: import("@/types").Lecture = {
      id: genId("lec"),
      teacherId: paper.teacherId,
      schoolId: paper.schoolId,
      title: `${paper.title}（转讲义）`,
      description: paper.description,
      chapterIds: paper.chapterIds,
      knowledgePointIds: paper.knowledgePointIds,
      grade: paper.grade,
      schoolYear: paper.schoolYear,
      classIds: [],
      studentIds: [],
      sections,
      typeId: undefined,
      version: 1,
      status: "draft",
      createdAt: now,
      updatedAt: now,
    };

    db.update("lectures", (list) => [lecture, ...list]);

    return { lectureId: lecture.id };
  },
};
