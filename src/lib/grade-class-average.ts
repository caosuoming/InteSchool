import type {
  GradeClassAverageOptions,
  GradeClassAverageSubjectScoreMode,
  GradeExam,
  GradeExamSettings,
  GradeImportContext,
  GradeScoreMode,
  GradeScoreRecord,
  GradeStatisticsTemplate,
} from "../types/index.js";
import { averageGradeValues } from "./grade-reports.js";

export interface GradeClassAverageScorePair {
  raw: number | null;
  assigned: number | null;
}

export interface GradeClassAverageRow {
  classId: string;
  className: string;
  classLabel: string;
  category: string;
  studentCount: number;
  homeroomTeachers: string[];
  subjectTeachers: Record<string, string[]>;
  subjectAverages: Record<string, GradeClassAverageScorePair>;
  subjectScoreModes: Record<string, GradeClassAverageSubjectScoreMode>;
  totalAverages: GradeClassAverageScorePair;
}

export interface GradeClassAverageSummary {
  subjectValues: Record<string, GradeClassAverageScorePair>;
  totalValues: GradeClassAverageScorePair;
}

export interface GradeClassAverageGroup {
  category: string;
  rows: GradeClassAverageRow[];
  difference: GradeClassAverageSummary;
  average: GradeClassAverageSummary;
  subjectScoreModes: Record<string, GradeClassAverageSubjectScoreMode>;
}

export interface GradeClassAverageReport {
  title: string;
  reportDate: string;
  subjects: string[];
  options: Required<Pick<
    GradeClassAverageOptions,
    | "showTeacherRows"
    | "showGroupDifference"
    | "showGroupAverage"
    | "showOverallAverage"
  >> & GradeClassAverageOptions;
  groups: GradeClassAverageGroup[];
  overallAverage: GradeClassAverageSummary;
  overallSubjectScoreModes: Record<string, GradeClassAverageSubjectScoreMode>;
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function naturalCompare(left: string, right: string): number {
  return left.localeCompare(right, "zh-CN", { numeric: true, sensitivity: "base" });
}

export function compactGradeClassLabel(className: string): string {
  const bracketed = className.match(/[（(]\s*(\d+)\s*[）)]\s*班?/);
  if (bracketed) return `${Number(bracketed[1])}班`;
  const numbered = className.match(/(?:^|[^\d])(\d+)\s*班/);
  if (numbered) return `${Number(numbered[1])}班`;
  return className;
}

function fallbackReportDate(exam: GradeExam): string {
  return exam.examDate || exam.createdAt.slice(0, 10);
}

function defaultCategory(
  classId: string,
  records: GradeScoreRecord[],
  context: GradeImportContext,
): string {
  return context.classProfiles?.[classId]?.classTypeName
    || records.find((record) => record.classId === classId)?.classType
    || "普通班";
}

export function buildDefaultClassAverageOptions(
  exam: GradeExam,
  context: GradeImportContext,
  scoreMode: GradeScoreMode = "assigned",
): GradeClassAverageOptions {
  const recordClassIds = unique(exam.records.map((record) => record.classId));
  const classMap = new Map(context.classes.map((item) => [item.id, item]));
  const classOrder = [
    ...context.classes
      .sort((left, right) => naturalCompare(left.name, right.name))
      .map((item) => item.id),
    ...recordClassIds.filter((classId) => !classMap.has(classId)),
  ];
  const classNames = new Map(exam.records.map((record) => [record.classId, record.className]));

  return {
    title: `${exam.cohortLabel}${exam.name}班级平均分统计表`,
    reportDate: fallbackReportDate(exam),
    classOrder,
    hiddenClassIds: [],
    classCategories: Object.fromEntries(classOrder.map((classId) => [
      classId,
      defaultCategory(classId, exam.records, context),
    ])),
    classLabels: Object.fromEntries(classOrder.map((classId) => [
      classId,
      compactGradeClassLabel(classMap.get(classId)?.name || classNames.get(classId) || "未知班级"),
    ])),
    subjectScoreModes: Object.fromEntries(classOrder.map((classId) => [
      classId,
      Object.fromEntries(exam.subjects.map((subject) => [subject, scoreMode])),
    ])),
    totalScoreMode: scoreMode,
    showTeacherRows: true,
    showGroupDifference: true,
    showGroupAverage: true,
    showOverallAverage: true,
  };
}

export function resolveClassAverageOptions(
  exam: GradeExam,
  context: GradeImportContext,
  options?: GradeClassAverageOptions,
  scoreMode: GradeScoreMode = "assigned",
): GradeClassAverageReport["options"] {
  const defaults = buildDefaultClassAverageOptions(exam, context, scoreMode);
  const defaultOrder = defaults.classOrder || [];
  const requestedOrder = unique(options?.classOrder || []).filter((classId) => defaultOrder.includes(classId));
  const classOrder = [
    ...requestedOrder,
    ...defaultOrder.filter((classId) => !requestedOrder.includes(classId)),
  ];
  return {
    ...defaults,
    ...options,
    title: options?.title?.trim() || defaults.title,
    reportDate: options?.reportDate || defaults.reportDate,
    classOrder,
    hiddenClassIds: unique(options?.hiddenClassIds || []),
    classCategories: {
      ...defaults.classCategories,
      ...options?.classCategories,
    },
    classLabels: {
      ...defaults.classLabels,
      ...options?.classLabels,
    },
    subjectScoreModes: Object.fromEntries((classOrder || []).map((classId) => [
      classId,
      {
        ...defaults.subjectScoreModes?.[classId],
        ...options?.subjectScoreModes?.[classId],
      },
    ])),
    totalScoreMode: options?.totalScoreMode || scoreMode,
    showTeacherRows: options?.showTeacherRows ?? true,
    showGroupDifference: options?.showGroupDifference ?? true,
    showGroupAverage: options?.showGroupAverage ?? true,
    showOverallAverage: options?.showOverallAverage ?? true,
  };
}

function recordSubjectValue(
  record: GradeScoreRecord,
  subject: string,
  scoreMode: GradeScoreMode,
): number | null {
  return scoreMode === "raw" ? record.scores[subject] : record.assignedScores[subject];
}

function recordTotal(
  record: GradeScoreRecord,
  subjects: string[],
  scoreMode: GradeScoreMode,
): number | null {
  const values = subjects
    .map((subject) => recordSubjectValue(record, subject, scoreMode))
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return values.length > 0 ? round(values.reduce((sum, value) => sum + value, 0)) : null;
}

function summaryForRecords(
  records: GradeScoreRecord[],
  subjects: string[],
): GradeClassAverageSummary {
  return {
    subjectValues: Object.fromEntries(subjects.map((subject) => [
      subject,
      {
        raw: averageGradeValues(records.map((record) => recordSubjectValue(record, subject, "raw"))),
        assigned: averageGradeValues(records.map((record) => recordSubjectValue(record, subject, "assigned"))),
      },
    ])),
    totalValues: {
      raw: averageGradeValues(records.map((record) => recordTotal(record, subjects, "raw"))),
      assigned: averageGradeValues(records.map((record) => recordTotal(record, subjects, "assigned"))),
    },
  };
}

function differenceForRows(
  rows: GradeClassAverageRow[],
  subjects: string[],
): GradeClassAverageSummary {
  const difference = (values: Array<number | null>): number | null => {
    const numbers = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
    return numbers.length > 1 ? round(Math.max(...numbers) - Math.min(...numbers)) : null;
  };
  return {
    subjectValues: Object.fromEntries(subjects.map((subject) => [
      subject,
      {
        raw: difference(rows.map((row) => row.subjectAverages[subject].raw)),
        assigned: difference(rows.map((row) => row.subjectAverages[subject].assigned)),
      },
    ])),
    totalValues: {
      raw: difference(rows.map((row) => row.totalAverages.raw)),
      assigned: difference(rows.map((row) => row.totalAverages.assigned)),
    },
  };
}

function subjectScoreModeForClass(
  options: GradeClassAverageReport["options"],
  classId: string,
  subject: string,
  fallback: GradeScoreMode,
): GradeClassAverageSubjectScoreMode {
  return options.subjectScoreModes?.[classId]?.[subject] || fallback;
}

function combinedSubjectScoreModes(
  rows: GradeClassAverageRow[],
  subjects: string[],
  fallback: GradeScoreMode,
): Record<string, GradeClassAverageSubjectScoreMode> {
  return Object.fromEntries(subjects.map((subject) => {
    let hasRaw = false;
    let hasAssigned = false;
    rows.forEach((row) => {
      const mode = row.subjectScoreModes[subject] || fallback;
      hasRaw ||= mode === "raw" || mode === "both";
      hasAssigned ||= mode === "assigned" || mode === "both";
    });
    const mode: GradeClassAverageSubjectScoreMode = hasRaw && hasAssigned
      ? "both"
      : hasRaw
        ? "raw"
        : "assigned";
    return [subject, mode];
  }));
}

export function classAverageScoreCellValue(
  values: GradeClassAverageScorePair,
  mode: GradeClassAverageSubjectScoreMode,
): number | string | null {
  if (mode === "raw") return values.raw;
  if (mode === "assigned") return values.assigned;
  if (values.raw === null && values.assigned === null) return null;
  const display = (value: number | null) => value === null ? "—" : value.toFixed(2);
  return `${display(values.raw)}|${display(values.assigned)}`;
}

function teacherNamesForSubject(
  classId: string,
  subject: string,
  settings: GradeExamSettings,
  context: GradeImportContext,
): string[] {
  const teacherNames = new Map(context.teachers.map((teacher) => [teacher.id, teacher.name]));
  return unique([
    ...(settings.classSubjectTeacherIds?.[classId]?.[subject] || [])
      .map((teacherId) => teacherNames.get(teacherId) || "")
      .filter(Boolean),
    ...(settings.classSubjectTeacherNames?.[classId]?.[subject] || []),
  ]);
}

export function buildGradeClassAverageReport(
  exam: GradeExam,
  template: GradeStatisticsTemplate,
  context: GradeImportContext,
  settings: GradeExamSettings = exam.settings,
): GradeClassAverageReport {
  const options = resolveClassAverageOptions(exam, context, template.classAverageOptions, template.scoreMode);
  const subjects = template.subjects.filter((subject) => exam.subjects.includes(subject));
  const effectiveSubjects = subjects.length > 0 ? subjects : [...exam.subjects];
  const hiddenClassIds = new Set(options.hiddenClassIds || []);
  const recordsByClass = new Map<string, GradeScoreRecord[]>();
  exam.records.forEach((record) => {
    const current = recordsByClass.get(record.classId) || [];
    current.push(record);
    recordsByClass.set(record.classId, current);
  });
  const contextClassNames = new Map(context.classes.map((item) => [item.id, item.name]));

  const classRows = (options.classOrder || [])
    .filter((classId) => !hiddenClassIds.has(classId))
    .map((classId) => {
      const records = recordsByClass.get(classId) || [];
      const className = contextClassNames.get(classId) || records[0]?.className || "未知班级";
      const summary = summaryForRecords(records, effectiveSubjects);
      return {
        classId,
        className,
        classLabel: options.classLabels?.[classId] || compactGradeClassLabel(className),
        category: options.classCategories?.[classId] || "普通班",
        studentCount: records.length,
        homeroomTeachers: unique(context.teachers
          .filter((teacher) => teacher.homeroomClassIds?.includes(classId))
          .map((teacher) => teacher.name)),
        subjectTeachers: Object.fromEntries(effectiveSubjects.map((subject) => [
          subject,
          teacherNamesForSubject(classId, subject, settings, context),
        ])),
        subjectAverages: summary.subjectValues,
        subjectScoreModes: Object.fromEntries(effectiveSubjects.map((subject) => [
          subject,
          subjectScoreModeForClass(options, classId, subject, template.scoreMode),
        ])),
        totalAverages: summary.totalValues,
      } satisfies GradeClassAverageRow;
    });

  const categoryOrder = unique(classRows.map((row) => row.category));
  const groups = categoryOrder.map((category) => {
    const rows = classRows.filter((row) => row.category === category);
    const groupRecords = rows.flatMap((row) => recordsByClass.get(row.classId) || []);
    return {
      category,
      rows,
      difference: differenceForRows(rows, effectiveSubjects),
      average: summaryForRecords(groupRecords, effectiveSubjects),
      subjectScoreModes: combinedSubjectScoreModes(rows, effectiveSubjects, template.scoreMode),
    } satisfies GradeClassAverageGroup;
  });
  const reportRecords = classRows.flatMap((row) => recordsByClass.get(row.classId) || []);

  return {
    title: options.title || `${exam.cohortLabel}${exam.name}班级平均分统计表`,
    reportDate: options.reportDate || fallbackReportDate(exam),
    subjects: effectiveSubjects,
    options,
    groups,
    overallAverage: summaryForRecords(reportRecords, effectiveSubjects),
    overallSubjectScoreModes: combinedSubjectScoreModes(classRows, effectiveSubjects, template.scoreMode),
  };
}
