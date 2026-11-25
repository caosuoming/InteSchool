import { randomUUID } from "node:crypto";
import type { Question } from "../../src/types/index.js";
import { HIGH_SIMILARITY_THRESHOLD, prepareQuestionStemSimilarity, preparedStemSimilarity, questionContentSimilarityWithStemScore } from "../../src/lib/question-similarity.js";
import type { DuplicateCandidate, DuplicateSchedule } from "./scheduledDuplicate.js";

export type ScanQuestion = Pick<Question, "id" | "stem" | "options" | "subject" | "sameQuestionGroupId">;
export interface DuplicateScanInput {
  schedule: DuplicateSchedule;
  mine: ScanQuestion[];
  source: ScanQuestion[];
  counts: Map<string, number>;
  prior: Set<string>;
  found: Set<string>;
}

export function computeDuplicateScan(input: DuplicateScanInput): DuplicateCandidate[] {
  const { schedule, mine, source, counts, prior } = input;
  const found = new Set(input.found);
  const ownPositions = new Map(mine.map((q, index) => [q.id, index]));
  const pairId = (a: string, b: string) => `${schedule.kind}:${[a, b].sort().join(":")}`;
  const stems = new Map<string, ReturnType<typeof prepareQuestionStemSimilarity>>();
  for (const q of [...mine, ...source]) {
    if (!stems.has(q.id)) stems.set(q.id, prepareQuestionStemSimilarity(q.stem));
  }
  const index = new Map<string, Set<ScanQuestion>>();
  for (const q of source) {
    const value = stems.get(q.id)!.value;
    if (!value) continue;
    for (const key of value.length === 1 ? [value] : stems.get(q.id)!.pairs.keys()) {
      if (!index.has(key)) index.set(key, new Set());
      index.get(key)!.add(q);
    }
  }
  const additions: DuplicateCandidate[] = [];
  const maximumNewCandidates = 300;
  scanQuestions: for (let i = 0; i < mine.length; i++) {
    const left = mine[i];
    const leftStem = stems.get(left.id)!;
    const value = leftStem.value;
    const possibilities = new Set<ScanQuestion>();
    for (const key of value.length === 1 ? [value] : leftStem.pairs.keys()) {
      for (const q of index.get(key) || []) possibilities.add(q);
    }
    for (const right of possibilities) {
      if (schedule.kind === "student" && left.subject && right.subject && left.subject !== right.subject) continue;
      if (left.id === right.id || (schedule.kind === "library" && (ownPositions.get(right.id) ?? -1) <= i)) continue;
      if (left.sameQuestionGroupId && left.sameQuestionGroupId === right.sameQuestionGroupId) continue;
      const id = pairId(left.id, right.id);
      if (prior.has(id) || found.has(id)) continue;
      const stemScore = preparedStemSimilarity(leftStem, stems.get(right.id)!);
      // Even perfect answer choices cannot raise a score past this upper bound.
      if (stemScore < HIGH_SIMILARITY_THRESHOLD && 0.6 * stemScore + 0.4 < HIGH_SIMILARITY_THRESHOLD) continue;
      const similarity = questionContentSimilarityWithStemScore(left, right, stemScore);
      if (similarity < HIGH_SIMILARITY_THRESHOLD) continue;
      additions.push({ id: `duplicate-${randomUUID()}`, teacherId: schedule.teacherId, scheduleId: schedule.id, kind: schedule.kind,
        leftQuestionId: left.id, rightQuestionId: right.id, similarity, status: "pending",
        studentCount: counts.get(right.id), createdAt: new Date().toISOString() });
      found.add(id);
      if (additions.length >= maximumNewCandidates) break scanQuestions;
    }
  }
  return additions;
}
