import { alignGeographyGroupAnswerNumbers, geographyAnswerLabelNumbers, rewriteGeographyAnswerLabels } from "./geography-answer-numbering";

const lineStart = /^([ \t]*(?:<(?:p|div|li|span|strong)\b[^>]*>[ \t]*)*)([\d０-９]{1,4})[ \t]*[.．、][ \t]*(?=\S)/i;

export interface GeographyChoiceGroup {
  introduction: string;
  questions: string[];
  originalNumbers: number[];
  inferred?: boolean;
}

/** Some imported Word lists lose their number markers but retain each A–D set. */
function splitUnnumberedGeographyChoiceGroup(lines: string[]): GeographyChoiceGroup | null {
  if (lines.some((line) => lineStart.test(line))) return null;

  const optionLine = /^\s*(?:<(?:p|div|li|span)\b[^>]*>\s*)*([A-Da-d])\s*[.．、:：)）]\s*\S/i;
  const optionGroups: Array<{ start: number; end: number }> = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (optionLine.exec(lines[index])?.[1].toUpperCase() !== "A") continue;
    let end = index;
    let nextLetter = 1;
    while (nextLetter < 4) {
      const next = lines[end + 1];
      if (!next) break;
      const marker = optionLine.exec(next)?.[1].toUpperCase();
      if (marker !== String.fromCharCode(65 + nextLetter)) break;
      end += 1;
      nextLetter += 1;
    }
    if (nextLetter < 3) continue;
    optionGroups.push({ start: index, end });
    index = end;
  }
  if (optionGroups.length < 2) return null;

  const firstOption = optionGroups[0].start;
  let firstQuestion = firstOption - 1;
  while (firstQuestion >= 0 && (!lines[firstQuestion].trim() || /^\s*(?:<img\b|!\[)/i.test(lines[firstQuestion]))) {
    firstQuestion -= 1;
  }
  if (firstQuestion < 0 || firstQuestion === optionGroups[0].start) return null;

  const questions: string[] = [];
  for (let index = 0; index < optionGroups.length; index += 1) {
    const start = index === 0 ? firstQuestion : optionGroups[index - 1].end + 1;
    const body = lines.slice(start, optionGroups[index].end + 1).join("\n").trim();
    if (!body || !lines.slice(start, optionGroups[index].start).some((line) => line.trim()
      && !optionLine.test(line) && !/^\s*(?:<img\b|!\[)/i.test(line))) return null;
    questions.push(body);
  }

  const introduction = lines.slice(0, firstQuestion).join("\n").trim();
  const range = /(?:完成|回答|作答)\s*(?:下[列面]\s*)?(\d{1,3})\s*[—–～~至到-]\s*(\d{1,3})\s*题/.exec(introduction);
  const firstNumber = range && Number(range[2]) - Number(range[1]) + 1 === questions.length
    ? Number(range[1]) : 1;
  const originalNumbers = questions.map((_, index) => firstNumber + index);
  return {
    introduction,
    questions: questions.map((question, index) => `${originalNumbers[index]}. ${question}`),
    originalNumbers,
    inferred: true,
  };
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
  if (starts.length < 2) return splitUnnumberedGeographyChoiceGroup(lines);
  if (starts.some((item, index) => (
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

/** Normalize displayed answer/analysis labels without changing persisted source data. */
export function alignGeographyQuestionAnswer(
  stem: string, field: string, type: string, subject?: string,
): string {
  if (subject?.trim() !== "地理" || type !== "single") return field;
  const group = splitGeographyChoiceGroup(stem);
  if (group) return alignGeographyGroupAnswerNumbers(stem, field, group.originalNumbers);

  // A standalone choice question can carry an old source-paper number.
  const leading = /^\s*(?:<p\b[^>]*>\s*)?([\d０-９]{1,4})\s*[.．、]\s*\S/i.exec(stem);
  if (!leading) return field;
  const marker = /^(\s*(?:<p\b[^>]*>\s*)?)(?:[（(][ \t]*[\d０-９]{1,4}[ \t]*[）)]|[\d０-９]{1,4}[ \t]*[.．、])[ \t]*/i;
  return field.replace(marker, (_match, prefix: string) =>
    `${prefix}${Number(leading[1].normalize("NFKC"))}. `);
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
  // Standalone questions receive their number from the paper layout. Avoid
  // displaying both the source-paper number and the new continuous number.
  if (!group) return stem.replace(lineStart, (_match, prefix: string) => prefix);
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
  if (!group) {
    // Preserve unnumbered standalone answers; their prefix might be part of
    // the explanation rather than a question number.
    const leading = /^\s*(?:<p\b[^>]*>\s*)?[\d０-９]{1,4}\s*[.．、]\s*\S/i.test(stem);
    if (!leading) return field;
    const marker = /^(\s*(?:<p\b[^>]*>\s*)?)(?:[（(][ \t]*[\d０-９]{1,4}[ \t]*[）)]|[\d０-９]{1,4}[ \t]*[.．、])[ \t]*/i;
    return field.replace(marker, (_match, prefix: string) => `${prefix}${startNumber}. `);
  }
  const aligned = alignGeographyQuestionAnswer(stem, field, type, subject);
  const originalToNew = new Map(group.originalNumbers.map((number, index) => [number, startNumber + index]));
  if (group.inferred) {
    const labels = geographyAnswerLabelNumbers(aligned);
    if (labels.length && labels.every((number, index) => number === index + 1)) {
      originalToNew.clear();
      group.originalNumbers.forEach((_, index) => originalToNew.set(index + 1, startNumber + index));
    }
  }
  return rewriteGeographyAnswerLabels(aligned, (number) => originalToNew.get(number));
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
