import { describe, expect, it } from "vitest";
import type { GradeCustomTotalScore, GradeExam, GradeImportContext, GradeScoreRecord, GradeStatisticsTemplate } from "../types/index.js";
import { gradeCustomRanks, gradeCustomTotal, gradeCustomTotals } from "./grade-custom-totals.js";
import { buildGradeClassAverageReport } from "./grade-class-average.js";
import { buildGradeTotalScoreSegmentReport } from "./grade-total-score-segment.js";
import { buildGradeTotalScoreRankingReport } from "./grade-total-score-ranking.js";
import { buildGradeClassStatisticsReport, DEFAULT_GRADE_CLASS_STATISTICS_OPTIONS } from "./grade-class-statistics.js";
import { normalizeGradeSettings } from "./grade-statistics.js";
import { buildGradePublishedReportBundle } from "./grade-published-report.js";

const raw: GradeCustomTotalScore = { id: "raw-pair", name: "语化总分", subjects: ["语文", "化学"], scoreMode: "raw" };
const assigned: GradeCustomTotalScore = { id: "assigned-chem", name: "化学赋分", subjects: ["化学"], scoreMode: "assigned" };

function record(id: string, classId: string, chinese: number | null, chemistry: number | null, chemistryAssigned: number | null): GradeScoreRecord {
  return {
    id, studentId: id, studentNo: id, studentName: `学生${id}`, classId, className: classId,
    scores: { 语文: chinese, 化学: chemistry },
    assignedScores: { 语文: chinese, 化学: chemistryAssigned },
    rawTotal: (chinese || 0) + (chemistry || 0),
    assignedTotal: (chinese || 0) + (chemistryAssigned || 0),
    classRank: 0, gradeRank: 0,
  };
}

const average: GradeStatisticsTemplate = {
  id: "class-average", kind: "classAverage", name: "班级平均", enabled: true,
  scoreMode: "assigned", subjects: ["语文", "化学"],
  classAverageOptions: { customTotals: [raw, assigned] },
};
const segment: GradeStatisticsTemplate = {
  id: "total-score-segment", kind: "totalScoreSegment", name: "总分段", enabled: true,
  scoreMode: "assigned", subjects: ["语文", "化学"],
  segmentMin: 80, segmentMax: 250, segmentSize: 10,
  totalScoreSegmentOptions: { totalScoreTopN: 2 },
};
const exam: GradeExam = {
  id: "exam-custom", name: "测试考试", schoolId: "school", teacherId: "teacher",
  cohortKey: "2026", cohortLabel: "2026届", sourceFileName: "score.xlsx", sourceSheetName: "成绩",
  subjects: ["语文", "化学"], records: [
    record("s1", "c1", 120, 80, 90),
    record("s2", "c1", 105, 85, 96),
    record("s3", "c2", 125, 75, 90),
    record("s4", "c2", null, 70, 85),
    { ...record("s5", "c2", 150, 100, 100), includeInStatistics: false },
  ],
  settings: {
    subjectTeacherIds: {}, assignmentRules: {},
    classSubjects: [
      { classId: "c1", examSubjects: ["语文", "化学"], statisticSubjects: ["语文", "化学"] },
      { classId: "c2", examSubjects: ["语文", "化学"], statisticSubjects: ["语文", "化学"] },
    ], templates: [average, segment],
  },
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};
const context: GradeImportContext = {
  cohort: { key: "2026", label: "2026届", gradYear: 2026, grade: "高三", classIds: ["c1", "c2"], studentCount: 5 },
  classes: [
    { id: "c1", type: "school", schoolId: "school", name: "高三(1)班", grade: "高三", studentCount: 2, createdBy: "teacher", createdAt: "2026-01-01" },
    { id: "c2", type: "school", schoolId: "school", name: "高三(2)班", grade: "高三", studentCount: 3, createdBy: "teacher", createdAt: "2026-01-01" },
  ],
  students: [], teachers: [],
};

describe("multiple custom totals across statistics tables", () => {
  it("uses selected subjects and original/assigned modes without turning absence into zero", () => {
    expect(gradeCustomTotals(average, exam.subjects)).toEqual([raw, assigned]);
    expect(gradeCustomTotal(exam.records[0], raw)).toBe(200);
    expect(gradeCustomTotal(exam.records[0], assigned)).toBe(90);
    expect(gradeCustomTotal(exam.records[1], raw)).toBe(190);
    expect(gradeCustomTotal(exam.records[1], assigned)).toBe(96);
    expect(gradeCustomTotal(exam.records[3], raw)).toBeNull();
    expect(gradeCustomTotal(exam.records[3], assigned)).toBe(85);
    expect(gradeCustomTotal(exam.records[4], raw)).toBeNull();
  });

  it("calculates independent competition ranks and excludes missing subjects", () => {
    const ranks = gradeCustomRanks(exam, raw);
    expect(ranks.scores.size).toBe(3);
    expect(ranks.gradeRanks.get("s1")).toBe(1);
    expect(ranks.gradeRanks.get("s3")).toBe(1);
    expect(ranks.gradeRanks.get("s2")).toBe(3);
    expect(ranks.gradeRanks.has("s4")).toBe(false);
    expect(ranks.classRanks.get("s1")).toBe(1);
    expect(ranks.classRanks.get("s2")).toBe(2);
    expect(ranks.classRanks.get("s3")).toBe(1);
  });

  it("adds multiple class averages while preserving the standard total", () => {
    const report = buildGradeClassAverageReport(exam, average, context);
    expect(report.customTotals).toEqual([raw, assigned]);
    const rows = report.groups.flatMap((group) => group.rows);
    expect(rows.find((row) => row.classId === "c1")?.customAverages).toEqual({ "raw-pair": 195, "assigned-chem": 93 });
    expect(rows.find((row) => row.classId === "c2")?.customAverages).toEqual({ "raw-pair": 200, "assigned-chem": 90 });
  });

  it("produces dedicated segment and top-N report for each total", () => {
    const report = buildGradeTotalScoreSegmentReport(exam, segment, context, average, exam.settings, raw);
    expect(report.customName).toBe("语化总分");
    expect(report.rows.find((row) => row.threshold === 200)?.counts.c1).toBe(1);
    expect(report.rows.find((row) => row.threshold === 200)?.counts.c2).toBe(1);
    expect(report.validTotalCounts.c1).toBe(2);
    expect(report.validTotalCounts.c2).toBe(1);
    const rank = buildGradeTotalScoreRankingReport(exam, segment, context, average, raw);
    expect(rank.tables[0].totalLabel).toBe("语化总分");
    expect(rank.tables[0].rows.map((row) => [row.studentId, row.rank, row.score])).toEqual([
      ["s1", 1, 200], ["s3", 1, 200],
    ]);
    expect(buildGradeTotalScoreRankingReport(exam, segment, context, average, assigned).tables[0].rows[0].score).toBe(96);
  });

  it("exposes selectable total and rank fields in table six", () => {
    const options = { ...DEFAULT_GRADE_CLASS_STATISTICS_OPTIONS, customTotalIds: ["raw-pair", "assigned-chem", "invalid"] };
    const report = buildGradeClassStatisticsReport(exam, [], options);
    expect(report.options.customTotalIds).toEqual(["raw-pair", "assigned-chem"]);
    expect(report.columns.filter((column) => column.kind.startsWith("custom")).map((column) => column.label)).toEqual([
      "语化总分", "语化总分班级排名", "语化总分年级排名",
      "化学赋分", "化学赋分班级排名", "化学赋分年级排名",
    ]);
    const first = report.classes.find((table) => table.classId === "c1")?.rows.find((row) => row.studentId === "s1");
    expect(first?.values["exam-custom:custom:raw-pair"]).toBe(200);
    expect(first?.values["exam-custom:customGradeRank:raw-pair"]).toBe(1);
    const absent = report.classes.find((table) => table.classId === "c2")?.rows.find((row) => row.studentId === "s4");
    expect(absent?.values["exam-custom:custom:raw-pair"]).toBeNull();
    expect(absent?.values["exam-custom:custom:assigned-chem"]).toBeNull();
  });

  it("sanitizes persisted configuration and includes custom reports in publication", () => {
    const normalized = normalizeGradeSettings(exam.settings, exam.subjects, ["c1", "c2"]);
    expect(normalized.templates.find((item) => item.id === "class-average")?.classAverageOptions?.customTotals).toEqual([raw, assigned]);
    const published = buildGradePublishedReportBundle(exam, context, "2026-01-02T00:00:00.000Z");
    expect(published.customTotalSegments).toHaveLength(2);
    expect(published.totalScoreRanking?.tables.some((table) => table.totalLabel === "语化总分")).toBe(true);
  });
});
