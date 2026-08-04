import type { AnswerRecord, ExtractedDocumentBlock } from "@/types";

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
