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
  return normalizedSimilarity(normalizeQuestionStem(left), normalizeQuestionStem(right));
}

function normalizedSimilarity(a: string, b: string): number {
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

/** Fuzzy duplicate scoring: 60% stem, 40% choices. Option order is irrelevant.
 * Non-choice questions with no options keep their original stem-only score. */
export interface QuestionSimilarityContent {
  stem: string;
  options?: readonly string[];
}

export function questionContentSimilarity(
  left: QuestionSimilarityContent,
  right: QuestionSimilarityContent,
): number {
  const stemScore = questionStemSimilarity(left.stem, right.stem);
  const leftOptions = (left.options || []).map(normalizeOption).filter(Boolean);
  const rightOptions = (right.options || []).map(normalizeOption).filter(Boolean);
  if (!leftOptions.length && !rightOptions.length) return stemScore;

  const pairs = leftOptions.flatMap((option, leftIndex) => rightOptions.map((other, rightIndex) => ({
    leftIndex,
    rightIndex,
    score: normalizedSimilarity(option, other),
  }))).sort((a, b) => b.score - a.score);
  const usedLeft = new Set<number>();
  const usedRight = new Set<number>();
  let matched = 0;
  for (const pair of pairs) {
    if (!pair.score || usedLeft.has(pair.leftIndex) || usedRight.has(pair.rightIndex)) continue;
    usedLeft.add(pair.leftIndex);
    usedRight.add(pair.rightIndex);
    matched += pair.score;
  }
  const optionScore = matched / Math.max(leftOptions.length, rightOptions.length, 1);
  return 0.6 * stemScore + 0.4 * optionScore;
}

function imageFingerprint(url: string): string {
  let hash = 0x811c9dc5;
  for (const character of url) {
    hash = Math.imul(hash ^ character.charCodeAt(0), 0x01000193);
  }
  return `图${(hash >>> 0).toString(36)}`;
}

function normalizeOption(value: string): string {
  // Preserve mathematical operators and image identity: x+1 and x-1, or two
  // image-only options, must not be treated as the same answer choice.
  return value.normalize("NFC")
    .replace(/^\s*[A-HＡ-Ｈ][.．、:：)]\s*/i, "")
    .replace(/!\[[^\]]*\]\(([^)]+)\)/g, (_whole, url: string) => imageFingerprint(url))
    .replace(/<img\b[^>]*>/gi, (tag) => {
      const src = tag.match(/\bsrc\s*=\s*(?:["']([^"']+)["']|([^\s>]+))/i);
      return src ? imageFingerprint(src[1] || src[2]) : "图";
    })
    .replace(/<\/?[a-z][^>]*>/gi, "")
    .replace(/&[a-zA-Z#0-9]+;/g, "")
    .replace(/\s+/g, "")
    .replace(/[，。、；：！？“”"'（）()【】[\]{}《》·…_]/g, "")
    .replace(/[−–]/g, "-")
    .toLowerCase()
    .slice(0, MAX_COMPARISON_LENGTH);
}
