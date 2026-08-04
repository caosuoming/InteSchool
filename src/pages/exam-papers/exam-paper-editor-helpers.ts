import type { AnswerRecord, ExamPaperQuestion, ExtractedDocumentBlock } from "@/types";

export interface QuestionProgress {
  answeredCount: number;
  targetCount: number;
  scoredCount: number;
  correctRate: number | null;
}

export function buildQuestionProgress(
  records: AnswerRecord[],
  targetStudentIds: string[],
): Record<string, QuestionProgress> {
  const targetIds = new Set(targetStudentIds);
  const latestByStudentAndQuestion = new Map<string, AnswerRecord>();

  records.forEach((record) => {
    if (!targetIds.has(record.studentId)) return;
    const key = `${record.studentId}:${record.questionId}`;
    const current = latestByStudentAndQuestion.get(key);
    if (!current || new Date(record.answeredAt).getTime() >= new Date(current.answeredAt).getTime()) {
      latestByStudentAndQuestion.set(key, record);
    }
  });

  const aggregates = new Map<string, {
    answeredCount: number;
    scoredCount: number;
    correctCount: number;
  }>();

  latestByStudentAndQuestion.forEach((record) => {
    const aggregate = aggregates.get(record.questionId) || {
      answeredCount: 0,
      scoredCount: 0,
      correctCount: 0,
    };
    aggregate.answeredCount += 1;

    const score = record.score || (record.isCorrect ? "correct" : "wrong");
    if (score !== "done") {
      aggregate.scoredCount += 1;
      if (score === "correct") aggregate.correctCount += 1;
    }
    aggregates.set(record.questionId, aggregate);
  });

  return Object.fromEntries(Array.from(aggregates.entries()).map(([questionId, aggregate]) => [
    questionId,
    {
      answeredCount: aggregate.answeredCount,
      targetCount: targetStudentIds.length,
      scoredCount: aggregate.scoredCount,
      correctRate: aggregate.scoredCount > 0
        ? aggregate.correctCount / aggregate.scoredCount
        : null,
    },
  ]));
}

export function isQuestionGroupBlock(block: ExtractedDocumentBlock): boolean {
  return block.type === "groupTitle" || block.type === "heading";
}

export function getCollapsedStructuredBlockIds(
  blocks: ExtractedDocumentBlock[],
  collapsedHeadingIds: Set<string>,
): Set<string> {
  const hiddenIds = new Set<string>();
  let activeCollapsedHeading = false;

  blocks.forEach((block) => {
    if (isQuestionGroupBlock(block)) {
      activeCollapsedHeading = collapsedHeadingIds.has(block.id);
      return;
    }
    if (activeCollapsedHeading) hiddenIds.add(block.id);
  });

  return hiddenIds;
}

export function getHeadingInsertIndex(
  blocks: ExtractedDocumentBlock[],
  headingId: string,
): number {
  const headingIndex = blocks.findIndex((block) => block.id === headingId && isQuestionGroupBlock(block));
  if (headingIndex < 0) return blocks.length;

  for (let index = headingIndex + 1; index < blocks.length; index += 1) {
    if (isQuestionGroupBlock(blocks[index])) return index;
  }
  return blocks.length;
}

export function insertBlocksUnderHeading(
  blocks: ExtractedDocumentBlock[],
  headingId: string,
  insertedBlocks: ExtractedDocumentBlock[],
): ExtractedDocumentBlock[] {
  const insertIndex = getHeadingInsertIndex(blocks, headingId);
  return [
    ...blocks.slice(0, insertIndex),
    ...insertedBlocks,
    ...blocks.slice(insertIndex),
  ];
}

function getQuestionGroupStarts(blocks: ExtractedDocumentBlock[]): number[] {
  return blocks.reduce<number[]>((starts, block, index) => {
    if (isQuestionGroupBlock(block)) starts.push(index);
    return starts;
  }, []);
}

export function canMoveStructuredQuestionGroup(
  blocks: ExtractedDocumentBlock[],
  headingId: string,
  direction: "up" | "down",
): boolean {
  const groupStarts = getQuestionGroupStarts(blocks);
  const groupIndex = groupStarts.findIndex((index) => blocks[index].id === headingId);
  if (groupIndex < 0) return false;
  return direction === "up"
    ? groupIndex > 0
    : groupIndex < groupStarts.length - 1;
}

export function moveStructuredQuestionGroup(
  blocks: ExtractedDocumentBlock[],
  headingId: string,
  direction: "up" | "down",
): ExtractedDocumentBlock[] {
  const groupStarts = getQuestionGroupStarts(blocks);
  const groupIndex = groupStarts.findIndex((index) => blocks[index].id === headingId);
  if (groupIndex < 0 || !canMoveStructuredQuestionGroup(blocks, headingId, direction)) {
    return blocks;
  }

  const currentStart = groupStarts[groupIndex];
  const currentEnd = groupStarts[groupIndex + 1] ?? blocks.length;

  if (direction === "up") {
    const previousStart = groupStarts[groupIndex - 1];
    return [
      ...blocks.slice(0, previousStart),
      ...blocks.slice(currentStart, currentEnd),
      ...blocks.slice(previousStart, currentStart),
      ...blocks.slice(currentEnd),
    ];
  }

  const nextStart = groupStarts[groupIndex + 1];
  const nextEnd = groupStarts[groupIndex + 2] ?? blocks.length;
  return [
    ...blocks.slice(0, currentStart),
    ...blocks.slice(nextStart, nextEnd),
    ...blocks.slice(currentStart, nextStart),
    ...blocks.slice(nextEnd),
  ];
}

export function orderPaperQuestionsByContentBlocks(
  blocks: ExtractedDocumentBlock[],
  questions: ExamPaperQuestion[],
): ExamPaperQuestion[] {
  const questionsById = new Map(questions.map((question) => [question.id, question]));
  const orderedIds = new Set<string>();
  const orderedQuestions: ExamPaperQuestion[] = [];

  blocks.forEach((block) => {
    if (block.type !== "question" || !block.examPaperQuestionId) return;
    const question = questionsById.get(block.examPaperQuestionId);
    if (!question || orderedIds.has(question.id)) return;
    orderedIds.add(question.id);
    orderedQuestions.push(question);
  });

  return [
    ...orderedQuestions,
    ...questions.filter((question) => !orderedIds.has(question.id)),
  ];
}
