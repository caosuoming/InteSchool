import type {
  GradeExam,
  GradeImportContext,
  GradeStatisticsTemplate,
  GradeTotalScoreTargetKey,
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

export type GradeTotalScoreSummaryRowKind = "count" | "target" | "status" | "rate";

export interface GradeTotalScoreSummaryRow {
  key: string;
  label: string;
  kind: GradeTotalScoreSummaryRowKind;
  targetKey?: GradeTotalScoreTargetKey;
  values: Record<string, number | string | null>;
}

export interface GradeTotalScoreSegmentReport {
  title: string;
  reportDate: string;
  segmentMax: number;
  segmentMin: number;
  segmentSize: number;
  classes: GradeTotalScoreSegmentClass[];
  rows: GradeTotalScoreSegmentRow[];
  summaryRows: GradeTotalScoreSummaryRow[];
}

export const DEFAULT_TOTAL_SCORE_SEGMENT_MAX = 700;
export const DEFAULT_TOTAL_SCORE_SEGMENT_MIN = 400;
export const DEFAULT_TOTAL_SCORE_SEGMENT_SIZE = 10;

const TARGET_KEYS: GradeTotalScoreTargetKey[] = [
  "highScore1",
  "highScore2",
  "firstTier",
  "undergraduate",
];

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

  const totalsByClass = new Map(classes.map((classItem) => [
    classItem.classId,
    (recordsByClass.get(classItem.classId) || []).map((record) => gradeTemplateTotal(record, effectiveTemplate)),
  ]));

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
        (totalsByClass.get(classItem.classId) || []).filter((total) => total >= threshold).length,
      ])),
    });
  }

  const segmentOptions = template.totalScoreSegmentOptions || {};
  const thresholds: Record<GradeTotalScoreTargetKey, number | undefined> = {
    highScore1: segmentOptions.highScore1Threshold,
    highScore2: segmentOptions.highScore2Threshold,
    firstTier: segmentOptions.firstTierThreshold,
    undergraduate: segmentOptions.undergraduateThreshold,
  };
  const targets = Object.fromEntries(classes.map((classItem) => [
    classItem.classId,
    segmentOptions.classTargets?.[classItem.classId] || {},
  ]));
  const lineCounts = Object.fromEntries(TARGET_KEYS.map((key) => [
    key,
    Object.fromEntries(classes.map((classItem) => {
      const threshold = thresholds[key];
      return [
        classItem.classId,
        typeof threshold === "number"
          ? (totalsByClass.get(classItem.classId) || []).filter((total) => total >= threshold).length
          : null,
      ];
    })),
  ])) as Record<GradeTotalScoreTargetKey, Record<string, number | null>>;
  const targetValues = (key: GradeTotalScoreTargetKey) => Object.fromEntries(classes.map((classItem) => [
    classItem.classId,
    targets[classItem.classId]?.[key] ?? null,
  ]));
  const countValues = (key: GradeTotalScoreTargetKey) => Object.fromEntries(classes.map((classItem) => [
    classItem.classId,
    lineCounts[key][classItem.classId],
  ]));
  const statusValues = (key: GradeTotalScoreTargetKey) => Object.fromEntries(classes.map((classItem) => {
    const target = targets[classItem.classId]?.[key];
    const actual = lineCounts[key][classItem.classId];
    if (typeof target !== "number" || typeof actual !== "number") return [classItem.classId, null];
    const difference = actual - target;
    return [
      classItem.classId,
      difference >= 0 ? `完成（+${difference}）` : `未完成（${difference}）`,
    ];
  }));
  const rateValues = (key: GradeTotalScoreTargetKey) => Object.fromEntries(classes.map((classItem) => {
    const actual = lineCounts[key][classItem.classId];
    const total = totalsByClass.get(classItem.classId)?.length || 0;
    return [
      classItem.classId,
      typeof actual === "number" && total > 0 ? `${((actual / total) * 100).toFixed(1)}%` : null,
    ];
  }));
  const summaryRows: GradeTotalScoreSummaryRow[] = [
    {
      key: "candidateCount",
      label: "考生人数",
      kind: "count",
      values: Object.fromEntries(classes.map((classItem) => [
        classItem.classId,
        totalsByClass.get(classItem.classId)?.length || 0,
      ])),
    },
    { key: "highScore1Target", label: "高分1目标", kind: "target", targetKey: "highScore1", values: targetValues("highScore1") },
    { key: "highScore1Count", label: "高分1达线数", kind: "count", values: countValues("highScore1") },
    { key: "highScore1Status", label: "完成情况", kind: "status", values: statusValues("highScore1") },
    { key: "highScore2Target", label: "高分2目标", kind: "target", targetKey: "highScore2", values: targetValues("highScore2") },
    { key: "highScore2Count", label: "高分2达线数", kind: "count", values: countValues("highScore2") },
    { key: "highScore2Status", label: "达线情况", kind: "status", values: statusValues("highScore2") },
    { key: "firstTierTarget", label: "一本目标", kind: "target", targetKey: "firstTier", values: targetValues("firstTier") },
    { key: "firstTierCount", label: "一本人数", kind: "count", values: countValues("firstTier") },
    { key: "firstTierRate", label: "一本率", kind: "rate", values: rateValues("firstTier") },
    { key: "undergraduateTarget", label: "本科目标", kind: "target", targetKey: "undergraduate", values: targetValues("undergraduate") },
    { key: "undergraduateCount", label: "本科人数", kind: "count", values: countValues("undergraduate") },
    { key: "undergraduateRate", label: "本科率", kind: "rate", values: rateValues("undergraduate") },
  ];

  return {
    title: `${exam.cohortLabel}${exam.name}总分分数段汇总表`,
    reportDate: exam.examDate || exam.createdAt.slice(0, 10),
    segmentMax,
    segmentMin,
    segmentSize,
    classes,
    rows,
    summaryRows,
  };
}
