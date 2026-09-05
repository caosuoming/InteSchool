import { describe, expect, it } from "vitest";
import type { GradeExam, GradeImportContext, GradeStatisticsTemplate } from "../types/index.js";
import { DEFAULT_ASSIGNMENT_RULES } from "./grade-statistics.js";
import {
  buildGradeElectiveScoreSegmentReport,
  resolveGradeElectiveScoreThresholds,
} from "./grade-elective-score-segment.js";

const template: GradeStatisticsTemplate = {
  id: "total-score-segment",
  kind: "totalScoreSegment",
  name: "总分分数段",
  enabled: true,
  scoreMode: "assigned",
  subjects: ["化学", "生物"],
  totalScoreSegmentOptions: {
    subjectScoreSegmentThresholds: { 化学: [90, 80, 70] },
  },
};

const context: GradeImportContext = {
  cohort: { key: "grad-2027", label: "2027届高二", grade: "高二", gradYear: 2027, classIds: ["class-1", "class-2"], studentCount: 3 },
  classes: [
    {
      id: "class-1",
      type: "school",
      schoolId: "school-1",
      name: "高二(1)班",
      grade: "高二",
      studentCount: 2,
      createdBy: "teacher-1",
      createdAt: "2026-01-01T00:00:00.000Z",
    },
    {
      id: "class-2",
      type: "school",
      schoolId: "school-1",
      name: "高二(2)班",
      grade: "高二",
      studentCount: 1,
      createdBy: "teacher-1",
      createdAt: "2026-01-01T00:00:00.000Z",
    },
  ],
  students: [],
  teachers: [
    { id: "teacher-chem-1", name: "陈老师", subject: "化学", teachingClassIds: ["class-1"] },
    { id: "teacher-chem-2", name: "林老师", subject: "化学", teachingClassIds: ["class-2"] },
  ],
};

const exam: GradeExam = {
  id: "exam-1",
  schoolId: "school-1",
  teacherId: "teacher-1",
  cohortKey: "grad-2027",
  cohortLabel: "2027届高二",
  name: "四校联合考试",
  examDate: "2026-05-26",
  sourceFileName: "scores.xlsx",
  sourceSheetName: "成绩",
  subjects: ["化学", "生物"],
  records: [
    {
      id: "record-1",
      studentId: "student-1",
      studentName: "甲",
      studentNo: "001",
      classId: "class-1",
      className: "高二(1)班",
      scores: { 化学: 95, 生物: null },
      assignedScores: { 化学: 92, 生物: null },
      rawTotal: 95,
      assignedTotal: 92,
      gradeRank: 1,
      classRank: 1,
    },
    {
      id: "record-2",
      studentId: "student-2",
      studentName: "乙",
      studentNo: "002",
      classId: "class-1",
      className: "高二(1)班",
      scores: { 化学: 82, 生物: null },
      assignedScores: { 化学: 78, 生物: null },
      rawTotal: 82,
      assignedTotal: 78,
      gradeRank: 2,
      classRank: 2,
    },
    {
      id: "record-3",
      studentId: "student-3",
      studentName: "丙",
      studentNo: "003",
      classId: "class-2",
      className: "高二(2)班",
      scores: { 化学: 74, 生物: null },
      assignedScores: { 化学: 63, 生物: null },
      rawTotal: 74,
      assignedTotal: 63,
      gradeRank: 3,
      classRank: 1,
    },
  ],
  settings: {
    subjectTeacherIds: { 化学: ["teacher-chem-1", "teacher-chem-2"] },
    classSubjectTeacherIds: {
      "class-1": { 化学: ["teacher-chem-1"] },
      "class-2": { 化学: ["teacher-chem-2"] },
    },
    assignmentRules: { 化学: DEFAULT_ASSIGNMENT_RULES.map((rule) => ({ ...rule })) },
    classSubjects: [
      { classId: "class-1", examSubjects: ["化学"], statisticSubjects: ["化学"] },
      { classId: "class-2", examSubjects: ["化学"], statisticSubjects: ["化学"] },
    ],
    templates: [template],
  },
  createdAt: "2026-05-26T00:00:00.000Z",
  updatedAt: "2026-05-26T00:00:00.000Z",
};

describe("grade elective score segment report", () => {
  it("reports A-E grades and cumulative raw-score thresholds by class", () => {
    const report = buildGradeElectiveScoreSegmentReport(exam, template, context);
    const chemistry = report.subjects.find((item) => item.subject === "化学");

    expect(chemistry?.title).toBe("四校联合考试化学选修分数段统计表");
    expect(chemistry?.gradeLabels).toEqual(["A", "B", "C", "D", "E"]);
    expect(chemistry?.thresholds).toEqual([90, 80, 70]);
    expect(chemistry?.rows[0]).toMatchObject({
      classLabel: "1班",
      teacherNames: ["陈老师"],
      candidateCount: 2,
      gradeCounts: { A: 1, B: 1, C: 0, D: 0, E: 0 },
      scoreCounts: { 90: 1, 80: 2, 70: 2 },
    });
    expect(chemistry?.rows[1]).toMatchObject({
      classLabel: "2班",
      teacherNames: ["林老师"],
      candidateCount: 1,
      gradeCounts: { A: 0, B: 0, C: 1, D: 0, E: 0 },
      scoreCounts: { 90: 0, 80: 0, 70: 1 },
    });
    expect(chemistry?.totalGradeCounts).toEqual({ A: 1, B: 1, C: 1, D: 0, E: 0 });
    expect(chemistry?.totalScoreCounts).toEqual({ 90: 1, 80: 2, 70: 3 });
    expect(chemistry?.totalGradeRates).toEqual({ A: "33.3%", B: "33.3%", C: "33.3%", D: "0.0%", E: "0.0%" });
    expect(chemistry?.totalScoreRates).toEqual({ 90: "33.3%", 80: "66.7%", 70: "100.0%" });
  });

  it("defaults elective score thresholds to 90 through 40", () => {
    expect(resolveGradeElectiveScoreThresholds({ ...template, totalScoreSegmentOptions: undefined }, "化学"))
      .toEqual([90, 80, 70, 60, 50, 40]);
  });
});
