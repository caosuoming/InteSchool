export type QuestionOptionGridColumns = "grid-cols-1" | "grid-cols-2" | "grid-cols-4";

export function getQuestionOptionGridColumns(options: readonly string[]): QuestionOptionGridColumns {
  const maxOptionLength = options.reduce((maxLength, option) => Math.max(maxLength, option.length), 0);

  if (maxOptionLength > 60) return "grid-cols-1";
  if (maxOptionLength > 30) return "grid-cols-2";
  return "grid-cols-4";
}
