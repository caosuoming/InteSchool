import { AUTO_QUESTION_CATEGORIES } from "./question-category-detection";

export interface QuestionCategoryOption {
  value: string;
  label: string;
}

export type QuestionCategoryAliases = Record<string, string[]>;

/** Keep the automatic categories' stable values even if a school defines the same labels under legacy values. */
export function mergeQuestionCategoryOptions(configured: QuestionCategoryOption[]): {
  options: QuestionCategoryOption[];
  aliases: QuestionCategoryAliases;
} {
  const automatic = new Map<string, string>(AUTO_QUESTION_CATEGORIES.map((label) => [label, label]));
  const aliases: QuestionCategoryAliases = {};
  const options: QuestionCategoryOption[] = [];
  const seen = new Set<string>();

  for (const option of [
    ...configured,
    ...AUTO_QUESTION_CATEGORIES.map((label) => ({ value: label, label })),
  ]) {
    const canonical = automatic.get(option.label.normalize("NFKC").trim())
      || automatic.get(option.value.normalize("NFKC").trim());
    const value = canonical || option.value;
    if (canonical) {
      const values = aliases[canonical] ||= [];
      if (!values.includes(option.value)) values.push(option.value);
      if (!values.includes(canonical)) values.push(canonical);
    }
    if (!seen.has(value)) {
      options.push(canonical ? { value: canonical, label: canonical } : option);
      seen.add(value);
    }
  }
  return { options, aliases };
}

export function normalizeQuestionCategory(value: string, aliases: QuestionCategoryAliases): string {
  return Object.keys(aliases).find((canonical) => aliases[canonical].includes(value)) || value;
}

export function expandQuestionCategoryFilter(values: string[], aliases: QuestionCategoryAliases): string[] {
  return [...new Set(values.flatMap((value) => aliases[value] || [value]))];
}
