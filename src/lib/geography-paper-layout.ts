import { alignGeographyGroupAnswerNumbers } from "./geography-answer-numbering";

const lineStart = /^([ \t]*(?:<(?:p|div|li|span|strong)\b[^>]*>[ \t]*)*)([\d０-９]{1,4})[ \t]*[.．、][ \t]*(?=\S)/i;

export interface GeographyChoiceGroup {
  introduction: string;
  questions: string[];
  originalNumbers: number[];
}

/**
 * Geography selection groups are stored as one question. Keep the original
 * stem intact in storage, and split it only when presenting or exporting it.
 */
export function splitGeographyChoiceGroup(stem: string): GeographyChoiceGroup | null {
  const lines = stem.replace(/(<br\s*\/?\s*>|<\/(?:p|div|li)>)/gi, "$1\n").split(/\r?\n/);
  const starts: { index: number; number: number }[] = [];
  lines.forEach((line, index) => {
    const match = lineStart.exec(line);
    if (match) starts.push({ index, number: Number(match[2].normalize("NFKC")) });
  });
  if (starts.length < 2 || starts.some((item, index) => (
    index > 0 && item.number !== starts[index - 1].number + 1
  ))) return null;

  return {
    introduction: lines.slice(0, starts[0].index).join("\n").trim(),
    questions: starts.map((item, index) =>
      lines.slice(item.index, starts[index + 1]?.index ?? lines.length).join("\n").trim()),
    originalNumbers: starts.map((item) => item.number),
  };
}

export function isGeographyChoiceGroup(stem: string, type: string, subject?: string): boolean {
  return subject?.trim() === "地理" && type === "single" && splitGeographyChoiceGroup(stem) !== null;
}

export function geographyPaperQuestionCount(stem: string, type: string, subject?: string): number {
  return subject?.trim() === "地理" && type === "single"
    ? splitGeographyChoiceGroup(stem)?.questions.length ?? 1 : 1;
}

/** Number every choice subquestion globally; comprehensive questions use one number. */
export function renumberGeographyPaperStem(
  stem: string, type: string, subject: string | undefined, startNumber: number,
): string {
  if (subject?.trim() !== "地理" || type !== "single") return stem;
  const group = splitGeographyChoiceGroup(stem);
  if (!group) return stem;
  const first = group.originalNumbers[0];
  const last = group.originalNumbers[group.originalNumbers.length - 1];
  // Update reading prompts such as “完成下面4—6题” to match the displayed numbering.
  const range = new RegExp(`(?<![\\d０-９])${first}([—–－~～至-])${last}(?=\\s*(?:小?题))`, "g");
  const introduction = group.introduction.replace(range,
    (_match, separator: string) => `${startNumber}${separator}${startNumber + group.questions.length - 1}`);
  return [introduction, ...group.questions.map((question, index) =>
    question.replace(lineStart, (_match, prefix: string) => `${prefix}${startNumber + index}. `),
  )].filter(Boolean).join("\n");
}

/** Preserve the answer-to-question alignment after the print numbering changes. */
export function renumberGeographyPaperAnswer(
  stem: string, field: string, type: string, subject: string | undefined, startNumber: number,
): string {
  if (subject?.trim() !== "地理" || type !== "single") return field;
  const group = splitGeographyChoiceGroup(stem);
  if (!group) return field;
  const aligned = alignGeographyGroupAnswerNumbers(stem, field);
  const originalToNew = new Map(group.originalNumbers.map((number, index) => [number, startNumber + index]));
  return aligned.replace(/(^|\n)([ \t]*[（(][ \t]*)([\d０-９]{1,4})([ \t]*[）)])/g,
    (match, breakText: string, prefix: string, numberText: string, suffix: string) => {
      const replacement = originalToNew.get(Number(numberText.normalize("NFKC")));
      return replacement === undefined ? match : `${breakText}${prefix}${replacement}${suffix}`;
    });
}

export function geographyPaperNumberMap<T extends { id: string; stem: string; type: string }>(
  questions: T[], subject?: string,
): Map<string, number> {
  const result = new Map<string, number>();
  let next = 1;
  questions.forEach((question) => {
    result.set(question.id, next);
    next += geographyPaperQuestionCount(question.stem, question.type, subject);
  });
  return result;
}
