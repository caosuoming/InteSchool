import type {
  GradeCustomTotalScore,
  GradeExam,
  GradeImportContext,
  GradeScoreMode,
  GradeScoreRecord,
  GradeStatisticsTemplate,
} from "../types/index.js";
import { gradeCustomTotal } from "./grade-custom-totals.js";
import { resolveClassAverageOptions } from "./grade-class-average.js";
import {
  inferGradeAcademicTrackFromSelection,
  inferGradeClassAcademicTrack,
  type GradeAcademicTrackClassification,
} from "./grade-total-score-segment.js";
import { gradeTemplateTotal } from "./grade-reports.js";
import { gradeAttendance, participatingGradeRecords, totalRankingGroupKey } from "./grade-statistics.js";

export const DEFAULT_TOTAL_SCORE_TOP_N = 50;

export interface GradeTotalScoreRankingRow {
  rank: number;
  studentId: string;
  studentNo: string;
  studentName: string;
  classId: string;
  classLabel: string;
  subjectScores: Record<string, number | null>;
  score: number;
}

export interface GradeTotalScoreRankingTable {
  key: string;
  title: string;
  rows: GradeTotalScoreRankingRow[];
  subjects: string[];
  totalLabel?: string;
  totalId?: string;
  scoreModeLabel?: string;
}

export interface GradeTotalScoreRankingReport {
  reportDate: string;
  scoreMode: GradeScoreMode;
  scoreModeLabel: "原始分" | "赋分";
  subjects: string[];
  topN: number;
  separateTopN: number;
  hasSeparateGroups: boolean;
  tables: GradeTotalScoreRankingTable[];
}

function normalizeTopN(value: number | undefined): number {
  if (!Number.isFinite(value)) return DEFAULT_TOTAL_SCORE_TOP_N;
  return Math.max(1, Math.min(1000, Math.round(Number(value))));
}

function rankedRows(
  records: GradeScoreRecord[],
  template: GradeStatisticsTemplate,
  subjects: string[],
  classLabels: Record<string, string>,
  topN: number,
  customTotal?: GradeCustomTotalScore,
): GradeTotalScoreRankingRow[] {
  const sorted = records
    .flatMap((record) => {
      if (customTotal) {
        const score = gradeCustomTotal(record, customTotal);
        return score === null ? [] : [{ record, score }];
      }
      const score = template.subjects.length ? gradeTemplateTotal(record, template) : null;
      return score === null ? [] : [{ record, score }];
    })
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
        subjectScores: Object.fromEntries(subjects.map((subject) => [
          subject,
          template.scoreMode === "raw" ? record.scores[subject] : record.assignedScores[subject],
        ])),
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
  customTotal?: GradeCustomTotalScore,
): GradeTotalScoreRankingReport {
  const effectiveTemplate = customTotal
    ? { ...template, subjects: customTotal.subjects, scoreMode: customTotal.scoreMode }
    : { ...template, subjects: [...exam.subjects] };
  const classOptions = resolveClassAverageOptions(
    exam,
    context,
    classAverageTemplate?.classAverageOptions,
    classAverageTemplate?.scoreMode || "assigned",
  );
  const hiddenClassIds = new Set(classOptions.hiddenClassIds || []);
  const classLabels = classOptions.classLabels || {};
  const records = participatingGradeRecords(exam.records).filter((record) =>
    !hiddenClassIds.has(record.classId) && gradeAttendance(record, exam.subjects, exam.settings).complete);
  const subjects = customTotal ? [...customTotal.subjects] : [...exam.subjects];
  const topN = normalizeTopN(template.totalScoreSegmentOptions?.totalScoreTopN);
  const separateTopN = normalizeTopN(template.totalScoreSegmentOptions?.totalScoreSeparateTopN ?? topN);
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
  const table = (
    key: GradeTotalScoreRankingTable["key"],
    label: string,
    source: GradeScoreRecord[],
    limit: number,
  ): GradeTotalScoreRankingTable => ({
    key,
    title: `${exam.name}${customTotal ? customTotal.name : ""}${label}（${scoreModeLabel}）`,
    totalLabel: customTotal?.name,
    totalId: customTotal?.id,
    subjects,
    scoreModeLabel,
    rows: rankedRows(source, effectiveTemplate, subjects, classLabels, limit, customTotal),
  });

  const rankedGroups = new Map<string, GradeScoreRecord[]>();
  records.forEach((record) => {
    const key = totalRankingGroupKey(exam.settings, record.classId);
    const group = rankedGroups.get(key) || [];
    group.push(record);
    rankedGroups.set(key, group);
  });
  const hasSeparateGroups = [...rankedGroups.keys()].some((key) => key !== "[]");
  const tables: GradeTotalScoreRankingTable[] = [];
  rankedGroups.forEach((groupRecords, groupKey) => {
    const separateSubjects = JSON.parse(groupKey) as string[];
    const groupTopN = separateSubjects.length ? separateTopN : topN;
    const groupLabel = !hasSeparateGroups ? ""
      : separateSubjects.length ? `单独排名（${separateSubjects.join("、")}）` : "统一排名";
    const keySuffix = separateSubjects.length ? `separate-${separateSubjects.join("-")}` : "all";
    const classifiedRecords = groupRecords.map((record) => ({ record, track: trackForRecord(record) }));
    const hasScience = classifiedRecords.some((item) => item.track === "science");
    const hasArts = classifiedRecords.some((item) => item.track === "arts");
    const hasUnclassified = classifiedRecords.some((item) => item.track === "unclassified");
    if (hasScience && hasArts && !hasUnclassified) {
      (["science", "arts"] as const).forEach((track) => {
        const trackRecords = classifiedRecords.filter((item) => item.track === track).map((item) => item.record);
        const trackName = track === "science" ? "理科" : "文科";
        tables.push(table(hasSeparateGroups ? `${track}-${keySuffix}` : track, `${trackName}${groupLabel}总分前${groupTopN}名`, trackRecords, groupTopN));
      });
    } else {
      tables.push(table(keySuffix, `${groupLabel}总分前${groupTopN}名`, groupRecords, groupTopN));
    }
  });

  return {
    reportDate: exam.examDate || exam.createdAt.slice(0, 10),
    scoreMode: effectiveTemplate.scoreMode,
    scoreModeLabel,
    subjects,
    topN,
    separateTopN,
    hasSeparateGroups,
    tables,
  };
}
