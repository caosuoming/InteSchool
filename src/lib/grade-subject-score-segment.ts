import type {
  GradeExam,
  GradeExamSettings,
  GradeImportContext,
  GradeStatisticsTemplate,
} from "../types/index.js";
import { resolveClassAverageOptions, teacherNamesForSubject } from "./grade-class-average.js";

export const GRADE_SUBJECT_SCORE_SEGMENT_SUBJECTS = ["语文", "数学", "英语", "物理", "历史"] as const;
export type GradeSubjectScoreSegmentSubject = (typeof GRADE_SUBJECT_SCORE_SEGMENT_SUBJECTS)[number];

const DEFAULT_CORE_THRESHOLDS = [140, 130, 120, 110, 100, 90, 80, 70, 60];
const DEFAULT_PRIMARY_ELECTIVE_THRESHOLDS = [90, 80, 70, 60, 50, 40];

export interface GradeSubjectScoreSegmentRow {
  classId: string;
  classLabel: string;
  teacherNames: string[];
  candidateCount: number;
  counts: Record<number, number>;
}

export interface GradeSubjectScoreSegmentSubjectReport {
  subject: GradeSubjectScoreSegmentSubject;
  title: string;
  thresholds: number[];
  rows: GradeSubjectScoreSegmentRow[];
  totalCandidateCount: number;
  totalCounts: Record<number, number>;
  totalRates: Record<number, string>;
}

export interface GradeSubjectScoreSegmentReport {
  reportDate: string;
  subjects: GradeSubjectScoreSegmentSubjectReport[];
}

export function defaultGradeSubjectScoreThresholds(subject: string): number[] {
  return subject === "物理" || subject === "历史"
    ? [...DEFAULT_PRIMARY_ELECTIVE_THRESHOLDS]
    : [...DEFAULT_CORE_THRESHOLDS];
}

export function resolveGradeSubjectScoreThresholds(
  template: GradeStatisticsTemplate,
  subject: string,
): number[] {
  const configured = template.totalScoreSegmentOptions?.subjectScoreSegmentThresholds?.[subject];
  return configured?.length
    ? [...new Set(configured
      .filter((value) => Number.isFinite(value))
      .map((value) => Math.max(0, Math.min(1000, Math.round(value)))))]
      .sort((left, right) => right - left)
    : defaultGradeSubjectScoreThresholds(subject);
}

export function buildGradeSubjectScoreSegmentReport(
  exam: GradeExam,
  template: GradeStatisticsTemplate,
  context: GradeImportContext,
  settings: GradeExamSettings = exam.settings,
  classAverageTemplate?: GradeStatisticsTemplate,
): GradeSubjectScoreSegmentReport {
  const classOptions = resolveClassAverageOptions(
    exam,
    context,
    classAverageTemplate?.classAverageOptions,
    classAverageTemplate?.scoreMode || "assigned",
  );
  const hiddenClassIds = new Set(classOptions.hiddenClassIds || []);
  const classNames = new Map(context.classes.map((classItem) => [classItem.id, classItem.name]));
  const recordsByClass = new Map<string, typeof exam.records>();
  exam.records.forEach((record) => {
    const current = recordsByClass.get(record.classId) || [];
    current.push(record);
    recordsByClass.set(record.classId, current);
  });
  const classSubjectSettings = new Map(settings.classSubjects.map((item) => [item.classId, item]));

  const subjects = GRADE_SUBJECT_SCORE_SEGMENT_SUBJECTS
    .filter((subject) => exam.subjects.includes(subject))
    .map((subject) => {
      const thresholds = resolveGradeSubjectScoreThresholds(template, subject);
      const rows = (classOptions.classOrder || [])
        .filter((classId) => !hiddenClassIds.has(classId))
        .map((classId) => {
          const classRecords = recordsByClass.get(classId) || [];
          const scores = classRecords
            .map((record) => record.scores[subject])
            .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
          const configuredForClass = classSubjectSettings.get(classId)?.examSubjects.includes(subject) ?? false;
          if (scores.length === 0 && !configuredForClass) return null;
          const className = classNames.get(classId) || classRecords[0]?.className || classId;
          return {
            classId,
            classLabel: classOptions.classLabels?.[classId] || className,
            teacherNames: teacherNamesForSubject(classId, subject, settings, context),
            candidateCount: scores.length,
            counts: Object.fromEntries(thresholds.map((threshold) => [
              threshold,
              scores.filter((score) => score >= threshold).length,
            ])),
          } satisfies GradeSubjectScoreSegmentRow;
        })
        .filter((row): row is GradeSubjectScoreSegmentRow => row !== null);
      const totalCandidateCount = rows.reduce((sum, row) => sum + row.candidateCount, 0);
      const totalCounts = Object.fromEntries(thresholds.map((threshold) => [
        threshold,
        rows.reduce((sum, row) => sum + (row.counts[threshold] || 0), 0),
      ]));
      const totalRates = Object.fromEntries(thresholds.map((threshold) => [
        threshold,
        totalCandidateCount > 0 ? `${((totalCounts[threshold] / totalCandidateCount) * 100).toFixed(1)}%` : "—",
      ]));
      return {
        subject,
        title: `${exam.name}${subject}成绩情况统计表`,
        thresholds,
        rows,
        totalCandidateCount,
        totalCounts,
        totalRates,
      } satisfies GradeSubjectScoreSegmentSubjectReport;
    });

  return {
    reportDate: exam.examDate || exam.createdAt.slice(0, 10),
    subjects,
  };
}
