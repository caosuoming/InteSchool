const MAX_COMPARISON_LENGTH = 4_000;

export const HIGH_SIMILARITY_THRESHOLD = 0.8;

export function normalizeQuestionStem(value: string): string {
  return value
    .normalize("NFC")
    .replace(/!\[[^\]]*\]\([^)]+\)/g, "")
    .replace(/<img\b[^>]*>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&[a-zA-Z#0-9]+;/g, "")
    .replace(/\s+/g, "")
    .replace(/[，。、；：！？“”"'（）()【】[\]{}<>《》·…—_+\-=]/g, "")
    .toLowerCase()
    .slice(0, MAX_COMPARISON_LENGTH);
}

export function questionStemSimilarity(left: string, right: string): number {
  const a = normalizeQuestionStem(left);
  const b = normalizeQuestionStem(right);
  if (a === b) return a.length > 0 ? 1 : 0;
  if (!a.length || !b.length) return 0;
  if (Math.min(a.length, b.length) === 1) return 0;

  const lengthRatio = Math.min(a.length, b.length) / Math.max(a.length, b.length);
  if (lengthRatio < HIGH_SIMILARITY_THRESHOLD) return 0;

  const leftPairs = bigramCounts(a);
  const rightPairs = bigramCounts(b);
  let overlap = 0;
  for (const [pair, leftCount] of leftPairs) {
    overlap += Math.min(leftCount, rightPairs.get(pair) || 0);
  }
  return (2 * overlap) / (a.length + b.length - 2);
}

function bigramCounts(value: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (let index = 0; index < value.length - 1; index += 1) {
    const pair = value.slice(index, index + 2);
    counts.set(pair, (counts.get(pair) || 0) + 1);
  }
  return counts;
}

