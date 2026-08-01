import { describe, expect, it } from "vitest";
import type { GradeExam, GradeStatisticsTemplate } from "../types/index.js";
import { buildGradeReportTable } from "./grade-reports.js";

const template: GradeStatisticsTemplate = {
  id: "custom",
  kind: "customTable",
  name: "自定义总分表",
  enabled: true,
  scoreMode: "assigned",
  subjects: ["语文", "数学", "物理", "化学"],
  columns: [
    { id: "name", name: "姓名", formula: "=姓名" },
    { id: "total", name: "组合总分", formula: '=SUM(SCORES("语文", "数学"), BEST(SCORES("物理", "化学"), 1))' },
    { id: "bad", name: "错误列", formula: "=1 / 0" },
  ],
};

const exam: GradeExam = {
  id: "exam-1",
  schoolId: "school-1",
  teacherId: "teacher-1",
  cohortKey: "grad-2026",
  cohortLabel: "2026届高三",
  name: "联考",
  sourceFileName: "scores.xlsx",
  sourceSheetName: "成绩",
  subjects: ["语文", "数学", "物理", "化学"],
  records: [
    {
      id: "score-2",
      studentId: "student-2",
      studentName: "乙",
      studentNo: "002",
      classId: "class-1",
      className: "高三(1)班",
      scores: { 语文: 100, 数学: 110, 物理: 70, 化学: 80 },
      assignedScores: { 语文: 100, 数学: 110, 物理: 88, 化学: 92 },
      rawTotal: 360,
      assignedTotal: 390,
      gradeRank: 2,
      classRank: 2,
    },
    {
      id: "score-1",
      studentId: "student-1",
      studentName: "甲",
      studentNo: "001",
      classId: "class-1",
      className: "高三(1)班",
      scores: { 语文: 120, 数学: 130, 物理: 85, 化学: 75 },
      assignedScores: { 语文: 120, 数学: 130, 物理: 96, 化学: 90 },
      rawTotal: 410,
      assignedTotal: 436,
      gradeRank: 1,
      classRank: 1,
    },
  ],
  settings: {
    subjectTeacherIds: {},
    assignmentRules: {},
    classSubjects: [],
    templates: [template],
  },
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
};

describe("grade report tables", () => {
  it("renders custom formula columns in grade-rank order", () => {
    const report = buildGradeReportTable(exam, template);

    expect(report.headers).toEqual(["姓名", "组合总分", "错误列"]);
    expect(report.rows[0]).toEqual(["甲", 346, expect.stringContaining("#错误")]);
    expect(report.rows[1]).toEqual(["乙", 302, expect.stringContaining("#错误")]);
  });
});
