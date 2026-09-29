import type { QuestionType } from "../types/index.js";

export function subjectAwareDefaultQuestionScore(
  type: QuestionType,
  subject: string | null | undefined,
  fallback: number,
): number {
  if (subject?.trim() !== "数学") return fallback;
  if (type === "single" || type === "short") return 5;
  if (type === "multiple") return 6;
  return fallback;
}
