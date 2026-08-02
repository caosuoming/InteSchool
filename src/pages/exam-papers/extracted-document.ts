import type {
  ExamPaperQuestion,
  ExtractedDocumentBlock,
  Question,
} from "@/types";

export interface ExtractedQuestionDisplay {
  stem: string;
  options?: string[];
  answer: string;
  analysis: string;
}

export function resolveExtractedQuestionDisplay(
  paperQuestion: ExamPaperQuestion | undefined,
  linkedQuestion: Question | undefined,
  stemOverride?: string,
): ExtractedQuestionDisplay {
  const options = paperQuestion?.options?.length
    ? paperQuestion.options
    : linkedQuestion?.options;

  return {
    stem: stemOverride || paperQuestion?.stem || linkedQuestion?.stem || "",
    options,
    answer: paperQuestion?.answer || linkedQuestion?.answer || "",
    analysis: paperQuestion?.analysis || linkedQuestion?.analysis || "",
  };
}

export function questionIdsUnderHeading(
  blocks: ExtractedDocumentBlock[],
  headingId: string,
): string[] {
  const isQuestionGroup = (block: ExtractedDocumentBlock) => (
    block.type === "groupTitle" || block.type === "heading"
  );
  const headingIndex = blocks.findIndex((block) => block.id === headingId && isQuestionGroup(block));
  if (headingIndex < 0) return [];

  const result: string[] = [];
  for (let index = headingIndex + 1; index < blocks.length; index += 1) {
    const block = blocks[index];
    if (isQuestionGroup(block)) break;
    if (block.type === "question" && block.examPaperQuestionId) {
      result.push(block.examPaperQuestionId);
    }
  }
  return result;
}

export function commonScoreUnderHeading(
  blocks: ExtractedDocumentBlock[],
  questions: ExamPaperQuestion[],
  headingId: string,
): number | null {
  const questionIds = new Set(questionIdsUnderHeading(blocks, headingId));
  const scores = questions
    .filter((question) => questionIds.has(question.id))
    .map((question) => question.score);

  if (scores.length === 0) return null;
  return scores.every((score) => score === scores[0]) ? scores[0] : null;
}

export function setScoreUnderHeading(
  blocks: ExtractedDocumentBlock[],
  questions: ExamPaperQuestion[],
  headingId: string,
  score: number,
): ExamPaperQuestion[] {
  if (!Number.isFinite(score) || score < 0) return questions;
  const questionIds = new Set(questionIdsUnderHeading(blocks, headingId));
  if (questionIds.size === 0) return questions;

  return questions.map((question) => (
    questionIds.has(question.id) ? { ...question, score } : question
  ));
}
