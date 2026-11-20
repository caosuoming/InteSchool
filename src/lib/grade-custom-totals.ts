import type { GradeCustomTotalScore, GradeExam, GradeScoreRecord, GradeStatisticsTemplate } from "../types/index.js";
import { participatingGradeRecords, totalRankingGroupKey } from "./grade-statistics.js";
import { inferGradeAcademicTrackFromSelection } from "./grade-total-score-segment.js";

/** Same name/subject selection is used by every statistics table. */
export function gradeCustomTotals(template: GradeStatisticsTemplate | undefined, subjects: string[]): GradeCustomTotalScore[] {
  const allowed = new Set(subjects);
  return (template?.classAverageOptions?.customTotals || []).filter((total) =>
    total.subjects.length > 0 && total.subjects.every((subject) => allowed.has(subject)),
  );
}

/** A missing required subject is a missing total, never an implicit zero. */
export function gradeCustomTotal(record: GradeScoreRecord, total: GradeCustomTotalScore): number | null {
  if (record.includeInStatistics === false || total.subjects.length === 0) return null;
  const scores = total.scoreMode === "raw" ? record.scores : record.assignedScores;
  const values = total.subjects.map((subject) => {
    const raw = record.scores[subject];
    const score = scores[subject];
    return typeof raw === "number" && Number.isFinite(raw)
      && typeof score === "number" && Number.isFinite(score) ? score : null;
  });
  if (values.some((value) => value === null)) return null;
  return Math.round(values.reduce<number>((sum, value) => sum + (value ?? 0), 0) * 100) / 100;
}

export interface GradeCustomRanks {
  scores: Map<string, number>;
  classRanks: Map<string, number>;
  gradeRanks: Map<string, number>;
}

/** Competition ranking (1,1,3), respecting separate ranking groups and mixed tracks. */
export function gradeCustomRanks(exam: GradeExam, total: GradeCustomTotalScore): GradeCustomRanks {
  const records = participatingGradeRecords(exam.records);
  const scored = records.flatMap((record) => {
    const score = gradeCustomTotal(record, total);
    return score === null ? [] : [{ record, score }];
  });
  const hasScience = scored.some(({ record }) => record.scores["物理"] !== null && typeof record.scores["物理"] === "number"
    && record.scores["历史"] == null);
  const hasArts = scored.some(({ record }) => record.scores["历史"] !== null && typeof record.scores["历史"] === "number"
    && record.scores["物理"] == null);
  const track = (record: GradeScoreRecord) => {
    if (record.scores["物理"] != null && record.scores["历史"] == null) return "science";
    if (record.scores["历史"] != null && record.scores["物理"] == null) return "arts";
    return inferGradeAcademicTrackFromSelection(record.subjectSelection || "");
  };
  const pool = (record: GradeScoreRecord) => (
    hasScience && hasArts ? `${totalRankingGroupKey(exam.settings, record.classId)}:${track(record)}`
      : totalRankingGroupKey(exam.settings, record.classId)
  );
  const rank = (key: (record: GradeScoreRecord) => string) => {
    const groups = new Map<string, typeof scored>();
    scored.forEach((item) => groups.set(key(item.record), [...(groups.get(key(item.record)) || []), item]));
    const result = new Map<string, number>();
    groups.forEach((group) => {
      group.sort((a, b) => b.score - a.score || a.record.studentNo.localeCompare(b.record.studentNo, "zh-CN", { numeric: true }));
      let previousScore: number | undefined;
      let previousRank = 0;
      group.forEach((item, index) => {
        const currentRank = previousScore === item.score ? previousRank : index + 1;
        result.set(item.record.studentId, currentRank);
        previousScore = item.score;
        previousRank = currentRank;
      });
    });
    return result;
  };
  return {
    scores: new Map(scored.map(({ record, score }) => [record.studentId, score])),
    classRanks: rank((record) => record.classId),
    gradeRanks: rank(pool),
  };
}
