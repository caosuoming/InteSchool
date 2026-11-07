import type { Question, ShareRecord } from "../../src/types/index.js";
import { db } from "../runtime-db.js";
import { genId } from "../domain-shared.js";

/** A group is an identity link, never a request to merge either question's content or ID. */
export function linkSameQuestions(first: Question, second: Question): string {
  if (!first.id || !second.id) throw new Error("题目不存在");
  const previousGroups = new Set([first.sameQuestionGroupId, second.sameQuestionGroupId].filter(Boolean));
  const ids = new Set([first.id, second.id]);
  const groupId = first.sameQuestionGroupId || second.sameQuestionGroupId || genId("sameq");
  const matches = (q: Question) => ids.has(q.id) || Boolean(q.sameQuestionGroupId && previousGroups.has(q.sameQuestionGroupId));
  const all = (db.read("questions") || []) as Question[];
  const linked = all.filter(matches);
  const hidden = [...new Set(linked.flatMap((q) => q.hiddenByExamIds || []))];
  const now = new Date().toISOString();
  db.update("questions", (questions: Question[]) => questions.map((q) => matches(q)
    ? { ...q, sameQuestionGroupId: groupId, hiddenByExamIds: [...hidden], updatedAt: now }
    : q));
  const shares = (db.read("shareRecords") || []) as ShareRecord[];
  if (shares.length) {
    db.update("shareRecords", (records: ShareRecord[]) => records.map((record) => {
      const q = record.resourceType === "question" ? record.resourceSnapshot as Question | undefined : undefined;
      return q && matches(q)
        ? { ...record, resourceSnapshot: { ...q, sameQuestionGroupId: groupId } }
        : record;
    }));
  }
  return groupId;
}

export function sameQuestionIds(questionIds: Iterable<string>, questions: readonly Question[]): Set<string> {
  const ids = new Set(questionIds);
  const groups = new Set(questions.filter((q) => ids.has(q.id) && q.sameQuestionGroupId)
    .map((q) => q.sameQuestionGroupId));
  for (const q of questions) {
    if (q.sameQuestionGroupId && groups.has(q.sameQuestionGroupId)) ids.add(q.id);
  }
  return ids;
}

export function sameQuestionKey(question: Question): string {
  return question.sameQuestionGroupId || question.id;
}
