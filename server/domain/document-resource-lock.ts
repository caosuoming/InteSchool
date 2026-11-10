import { isDeepStrictEqual } from "node:util";
import { genId } from "../domain-shared.js";
import type {
  ExamPaper,
  ExamPaperQuestion,
  Lecture,
} from "../../src/types/index.js";
import { isDocumentStructureLocked, isExamPaperStructureLocked } from "../../src/lib/document-resource.js";
import { db } from "../runtime-db.js";

export function hasDocumentAnswerRecords(documentId: string): boolean {
  return (db.read("answerRecords") || []).some((record) => record.lectureId === documentId);
}

export function withUsagePublishedAnswerSheet<T extends ExamPaper | Lecture>(document: T): T {
  if (document.answerSheetPublishedAt) return document;
  const record = (db.read("answerRecords") || []).find((item) => item.lectureId === document.id);
  if (!record) return document;
  return {
    ...document,
    hasAnswerSheet: true,
    answerSheetCreatedAt: document.answerSheetCreatedAt || record.answeredAt,
    answerSheetPublishedAt: record.answeredAt,
  };
}

export function publishAnswerSheetsForUsage(ids: Iterable<string>, now: string): void {
  const usedIds = new Set(ids);
  if (usedIds.size === 0) return;
  for (const collection of ["examPapers", "lectures"] as const) {
    if (!db.read(collection)) continue;
    db.update(collection, (documents) => documents.map((document) => {
      if (!usedIds.has(document.id) || document.answerSheetPublishedAt) return document;
      return {
        ...document,
        hasAnswerSheet: true,
        answerSheetCreatedAt: document.answerSheetCreatedAt || now,
        answerSheetRevisionId: document.answerSheetRevisionId || genId("sheet"),
        answerSheetPublishedAt: now,
      };
    }));
  }
}

function sameStringArray(left: string[] | undefined, right: string[] | undefined): boolean {
  if (left === right) return true;
  if (!left || !right || left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

function samePaperQuestionStructure(
  current: readonly ExamPaperQuestion[],
  incoming: readonly ExamPaperQuestion[],
): boolean {
  if (current.length !== incoming.length) return false;
  return current.every((question, index) => {
    const next = incoming[index];
    return Boolean(next)
      && question.id === next.id
      && question.questionId === next.questionId
      && question.projectId === next.projectId
      && question.stem === next.stem
      && sameStringArray(question.options, next.options)
      && ((question.type === "single" || question.type === "multiple") || question.answer === next.answer)
      && question.analysis === next.analysis
      && question.type === next.type;
  });
}

function sameJsonStructure(
  current: readonly unknown[] | undefined,
  incoming: readonly unknown[] | undefined,
): boolean {
  return JSON.stringify(current || []) === JSON.stringify(incoming || []);
}

const PAPER_CARD_FIELDS: (keyof ExamPaper)[] = [
  "title", "description", "grade", "schoolYear", "duration", "totalScore", "questions",
  "contentBlocks", "layoutMode", "questionTypeOrder", "questionTypeLabels", "projects",
];
const LECTURE_CARD_FIELDS: (keyof Lecture)[] = [
  "title", "description", "grade", "schoolYear", "sections", "contentBlocks",
];

export function answerSheetInvalidationPatch<T extends ExamPaper | Lecture>(
  current: T,
  patch: Partial<T>,
  type: "paper" | "lecture",
): Partial<T> {
  if (!current.hasAnswerSheet || current.answerSheetPublishedAt || hasDocumentAnswerRecords(current.id)) return {};
  const keys: readonly string[] = type === "paper" ? PAPER_CARD_FIELDS : LECTURE_CARD_FIELDS;
  const before = current as unknown as Record<string, unknown>;
  const after = patch as Record<string, unknown>;
  if (!keys.some((key) => Object.prototype.hasOwnProperty.call(after, key) && JSON.stringify(before[key]) !== JSON.stringify(after[key]))) return {};
  return {
    hasAnswerSheet: undefined,
    answerSheetCreatedAt: undefined,
    answerSheetPublishedAt: undefined,
    answerSheetSettings: undefined,
    answerSheetRevisionId: undefined,
  } as Partial<T>;
}

export function sanitizeExamPaperPatch(
  current: ExamPaper,
  patch: Partial<ExamPaper>,
): Partial<ExamPaper> {
  const metadataSafePatch = { ...patch };
  delete metadataSafePatch.hasAnswerSheet;
  delete metadataSafePatch.answerSheetCreatedAt;
  delete metadataSafePatch.answerSheetPublishedAt;
  delete metadataSafePatch.answerSheetSettings;
  delete metadataSafePatch.answerSheetRevisionId;
  delete metadataSafePatch.paperDownloadedAt;
  delete metadataSafePatch.answerSheetExportedAt;
  const used = Boolean(current.answerSheetPublishedAt) || hasDocumentAnswerRecords(current.id);
  if (!isExamPaperStructureLocked(current) && !used) return metadataSafePatch;
  if (used) {
    for (const [key, value] of Object.entries(metadataSafePatch)) {
      if (key === "questions" || key === "totalScore") continue;
      if (!isDeepStrictEqual(current[key as keyof ExamPaper], value)) {
        throw new Error(current.answerSheetPublishedAt ? "答题卡已发布，请先撤回发布才能修改文档结构" : "文档已用，不能修改文档结构");
      }
    }
    if (patch.questions && !patch.questions.every((question, index) =>
      isDeepStrictEqual({ ...question, score: current.questions[index]?.score }, current.questions[index])
    )) {
      throw new Error("文档已用或答题卡已发布，只能修改题目分值和题库属性");
    }
  }

  const safePatch = metadataSafePatch;
  const lockReason = isDocumentStructureLocked(current) ? "上传原稿和拆解稿" : "已下载的试卷或已导出的答题卡";
  delete safePatch.originalFileUrl;
  delete safePatch.originalFileName;
  delete safePatch.originalFileType;
  delete safePatch.originalFileSize;
  delete safePatch.isExtractCopy;
  delete safePatch.sourceResourceId;
  delete safePatch.extractStatus;
  delete safePatch.hasAnswerSheet;
  delete safePatch.answerSheetCreatedAt;
  if (patch.questions) {
    if (!samePaperQuestionStructure(current.questions, patch.questions)) {
      throw new Error(`${lockReason}不能换题、删除题目或调整题目顺序`);
    }
    safePatch.questions = current.questions.map((question, index) => ({
      ...question,
      score: patch.questions![index].score,
      ...((question.type === "single" || question.type === "multiple")
        ? { answer: patch.questions![index].answer }
        : {}),
    }));
    safePatch.totalScore = safePatch.questions.reduce((sum, question) => sum + question.score, 0);
  } else if (patch.totalScore !== undefined && patch.totalScore !== current.totalScore) {
    throw new Error("请通过题目分值修改试卷总分");
  }

  if (patch.contentBlocks && !sameJsonStructure(current.contentBlocks, patch.contentBlocks)) {
    throw new Error(`${lockReason}不能编辑文档内容结构`);
  }
  if (patch.layoutMode !== undefined && patch.layoutMode !== current.layoutMode) {
    throw new Error(`${lockReason}不能调整题目编排方式`);
  }
  if (patch.questionTypeOrder && !sameJsonStructure(current.questionTypeOrder, patch.questionTypeOrder)) {
    throw new Error("上传原稿和拆解稿不能调整题型顺序");
  }
  if (patch.questionTypeLabels && !isDeepStrictEqual(current.questionTypeLabels || {}, patch.questionTypeLabels)) {
    throw new Error(`${lockReason}不能修改题型标题`);
  }
  if (patch.projects && !sameJsonStructure(current.projects, patch.projects)) {
    throw new Error(`${lockReason}不能调整项目编排`);
  }
  delete safePatch.contentBlocks;
  delete safePatch.layoutMode;
  delete safePatch.questionTypeOrder;
  delete safePatch.questionTypeLabels;
  delete safePatch.projects;
  return safePatch;
}

export function sanitizeLecturePatch(
  current: Lecture,
  patch: Partial<Lecture>,
): Partial<Lecture> {
  const metadataSafePatch = { ...patch };
  delete metadataSafePatch.hasAnswerSheet;
  delete metadataSafePatch.answerSheetCreatedAt;
  delete metadataSafePatch.answerSheetPublishedAt;
  delete metadataSafePatch.answerSheetSettings;
  delete metadataSafePatch.answerSheetRevisionId;
  const used = Boolean(current.answerSheetPublishedAt) || hasDocumentAnswerRecords(current.id);
  if (!isDocumentStructureLocked(current) && !used) return metadataSafePatch;
  if (used) {
    for (const [key, value] of Object.entries(metadataSafePatch)) {
      if (!isDeepStrictEqual(current[key as keyof Lecture], value)) {
        throw new Error(current.answerSheetPublishedAt ? "答题卡已发布，请先撤回发布才能修改文档结构" : "文档已用，不能修改文档结构");
      }
    }
  }

  if (patch.sections && !sameJsonStructure(current.sections, patch.sections)) {
    throw new Error("上传原稿和拆解稿不能编辑、删除或调整讲义内容顺序");
  }
  if (patch.contentBlocks && !sameJsonStructure(current.contentBlocks, patch.contentBlocks)) {
    throw new Error("上传原稿和拆解稿不能编辑文档内容结构");
  }

  const safePatch = metadataSafePatch;
  delete safePatch.originalFileUrl;
  delete safePatch.originalFileName;
  delete safePatch.originalFileType;
  delete safePatch.originalFileSize;
  delete safePatch.isExtractCopy;
  delete safePatch.sourceResourceId;
  delete safePatch.extractStatus;
  delete safePatch.versionType;
  delete safePatch.hasOrigin;
  delete safePatch.hasPreview;
  delete safePatch.hasAnswerSheet;
  delete safePatch.answerSheetCreatedAt;
  delete safePatch.sections;
  delete safePatch.contentBlocks;
  return safePatch;
}
