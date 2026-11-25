import type { AnswerRecord, Question, ExamPaper, Lecture, DocumentRecord, DuplicateQuestionMergeFields, Student, PersonalClass } from "../../src/types/index.js";
import { computeDuplicateScan, type DuplicateScanInput, type ScanQuestion } from "./duplicateScan.js";
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
  status: "pending" | "cancelled" | "keep" | "merged" | "same" | "added";
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

type CandidateQuestion = Pick<Question, "id" | "stem" | "options" | "answer" | "analysis" | "summary" | "subject"> & { sources: string[] };

function questionSources(teacherId: string, questions: Question[], wantedIds: Set<string>): Map<string, string[]> {
  const sources = new Map<string, Set<string>>();
  const add = (id: string, label: string) => {
    if (!wantedIds.has(id)) return;
    if (!sources.has(id)) sources.set(id, new Set());
    sources.get(id)!.add(label);
  };
  const documents = new Map(((db.read("documents") || []) as DocumentRecord[])
    .filter((doc) => doc.teacherId === teacherId).map((doc) => [doc.id, doc]));
  for (const question of questions) {
    if (question.teacherId !== teacherId) continue;
    for (const id of new Set([question.sourceDocId, ...(question.sourceDocIds || [])].filter((v): v is string => Boolean(v)))) {
      const document = documents.get(id);
      if (document) add(question.id, "文档：" + document.fileName);
    }
  }
  for (const paper of (db.read("examPapers") || []) as ExamPaper[]) {
    if (paper.teacherId !== teacherId) continue;
    for (const item of paper.questions) if (item.questionId) add(item.questionId, "试卷：" + paper.title);
    for (const block of paper.contentBlocks || []) {
      if (block.type === "question" && block.questionId) add(block.questionId, "试卷：" + paper.title);
    }
  }
  for (const lecture of (db.read("lectures") || []) as Lecture[]) {
    if (lecture.teacherId !== teacherId) continue;
    const walk = (sections: Lecture["sections"]) => {
      for (const section of sections) {
        if (section.questionId) add(section.questionId, "讲义：" + lecture.title);
        if (section.children?.length) walk(section.children);
      }
    };
    walk(lecture.sections || []);
    for (const block of lecture.contentBlocks || []) {
      if (block.type === "question" && block.questionId) add(block.questionId, "讲义：" + lecture.title);
    }
  }
  return new Map([...sources].map(([id, labels]) => [id, [...labels]]));
}

function syncMergedQuestionDocuments(previousIds: [string, string], merged: Question): void {
  const ids = new Set(previousIds);
  const now = new Date().toISOString();
  db.update("examPapers", (papers: ExamPaper[] = []) => papers.map((paper) => {
    const hasMatch = paper.questions.some((item) => item.questionId && ids.has(item.questionId))
      || paper.contentBlocks?.some((block) => block.type === "question" && block.questionId && ids.has(block.questionId));
    if (!hasMatch || paper.teacherId !== merged.teacherId) return paper;
    return {
      ...paper,
      updatedAt: now,
      questions: paper.questions.map((item) => item.questionId && ids.has(item.questionId) ? {
        ...item, questionId: merged.id, stem: merged.stem, options: merged.options,
        answer: merged.answer, analysis: merged.analysis, type: merged.type,
      } : item),
      contentBlocks: paper.contentBlocks?.map((block) => block.type === "question" && block.questionId && ids.has(block.questionId)
        ? { ...block, questionId: merged.id, content: merged.stem, questionType: merged.type } : block),
    };
  }));
  db.update("lectures", (lectures: Lecture[] = []) => lectures.map((lecture) => {
    if (lecture.teacherId !== merged.teacherId) return lecture;
    const updateSections = (sections: Lecture["sections"]): Lecture["sections"] => sections.map((section) => ({
      ...section,
      ...(section.questionId && ids.has(section.questionId) && section.type === "question"
        ? { questionId: merged.id, content: merged.stem } : {}),
      children: section.children?.length ? updateSections(section.children) : section.children,
    }));
    const hasLinked = (sections: Lecture["sections"]): boolean => sections.some((section) =>
      Boolean(section.questionId && ids.has(section.questionId)) || hasLinked(section.children || []));
    const hasMatch = lecture.contentBlocks?.some((block) => block.type === "question" && block.questionId && ids.has(block.questionId))
      || hasLinked(lecture.sections || []);
    if (!hasMatch) return lecture;
    return {
      ...lecture, updatedAt: now,
      sections: updateSections(lecture.sections || []),
      contentBlocks: lecture.contentBlocks?.map((block) => block.type === "question" && block.questionId && ids.has(block.questionId)
        ? { ...block, questionId: merged.id, content: merged.stem, questionType: merged.type } : block),
    };
  }));
}

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

export function prepareDuplicateScan(schedule: DuplicateSchedule): DuplicateScanInput | null {
  const all = (db.read("questions") || []) as Question[];
  const teacher = ((db.read("teachers") || []) as TeacherRecord[]).find((t) => t.id === schedule.teacherId);
  if (!teacher) return null;
  const subject = selectedSubject(teacher);
  const mine = all.filter((q) => q.teacherId === schedule.teacherId && (!subject || !q.subject || q.subject === subject));
  const source = schedule.kind === "library" ? mine : [...all, ...paperQuestionSources()];
  const ownIds = new Set(mine.map((q) => q.id));
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
  // Cancelled reviews are deliberately not checked: a later scan may rediscover them.
  const found = new Set(candidates().filter((c) => c.teacherId === teacher.id && c.kind === schedule.kind && c.status === "pending")
    .map((c) => pairId(c.kind, c.leftQuestionId, c.rightQuestionId)));
  const project = (q: Question): ScanQuestion => ({
    id: q.id, stem: q.stem, options: q.options, subject: q.subject, sameQuestionGroupId: q.sameQuestionGroupId,
  });
  const eligible = source.filter((q) => schedule.kind === "library"
    || (!ownIds.has(q.id) && (q.teacherId !== teacher.id || q.id.startsWith("exam-item:")) && counts.has(q.id)));
  return { schedule, mine: mine.map(project), source: eligible.map(project), counts, prior, found };
}

export function applyDuplicateScan(input: DuplicateScanInput | null, additions: DuplicateCandidate[]): number {
  if (!input || !additions.length) return 0;
  const current = prepareDuplicateScan(input.schedule);
  if (!current) return 0;
  const originalLeft = new Map(input.mine.map((q) => [q.id, q]));
  const originalRight = new Map(input.source.map((q) => [q.id, q]));
  const currentLeft = new Map(current.mine.map((q) => [q.id, q]));
  const currentRight = new Map(current.source.map((q) => [q.id, q]));
  const unchanged = (before: ScanQuestion | undefined, after: ScanQuestion | undefined) =>
    !!before && !!after && JSON.stringify(before) === JSON.stringify(after);
  const valid = additions.filter((item) => {
    const id = pairId(item.kind, item.leftQuestionId, item.rightQuestionId);
    return !current.prior.has(id) && !current.found.has(id)
      && unchanged(originalLeft.get(item.leftQuestionId), currentLeft.get(item.leftQuestionId))
      && unchanged(originalRight.get(item.rightQuestionId), currentRight.get(item.rightQuestionId));
  }).map((item) => ({ ...item, studentCount: current.counts.get(item.rightQuestionId) }));
  if (valid.length) db.update("duplicateCandidates", (items: DuplicateCandidate[] = []) => [...items, ...valid]);
  return valid.length;
}

function scan(schedule: DuplicateSchedule): number {
  const input = prepareDuplicateScan(schedule);
  return input ? applyDuplicateScan(input, computeDuplicateScan(input)) : 0;
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
    const pending = candidates().filter((item) => item.teacherId === teacherId && item.status === "pending")
      .sort((a, b) => b.similarity - a.similarity || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
    if (!pending.length) return [];
    const libraryQuestions = (db.read("questions") || []) as Question[];
    const questions = new Map([...libraryQuestions, ...paperQuestionSources()].map((q) => [q.id, q]));
    const libraryIds = new Set(pending.filter((item) => item.kind === "library")
      .flatMap((item) => [item.leftQuestionId, item.rightQuestionId]));
    const sources = libraryIds.size
      ? questionSources(teacherId, libraryQuestions.filter((question) => libraryIds.has(question.id)), libraryIds)
      : new Map<string, string[]>();
    const view = (id: string, library: boolean): CandidateQuestion | null => {
      const question = questions.get(id);
      if (!question) return null;
      return {
        id: question.id, stem: question.stem, options: question.options,
        answer: library ? question.answer : "", analysis: library ? question.analysis : "",
        summary: library ? question.summary : "", subject: question.subject,
        sources: library ? (sources.get(id) || []) : [],
      };
    };
    return pending.map((item) => ({
        ...item,
        leftQuestion: view(item.leftQuestionId, true),
        rightQuestion: view(item.rightQuestionId, item.kind === "library"),
      }));
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
  async cancelPendingCandidates(teacherId: string): Promise<number> {
    let cancelled = 0;
    const now = new Date().toISOString();
    db.update("duplicateCandidates", (items: DuplicateCandidate[] = []) => items.map((item) => {
      if (item.teacherId !== teacherId || item.status !== "pending") return item;
      cancelled++;
      return { ...item, status: "cancelled" as const, resolvedAt: now };
    }));
    return cancelled;
  },
  async resolveCandidate(teacherId: string, candidateId: string, decision: "keep" | "merge" | "same" | "add", fields?: DuplicateQuestionMergeFields): Promise<void> {
    const candidate = candidates().find((c) => c.id === candidateId && c.teacherId === teacherId && c.status === "pending");
    if (!candidate) throw new Error("待处理题目不存在");
    if (!(candidate.kind === "library" ? ["keep", "merge"] : ["same", "add"]).includes(decision)) throw new Error("处理方式无效");
    const questions = db.read("questions") as Question[];
    const left = questions.find((q) => q.id === candidate.leftQuestionId && q.teacherId === teacherId);
    const right = [...questions, ...paperQuestionSources()].find((q) => q.id === candidate.rightQuestionId);
    if (!left || !right) throw new Error("题目已不存在");
    if (decision === "merge") {
      if (right.teacherId !== teacherId || left.id === right.id) throw new Error("只能合并本人题库中的不同题目");
      if (!fields) throw new Error("请先选择题干、答案、解析和总结的合并方式");
      await prepService.mergeQuestions(left.id, right.id, fields);
      const merged = ((db.read("questions") || []) as Question[]).find((q) => q.id === left.id);
      if (!merged) throw new Error("合并后的题目不存在");
      syncMergedQuestionDocuments([left.id, right.id], merged);
      // The removed question may occur in other pending comparisons.
      db.update("duplicateCandidates", (items: DuplicateCandidate[]) => items.map((item) =>
        item.id !== candidate.id && item.teacherId === teacherId && item.kind === "library"
        && item.status === "pending" && (item.leftQuestionId === right.id || item.rightQuestionId === right.id)
          ? { ...item, status: "merged" as const, resolvedAt: new Date().toISOString() }
          : item));
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
        sourceDocId: undefined, sourceDocIds: undefined, hiddenByExamIds: [], platformSourceDonationIds: undefined,
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
