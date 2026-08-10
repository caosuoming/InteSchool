import type {
  GradeExam,
  GradeImportContext,
  GradeStatisticsTemplate,
} from "../types/index.js";
import { resolveClassAverageOptions } from "./grade-class-average.js";
import { gradeTemplateTotal } from "./grade-reports.js";

export interface GradeTotalScoreSegmentClass {
  classId: string;
  className: string;
  classLabel: string;
}

export interface GradeTotalScoreSegmentRow {
  threshold: number;
  counts: Record<string, number>;
}

export interface GradeTotalScoreSegmentReport {
  title: string;
  reportDate: string;
  segmentMax: number;
  segmentMin: number;
  segmentSize: number;
  classes: GradeTotalScoreSegmentClass[];
  rows: GradeTotalScoreSegmentRow[];
}

export const DEFAULT_TOTAL_SCORE_SEGMENT_MAX = 700;
export const DEFAULT_TOTAL_SCORE_SEGMENT_MIN = 400;
export const DEFAULT_TOTAL_SCORE_SEGMENT_SIZE = 10;

function finiteInteger(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) ? Math.round(Number(value)) : fallback;
}

export function resolveTotalScoreSegmentRange(template: GradeStatisticsTemplate): {
  segmentMax: number;
  segmentMin: number;
  segmentSize: number;
} {
  const rawMax = Math.max(0, Math.min(2000, finiteInteger(
    template.segmentMax,
    DEFAULT_TOTAL_SCORE_SEGMENT_MAX,
  )));
  const rawMin = Math.max(0, Math.min(2000, finiteInteger(
    template.segmentMin,
    DEFAULT_TOTAL_SCORE_SEGMENT_MIN,
  )));
  const segmentSize = Math.max(1, Math.min(500, finiteInteger(
    template.segmentSize,
    DEFAULT_TOTAL_SCORE_SEGMENT_SIZE,
  )));
  return {
    segmentMax: Math.max(rawMax, rawMin),
    segmentMin: Math.min(rawMax, rawMin),
    segmentSize,
  };
}

export function buildGradeTotalScoreSegmentReport(
  exam: GradeExam,
  template: GradeStatisticsTemplate,
  context: GradeImportContext,
  classAverageTemplate?: GradeStatisticsTemplate,
): GradeTotalScoreSegmentReport {
  const { segmentMax, segmentMin, segmentSize } = resolveTotalScoreSegmentRange(template);
  const classOptions = resolveClassAverageOptions(exam, context, classAverageTemplate?.classAverageOptions);
  const hiddenClassIds = new Set(classOptions.hiddenClassIds || []);
  const recordsByClass = new Map<string, typeof exam.records>();
  exam.records.forEach((record) => {
    const current = recordsByClass.get(record.classId) || [];
    current.push(record);
    recordsByClass.set(record.classId, current);
  });
  const classNames = new Map(context.classes.map((item) => [item.id, item.name]));
  const effectiveTemplate = template.subjects.length > 0
    ? template
    : { ...template, subjects: [...exam.subjects] };

  const classes = (classOptions.classOrder || [])
    .filter((classId) => !hiddenClassIds.has(classId))
    .map((classId) => {
      const records = recordsByClass.get(classId) || [];
      const className = classNames.get(classId) || records[0]?.className || classId;
      return {
        classId,
        className,
        classLabel: classOptions.classLabels?.[classId] || className,
      } satisfies GradeTotalScoreSegmentClass;
    });

  const rows: GradeTotalScoreSegmentRow[] = [];
  for (
    let threshold = segmentMax;
    threshold >= segmentMin;
    threshold -= segmentSize
  ) {
    rows.push({
      threshold,
      counts: Object.fromEntries(classes.map((classItem) => [
        classItem.classId,
        (recordsByClass.get(classItem.classId) || []).filter((record) => (
          gradeTemplateTotal(record, effectiveTemplate) >= threshold
        )).length,
      ])),
    });
  }

  return {
    title: `${exam.cohortLabel}${exam.name}总分分数段汇总表`,
    reportDate: exam.examDate || exam.createdAt.slice(0, 10),
    segmentMax,
    segmentMin,
    segmentSize,
    classes,
    rows,
  };
}
