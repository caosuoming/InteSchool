import { DEFAULT_QUESTION_TYPES, type QuestionType } from "@/types";

export interface QuestionTypeOption {
  value: QuestionType;
  label: string;
}

export const DEFAULT_QUESTION_TYPE_OPTIONS: QuestionTypeOption[] = DEFAULT_QUESTION_TYPES.map(
  (option) => ({ ...option }),
);

const DEFAULT_QUESTION_TYPE_LABELS = new Map(
  DEFAULT_QUESTION_TYPE_OPTIONS.map((option) => [option.value, option.label] as const),
);

export function getDefaultQuestionTypeLabel(value: QuestionType): string {
  return DEFAULT_QUESTION_TYPE_LABELS.get(value) || value;
}

export function normalizeQuestionTypeForSubject(
  type: QuestionType,
  subject?: string,
): QuestionType {
  return subject?.trim() === "数学" && type === "comprehensive" ? "essay" : type;
}
