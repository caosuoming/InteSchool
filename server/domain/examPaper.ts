import type {
  AnswerRecord,
  ExamPaper,
  ExamPaperQuestion,
  ExtractedDocumentBlock,
  ResourceFilter,
  ResourceSemester,
} from "../../src/types/index.js";
import { db } from "../runtime-db.js";
import type { TeacherRecord } from "../types.js";
import { publishAnswerSheetsForUsage } from "./document-resource-lock.js";
import type { UsageImportItem, UsageMetadataUpdate } from "../../src/lib/exam-usage-spreadsheet.js";
import { delay, genId, maybeThrowError } from "../domain-shared.js";
import { questionService, recordQuestionUsage } from "./question.js";
import { reflectionService } from "./reflection.js";
import { answerSheetInvalidationPatch, hasDocumentAnswerRecords, withUsagePublishedAnswerSheet, sanitizeExamPaperPatch } from "./document-resource-lock.js";
import { assertResourceCapacity } from "./quota.js";
import { moveExamPaperToLecture } from "./document-library-move.js";
import { examPaperKnowledgePointIds } from "./document-knowledge.js";
import { withPaperAnnotationSummary } from "./document-annotation-summary.js";
import { subjectAwareDefaultQuestionScore } from "../../src/lib/question-default-score.js";
import { splitGeographyChoiceGroup } from "../../src/lib/geography-paper-layout.js";

function mergeNumberedAnswers(previous: string | undefined, incoming: string): string {
  if (!previous) return incoming;
  const parse = (value: string) => {
    const lines = value.split("\n").filter((line) => line.trim());
    const pairs = lines.map((line) => /^(\d+)[.．、]\s+(.+)$/.exec(line.trim()));
    if (pairs.length !== lines.length || pairs.some((pair) => !pair)) return null;
    const mapped = new Map(pairs.map((pair) => [Number(pair![1]), pair![2]]));
    return mapped.size === lines.length ? mapped : null;
  };
  const prior = parse(previous);
  const next = parse(incoming);
  if (!prior || !next) return incoming;
  for (const [number, answer] of next) prior.set(number, answer);
  return [...prior].sort(([a], [b]) => a - b)
    .map(([number, answer]) => String(number) + ". " + answer).join("\n");
}


function withDerivedKnowledgePoints(paper: ExamPaper): ExamPaper {
  return { ...withUsagePublishedAnswerSheet(paper), knowledgePointIds: examPaperKnowledgePointIds(paper) };
}

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
    const ids = examPaperKnowledgePointIds(p);
    const logic = filter.knowledgeLogic || "or";
    if (logic === "and") {
      if (!filter.knowledgePointIds.every((k) => ids.includes(k))) return false;
    } else {
      if (!filter.knowledgePointIds.some((k) => ids.includes(k))) return false;
    }
  }
  if (filter.thoughtMethodIds?.length) {
    const ids = p.thoughtMethodIds || [];
    if ((filter.methodLogic || "or") === "and") {
      if (!filter.thoughtMethodIds.every((id) => ids.includes(id))) return false;
    } else if (!filter.thoughtMethodIds.some((id) => ids.includes(id))) return false;
  }
  if (filter.errorReasonIds?.length) {
    const ids = p.errorReasonIds || [];
    if ((filter.errorReasonLogic || "or") === "and") {
      if (!filter.errorReasonIds.every((id) => ids.includes(id))) return false;
    } else if (!filter.errorReasonIds.some((id) => ids.includes(id))) return false;
  }
  if (filter.grade && p.grade !== filter.grade) return false;
  if (filter.schoolYear && p.schoolYear !== filter.schoolYear) return false;
  if (filter.semester && (p.semester || "上学期") !== filter.semester) return false;
  if (filter.teacherId && p.teacherId !== filter.teacherId) return false;
  if (filter.schoolId && p.schoolId !== filter.schoolId) return false;
  if (filter.typeId && p.typeId !== filter.typeId) return false;
  return true;
}

export interface ExamPaperInput {
  title: string;
  description?: string;
  chapterIds: string[];
  knowledgePointIds: string[];
  grade: string;
  schoolYear: string;
  semester?: ResourceSemester;
  duration: number;
  totalScore: number;
  questions: ExamPaperQuestion[];
  typeId?: string;
  questionSourceType?: string;
  questionCategory?: string;
  layoutMode?: "grouped" | "flat";
  questionTypeOrder?: string[];
  questionTypeLabels?: Record<string, string>;
  classIds?: string[];
  managementCategory?: "homework" | "exam";
  assignedDate?: string;
  assignedEndDate?: string;
  status?: "draft" | "published";
  originalFileUrl?: string;
  originalFileName?: string;
  originalFileType?: "word" | "pdf";
  originalFileSize?: number;
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function validateManagementFields(value: Pick<ExamPaper, "managementCategory" | "assignedDate" | "assignedEndDate">): void {
  if (value.managementCategory && value.managementCategory !== "homework" && value.managementCategory !== "exam") {
    throw new Error("管理目录不正确");
  }
  if (value.assignedDate && !DATE_PATTERN.test(value.assignedDate)) throw new Error("作业开始日期格式不正确");
  if (value.assignedEndDate) {
    if (!value.assignedDate || !DATE_PATTERN.test(value.assignedEndDate) || value.assignedEndDate < value.assignedDate) {
      throw new Error("作业结束日期不正确");
    }
  }
}

function referencedQuestionIds(questions: readonly ExamPaperQuestion[]): string[] {
  return questions.flatMap((question) => question.questionId ? [question.questionId] : []);
}

function newlyReferencedQuestionIds(
  previousQuestions: readonly ExamPaperQuestion[],
  nextQuestions: readonly ExamPaperQuestion[],
): string[] {
  const previousIds = new Set(referencedQuestionIds(previousQuestions));
  return referencedQuestionIds(nextQuestions).filter((questionId) => !previousIds.has(questionId));
}

export const examPaperService = {
  /** 经 RPC 注入当前登录教师，校验试卷和学生后原子导入明细。 */
  async importUsageData(
    paperId: string, items: UsageImportItem[], metadataUpdates: UsageMetadataUpdate[], teacher: TeacherRecord,
  ): Promise<{ imported: number; studentCount: number; updatedPaper?: ExamPaper }> {
    const paper = (db.read("examPapers") as ExamPaper[]).find((candidate) => candidate.id === paperId);
    if (!paper || paper.teacherId !== teacher.id || paper.schoolId !== teacher.schoolId) {
      throw new Error("无权导入此试卷的使用数据");
    }
    if (!Array.isArray(items) || !items.length || items.length > 20000) {
      throw new Error("导入数据为空或超过单次 20000 条限制");
    }
    if (!Array.isArray(metadataUpdates) || metadataUpdates.length > paper.questions.length * 2) {
      throw new Error("试卷题目信息修改无效");
    }
    const revisedQuestions = paper.questions.map((question) => ({ ...question }));
    const revisedById = new Map(revisedQuestions.map((question) => [question.id, question]));
    const seenMetadata = new Set<string>();
    for (const update of metadataUpdates) {
      if (!update || typeof update.paperQuestionId !== "string"
        || (update.attribute !== "score" && update.attribute !== "answer")
        || typeof update.expected !== "string" || typeof update.value !== "string") {
        throw new Error("试卷题目信息修改无效");
      }
      const question = revisedById.get(update.paperQuestionId);
      if (!question) throw new Error("题目信息修改不属于当前试卷");
      const key = `${update.paperQuestionId}:${update.attribute}`;
      if (seenMetadata.has(key)) throw new Error("重复的题目信息修改");
      seenMetadata.add(key);
      const current = update.attribute === "score" ? String(question.score) : (question.answer || "").trim();
      if (current !== update.expected) throw new Error("试卷题目已发生变化，请重新核对后导入");
      if (update.attribute === "score") {
        const next = Number(update.value);
        if (!update.value.trim() || !Number.isFinite(next) || next < 0 || next > 10000)
          throw new Error("Excel 题目满分无效");
        question.score = next;
      } else {
        const answer = update.value.trim();
        if (!answer || answer.length > 256) throw new Error("Excel 标准答案无效");
        question.answer = answer;
      }
    }
    const questionById = revisedById;
    const linkedById = new Map((paper.contentBlocks || [])
      .filter((block) => block.type === "question" && block.examPaperQuestionId && block.questionId)
      .map((block) => [block.examPaperQuestionId!, block.questionId!]));
    const studentIds = new Set((db.read("students") || []).filter((student) => {
      if (student.schoolId !== paper.schoolId || student.status !== "active") return false;
      if ((paper.studentIds || []).includes(student.id) || (paper.classIds || []).includes(student.classId)) return true;
      return (db.read("personalClasses") || []).some((cls) =>
        (paper.classIds || []).includes(cls.id) && cls.studentIds.includes(student.id));
    }).map((student) => student.id));
    if (!studentIds.size) throw new Error("请先添加试卷使用班级及在读学生");
    const now = new Date().toISOString();
    const existing = new Map<string, AnswerRecord>((db.read("answerRecords") as AnswerRecord[] || []).map((record) =>
      [`${record.lectureId}:${record.studentId}:${record.questionId}`, record] as const));
    // Update the grading ceiling of existing records when the teacher adopts Excel's full mark.
    // Reject a smaller maximum that would invalidate scores already saved for this paper.
    for (const before of paper.questions) {
      const revised = revisedById.get(before.id)!;
      if (before.score === revised.score) continue;
      const questionId = before.questionId || linkedById.get(before.id) || `exam-item:${paper.id}:${before.id}`;
      for (const [key, record] of existing) {
        if (record.lectureId !== paperId || record.questionId !== questionId) continue;
        if (record.earnedScore !== undefined && record.earnedScore > revised.score + 1e-6)
          throw new Error(`第${paper.questions.indexOf(before) + 1}题已有学生得分超过新的满分，无法修改`);
        const score = record.earnedScore === undefined ? record.score
          : revised.score <= 0 ? "done"
            : record.earnedScore >= revised.score - 1e-6 ? "correct"
              : record.earnedScore === 0 ? "wrong" : "partial";
        existing.set(key, { ...record, maxScore: revised.score, score, isCorrect: score === "correct" });
      }
    }
    const seen = new Set<string>();
    const changes: AnswerRecord[] = [];
    for (const item of items) {
      if (!item || !studentIds.has(item.studentId)) throw new Error("导入包含不属于试卷使用班级的学生");
      const question = questionById.get(item.paperQuestionId);
      if (!question) throw new Error("导入题号不属于当前试卷");
      const questionId = question.questionId || linkedById.get(question.id) || `exam-item:${paper.id}:${question.id}`;
      const key = `${paperId}:${item.studentId}:${questionId}`;
      if (seen.has(key)) throw new Error("同一个学生和试题出现重复数据");
      seen.add(key);
      const rawSubScores = item.subScores;
      if (rawSubScores !== undefined && (!rawSubScores || typeof rawSubScores !== "object" || Array.isArray(rawSubScores)
        || Object.keys(rawSubScores).length > 100)) throw new Error("小题得分格式无效");
      const subScores: Record<string, number> | undefined = rawSubScores === undefined ? undefined : {};
      for (const [part, value] of Object.entries(rawSubScores || {})) {
        if (!/^[1-9]\d{0,2}$/.test(part) || typeof value !== "number" || !Number.isFinite(value)
          || value < 0 || value > 10000) throw new Error("小题得分格式无效");
        subScores![part] = value;
      }
      if (item.earnedScore !== undefined && (typeof item.earnedScore !== "number" || !Number.isFinite(item.earnedScore)
        || item.earnedScore < 0 || item.earnedScore > 10000)) throw new Error("题目得分格式无效");
      if (item.studentAnswer !== undefined && (typeof item.studentAnswer !== "string" || item.studentAnswer.length > 2048))
        throw new Error("学生答案长度超出限制");
      const old = existing.get(key);
      const subject = paper.subject?.trim() || teacher.subject?.trim();
      const grouped = subject === "地理" && question.type === "single"
        ? splitGeographyChoiceGroup(question.stem) : null;
      if (grouped && subScores && Object.keys(subScores).some((part) => Number(part) > grouped.questions.length))
        throw new Error("题组小题号超出范围");
      const mergedSubScores = subScores ? { ...(old?.subScores || {}), ...subScores } : old?.subScores;
      const subTotal = mergedSubScores ? Object.values(mergedSubScores).reduce((sum, n) => sum + n, 0) : undefined;
      const points = item.earnedScore ?? (subScores ? subTotal : undefined);
      const maxScore = question.score;
      if (maxScore > 0 && (points !== undefined && points > maxScore + 1e-6
        || (subScores && subTotal !== undefined && subTotal > maxScore + 1e-6))
        || item.earnedScore !== undefined && subScores && subTotal !== undefined && subTotal > item.earnedScore + 1e-6)
        throw new Error("题目得分或小题分数超过卷面满分");
      if (points === undefined && !item.studentAnswer?.trim()) throw new Error("有空的答题记录");
      const score = points === undefined
        ? old?.score || "done"
        : maxScore <= 0 ? "done" : points >= maxScore - 1e-6 ? "correct" : points === 0 ? "wrong" : "partial";
      const studentAnswer = grouped && item.studentAnswer
        ? mergeNumberedAnswers(old?.studentAnswer, item.studentAnswer)
        : item.studentAnswer ?? old?.studentAnswer;
      if (studentAnswer && studentAnswer.length > 2048) throw new Error("学生答案长度超出限制");
      changes.push({
        ...old,
        id: old?.id || genId("ar"),
        studentId: item.studentId,
        questionId,
        lectureId: paperId,
        score, isCorrect: score === "correct", source: "import",
        earnedScore: points ?? old?.earnedScore,
        maxScore: points === undefined ? old?.maxScore : maxScore,
        subScores: mergedSubScores,
        studentAnswer,
        answeredAt: now,
      });
    }
    for (const record of changes) {
      existing.set(`${record.lectureId}:${record.studentId}:${record.questionId}`, record);
    }
    if (metadataUpdates.length) {
      db.update("examPapers", (papers) => papers.map((item) => item.id === paperId
        ? { ...item, questions: revisedQuestions,
          totalScore: revisedQuestions.reduce((sum, question) => sum + question.score, 0),
          updatedAt: now }
        : item));
    }
    db.update("answerRecords", () => [...existing.values()]);
    const touched = new Set(changes.map((record) => record.questionId));
    db.update("questions", (questions) => questions.map((question) => touched.has(question.id)
      ? { ...question, lastUsedAt: now } : question));
    publishAnswerSheetsForUsage([paperId], now);
    return {
      imported: changes.length,
      studentCount: new Set(changes.map((record) => record.studentId)).size,
      ...(metadataUpdates.length ? { updatedPaper: withDerivedKnowledgePoints({ ...paper,
        questions: revisedQuestions,
        totalScore: revisedQuestions.reduce((sum, question) => sum + question.score, 0),
        updatedAt: now,
      }) } : {}),
    };
  },

  async listPapers(filter: ResourceFilter = {}): Promise<ExamPaper[]> {
    await delay(300);
    return withPaperAnnotationSummary(db
      .read("examPapers")
      .filter((p) => matchFilter(p, filter))
      .map(withDerivedKnowledgePoints)
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()));
  },

  async getPaper(id: string): Promise<ExamPaper | null> {
    await delay(200);
    const paper = db.read("examPapers").find((p) => p.id === id);
    return paper ? withDerivedKnowledgePoints(paper) : null;
  },

  async listPublishedAnswerSheets(): Promise<ExamPaper[]> {
    return db.read("examPapers")
      .map(withDerivedKnowledgePoints)
      .filter((item) => Boolean(item.hasAnswerSheet && item.answerSheetPublishedAt));
  },

  async getPublishedAnswerSheet(id: string): Promise<ExamPaper | null> {
    const item = db.read("examPapers").find((entry) => entry.id === id);
    const result = item ? withDerivedKnowledgePoints(item) : null;
    return result?.hasAnswerSheet && result.answerSheetPublishedAt ? result : null;
  },

  async publishAnswerSheet(id: string, settings?: ExamPaper["answerSheetSettings"]): Promise<ExamPaper> {
    let updated: ExamPaper | undefined;
    db.update("examPapers", (list) => list.map((item) => {
      if (item.id !== id) return item;
      if (!item.hasAnswerSheet) throw new Error("请先制作答题卡");
      updated = item.answerSheetPublishedAt ? item : {
        ...item,
        ...(settings ? { answerSheetSettings: settings } : {}),
        answerSheetPublishedAt: new Date().toISOString(),
      };
      return updated;
    }));
    if (!updated) throw new Error("试卷不存在");
    return withDerivedKnowledgePoints(updated);
  },

  async unpublishAnswerSheet(id: string): Promise<ExamPaper> {
    if (hasDocumentAnswerRecords(id)) throw new Error("已有学生答题记录，不能撤回发布");
    let updated: ExamPaper | undefined;
    db.update("examPapers", (list) => list.map((item) => {
      if (item.id !== id) return item;
      updated = { ...item, answerSheetPublishedAt: undefined };
      return updated;
    }));
    if (!updated) throw new Error("试卷不存在");
    return withDerivedKnowledgePoints(updated);
  },

  async markPaperDownloaded(id: string): Promise<ExamPaper> {
    let updated: ExamPaper | undefined;
    db.update("examPapers", (list) => list.map((item) => {
      if (item.id !== id) return item;
      updated = item.paperDownloadedAt ? item : { ...item, paperDownloadedAt: new Date().toISOString() };
      return updated;
    }));
    if (!updated) throw new Error("试卷不存在");
    return withDerivedKnowledgePoints(updated);
  },

  async invalidatePaperDownload(id: string): Promise<ExamPaper> {
    let updated: ExamPaper | undefined;
    db.update("examPapers", (list) => list.map((item) => {
      if (item.id !== id) return item;
      updated = { ...item, paperDownloadedAt: undefined };
      return updated;
    }));
    if (!updated) throw new Error("试卷不存在");
    return withDerivedKnowledgePoints(updated);
  },

  async markAnswerSheetExported(id: string, settings?: ExamPaper["answerSheetSettings"]): Promise<ExamPaper> {
    let updated: ExamPaper | undefined;
    db.update("examPapers", (list) => list.map((item) => {
      if (item.id !== id) return item;
      if (!item.hasAnswerSheet) throw new Error("请先制作答题卡");
      updated = {
        ...item,
        ...(settings ? { answerSheetSettings: settings } : {}),
        answerSheetExportedAt: item.answerSheetExportedAt || new Date().toISOString(),
      };
      return updated;
    }));
    if (!updated) throw new Error("试卷不存在");
    return withDerivedKnowledgePoints(updated);
  },

  async invalidateAnswerSheet(id: string): Promise<ExamPaper> {
    if (hasDocumentAnswerRecords(id)) throw new Error("文档已有答题记录，不能作废答题卡");
    let updated: ExamPaper | undefined;
    db.update("examPapers", (list) => list.map((item) => {
      if (item.id !== id) return item;
      if (item.answerSheetPublishedAt) throw new Error("请先撤回发布答题卡再作废");
      updated = {
        ...item,
        hasAnswerSheet: undefined,
        answerSheetCreatedAt: undefined,
        answerSheetRevisionId: undefined,
        answerSheetSettings: undefined,
        answerSheetExportedAt: undefined,
      };
      return updated;
    }));
    if (!updated) throw new Error("试卷不存在");
    return withDerivedKnowledgePoints(updated);
  },

  async markAnswerSheetCreated(
    id: string,
    settings?: ExamPaper["answerSheetSettings"],
  ): Promise<ExamPaper | null> {
    await delay(100);
    let updated: ExamPaper | null = null;
    const now = new Date().toISOString();
    db.update("examPapers", (list) => list.map((paper) => {
      if (paper.id !== id) return paper;
      if (paper.answerSheetPublishedAt && settings && JSON.stringify(settings) !== JSON.stringify(paper.answerSheetSettings)) {
        throw new Error("答题卡已发布，请先撤回发布再编辑");
      }
      updated = {
        ...paper,
        hasAnswerSheet: true,
        answerSheetCreatedAt: paper.answerSheetCreatedAt || now,
        answerSheetRevisionId: paper.hasAnswerSheet ? paper.answerSheetRevisionId : genId("sheet"),
        ...(settings ? { answerSheetSettings: settings } : {}),
      };
      return updated;
    }));
    return updated ? withDerivedKnowledgePoints(updated) : null;
  },

  async createPaper(
    teacherId: string,
    schoolId: string,
    input: ExamPaperInput,
  ): Promise<ExamPaper> {
    await delay(400);
    maybeThrowError();
    assertResourceCapacity(teacherId, "examPaper");
    validateManagementFields(input);
    const now = new Date().toISOString();
    const paper: ExamPaper = {
      id: genId("exam"),
      teacherId,
      schoolId,
      title: input.title,
      description: input.description,
      chapterIds: input.chapterIds,
      knowledgePointIds: [],
      grade: input.grade,
      schoolYear: input.schoolYear,
      semester: input.semester || "上学期",
      duration: input.duration,
      totalScore: input.totalScore,
      questions: input.questions,
      typeId: input.typeId,
      questionSourceType: input.questionSourceType,
      questionCategory: input.questionCategory,
      layoutMode: input.layoutMode || "grouped",
      questionTypeOrder: input.questionTypeOrder,
      questionTypeLabels: input.questionTypeLabels,
      classIds: input.classIds || [],
      managementCategory: input.managementCategory || "homework",
      assignedDate: input.assignedDate,
      assignedEndDate: input.assignedEndDate,
      studentIds: [],
      status: input.status || "draft",
      originalFileUrl: input.originalFileUrl,
      originalFileName: input.originalFileName,
      originalFileType: input.originalFileType,
      originalFileSize: input.originalFileSize,
      createdAt: now,
      updatedAt: now,
    };
    db.update("examPapers", (list) => [paper, ...list]);
    recordQuestionUsage(referencedQuestionIds(paper.questions));
    return withDerivedKnowledgePoints(paper);
  },

  async updatePaper(id: string, patch: Partial<ExamPaper>): Promise<ExamPaper> {
    await delay(300);
    maybeThrowError();
    let updated: ExamPaper | null = null;
    let addedQuestionIds: string[] = [];
    db.update("examPapers", (list) =>
      list.map((p) => {
        if (p.id === id) {
          const safePatch = sanitizeExamPaperPatch(p, patch);
          validateManagementFields({ ...p, ...safePatch });
          delete safePatch.knowledgePointIds;
          if (safePatch.questions) {
            addedQuestionIds = newlyReferencedQuestionIds(p.questions, safePatch.questions);
          }
          updated = {
            ...p,
            ...safePatch,
            ...answerSheetInvalidationPatch(p, safePatch, "paper"),
            updatedAt: new Date().toISOString(),
          };
          return updated;
        }
        return p;
      }),
    );
    if (!updated) throw new Error("试卷不存在");
    recordQuestionUsage(addedQuestionIds);
    return withDerivedKnowledgePoints(updated);
  },

  async deletePaper(id: string): Promise<void> {
    await delay(200);
    if (db.read("examPapers").some((item) => item.id === id && item.answerSheetPublishedAt)) {
      throw new Error("答题卡已发布，请先撤回发布再删除试卷");
    }
    db.update("examPapers", (list) => list.filter((p) => p.id !== id));
  },

  /**
   * 创建副本：复制试卷（含题目），并复制关联的课后反思
   */
  async duplicatePaper(
    sourceId: string,
    newTitle?: string,
  ): Promise<ExamPaper> {
    await delay(400);
    maybeThrowError();
    const source = db.read("examPapers").find((p) => p.id === sourceId);
    if (!source) throw new Error("原试卷不存在");
    assertResourceCapacity(source.teacherId, "examPaper");
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
      excludedPendingQuestionIds: [],
      status: "draft",
      managementCategory: "homework",
      assignedDate: undefined,
      assignedEndDate: undefined,
      questions: copiedQuestions,
      knowledgePointIds: [],
      contentBlocks: undefined,
      originalFileUrl: undefined,
      originalFileName: undefined,
      originalFileType: undefined,
      originalFileSize: undefined,
      isExtractCopy: undefined,
      sourceResourceId: undefined,
      extractStatus: undefined,
      paperDownloadedAt: undefined,
      answerSheetExportedAt: undefined,
      hasAnswerSheet: undefined,
      answerSheetCreatedAt: undefined,
      answerSheetRevisionId: undefined,
      answerSheetPublishedAt: undefined,
      answerSheetSettings: undefined,
      createdAt: now,
      updatedAt: now,
    };
    db.update("examPapers", (list) => [duplicated, ...list]);
    recordQuestionUsage(referencedQuestionIds(duplicated.questions));
    // 复制关联反思
    await reflectionService.copyToTarget(
      source.teacherId,
      source.schoolId,
      source.id,
      duplicated.id,
    );
    return withDerivedKnowledgePoints(duplicated);
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
    if (paper.answerSheetPublishedAt) throw new Error("答题卡已发布，请先撤回发布再编辑试卷");

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
          chapterIds: [],
          knowledgePointIds: [],
          grade: paper.grade,
          schoolYear: paper.schoolYear,
          semester: paper.semester || "上学期",
          sourceType: paper.questionSourceType,
          category: paper.questionCategory,
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
  async createExtractCopy(
    sourceId: string,
    contentBlocks: ExtractedDocumentBlock[] = [],
  ): Promise<ExamPaper> {
    await delay(400);
    maybeThrowError();
    const source = db.read("examPapers").find((p) => p.id === sourceId);
    if (!source) throw new Error("源试卷不存在");
    if (source.answerSheetPublishedAt) throw new Error("答题卡已发布，请先撤回发布再拆解试卷");
    assertResourceCapacity(source.teacherId, "examPaper");
    const subject = (db.read("teachers") || []).find((teacher) => teacher.id === source.teacherId)?.subject;
    const now = new Date().toISOString();
    const normalizedBlocks = contentBlocks.map((block) => ({
      ...block,
      id: genId("doc-block"),
    }));
    const copiedQuestions: ExamPaperQuestion[] = normalizedBlocks.length > 0
      ? normalizedBlocks
        .filter((block) => block.type === "question")
        .map((block) => {
          const id = genId("epq");
          block.examPaperQuestionId = id;
          const linkedQuestion = block.questionId
            ? (db.read("questions") || []).find((question) => question.id === block.questionId)
            : undefined;
          const type = linkedQuestion?.type || block.questionType || "short";
          return {
            id,
            questionId: block.questionId,
            listeningAudios: linkedQuestion?.listeningAudios?.map((audio) => ({ ...audio })),
            stem: block.content || linkedQuestion?.stem || "",
            options: linkedQuestion?.options,
            answer: linkedQuestion?.answer || "",
            analysis: linkedQuestion?.analysis || "",
            score: subjectAwareDefaultQuestionScore(
              type,
              subject,
              type === "essay" ? 15 : type === "short" ? 5 : type === "multiple" ? 3 : 2,
            ),
            type,
          };
        })
      : source.questions.map((q) => ({
        ...q,
        id: genId("epq"),
      }));
    const copy: ExamPaper = {
      ...source,
      id: genId("exam"),
      title: `${source.title}（拆解版）`,
      managementCategory: "homework",
      assignedDate: undefined,
      assignedEndDate: undefined,
      questions: copiedQuestions,
      knowledgePointIds: [],
      totalScore: copiedQuestions.reduce((sum, question) => sum + question.score, 0),
      contentBlocks: normalizedBlocks.length > 0 ? normalizedBlocks : source.contentBlocks,
      isExtractCopy: true,
      sourceResourceId: sourceId,
      extractStatus: "done",
      originalFileUrl: undefined,
      originalFileName: undefined,
      originalFileType: undefined,
      originalFileSize: undefined,
      paperDownloadedAt: undefined,
      answerSheetExportedAt: undefined,
      hasAnswerSheet: undefined,
      answerSheetCreatedAt: undefined,
      answerSheetRevisionId: undefined,
      answerSheetPublishedAt: undefined,
      answerSheetSettings: undefined,
      status: "draft",
      createdAt: now,
      updatedAt: now,
    };
    db.update("examPapers", (list) => [copy, ...list]);
    // 拆解状态属于系统来源信息，不通过普通属性更新接口写入。
    db.update("examPapers", (list) => list.map((paper) => (
      paper.id === sourceId
        ? { ...paper, extractStatus: "done", updatedAt: now }
        : paper
    )));
    recordQuestionUsage(referencedQuestionIds(copiedQuestions));
    return withDerivedKnowledgePoints(copy);
  },

  /**
   * 获取试卷的拆解副本
   */
  async getExtractCopy(sourceId: string): Promise<ExamPaper | null> {
    await delay(200);
    const copy = db.read("examPapers").find(
      (p) => p.sourceResourceId === sourceId && p.isExtractCopy,
    );
    return copy ? withDerivedKnowledgePoints(copy) : null;
  },

  /** 将试卷连同其文档状态一起移动到讲义库。 */
  async convertToLecture(paperId: string): Promise<{ lectureId: string }> {
    await delay(500);
    maybeThrowError();
    return moveExamPaperToLecture(paperId);
  },
};
