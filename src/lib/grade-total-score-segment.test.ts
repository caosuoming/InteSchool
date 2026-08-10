import { describe, expect, it } from "vitest";
import type {
  GradeExam,
  GradeImportContext,
  GradeStatisticsTemplate,
} from "../types/index.js";
import { buildGradeTotalScoreSegmentReport } from "./grade-total-score-segment.js";

const template: GradeStatisticsTemplate = {
  id: "total-score-segment",
  kind: "totalScoreSegment",
  name: "总分分数（赋分）",
  enabled: true,
  scoreMode: "assigned",
  subjects: ["数学"],
  segmentMax: 100,
  segmentMin: 80,
  segmentSize: 10,
};

const classAverageTemplate: GradeStatisticsTemplate = {
  id: "class-average",
  kind: "classAverage",
  name: "班级平均分表",
  enabled: true,
  scoreMode: "assigned",
  subjects: ["数学"],
  classAverageOptions: {
    classOrder: ["class-2", "class-1"],
    classLabels: { "class-1": "一班", "class-2": "二班" },
  },
};

const exam: GradeExam = {
  id: "exam-1",
  schoolId: "school-1",
  teacherId: "teacher-1",
  cohortKey: "grad-2026",
  cohortLabel: "2026届高三",
  name: "期末考试",
  examDate: "2026-01-27",
  sourceFileName: "scores.xlsx",
  sourceSheetName: "成绩",
  subjects: ["数学"],
  records: [
    ["record-1", "student-1", "甲", "001", "class-1", "高三(1)班", 95],
    ["record-2", "student-2", "乙", "002", "class-1", "高三(1)班", 85],
    ["record-3", "student-3", "丙", "003", "class-2", "高三(2)班", 100],
    ["record-4", "student-4", "丁", "004", "class-2", "高三(2)班", 70],
  ].map(([id, studentId, studentName, studentNo, classId, className, score], index) => ({
    id: String(id),
    studentId: String(studentId),
    studentName: String(studentName),
    studentNo: String(studentNo),
    classId: String(classId),
    className: String(className),
    scores: { 数学: Number(score) },
    assignedScores: { 数学: Number(score) },
    rawTotal: Number(score),
    assignedTotal: Number(score),
    gradeRank: index + 1,
    classRank: index % 2 + 1,
  })),
  settings: {
    subjectTeacherIds: {},
    assignmentRules: {},
    classSubjects: [],
    templates: [classAverageTemplate, template],
  },
  createdAt: "2026-01-27T00:00:00.000Z",
  updatedAt: "2026-01-27T00:00:00.000Z",
};

const context: GradeImportContext = {
  cohort: {
    key: "grad-2026",
    label: "2026届高三",
    grade: "高三",
    gradYear: 2026,
    classIds: ["class-1", "class-2"],
    studentCount: 4,
  },
  classes: [
    {
      id: "class-1",
      type: "school",
      schoolId: "school-1",
      name: "高三(1)班",
      grade: "高三",
      studentCount: 2,
      createdBy: "teacher-1",
      createdAt: "2026-01-01T00:00:00.000Z",
    },
    {
      id: "class-2",
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
};

describe("buildGradeTotalScoreSegmentReport", () => {
  it("builds cumulative threshold rows with classes as columns", () => {
    const report = buildGradeTotalScoreSegmentReport(exam, template, context, classAverageTemplate);

    expect(report.classes.map((item) => item.classLabel)).toEqual(["二班", "一班"]);
    expect(report.rows.map((row) => row.threshold)).toEqual([100, 90, 80]);
    expect(report.rows.map((row) => [row.counts["class-2"], row.counts["class-1"]])).toEqual([
      [1, 0],
      [1, 1],
      [1, 2],
    ]);
  });

  it("defaults to 700 through 400 in 10-point steps", () => {
    const report = buildGradeTotalScoreSegmentReport(
      exam,
      { ...template, segmentMax: undefined, segmentMin: undefined, segmentSize: undefined },
      context,
      classAverageTemplate,
    );

    expect(report.rows).toHaveLength(31);
    expect(report.rows[0].threshold).toBe(700);
    expect(report.rows.at(-1)?.threshold).toBe(400);
  });
});
