export interface FileNameCandidate {
  id: string;
  title: string;
  fileName?: string;
  description?: string;
  fileSize?: number;
  fileUrl?: string;
  updatedAt?: string;
}

export interface FileNameDuplicateMatch<T extends FileNameCandidate = FileNameCandidate> {
  candidate: T;
  similarity: number;
}

function withoutExtension(value: string): string {
  return value.replace(/\.[^.\\/]+$/, "");
}

export function normalizeFileName(value: string): string {
  return withoutExtension(value)
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[\s\p{P}\p{S}_]+/gu, "");
}

function bigrams(value: string): string[] {
  const chars = Array.from(value);
  if (chars.length < 2) return chars;
  return chars.slice(0, -1).map((char, index) => `${char}${chars[index + 1]}`);
}

function diceCoefficient(left: string, right: string): number {
  if (left === right) return 1;
  if (!left || !right) return 0;

  const leftBigrams = bigrams(left);
  const rightCounts = new Map<string, number>();
  for (const pair of bigrams(right)) {
    rightCounts.set(pair, (rightCounts.get(pair) || 0) + 1);
  }

  let overlap = 0;
  for (const pair of leftBigrams) {
    const count = rightCounts.get(pair) || 0;
    if (count > 0) {
      overlap += 1;
      rightCounts.set(pair, count - 1);
    }
  }

  return (2 * overlap) / (leftBigrams.length + bigrams(right).length);
}

export function fileNameSimilarity(leftName: string, rightName: string): number {
  const left = normalizeFileName(leftName);
  const right = normalizeFileName(rightName);
  if (!left || !right) return 0;
  if (left === right) return 1;

  const shorterLength = Math.min(Array.from(left).length, Array.from(right).length);
  const longerLength = Math.max(Array.from(left).length, Array.from(right).length);
  const containment = left.includes(right) || right.includes(left)
    ? shorterLength / longerLength
    : 0;

  return Math.max(containment, diceCoefficient(left, right));
}

export function findFileNameDuplicates<T extends FileNameCandidate>(
  incomingFileName: string,
  candidates: T[],
  threshold = 0.72,
): FileNameDuplicateMatch<T>[] {
  return candidates
    .map((candidate) => {
      const names = [candidate.fileName, candidate.title].filter((value): value is string => Boolean(value));
      const similarity = names.reduce(
        (best, name) => Math.max(best, fileNameSimilarity(incomingFileName, name)),
        0,
      );
      return { candidate, similarity };
    })
    .filter((match) => match.similarity >= threshold)
    .sort((left, right) => right.similarity - left.similarity);
}
