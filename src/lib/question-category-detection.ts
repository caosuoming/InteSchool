export const AUTO_QUESTION_CATEGORIES = ["一题多解", "一题多问"] as const;
export type AutoQuestionCategory = (typeof AUTO_QUESTION_CATEGORIES)[number];

interface QuestionCategoryText {
  content: string;
  analysis?: string;
}

function hasMultipleSolutions(analysis: string): boolean {
  return /(?:方法|解法|思路|(?<!算)法)\s*[:：、.．]?\s*[一二三四五六七八九十1-9]/u.test(
    analysis.normalize("NFKC"),
  );
}

function hasThreeSubquestions(stem: string): boolean {
  const indices = new Set<number>();
  const pattern = /[（(]\s*([1-9]\d?|[一二三四五六七八九十])\s*[）)]|(?:^|[\s；;。])([1-9]\d?)[.．、]|第\s*([1-9]\d?|[一二三四五六七八九十])\s*问|[①-⑳]/gmu;
  const chineseNumbers = "一二三四五六七八九十";
  for (const match of stem.matchAll(pattern)) {
    const value = match[1] || match[2] || match[3];
    const index = value
      ? (/^\d+$/.test(value) ? Number(value) : chineseNumbers.indexOf(value) + 1)
      : match[0].codePointAt(match[0].length - 1)! - 0x2460 + 1;
    if (index > 0) indices.add(index);
  }
  return indices.has(1) && indices.has(2) && indices.has(3);
}

export function detectQuestionCategories(question: QuestionCategoryText): AutoQuestionCategory[] {
  const result: AutoQuestionCategory[] = [];
  if (hasMultipleSolutions(question.analysis || "")) result.push("一题多解");
  if (hasThreeSubquestions(question.content)) result.push("一题多问");
  return result;
}

export function questionCategories(question: { category?: string; categories?: string[] }): string[] {
  return [...new Set([question.category, ...(question.categories || [])].filter((value): value is string => Boolean(value)))];
}
