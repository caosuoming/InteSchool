import type { QuestionType } from "@/types";

export type AnswerSheetResourceType = "exam-paper" | "lecture";
export type AnswerSheetPaperSize = "A4" | "16K" | "A3" | "8K";
export type AnswerSheetMode = "blank" | "with-questions";
export type AnswerSheetChoiceLayout = "inline" | "concentrated";
export type AnswerSheetChoiceDirection = "horizontal" | "vertical";
export type AnswerSheetWideColumns = 2 | 3;
export type AnswerSheetBoxStyle = "solid" | "dashed";
export type AnswerSheetOptionBreak = "new-line" | "same-line";

export interface AnswerSheetImageLayout {
  x: number;
  y: number;
  width: number;
  wrap?: "left" | "right" | "none";
  caption?: string;
}

export interface AnswerSheetInlineImageLayout {
  x: number;
  y: number;
  wrap: "left" | "right" | "none";
  caption?: string;
}

export interface AnswerSheetSettings {
  paperSize: AnswerSheetPaperSize;
  mode: AnswerSheetMode;
  studentNumberDigits: number;
  choiceLayout: AnswerSheetChoiceLayout;
  concentratedChoiceDirection?: AnswerSheetChoiceDirection;
  widePaperColumns: AnswerSheetWideColumns;
  a4Columns: 1 | 2;
  answerBoxStyle: AnswerSheetBoxStyle;
  stemFontSize: number;
  answerBoxHeights?: Record<string, number>;
  answerBoxWidths?: Record<string, number>;
  choiceOptionBreaks?: Record<string, Record<number, AnswerSheetOptionBreak>>;
  essayImageLayouts?: Record<string, AnswerSheetImageLayout[]>;
  questionImageLayouts?: Record<string, Record<string, AnswerSheetInlineImageLayout[]>>;
}

export interface AnswerSheetQuestion {
  id: string;
  label?: string;
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
  concentratedChoiceDirection: "horizontal",
  widePaperColumns: 2,
  a4Columns: 1,
  answerBoxStyle: "solid",
  stemFontSize: 12,
};

export function normalizeAnswerSheetStemFontSize(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_ANSWER_SHEET_SETTINGS.stemFontSize;
  return Math.min(20, Math.max(10, Math.round(value)));
}

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
