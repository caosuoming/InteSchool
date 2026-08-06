import { basketService } from "@/services/basket";

export const REFERENCED_QUESTION_REMOVAL_PROMPT = "是否移除已引用题目？";

export interface ReferencedQuestionRemovalResult {
  confirmed: boolean;
  removedQuestionIds: string[];
  failedQuestionIds: string[];
}

export async function promptToRemoveReferencedBasketQuestions(
  basketId: string | null | undefined,
  questionIds: string[],
): Promise<ReferencedQuestionRemovalResult> {
  const uniqueQuestionIds = Array.from(new Set(questionIds.filter(Boolean)));
  if (!basketId || uniqueQuestionIds.length === 0) {
    return { confirmed: false, removedQuestionIds: [], failedQuestionIds: [] };
  }
  if (!confirm(REFERENCED_QUESTION_REMOVAL_PROMPT)) {
    return { confirmed: false, removedQuestionIds: [], failedQuestionIds: [] };
  }

  const results = await Promise.allSettled(
    uniqueQuestionIds.map((questionId) => basketService.removeQuestion(basketId, questionId)),
  );
  const removedQuestionIds: string[] = [];
  const failedQuestionIds: string[] = [];
  results.forEach((result, index) => {
    const questionId = uniqueQuestionIds[index];
    if (result.status === "fulfilled") removedQuestionIds.push(questionId);
    else failedQuestionIds.push(questionId);
  });

  return { confirmed: true, removedQuestionIds, failedQuestionIds };
}
