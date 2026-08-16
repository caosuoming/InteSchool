import type {
  GradeAcademicTrack,
  GradeExam,
  GradeImportContext,
  GradeScoreRecord,
  GradeStatisticsTemplate,
  GradeTotalScoreTargetKey,
} from "../types/index.js";
import { resolveClassAverageOptions } from "./grade-class-average.js";
import { gradeTemplateTotal } from "./grade-reports.js";

export type GradeAcademicTrackClassification = GradeAcademicTrack | "unclassified";

export interface GradeTotalScoreSegmentClass {
  classId: string;
  className: string;
  classLabel: string;
  track: GradeAcademicTrackClassification;
}

export interface GradeTotalScoreSegmentColumn {
  key: string;
  label: string;
  kind: "class" | "subtotal" | "total";
  classId?: string;
  track?: GradeAcademicTrack;
  classIds: string[];
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
  trackStandards: Record<GradeAcademicTrack, Record<GradeTotalScoreTargetKey, number | null>>;
  classes: GradeTotalScoreSegmentClass[];
  columns: GradeTotalScoreSegmentColumn[];
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

const SUBTOTAL_KEYS: Record<GradeAcademicTrack, string> = {
  science: "__science_subtotal__",
  arts: "__arts_subtotal__",
};
const TOTAL_KEY = "__total__";

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

export function inferGradeAcademicTrackFromSelection(value: string): GradeAcademicTrackClassification {
  const normalized = value.replace(/[\s、,，/|+]+/g, "");
  const withoutBiology = normalized.replace(/生物/g, "");
  const hasPhysics = normalized.includes("物理") || withoutBiology.includes("物");
  const hasHistory = normalized.includes("历史") || normalized.includes("史");
  if (hasPhysics && !hasHistory) return "science";
  if (hasHistory && !hasPhysics) return "arts";
  return "unclassified";
}

function finiteSubjectScore(record: GradeScoreRecord, subject: string): boolean {
  return typeof record.scores[subject] === "number"
    || typeof record.assignedScores[subject] === "number";
}

export function inferGradeClassAcademicTrack(
  classId: string,
  records: GradeScoreRecord[],
  context: GradeImportContext,
): GradeAcademicTrackClassification {
  const selections = [
    ...(context.classProfiles?.[classId]?.subjectSelections || []),
    ...context.students
      .filter((student) => student.classId === classId)
      .map((student) => student.subjectSelection || ""),
    ...records
      .filter((record) => record.classId === classId)
      .map((record) => record.subjectSelection || ""),
  ].map((value) => value.trim()).filter(Boolean);

  let scienceVotes = 0;
  let artsVotes = 0;
  selections.forEach((selection) => {
    const track = inferGradeAcademicTrackFromSelection(selection);
    if (track === "science") scienceVotes += 1;
    if (track === "arts") artsVotes += 1;
  });
  if (scienceVotes > artsVotes) return "science";
  if (artsVotes > scienceVotes) return "arts";

  const classRecords = records.filter((record) => record.classId === classId);
  const physicsCount = classRecords.filter((record) => finiteSubjectScore(record, "物理")).length;
  const historyCount = classRecords.filter((record) => finiteSubjectScore(record, "历史")).length;
  if (physicsCount > historyCount) return "science";
  if (historyCount > physicsCount) return "arts";
  return "unclassified";
}

function buildColumns(classes: GradeTotalScoreSegmentClass[]): GradeTotalScoreSegmentColumn[] {
  const columns: GradeTotalScoreSegmentColumn[] = [];
  const appendTrack = (track: GradeAcademicTrack, label: string) => {
    const trackClasses = classes.filter((classItem) => classItem.track === track);
    trackClasses.forEach((classItem) => columns.push({
      key: classItem.classId,
      label: classItem.classLabel,
      kind: "class",
      classId: classItem.classId,
      track,
      classIds: [classItem.classId],
    }));
    if (trackClasses.length > 0) {
      columns.push({
        key: SUBTOTAL_KEYS[track],
        label,
        kind: "subtotal",
        track,
        classIds: trackClasses.map((classItem) => classItem.classId),
      });
    }
  };

  appendTrack("science", "理科小计");
  appendTrack("arts", "文科小计");
  classes.filter((classItem) => classItem.track === "unclassified").forEach((classItem) => columns.push({
    key: classItem.classId,
    label: classItem.classLabel,
    kind: "class",
    classId: classItem.classId,
    classIds: [classItem.classId],
  }));
  columns.push({
    key: TOTAL_KEY,
    label: "总计",
    kind: "total",
    classIds: classes.map((classItem) => classItem.classId),
  });
  return columns;
}

function sumNumbers(values: Array<number | null | undefined>): number | null {
  const numbers = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return numbers.length > 0 ? numbers.reduce((sum, value) => sum + value, 0) : null;
}

function thresholdForTrack(
  template: GradeStatisticsTemplate,
  track: GradeAcademicTrackClassification,
  key: GradeTotalScoreTargetKey,
): number | undefined {
  const options = template.totalScoreSegmentOptions || {};
  const legacyThresholds: Record<GradeTotalScoreTargetKey, number | undefined> = {
    highScore1: options.highScore1Threshold,
    highScore2: options.highScore2Threshold,
    firstTier: options.firstTierThreshold,
    undergraduate: options.undergraduateThreshold,
  };
  return track === "science" || track === "arts"
    ? options.trackThresholds?.[track]?.[key] ?? legacyThresholds[key]
    : legacyThresholds[key];
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
  const recordsByClass = new Map<string, GradeScoreRecord[]>();
  exam.records.forEach((record) => {
    const current = recordsByClass.get(record.classId) || [];
    current.push(record);
    recordsByClass.set(record.classId, current);
  });
  const classNames = new Map(context.classes.map((item) => [item.id, item.name]));
  const effectiveTemplate = template.subjects.length > 0
    ? template
    : { ...template, subjects: [...exam.subjects] };

  const sourceClasses = (classOptions.classOrder || [])
    .filter((classId) => !hiddenClassIds.has(classId))
    .map((classId) => {
      const records = recordsByClass.get(classId) || [];
      const className = classNames.get(classId) || records[0]?.className || classId;
      return {
        classId,
        className,
        classLabel: classOptions.classLabels?.[classId] || className,
        track: inferGradeClassAcademicTrack(classId, exam.records, context),
      } satisfies GradeTotalScoreSegmentClass;
    });
  const classes = [
    ...sourceClasses.filter((classItem) => classItem.track === "science"),
    ...sourceClasses.filter((classItem) => classItem.track === "arts"),
    ...sourceClasses.filter((classItem) => classItem.track === "unclassified"),
  ];
  const columns = buildColumns(classes);

  const totalsByClass = new Map(classes.map((classItem) => [
    classItem.classId,
    (recordsByClass.get(classItem.classId) || []).map((record) => gradeTemplateTotal(record, effectiveTemplate)),
  ]));

  const rows: GradeTotalScoreSegmentRow[] = [];
  for (let threshold = segmentMax; threshold >= segmentMin; threshold -= segmentSize) {
    const classCounts = Object.fromEntries(classes.map((classItem) => [
      classItem.classId,
      (totalsByClass.get(classItem.classId) || []).filter((total) => total >= threshold).length,
    ]));
    rows.push({
      threshold,
      counts: Object.fromEntries(columns.map((column) => [
        column.key,
        column.classIds.reduce((sum, classId) => sum + (classCounts[classId] || 0), 0),
      ])),
    });
  }

  const segmentOptions = template.totalScoreSegmentOptions || {};
  const trackStandards = Object.fromEntries((["science", "arts"] as const).map((track) => [
    track,
    Object.fromEntries(TARGET_KEYS.map((key) => [
      key,
      thresholdForTrack(template, track, key) ?? null,
    ])),
  ])) as GradeTotalScoreSegmentReport["trackStandards"];
  const targets = Object.fromEntries(classes.map((classItem) => [
    classItem.classId,
    segmentOptions.classTargets?.[classItem.classId] || {},
  ]));
  const lineCounts = Object.fromEntries(TARGET_KEYS.map((key) => [
    key,
    Object.fromEntries(classes.map((classItem) => {
      const threshold = thresholdForTrack(template, classItem.track, key);
      return [
        classItem.classId,
        typeof threshold === "number"
          ? (totalsByClass.get(classItem.classId) || []).filter((total) => total >= threshold).length
          : null,
      ];
    })),
  ])) as Record<GradeTotalScoreTargetKey, Record<string, number | null>>;

  const valuesByColumns = (
    classValues: Record<string, number | string | null>,
    aggregate: (classIds: string[]) => number | string | null,
  ) => Object.fromEntries(columns.map((column) => [
    column.key,
    column.kind === "class" && column.classId
      ? classValues[column.classId] ?? null
      : aggregate(column.classIds),
  ]));

  const targetValues = (key: GradeTotalScoreTargetKey) => {
    const perClass = Object.fromEntries(classes.map((classItem) => [
      classItem.classId,
      targets[classItem.classId]?.[key] ?? null,
    ]));
    return valuesByColumns(perClass, (classIds) => sumNumbers(classIds.map((classId) => perClass[classId] as number | null)));
  };
  const countValues = (key: GradeTotalScoreTargetKey) => {
    const perClass = Object.fromEntries(classes.map((classItem) => [classItem.classId, lineCounts[key][classItem.classId]]));
    return valuesByColumns(perClass, (classIds) => sumNumbers(classIds.map((classId) => perClass[classId] as number | null)));
  };
  const statusValues = (key: GradeTotalScoreTargetKey) => {
    const perClass = Object.fromEntries(classes.map((classItem) => {
      const target = targets[classItem.classId]?.[key];
      const actual = lineCounts[key][classItem.classId];
      if (typeof target !== "number" || typeof actual !== "number") return [classItem.classId, null];
      const difference = actual - target;
      return [classItem.classId, difference >= 0 ? `完成（+${difference}）` : `未完成（${difference}）`];
    }));
    return valuesByColumns(perClass, (classIds) => {
      const target = sumNumbers(classIds.map((classId) => targets[classId]?.[key]));
      const actual = sumNumbers(classIds.map((classId) => lineCounts[key][classId]));
      if (target === null || actual === null) return null;
      const difference = actual - target;
      return difference >= 0 ? `完成（+${difference}）` : `未完成（${difference}）`;
    });
  };
  const rateValues = (key: GradeTotalScoreTargetKey) => {
    const perClass = Object.fromEntries(classes.map((classItem) => {
      const actual = lineCounts[key][classItem.classId];
      const total = totalsByClass.get(classItem.classId)?.length || 0;
      return [
        classItem.classId,
        typeof actual === "number" && total > 0 ? `${((actual / total) * 100).toFixed(1)}%` : null,
      ];
    }));
    return valuesByColumns(perClass, (classIds) => {
      const actual = sumNumbers(classIds.map((classId) => lineCounts[key][classId]));
      const total = classIds.reduce((sum, classId) => sum + (totalsByClass.get(classId)?.length || 0), 0);
      return actual !== null && total > 0 ? `${((actual / total) * 100).toFixed(1)}%` : null;
    });
  };

  const candidatePerClass = Object.fromEntries(classes.map((classItem) => [
    classItem.classId,
    totalsByClass.get(classItem.classId)?.length || 0,
  ]));
  const summaryRows: GradeTotalScoreSummaryRow[] = [
    {
      key: "candidateCount",
      label: "考生人数",
      kind: "count",
      values: valuesByColumns(candidatePerClass, (classIds) => (
        classIds.reduce((sum, classId) => sum + (candidatePerClass[classId] || 0), 0)
      )),
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
    title: `${exam.cohortLabel}${exam.name}总分分数段汇总表（${template.scoreMode === "raw" ? "原始分" : "赋分"}）`,
    reportDate: exam.examDate || exam.createdAt.slice(0, 10),
    segmentMax,
    segmentMin,
    segmentSize,
    trackStandards,
    classes,
    columns,
    rows,
    summaryRows,
  };
}
