import type {
  GradeBandRule,
  GradeExam,
  GradeExamSettings,
  GradeImportContext,
  GradeStatisticsTemplate,
} from "../types/index.js";
import { resolveClassAverageOptions, teacherNamesForSubject } from "./grade-class-average.js";
import { DEFAULT_ASSIGNMENT_RULES } from "./grade-statistics.js";
import { ASSIGNABLE_GRADE_SUBJECTS } from "./grade-subjects.js";

export const GRADE_ELECTIVE_SCORE_SEGMENT_SUBJECTS = ASSIGNABLE_GRADE_SUBJECTS;
export type GradeElectiveScoreSegmentSubject = (typeof GRADE_ELECTIVE_SCORE_SEGMENT_SUBJECTS)[number];

const DEFAULT_THRESHOLDS = [90, 80, 70, 60, 50, 40];

export interface GradeElectiveScoreSegmentRow {
  classId: string;
  classLabel: string;
  teacherNames: string[];
  candidateCount: number;
  gradeCounts: Record<string, number>;
  scoreCounts: Record<number, number>;
}

export interface GradeElectiveScoreSegmentSubjectReport {
  subject: GradeElectiveScoreSegmentSubject;
  title: string;
  gradeLabels: string[];
  thresholds: number[];
  rows: GradeElectiveScoreSegmentRow[];
  totalCandidateCount: number;
  totalGradeCounts: Record<string, number>;
  totalScoreCounts: Record<number, number>;
  totalGradeRates: Record<string, string>;
  totalScoreRates: Record<number, string>;
}

export interface GradeElectiveScoreSegmentReport {
  reportDate: string;
  subjects: GradeElectiveScoreSegmentSubjectReport[];
}

export function defaultGradeElectiveScoreThresholds(): number[] {
  return [...DEFAULT_THRESHOLDS];
}

export function resolveGradeElectiveScoreThresholds(
  template: GradeStatisticsTemplate,
  subject: string,
): number[] {
  const configured = template.totalScoreSegmentOptions?.subjectScoreSegmentThresholds?.[subject];
  return configured?.length
    ? [...new Set(configured
      .filter((value) => Number.isFinite(value))
      .map((value) => Math.max(0, Math.min(1000, Math.round(value)))))]
      .sort((left, right) => right - left)
    : defaultGradeElectiveScoreThresholds();
}

function assignmentRulesForSubject(
  settings: GradeExamSettings,
  subject: string,
  hasImportedAssignedScores: boolean,
): GradeBandRule[] {
  const configured = settings.assignmentRules[subject];
  if (configured?.length) return configured;
  return hasImportedAssignedScores ? DEFAULT_ASSIGNMENT_RULES : [];
}

function assignedGradeLabel(value: number | null | undefined, rules: GradeBandRule[]): string | null {
  if (typeof value !== "number" || !Number.isFinite(value) || rules.length === 0) return null;
  return rules.find((rule) => value >= rule.assignedMin && value <= rule.assignedMax)?.label || null;
}

function thresholdScore(
  rawScore: number | null | undefined,
  assignedScore: number | null | undefined,
): number | null {
  if (typeof rawScore === "number" && Number.isFinite(rawScore)) return rawScore;
  if (typeof assignedScore === "number" && Number.isFinite(assignedScore)) return assignedScore;
  return null;
}

export function buildGradeElectiveScoreSegmentReport(
  exam: GradeExam,
  template: GradeStatisticsTemplate,
  context: GradeImportContext,
  settings: GradeExamSettings = exam.settings,
  classAverageTemplate?: GradeStatisticsTemplate,
): GradeElectiveScoreSegmentReport {
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

  const subjects = GRADE_ELECTIVE_SCORE_SEGMENT_SUBJECTS
    .filter((subject) => exam.subjects.includes(subject))
    .map((subject) => {
      const thresholds = resolveGradeElectiveScoreThresholds(template, subject);
      const hasImportedAssignedScores = exam.records.some(
        (record) => typeof record.sourceAssignedScores?.[subject] === "number",
      );
      const rules = assignmentRulesForSubject(settings, subject, hasImportedAssignedScores);
      const gradeLabels = rules.map((rule) => rule.label);
      const rows = (classOptions.classOrder || [])
        .filter((classId) => !hiddenClassIds.has(classId))
        .map((classId) => {
          const classRecords = recordsByClass.get(classId) || [];
          const scoreRows = classRecords
            .map((record) => ({
              raw: record.scores[subject],
              assigned: record.assignedScores[subject],
            }))
            .map((scores) => ({
              ...scores,
              threshold: thresholdScore(scores.raw, scores.assigned),
            }))
            .filter((scores) => scores.threshold !== null || typeof scores.assigned === "number");
          const configuredForClass = classSubjectSettings.get(classId)?.examSubjects.includes(subject) ?? false;
          if (scoreRows.length === 0 && !configuredForClass) return null;
          const className = classNames.get(classId) || classRecords[0]?.className || classId;
          const gradeCounts = Object.fromEntries(gradeLabels.map((label) => [label, 0]));
          scoreRows.forEach((scores) => {
            const label = assignedGradeLabel(scores.assigned, rules);
            if (label) gradeCounts[label] = (gradeCounts[label] || 0) + 1;
          });
          return {
            classId,
            classLabel: classOptions.classLabels?.[classId] || className,
            teacherNames: teacherNamesForSubject(classId, subject, settings, context),
            candidateCount: scoreRows.length,
            gradeCounts,
            scoreCounts: Object.fromEntries(thresholds.map((threshold) => [
              threshold,
              scoreRows.filter((scores) => scores.threshold !== null && scores.threshold >= threshold).length,
            ])),
          } satisfies GradeElectiveScoreSegmentRow;
        })
        .filter((row): row is GradeElectiveScoreSegmentRow => row !== null);
      const totalCandidateCount = rows.reduce((sum, row) => sum + row.candidateCount, 0);
      const totalGradeCounts = Object.fromEntries(gradeLabels.map((label) => [
        label,
        rows.reduce((sum, row) => sum + (row.gradeCounts[label] || 0), 0),
      ]));
      const totalScoreCounts = Object.fromEntries(thresholds.map((threshold) => [
        threshold,
        rows.reduce((sum, row) => sum + (row.scoreCounts[threshold] || 0), 0),
      ]));
      const totalGradeRates = Object.fromEntries(gradeLabels.map((label) => [
        label,
        totalCandidateCount > 0 ? `${((totalGradeCounts[label] / totalCandidateCount) * 100).toFixed(1)}%` : "—",
      ]));
      const totalScoreRates = Object.fromEntries(thresholds.map((threshold) => [
        threshold,
        totalCandidateCount > 0 ? `${((totalScoreCounts[threshold] / totalCandidateCount) * 100).toFixed(1)}%` : "—",
      ]));
      return {
        subject,
        title: `${exam.cohortLabel}${exam.name}${subject}选修分数段统计表`,
        gradeLabels,
        thresholds,
        rows,
        totalCandidateCount,
        totalGradeCounts,
        totalScoreCounts,
        totalGradeRates,
        totalScoreRates,
      } satisfies GradeElectiveScoreSegmentSubjectReport;
    });

  return {
    reportDate: exam.examDate || exam.createdAt.slice(0, 10),
    subjects,
  };
}
