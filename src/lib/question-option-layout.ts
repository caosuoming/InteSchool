export type QuestionOptionGridColumns = "grid-cols-1" | "grid-cols-2" | "grid-cols-4";

export function getQuestionOptionGridColumns(options: readonly string[]): QuestionOptionGridColumns {
  // Image choices need enough room to remain legible. Four common choices are
  // therefore arranged as two columns instead of being forced into one narrow row.
  if (options.some((option) => /<img\b/i.test(option))) return "grid-cols-2";

  const maxOptionLength = options.reduce((maxLength, option) => {
    const visibleText = option.replace(/<[^>]*>/g, "").trim();
    return Math.max(maxLength, visibleText.length);
  }, 0);

  if (maxOptionLength > 60) return "grid-cols-1";
  if (maxOptionLength > 30) return "grid-cols-2";
  return "grid-cols-4";
}
