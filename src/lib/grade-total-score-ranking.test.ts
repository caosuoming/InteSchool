import { describe, expect, it } from "vitest";
import type { GradeExam, GradeImportContext, GradeStatisticsTemplate } from "../types/index.js";
import { buildGradeTotalScoreRankingReport } from "./grade-total-score-ranking.js";

const template: GradeStatisticsTemplate = {
  id: "total-score-segment",
  kind: "totalScoreSegment",
  name: "总分分数段",
  enabled: true,
  scoreMode: "raw",
  subjects: ["数学"],
  totalScoreSegmentOptions: { totalScoreTopN: 1 },
};

const classAverageTemplate: GradeStatisticsTemplate = {
  id: "class-average",
  kind: "classAverage",
  name: "班级平均分表",
  enabled: true,
  scoreMode: "assigned",
  subjects: ["数学"],
  classAverageOptions: {
    classOrder: ["science-class", "arts-class"],
    classLabels: { "science-class": "1班", "arts-class": "2班" },
  },
};

const rows = [
  ["a", "甲", "001", "science-class", "高三(1)班", 100, 80],
  ["b", "乙", "002", "science-class", "高三(1)班", 90, 95],
  ["c", "丙", "003", "arts-class", "高三(2)班", 88, 99],
  ["d", "丁", "004", "arts-class", "高三(2)班", 85, 70],
] as const;

const exam: GradeExam = {
  id: "exam-1",
  schoolId: "school-1",
  teacherId: "teacher-1",
  cohortKey: "grad-2027",
  cohortLabel: "2027届高三",
  name: "期末考试",
  examDate: "2026-06-30",
  sourceFileName: "scores.xlsx",
  sourceSheetName: "成绩",
  subjects: ["数学"],
  records: rows.map(([id, name, studentNo, classId, className, raw, assigned]) => ({
    id: `record-${id}`,
    studentId: `student-${id}`,
    studentName: name,
    studentNo,
    classId,
    className,
    scores: { 数学: raw },
    assignedScores: { 数学: assigned },
    rawTotal: raw,
    assignedTotal: assigned,
    gradeRank: 0,
    classRank: 0,
  })),
  settings: {
    subjectTeacherIds: {},
    assignmentRules: {},
    classSubjects: [],
    templates: [classAverageTemplate, template],
  },
  createdAt: "2026-06-30T00:00:00.000Z",
  updatedAt: "2026-06-30T00:00:00.000Z",
};

const context: GradeImportContext = {
  cohort: {
    key: "grad-2027",
    label: "2027届高三",
    grade: "高三",
    gradYear: 2027,
    classIds: ["science-class", "arts-class"],
    studentCount: 4,
  },
  classes: [
    {
      id: "science-class",
      type: "school",
      schoolId: "school-1",
      name: "高三(1)班",
      grade: "高三",
      studentCount: 2,
      createdBy: "teacher-1",
      createdAt: "2026-01-01T00:00:00.000Z",
    },
    {
      id: "arts-class",
      type: "school",
      schoolId: "school-1",
      name: "高三(2)班",
      grade: "高三",
      studentCount: 2,
      createdBy: "teacher-1",
      createdAt: "2026-01-01T00:00:00.000Z",
    },
  ],
  students: [],
  teachers: [],
  classProfiles: {
    "science-class": { subjectSelections: ["物化生"], scoreSubjects: ["数学"], hasImportedScores: true },
    "arts-class": { subjectSelections: ["史政地"], scoreSubjects: ["数学"], hasImportedScores: true },
  },
};

describe("buildGradeTotalScoreRankingReport", () => {
  it("splits fully classified science/arts cohorts and ranks with table-two score mode", () => {
    const rawReport = buildGradeTotalScoreRankingReport(exam, template, context, classAverageTemplate);

    expect(rawReport.topN).toBe(1);
    expect(rawReport.scoreModeLabel).toBe("原始分");
    expect(rawReport.tables.map((table) => table.key)).toEqual(["science", "arts"]);
    expect(rawReport.tables.map((table) => table.title)).toEqual([
      "2027届高三期末考试理科总分前1名（原始分）",
      "2027届高三期末考试文科总分前1名（原始分）",
    ]);
    expect(rawReport.tables[0].rows.map((row) => row.studentName)).toEqual(["甲"]);
    expect(rawReport.tables[1].rows.map((row) => row.studentName)).toEqual(["丙"]);

    const assignedReport = buildGradeTotalScoreRankingReport(
      exam,
      { ...template, scoreMode: "assigned" },
      context,
      classAverageTemplate,
    );
    expect(assignedReport.scoreModeLabel).toBe("赋分");
    expect(assignedReport.tables[0].rows.map((row) => row.studentName)).toEqual(["乙"]);
    expect(assignedReport.tables[1].rows.map((row) => row.studentName)).toEqual(["丙"]);
  });

  it("falls back to one cohort table when tracks are not fully classifiable", () => {
    const report = buildGradeTotalScoreRankingReport(
      exam,
      { ...template, totalScoreSegmentOptions: { totalScoreTopN: 2 } },
      { ...context, classProfiles: {} },
      classAverageTemplate,
    );

    expect(report.tables).toHaveLength(1);
    expect(report.tables[0].key).toBe("all");
    expect(report.tables[0].rows.map((row) => row.studentName)).toEqual(["甲", "乙"]);
  });

  it("splits students by their own selections even inside the same class", () => {
    const mixedExam: GradeExam = {
      ...exam,
      records: exam.records.slice(0, 2).map((record, index) => ({
        ...record,
        classId: "mixed-class",
        className: "高三(3)班",
        subjectSelection: index === 0 ? "物化生" : "史政地",
      })),
    };
    const mixedContext: GradeImportContext = {
      ...context,
      cohort: { ...context.cohort, classIds: ["mixed-class"], studentCount: 2 },
      classes: [{
        ...context.classes[0],
        id: "mixed-class",
        name: "高三(3)班",
        studentCount: 2,
      }],
      classProfiles: {},
    };
    const mixedClassAverage: GradeStatisticsTemplate = {
      ...classAverageTemplate,
      classAverageOptions: {
        classOrder: ["mixed-class"],
        classLabels: { "mixed-class": "3班" },
      },
    };

    const report = buildGradeTotalScoreRankingReport(
      mixedExam,
      template,
      mixedContext,
      mixedClassAverage,
    );

    expect(report.tables.map((table) => table.key)).toEqual(["science", "arts"]);
    expect(report.tables[0].rows.map((row) => row.studentName)).toEqual(["甲"]);
    expect(report.tables[1].rows.map((row) => row.studentName)).toEqual(["乙"]);
  });
});
