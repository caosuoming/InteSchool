import type { GradeQueryData, GradeQueryExam, GradeQueryRecord } from "@/types";

export interface RankTrendPoint {
  examId: string;
  examName: string;
  date: string;
  value: number;
  rank: number | null;
  rankLabel: string;
  valueLabel: string;
  comparisonCount?: number;
}

export interface ScoreHistoryExam {
  id: string;
  name: string;
  date: string;
  scores: Record<string, number>;
  gradeRank: number | null;
}

function validNumber(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function examTime(exam: GradeQueryExam): number {
  const time = Date.parse(exam.examDate || exam.createdAt);
  return Number.isFinite(time) ? time : 0;
}

function chronologicalExams(exams: GradeQueryExam[]): GradeQueryExam[] {
  return [...exams].sort((a, b) => examTime(a) - examTime(b) || a.id.localeCompare(b.id));
}

function visibleScore(record: GradeQueryRecord, subject: string): number | null {
  const assigned = record.assignedScores[subject];
  if (validNumber(assigned)) return assigned;
  const raw = record.scores[subject];
  return validNumber(raw) ? raw : null;
}

export interface SubjectTrend {
  subject: string;
  points: RankTrendPoint[];
}

/** Only use records and subjects returned by the permission-filtered grade query. */
export function studentAllSubjectTrends(data: GradeQueryData | null, studentId: string | null): SubjectTrend[] {
  if (!data || !studentId) return [];
  const exams = chronologicalExams(data.exams);
  const subjects = [...new Set(exams.flatMap((exam) => {
    const record = exam.records.find((item) => item.studentId === studentId);
    return record ? exam.subjects.filter((subject) => visibleScore(record, subject) !== null) : [];
  }))];

  return subjects.map((subject) => ({
    subject,
    points: exams.flatMap((exam): RankTrendPoint[] => {
      const record = exam.records.find((item) => item.studentId === studentId);
      if (!record) return [];
      const score = visibleScore(record, subject);
      if (score === null) return [];
      const subjectRank = record.subjectRanks?.[subject];
      const rankScope = record.subjectRankScopes?.[subject];
      const hasSubjectRank = validNumber(subjectRank) && subjectRank > 0;
      const subjectRankProvided = Object.prototype.hasOwnProperty.call(record.subjectRanks || {}, subject);
      const rank = hasSubjectRank ? subjectRank : !subjectRankProvided && record.gradeRank > 0 ? record.gradeRank : null;
      const rankLabel = hasSubjectRank
        ? rankScope === "class" ? "班内名次" : rankScope === "separate" ? "单独排名组名次" : "单科年级名次"
        : subjectRankProvided ? "单科名次" : "总分年级名次";
      return [{
        examId: exam.id, examName: exam.name, date: exam.examDate || exam.createdAt.slice(0, 10),
        value: score, rank, rankLabel, valueLabel: `${subject}成绩`,
      }];
    }),
  }));
}

export function studentSubjectTrend(data: GradeQueryData | null, studentId: string | null): SubjectTrend {
  const trends = studentAllSubjectTrends(data, studentId);
  if (trends.length === 0) return { subject: "", points: [] };
  const exams = chronologicalExams(data!.exams);
  const latestRecord = [...exams].reverse()
    .map((exam) => exam.records.find((item) => item.studentId === studentId)).find(Boolean);
  const fallbackSubject = latestRecord && Object.keys(latestRecord.assignedScores)
    .find((subject) => visibleScore(latestRecord, subject) !== null);
  return trends.find((trend) => trend.subject === data!.subject)
    || trends.find((trend) => trend.subject === fallbackSubject)
    || trends[0];
}

export function classRankTrend(data: GradeQueryData | null, classId: string | null): {
  subject: string;
  points: RankTrendPoint[];
} {
  if (!data || !classId) return { subject: "", points: [] };
  const exams = chronologicalExams(data.exams);
  const latestWithClass = [...exams].reverse().find((exam) => exam.classSummaries.some((item) => item.classId === classId));
  const defaultSubject = latestWithClass?.subjects.find((subject) =>
    latestWithClass.classSummaries.some((item) => item.classId === classId && validNumber(item.subjectAverages[subject]))
    && latestWithClass.classSummaries.filter((item) => validNumber(item.subjectAverages[subject])).length > 1,
  );
  const preferredSubject = data.subject && exams.some((exam) =>
    exam.classSummaries.some((item) => item.classId === classId && validNumber(item.subjectAverages[data.subject]))
    && exam.classSummaries.filter((item) => validNumber(item.subjectAverages[data.subject])).length > 1,
  ) ? data.subject : undefined;
  const subject = preferredSubject || defaultSubject || "";
  if (!subject) return { subject, points: [] };

  const points = exams.flatMap((exam): RankTrendPoint[] => {
    const summary = exam.classSummaries.find((item) => item.classId === classId);
    const average = summary?.subjectAverages[subject];
    if (!validNumber(average)) return [];
    const peers = exam.classSummaries.filter((item) => validNumber(item.subjectAverages[subject]));
    if (peers.length < 2) return [];
    const rank = 1 + peers.filter((item) => item.subjectAverages[subject]! > average).length;
    return [{ examId: exam.id, examName: exam.name, date: exam.examDate || exam.createdAt.slice(0, 10), value: average, rank, rankLabel: "同年级班级名次", valueLabel: `${subject}班级均分`, comparisonCount: peers.length }];
  });
  return { subject, points };
}

export function studentScoreHistory(data: GradeQueryData | null, studentId: string | null): {
  subjects: string[];
  exams: ScoreHistoryExam[];
} {
  if (!data || !studentId) return { subjects: [], exams: [] };
  const exams = chronologicalExams(data.exams).flatMap((exam): ScoreHistoryExam[] => {
    const record = exam.records.find((item) => item.studentId === studentId);
    if (!record) return [];
    const scores = Object.fromEntries(exam.subjects.flatMap((subject) => {
      const value = visibleScore(record, subject);
      return value === null ? [] : [[subject, value]];
    }));
    if (Object.keys(scores).length === 0) return [];
    return [{ id: exam.id, name: exam.name, date: exam.examDate || exam.createdAt.slice(0, 10), scores, gradeRank: record.gradeRank > 0 ? record.gradeRank : null }];
  });
  return { subjects: [...new Set(exams.flatMap((exam) => Object.keys(exam.scores)))], exams };
}
