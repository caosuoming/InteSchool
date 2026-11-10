import type { ExamPaperQuestion, Question } from "@/types";
import { getDefaultQuestionTypeLabel } from "@/lib/question-types";

export const DEFAULT_QUESTION_TYPE_ORDER = [
  "single", "multiple", "judge", "short", "conceptFill", "essay", "comprehensive",
];

export function getQuestionTypeSections(
  questions: readonly ExamPaperQuestion[],
  questionsById: Record<string, Question> = {},
  order: readonly string[] = DEFAULT_QUESTION_TYPE_ORDER,
): { type: string; questions: ExamPaperQuestion[] }[] {
  const groups = new Map<string, ExamPaperQuestion[]>();
  for (const question of questions) {
    const type = (question.questionId && questionsById[question.questionId]?.type) || question.type;
    if (!groups.has(type)) groups.set(type, []);
    groups.get(type)!.push(question);
  }

  const orderedTypes = new Set([...order, ...DEFAULT_QUESTION_TYPE_ORDER, ...groups.keys()]);
  return [...orderedTypes]
    .filter((type) => groups.has(type))
    .map((type) => ({ type, questions: groups.get(type)! }));
}

const sectionNumerals = ["一", "二", "三", "四", "五", "六", "七", "八"];

export function getQuestionTypeDisplayName(type: string, labels: Readonly<Record<string, string>> = {}): string {
  const custom = labels[type]?.trim();
  if (custom) return custom;
  const label = getDefaultQuestionTypeLabel(type);
  return `${label}${label.endsWith("题") ? "" : "题"}`;
}

export function getQuestionTypeHeading(
  type: string,
  index: number,
  labels: Readonly<Record<string, string>> = {},
): string {
  return `${sectionNumerals[index] || index + 1}、${getQuestionTypeDisplayName(type, labels)}`;
}
