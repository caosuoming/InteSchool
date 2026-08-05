import type {
  ExamPaper,
  ExamPaperQuestion,
  ExtractedDocumentBlock,
  Lecture,
  LectureSection,
} from "../../src/types/index.js";
import { isDocumentStructureLocked } from "../../src/lib/document-resource.js";

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
      && question.stem === next.stem
      && sameStringArray(question.options, next.options)
      && question.answer === next.answer
      && question.analysis === next.analysis
      && question.type === next.type;
  });
}

function sameJsonStructure(
  current: readonly ExtractedDocumentBlock[] | readonly LectureSection[] | undefined,
  incoming: readonly ExtractedDocumentBlock[] | readonly LectureSection[] | undefined,
): boolean {
  return JSON.stringify(current || []) === JSON.stringify(incoming || []);
}

export function sanitizeExamPaperPatch(
  current: ExamPaper,
  patch: Partial<ExamPaper>,
): Partial<ExamPaper> {
  if (!isDocumentStructureLocked(current)) return patch;

  const safePatch = { ...patch };
  delete safePatch.originalFileUrl;
  delete safePatch.originalFileName;
  delete safePatch.originalFileType;
  delete safePatch.originalFileSize;
  delete safePatch.isExtractCopy;
  delete safePatch.sourceResourceId;
  delete safePatch.extractStatus;
  if (patch.questions) {
    if (!samePaperQuestionStructure(current.questions, patch.questions)) {
      throw new Error("上传原稿和拆解稿不能换题、删除题目或调整题目顺序");
    }
    safePatch.questions = current.questions.map((question, index) => ({
      ...question,
      score: patch.questions![index].score,
    }));
    safePatch.totalScore = safePatch.questions.reduce((sum, question) => sum + question.score, 0);
  } else if (patch.totalScore !== undefined && patch.totalScore !== current.totalScore) {
    throw new Error("请通过题目分值修改试卷总分");
  }

  if (patch.contentBlocks && !sameJsonStructure(current.contentBlocks, patch.contentBlocks)) {
    throw new Error("上传原稿和拆解稿不能编辑文档内容结构");
  }
  if (patch.layoutMode !== undefined && patch.layoutMode !== current.layoutMode) {
    throw new Error("上传原稿和拆解稿不能调整题目编排方式");
  }
  delete safePatch.contentBlocks;
  delete safePatch.layoutMode;
  return safePatch;
}

export function sanitizeLecturePatch(
  current: Lecture,
  patch: Partial<Lecture>,
): Partial<Lecture> {
  if (!isDocumentStructureLocked(current)) return patch;

  if (patch.sections && !sameJsonStructure(current.sections, patch.sections)) {
    throw new Error("上传原稿和拆解稿不能编辑、删除或调整讲义内容顺序");
  }
  if (patch.contentBlocks && !sameJsonStructure(current.contentBlocks, patch.contentBlocks)) {
    throw new Error("上传原稿和拆解稿不能编辑文档内容结构");
  }

  const safePatch = { ...patch };
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
  delete safePatch.sections;
  delete safePatch.contentBlocks;
  return safePatch;
}
