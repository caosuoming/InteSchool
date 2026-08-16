import type {
  GradeAcademicTrack,
  GradeExam,
  GradeImportContext,
  GradeScoreMode,
  GradeScoreRecord,
  GradeStatisticsTemplate,
} from "../types/index.js";
import { resolveClassAverageOptions } from "./grade-class-average.js";
import {
  inferGradeAcademicTrackFromSelection,
  inferGradeClassAcademicTrack,
  type GradeAcademicTrackClassification,
} from "./grade-total-score-segment.js";
import { gradeTemplateTotal } from "./grade-reports.js";

export const DEFAULT_TOTAL_SCORE_TOP_N = 50;

export interface GradeTotalScoreRankingRow {
  rank: number;
  studentId: string;
  studentNo: string;
  studentName: string;
  classId: string;
  classLabel: string;
  score: number;
}

export interface GradeTotalScoreRankingTable {
  key: "all" | GradeAcademicTrack;
  title: string;
  rows: GradeTotalScoreRankingRow[];
}

export interface GradeTotalScoreRankingReport {
  reportDate: string;
  scoreMode: GradeScoreMode;
  scoreModeLabel: "原始分" | "赋分";
  topN: number;
  tables: GradeTotalScoreRankingTable[];
}

function normalizeTopN(value: number | undefined): number {
  if (!Number.isFinite(value)) return DEFAULT_TOTAL_SCORE_TOP_N;
  return Math.max(1, Math.min(1000, Math.round(Number(value))));
}

function rankedRows(
  records: GradeScoreRecord[],
  template: GradeStatisticsTemplate,
  classLabels: Record<string, string>,
  topN: number,
): GradeTotalScoreRankingRow[] {
  const sorted = records
    .map((record) => ({ record, score: gradeTemplateTotal(record, template) }))
    .sort((left, right) => (
      right.score - left.score
      || left.record.studentNo.localeCompare(right.record.studentNo, "zh-CN", { numeric: true })
      || left.record.studentName.localeCompare(right.record.studentName, "zh-CN")
    ));

  let previousScore: number | undefined;
  let previousRank = 0;
  return sorted
    .map(({ record, score }, index) => {
      const rank = previousScore === score ? previousRank : index + 1;
      previousScore = score;
      previousRank = rank;
      return {
        rank,
        studentId: record.studentId,
        studentNo: record.studentNo,
        studentName: record.studentName,
        classId: record.classId,
        classLabel: classLabels[record.classId] || record.className,
        score,
      } satisfies GradeTotalScoreRankingRow;
    })
    .filter((row) => row.rank <= topN);
}

export function buildGradeTotalScoreRankingReport(
  exam: GradeExam,
  template: GradeStatisticsTemplate,
  context: GradeImportContext,
  classAverageTemplate?: GradeStatisticsTemplate,
): GradeTotalScoreRankingReport {
  const effectiveTemplate = template.subjects.length > 0
    ? template
    : { ...template, subjects: [...exam.subjects] };
  const classOptions = resolveClassAverageOptions(
    exam,
    context,
    classAverageTemplate?.classAverageOptions,
    classAverageTemplate?.scoreMode || "assigned",
  );
  const hiddenClassIds = new Set(classOptions.hiddenClassIds || []);
  const classLabels = classOptions.classLabels || {};
  const records = exam.records.filter((record) => !hiddenClassIds.has(record.classId));
  const topN = normalizeTopN(template.totalScoreSegmentOptions?.totalScoreTopN);
  const scoreModeLabel = effectiveTemplate.scoreMode === "raw" ? "原始分" : "赋分";

  const classTracks = new Map<string, GradeAcademicTrackClassification>();
  const studentSelections = new Map(context.students.map((student) => [student.id, student.subjectSelection || ""]));
  const trackForRecord = (record: GradeScoreRecord): GradeAcademicTrackClassification => {
    const selectionTrack = inferGradeAcademicTrackFromSelection(
      record.subjectSelection || studentSelections.get(record.studentId) || "",
    );
    if (selectionTrack !== "unclassified") return selectionTrack;
    if (!classTracks.has(record.classId)) {
      classTracks.set(
        record.classId,
        inferGradeClassAcademicTrack(record.classId, exam.records, context),
      );
    }
    return classTracks.get(record.classId) || "unclassified";
  };
  const classifiedRecords = records.map((record) => ({
    record,
    track: trackForRecord(record),
  }));
  const hasScience = classifiedRecords.some((item) => item.track === "science");
  const hasArts = classifiedRecords.some((item) => item.track === "arts");
  const hasUnclassified = classifiedRecords.some((item) => item.track === "unclassified");
  const splitByTrack = hasScience && hasArts && !hasUnclassified;

  const table = (
    key: GradeTotalScoreRankingTable["key"],
    label: string,
    source: GradeScoreRecord[],
  ): GradeTotalScoreRankingTable => ({
    key,
    title: `${exam.cohortLabel}${exam.name}${label}（${scoreModeLabel}）`,
    rows: rankedRows(source, effectiveTemplate, classLabels, topN),
  });

  const tables = splitByTrack
    ? [
        table("science", `理科总分前${topN}名`, classifiedRecords.filter((item) => item.track === "science").map((item) => item.record)),
        table("arts", `文科总分前${topN}名`, classifiedRecords.filter((item) => item.track === "arts").map((item) => item.record)),
      ]
    : [table("all", `总分前${topN}名`, records)];

  return {
    reportDate: exam.examDate || exam.createdAt.slice(0, 10),
    scoreMode: effectiveTemplate.scoreMode,
    scoreModeLabel,
    topN,
    tables,
  };
}
