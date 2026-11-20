import type { AnswerRecord, Question, ExamPaper, Student, PersonalClass } from "../../src/types/index.js";
import { HIGH_SIMILARITY_THRESHOLD, normalizeQuestionStem, questionStemSimilarity } from "../../src/lib/question-similarity.js";
import { db, computeDuplicateHash } from "../runtime-db.js";
import { genId } from "../domain-shared.js";
import { linkSameQuestions } from "./sameQuestion.js";
import { prepService } from "./prep.js";
import { assertResourceCapacity } from "./quota.js";
import { selectedSubject } from "../lib/resource-subject.js";
import type { TeacherRecord } from "../types.js";

export type DuplicateTaskKind = "library" | "student";
export type RepeatRule = "once" | "daily" | "weekend";
export interface DuplicateSchedule {
  id: string; teacherId: string; kind: DuplicateTaskKind; repeat: RepeatRule;
  nextRunAt: string | null; enabled: boolean; timezoneOffsetMinutes?: number; lastRunAt?: string; createdAt: string;
}
export interface DuplicateCandidate {
  id: string; teacherId: string; scheduleId: string; kind: DuplicateTaskKind;
  leftQuestionId: string; rightQuestionId: string; similarity: number;
  status: "pending" | "keep" | "merged" | "same" | "added";
  studentCount?: number; createdAt: string; resolvedAt?: string;
}

function paperQuestionSources(): Question[] {
  return ((db.read("examPapers") || []) as ExamPaper[]).flatMap((paper) =>
    paper.questions.filter((q) => !q.questionId).map((q) => ({
      id: `exam-item:${paper.id}:${q.id}`, teacherId: paper.teacherId, schoolId: paper.schoolId,
      subject: paper.subject, type: q.type, stem: q.stem, options: q.options, answer: q.answer,
      analysis: q.analysis, chapterIds: paper.chapterIds || [], knowledgePointIds: paper.knowledgePointIds || [],
      difficulty: 3 as const, recommendation: 3 as const, usageCount: 0, remark: "",
      isShared: false, grade: paper.grade, createdAt: paper.createdAt, updatedAt: paper.updatedAt,
    })));
}

const schedules = (): DuplicateSchedule[] => db.read("duplicateSchedules") || [];
const candidates = (): DuplicateCandidate[] => db.read("duplicateCandidates") || [];
const checked = (): Array<{ id: string; teacherId: string; kind: DuplicateTaskKind; leftQuestionId: string; rightQuestionId: string }> => db.read("duplicateCheckedPairs") || [];
const pairId = (kind: DuplicateTaskKind, a: string, b: string) => `${kind}:${[a, b].sort().join(":")}`;
const validTime = (value: string) => Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;

export function nextExecution(from: Date, repeat: RepeatRule, timezoneOffsetMinutes = 0): string | null {
  if (repeat === "once") return null;
  const next = new Date(from);
  next.setUTCDate(next.getUTCDate() + 1);
  if (repeat === "weekend") {
    while (![0, 6].includes(new Date(next.getTime() - timezoneOffsetMinutes * 60_000).getUTCDay())) {
      next.setUTCDate(next.getUTCDate() + 1);
    }
  }
  return next.toISOString();
}

function scan(schedule: DuplicateSchedule): number {
  const all = (db.read("questions") || []) as Question[];
  const teacher = ((db.read("teachers") || []) as TeacherRecord[]).find((t) => t.id === schedule.teacherId);
  if (!teacher) return 0;
  const subject = selectedSubject(teacher);
  const mine = all.filter((q) => q.teacherId === schedule.teacherId && (!subject || !q.subject || q.subject === subject));
  const source = schedule.kind === "library" ? mine : [...all, ...paperQuestionSources()];
  const ownIds = new Set(mine.map((q) => q.id));
  const ownPositions = new Map(mine.map((q, index) => [q.id, index]));
  const studentIds = new Set<string>();
  if (schedule.kind === "student") {
    const classes = (db.read("schoolClasses") || []).filter((c: { schoolId: string; status?: string }) =>
      c.schoolId === teacher.schoolId && c.status !== "deleted");
    const classIds = new Set(classes.map((c: { id: string }) => c.id));
    const personal = ((db.read("personalClasses") || []) as PersonalClass[]).filter((c) => c.teacherId === teacher.id);
    const personalIds = new Set(personal.flatMap((c) => c.studentIds));
    for (const student of (db.read("students") || []) as Student[]) {
      if (classIds.has(student.classId) || personalIds.has(student.id)) studentIds.add(student.id);
    }
  }
  const counts = new Map<string, number>();
  if (schedule.kind === "student") for (const a of (db.read("answerRecords") || []) as AnswerRecord[]) {
    if (studentIds.has(a.studentId)) counts.set(a.questionId, (counts.get(a.questionId) || 0) + 1);
  }
  const prior = new Set(checked().filter((c) => c.teacherId === teacher.id && c.kind === schedule.kind).map((c) => c.id));
  const found = new Set(candidates().filter((c) => c.teacherId === teacher.id && c.kind === schedule.kind).map((c) => pairId(c.kind, c.leftQuestionId, c.rightQuestionId)));
  const index = new Map<string, Set<Question>>();
  for (const q of source) {
    if (schedule.kind === "student" && (ownIds.has(q.id) || (q.teacherId === teacher.id && !q.id.startsWith("exam-item:")) || !counts.has(q.id))) continue;
    const value = normalizeQuestionStem(q.stem);
    if (!value) continue;
    for (let i = 0; i < Math.max(1, value.length - 1); i++) {
      const key = value.length === 1 ? value : value.slice(i, i + 2);
      if (!index.has(key)) index.set(key, new Set());
      index.get(key)!.add(q);
    }
  }
  const additions: DuplicateCandidate[] = [];
  const maximumNewCandidates = 300;
  scanQuestions: for (let i = 0; i < mine.length; i++) {
    const left = mine[i];
    const value = normalizeQuestionStem(left.stem);
    const possibilities = new Set<Question>();
    for (let j = 0; j < Math.max(1, value.length - 1); j++) {
      const key = value.length === 1 ? value : value.slice(j, j + 2);
      for (const q of index.get(key) || []) possibilities.add(q);
    }
    for (const right of possibilities) {
      if (schedule.kind === "student" && left.subject && right.subject && left.subject !== right.subject) continue;
      if (left.id === right.id || (schedule.kind === "library" && (ownPositions.get(right.id) ?? -1) <= i)) continue;
      if (left.sameQuestionGroupId && left.sameQuestionGroupId === right.sameQuestionGroupId) continue;
      const id = pairId(schedule.kind, left.id, right.id);
      if (prior.has(id) || found.has(id)) continue;
      const similarity = questionStemSimilarity(left.stem, right.stem);
      if (similarity < HIGH_SIMILARITY_THRESHOLD) continue;
      additions.push({ id: genId("duplicate"), teacherId: teacher.id, scheduleId: schedule.id, kind: schedule.kind,
        leftQuestionId: left.id, rightQuestionId: right.id, similarity, status: "pending",
        studentCount: counts.get(right.id), createdAt: new Date().toISOString() });
      found.add(id);
      if (additions.length >= maximumNewCandidates) break scanQuestions;
    }
  }
  if (additions.length) db.update("duplicateCandidates", (items: DuplicateCandidate[] = []) => [...items, ...additions]);
  return additions.length;
}

export function runDueDuplicateSchedules(now = new Date()): number {
  let executed = 0;
  for (const schedule of schedules()) {
    if (!schedule.enabled || !schedule.nextRunAt || schedule.nextRunAt > now.toISOString()) continue;
    scan(schedule);
    const nextRunAt = nextExecution(new Date(schedule.nextRunAt), schedule.repeat, schedule.timezoneOffsetMinutes);
    // Catch up after downtime without replaying missed runs.
    let next = nextRunAt;
    while (next && next <= now.toISOString()) next = nextExecution(new Date(next), schedule.repeat, schedule.timezoneOffsetMinutes);
    db.update("duplicateSchedules", (items: DuplicateSchedule[]) => items.map((item) => item.id === schedule.id
      ? { ...item, lastRunAt: now.toISOString(), nextRunAt: next, enabled: next !== null } : item));
    executed++;
  }
  return executed;
}

export const scheduledDuplicateService = {
  async listSchedules(teacherId: string): Promise<DuplicateSchedule[]> {
    return schedules().filter((item) => item.teacherId === teacherId);
  },
  async listCandidates(teacherId: string) {
    const questions = new Map([...((db.read("questions") || []) as Question[]), ...paperQuestionSources()].map((q) => [q.id, q]));
    return candidates().filter((item) => item.teacherId === teacherId && item.status === "pending")
      .map((item) => ({ ...item, leftStem: questions.get(item.leftQuestionId)?.stem || "题目已删除", rightStem: questions.get(item.rightQuestionId)?.stem || "题目已删除" }));
  },
  async createSchedule(teacherId: string, kind: DuplicateTaskKind, repeat: RepeatRule, nextRunAt: string, timezoneOffsetMinutes = 0): Promise<DuplicateSchedule> {
    if (!["library", "student"].includes(kind) || !["once", "daily", "weekend"].includes(repeat)
      || typeof nextRunAt !== "string" || !validTime(nextRunAt) || nextRunAt <= new Date().toISOString()
      || !Number.isInteger(timezoneOffsetMinutes) || Math.abs(timezoneOffsetMinutes) > 840) throw new Error("任务时间或类型无效");
    if (schedules().filter((item) => item.teacherId === teacherId && item.enabled).length >= 20) throw new Error("预约任务数量已达上限");
    const first = new Date(nextRunAt);
    if (repeat === "weekend") {
      while (![0, 6].includes(new Date(first.getTime() - timezoneOffsetMinutes * 60_000).getUTCDay())) {
        first.setUTCDate(first.getUTCDate() + 1);
      }
    }
    const item: DuplicateSchedule = { id: genId("schedule"), teacherId, kind, repeat,
      nextRunAt: first.toISOString(), timezoneOffsetMinutes, enabled: true, createdAt: new Date().toISOString() };
    db.update("duplicateSchedules", (items: DuplicateSchedule[] = []) => [...items, item]);
    return item;
  },
  async cancelSchedule(teacherId: string, scheduleId: string): Promise<void> {
    if (!schedules().some((s) => s.teacherId === teacherId && s.id === scheduleId)) throw new Error("任务不存在");
    db.update("duplicateSchedules", (items: DuplicateSchedule[]) => items.map((s) => s.id === scheduleId ? { ...s, enabled: false, nextRunAt: null } : s));
  },
  async runSchedule(teacherId: string, scheduleId: string): Promise<number> {
    const task = schedules().find((s) => s.id === scheduleId && s.teacherId === teacherId);
    if (!task) throw new Error("任务不存在");
    const count = scan(task);
    db.update("duplicateSchedules", (items: DuplicateSchedule[]) => items.map((s) => s.id === scheduleId ? { ...s, lastRunAt: new Date().toISOString() } : s));
    return count;
  },
  async resolveCandidate(teacherId: string, candidateId: string, decision: "keep" | "merge" | "same" | "add"): Promise<void> {
    const candidate = candidates().find((c) => c.id === candidateId && c.teacherId === teacherId && c.status === "pending");
    if (!candidate) throw new Error("待处理题目不存在");
    if (!(candidate.kind === "library" ? ["keep", "merge"] : ["same", "add"]).includes(decision)) throw new Error("处理方式无效");
    const questions = db.read("questions") as Question[];
    const left = questions.find((q) => q.id === candidate.leftQuestionId && q.teacherId === teacherId);
    const right = [...questions, ...paperQuestionSources()].find((q) => q.id === candidate.rightQuestionId);
    if (!left || !right) throw new Error("题目已不存在");
    if (decision === "merge") {
      if (right.teacherId !== teacherId) throw new Error("只能合并本人题库中的题目");
      await prepService.mergeQuestions(left.id, right.id);
      db.update("examPapers", (items: Array<{ questions: Array<{ questionId?: string }> }> = []) => items.map((paper) => ({
        ...paper, questions: paper.questions.map((q) => q.questionId === right.id ? { ...q, questionId: left.id } : q),
      })));
    } else if (decision === "same") {
      if (right.id.startsWith("exam-item:")) {
        // Exam-only questions have no library row to link. Preserve the recorded score
        // and associate the original attempt with the teacher's canonical question.
        db.update("answerRecords", (items: AnswerRecord[] = []) => items.map((record) =>
          record.questionId === right.id ? { ...record, questionId: left.id } : record));
      } else {
        linkSameQuestions(left, right);
      }
    } else if (decision === "add") {
      assertResourceCapacity(teacherId, "question");
      const now = new Date().toISOString();
      const copy = { ...right, id: genId("question"), teacherId, schoolId: left.schoolId,
        subject: left.subject, sameQuestionGroupId: undefined,
        sourceDocId: undefined, hiddenByExamIds: [], platformSourceDonationIds: undefined,
        schoolSourceBackupIds: undefined, sameQuestionDonationIds: undefined,
        duplicateHash: computeDuplicateHash(right.stem, right.answer, right.options),
        usageCount: 0, lastUsedAt: undefined, createdAt: now, updatedAt: now };
      db.update("questions", (items: Question[]) => [...items, copy]);
      if (right.id.startsWith("exam-item:")) {
        db.update("answerRecords", (items: AnswerRecord[] = []) => items.map((record) =>
          record.questionId === right.id ? { ...record, questionId: copy.id } : record));
      } else {
        linkSameQuestions(copy, right);
      }
    }
    db.update("duplicateCandidates", (items: DuplicateCandidate[]) => items.map((c) => c.id === candidate.id
      ? { ...c, status: decision === "merge" ? "merged" : decision === "add" ? "added" : decision === "same" ? "same" : "keep", resolvedAt: new Date().toISOString() } : c));
    const id = pairId(candidate.kind, candidate.leftQuestionId, candidate.rightQuestionId);
    db.update("duplicateCheckedPairs", (items: ReturnType<typeof checked> = []) => items.some((p) => p.id === id && p.teacherId === teacherId)
      ? items : [...items, { id, teacherId, kind: candidate.kind, leftQuestionId: left.id, rightQuestionId: right.id }]);
  },
};
