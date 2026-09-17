import type { QuestionType } from "@/types";

export type AnswerSheetResourceType = "exam-paper" | "lecture";
export type AnswerSheetPaperSize = "A4" | "A3" | "8K";
export type AnswerSheetMode = "blank" | "with-questions";
export type AnswerSheetChoiceLayout = "inline" | "concentrated";
export type AnswerSheetWideColumns = 2 | 3;
export type AnswerSheetBoxStyle = "solid" | "dashed";

export interface AnswerSheetSettings {
  paperSize: AnswerSheetPaperSize;
  mode: AnswerSheetMode;
  studentNumberDigits: number;
  choiceLayout: AnswerSheetChoiceLayout;
  widePaperColumns: AnswerSheetWideColumns;
  answerBoxStyle: AnswerSheetBoxStyle;
}

export interface AnswerSheetQuestion {
  id: string;
  type: QuestionType;
  stem: string;
  options?: string[];
  score?: number;
}

export const DEFAULT_STUDENT_NUMBER_DIGITS = 8;
export const MIN_STUDENT_NUMBER_DIGITS = 1;
export const MAX_STUDENT_NUMBER_DIGITS = 12;

export const DEFAULT_ANSWER_SHEET_SETTINGS: AnswerSheetSettings = {
  paperSize: "A4",
  mode: "blank",
  studentNumberDigits: DEFAULT_STUDENT_NUMBER_DIGITS,
  choiceLayout: "inline",
  widePaperColumns: 2,
  answerBoxStyle: "solid",
};

export function normalizeStudentNumberDigits(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_STUDENT_NUMBER_DIGITS;
  return Math.min(
    MAX_STUDENT_NUMBER_DIGITS,
    Math.max(MIN_STUDENT_NUMBER_DIGITS, Math.round(value)),
  );
}

/**
 * Stable machine-readable payload reserved for future answer-sheet scanning.
 * Resource IDs already uniquely identify each exam paper / lecture, so no
 * additional server-side QR record is required.
 */
export function buildAnswerSheetQrPayload(
  resourceType: AnswerSheetResourceType,
  resourceId: string,
): string {
  return `intes://answer-sheet/v1/${resourceType}/${encodeURIComponent(resourceId)}`;
}
