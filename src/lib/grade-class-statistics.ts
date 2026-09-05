import type { GradeExam, GradeScoreRecord } from "../types/index.js";

export interface GradeClassStatisticsOptions {
  showSubjectClassRanks: boolean;
  showSubjectGradeRanks: boolean;
  showRawTotal: boolean;
  showAssignedTotal: boolean;
  comparisonExamIds: string[];
}

export const DEFAULT_GRADE_CLASS_STATISTICS_OPTIONS: GradeClassStatisticsOptions = {
  showSubjectClassRanks: false,
  showSubjectGradeRanks: false,
  showRawTotal: false,
  showAssignedTotal: false,
  comparisonExamIds: [],
};

export type GradeClassStatisticsColumnKind =
  | "className"
  | "studentName"
  | "subjectScore"
  | "subjectClassRank"
  | "subjectGradeRank"
  | "rawTotal"
  | "rawTotalClassRank"
  | "rawTotalGradeRank"
  | "assignedTotal"
  | "assignedTotalClassRank"
  | "assignedTotalGradeRank";

export interface GradeClassStatisticsColumn {
  key: string;
  label: string;
  kind: GradeClassStatisticsColumnKind;
  examId?: string;
  subject?: string;
  width: number;
}

export interface GradeClassStatisticsRow {
  studentId: string;
  studentNo: string;
  classId: string;
  className: string;
  studentName: string;
  values: Record<string, string | number | null>;
}

export interface GradeClassStatisticsClassTable {
  classId: string;
  className: string;
  rows: GradeClassStatisticsRow[];
}

export interface GradeClassStatisticsReport {
  title: string;
  subjects: string[];
  currentExamId: string;
  includedExams: Array<Pick<GradeExam, "id" | "name" | "examDate"> & { current: boolean }>;
  columns: GradeClassStatisticsColumn[];
  classes: GradeClassStatisticsClassTable[];
  options: GradeClassStatisticsOptions;
}

interface ExamRankedRecord {
  record: GradeScoreRecord;
  subjectScores: Record<string, number | null>;
  subjectClassRanks: Record<string, number | null>;
  subjectGradeRanks: Record<string, number | null>;
  rawTotalClassRank: number | null;
  rawTotalGradeRank: number | null;
  assignedTotalClassRank: number | null;
  assignedTotalGradeRank: number | null;
}

function finite(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function finalSubjectScore(record: GradeScoreRecord, subject: string): number | null {
  return finite(record.assignedScores[subject]) ?? finite(record.scores[subject]);
}

function competitionRanks(
  records: GradeScoreRecord[],
  score: (record: GradeScoreRecord) => number | null,
): Map<string, number> {
  const ranked = records
    .map((record) => ({ record, score: score(record) }))
    .filter((item): item is { record: GradeScoreRecord; score: number } => item.score !== null)
    .sort((left, right) => (
      right.score - left.score
      || left.record.studentNo.localeCompare(right.record.studentNo, "zh-CN", { numeric: true })
      || left.record.studentName.localeCompare(right.record.studentName, "zh-CN")
    ));
  const result = new Map<string, number>();
  let previousScore: number | null = null;
  let previousRank = 0;
  ranked.forEach((item, index) => {
    const rank = previousScore === item.score ? previousRank : index + 1;
    previousScore = item.score;
    previousRank = rank;
    result.set(item.record.studentId, rank);
  });
  return result;
}

function ranksByClass(
  records: GradeScoreRecord[],
  score: (record: GradeScoreRecord) => number | null,
): Map<string, number> {
  const grouped = new Map<string, GradeScoreRecord[]>();
  records.forEach((record) => {
    const current = grouped.get(record.classId) || [];
    current.push(record);
    grouped.set(record.classId, current);
  });
  const result = new Map<string, number>();
  grouped.forEach((group) => {
    competitionRanks(group, score).forEach((rank, studentId) => result.set(studentId, rank));
  });
  return result;
}

function rankedRecords(exam: GradeExam, subjects: string[]): Map<string, ExamRankedRecord> {
  const subjectGradeRanks = Object.fromEntries(subjects.map((subject) => [
    subject,
    competitionRanks(exam.records, (record) => finalSubjectScore(record, subject)),
  ]));
  const subjectClassRanks = Object.fromEntries(subjects.map((subject) => [
    subject,
    ranksByClass(exam.records, (record) => finalSubjectScore(record, subject)),
  ]));
  const rawTotalGradeRanks = competitionRanks(exam.records, (record) => finite(record.rawTotal));
  const rawTotalClassRanks = ranksByClass(exam.records, (record) => finite(record.rawTotal));
  const assignedTotalGradeRanks = competitionRanks(exam.records, (record) => finite(record.assignedTotal));
  const assignedTotalClassRanks = ranksByClass(exam.records, (record) => finite(record.assignedTotal));

  return new Map(exam.records.map((record) => [record.studentId, {
    record,
    subjectScores: Object.fromEntries(subjects.map((subject) => [subject, finalSubjectScore(record, subject)])),
    subjectClassRanks: Object.fromEntries(subjects.map((subject) => [
      subject,
      subjectClassRanks[subject].get(record.studentId) ?? null,
    ])),
    subjectGradeRanks: Object.fromEntries(subjects.map((subject) => [
      subject,
      subjectGradeRanks[subject].get(record.studentId) ?? null,
    ])),
    rawTotalClassRank: rawTotalClassRanks.get(record.studentId) ?? null,
    rawTotalGradeRank: rawTotalGradeRanks.get(record.studentId) ?? null,
    assignedTotalClassRank: assignedTotalClassRanks.get(record.studentId) ?? null,
    assignedTotalGradeRank: assignedTotalGradeRanks.get(record.studentId) ?? null,
  }]));
}

function metricKey(examId: string, metric: string): string {
  return `${examId}:${metric}`;
}

function buildColumns(
  currentExam: GradeExam,
  includedExams: GradeExam[],
  subjects: string[],
  options: GradeClassStatisticsOptions,
): GradeClassStatisticsColumn[] {
  const columns: GradeClassStatisticsColumn[] = [
    { key: "className", label: "班级", kind: "className", width: 16 },
    { key: "studentName", label: "姓名", kind: "studentName", width: 12 },
  ];
  includedExams.forEach((exam) => {
    const prefix = exam.id === currentExam.id ? "" : `${exam.name}·`;
    subjects.forEach((subject) => {
      columns.push({
        key: metricKey(exam.id, `subject:${subject}`),
        label: `${prefix}${subject}`,
        kind: "subjectScore",
        examId: exam.id,
        subject,
        width: Math.max(10, Math.min(22, `${prefix}${subject}`.length + 4)),
      });
      if (options.showSubjectClassRanks) {
        columns.push({
          key: metricKey(exam.id, `subjectClassRank:${subject}`),
          label: `${prefix}${subject}班级排名`,
          kind: "subjectClassRank",
          examId: exam.id,
          subject,
          width: Math.max(12, Math.min(28, `${prefix}${subject}班级排名`.length + 4)),
        });
      }
      if (options.showSubjectGradeRanks) {
        columns.push({
          key: metricKey(exam.id, `subjectGradeRank:${subject}`),
          label: `${prefix}${subject}年级排名`,
          kind: "subjectGradeRank",
          examId: exam.id,
          subject,
          width: Math.max(12, Math.min(28, `${prefix}${subject}年级排名`.length + 4)),
        });
      }
    });
    if (options.showRawTotal) {
      columns.push(
        { key: metricKey(exam.id, "rawTotal"), label: `${prefix}总分（原始）`, kind: "rawTotal", examId: exam.id, width: 14 },
        { key: metricKey(exam.id, "rawTotalClassRank"), label: `${prefix}总分（原始）班级排名`, kind: "rawTotalClassRank", examId: exam.id, width: 20 },
        { key: metricKey(exam.id, "rawTotalGradeRank"), label: `${prefix}总分（原始）年级排名`, kind: "rawTotalGradeRank", examId: exam.id, width: 20 },
      );
    }
    if (options.showAssignedTotal) {
      columns.push(
        { key: metricKey(exam.id, "assignedTotal"), label: `${prefix}总分（赋分）`, kind: "assignedTotal", examId: exam.id, width: 14 },
        { key: metricKey(exam.id, "assignedTotalClassRank"), label: `${prefix}总分（赋分）班级排名`, kind: "assignedTotalClassRank", examId: exam.id, width: 20 },
        { key: metricKey(exam.id, "assignedTotalGradeRank"), label: `${prefix}总分（赋分）年级排名`, kind: "assignedTotalGradeRank", examId: exam.id, width: 20 },
      );
    }
  });
  return columns;
}

function fillExamValues(
  values: GradeClassStatisticsRow["values"],
  examId: string,
  ranked: ExamRankedRecord | undefined,
  subjects: string[],
  options: GradeClassStatisticsOptions,
): void {
  subjects.forEach((subject) => {
    values[metricKey(examId, `subject:${subject}`)] = ranked?.subjectScores[subject] ?? null;
    if (options.showSubjectClassRanks) {
      values[metricKey(examId, `subjectClassRank:${subject}`)] = ranked?.subjectClassRanks[subject] ?? null;
    }
    if (options.showSubjectGradeRanks) {
      values[metricKey(examId, `subjectGradeRank:${subject}`)] = ranked?.subjectGradeRanks[subject] ?? null;
    }
  });
  if (options.showRawTotal) {
    values[metricKey(examId, "rawTotal")] = finite(ranked?.record.rawTotal) ?? null;
    values[metricKey(examId, "rawTotalClassRank")] = ranked?.rawTotalClassRank ?? null;
    values[metricKey(examId, "rawTotalGradeRank")] = ranked?.rawTotalGradeRank ?? null;
  }
  if (options.showAssignedTotal) {
    values[metricKey(examId, "assignedTotal")] = finite(ranked?.record.assignedTotal) ?? null;
    values[metricKey(examId, "assignedTotalClassRank")] = ranked?.assignedTotalClassRank ?? null;
    values[metricKey(examId, "assignedTotalGradeRank")] = ranked?.assignedTotalGradeRank ?? null;
  }
}

export function buildGradeClassStatisticsReport(
  currentExam: GradeExam,
  candidateComparisonExams: GradeExam[],
  options: GradeClassStatisticsOptions = DEFAULT_GRADE_CLASS_STATISTICS_OPTIONS,
): GradeClassStatisticsReport {
  const normalizedOptions: GradeClassStatisticsOptions = {
    ...DEFAULT_GRADE_CLASS_STATISTICS_OPTIONS,
    ...options,
    comparisonExamIds: [...new Set(options.comparisonExamIds)].filter((id) => id !== currentExam.id),
  };
  const comparisonsById = new Map(candidateComparisonExams.map((exam) => [exam.id, exam]));
  const comparisons = normalizedOptions.comparisonExamIds
    .map((id) => comparisonsById.get(id))
    .filter((exam): exam is GradeExam => Boolean(exam));
  const includedExams = [currentExam, ...comparisons];
  const subjects = [...currentExam.subjects];
  const rankedByExam = new Map(includedExams.map((exam) => [exam.id, rankedRecords(exam, subjects)]));
  const currentRecordsByClass = new Map<string, GradeScoreRecord[]>();
  currentExam.records.forEach((record) => {
    const current = currentRecordsByClass.get(record.classId) || [];
    current.push(record);
    currentRecordsByClass.set(record.classId, current);
  });
  const classes = [...currentRecordsByClass.entries()]
    .map(([classId, records]) => ({
      classId,
      className: records[0]?.className || classId,
      rows: [...records]
        .sort((left, right) => (
          left.studentNo.localeCompare(right.studentNo, "zh-CN", { numeric: true })
          || left.studentName.localeCompare(right.studentName, "zh-CN")
        ))
        .map((record) => {
          const values: GradeClassStatisticsRow["values"] = {
            className: record.className,
            studentName: record.studentName,
          };
          includedExams.forEach((exam) => {
            fillExamValues(
              values,
              exam.id,
              rankedByExam.get(exam.id)?.get(record.studentId),
              subjects,
              normalizedOptions,
            );
          });
          return {
            studentId: record.studentId,
            studentNo: record.studentNo,
            classId: record.classId,
            className: record.className,
            studentName: record.studentName,
            values,
          } satisfies GradeClassStatisticsRow;
        }),
    }))
    .sort((left, right) => left.className.localeCompare(right.className, "zh-CN", { numeric: true }));

  return {
    title: `${currentExam.name}各班成绩统计`,
    subjects,
    currentExamId: currentExam.id,
    includedExams: includedExams.map((exam) => ({
      id: exam.id,
      name: exam.name,
      examDate: exam.examDate,
      current: exam.id === currentExam.id,
    })),
    columns: buildColumns(currentExam, includedExams, subjects, normalizedOptions),
    classes,
    options: normalizedOptions,
  };
}
