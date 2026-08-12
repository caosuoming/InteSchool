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
    subjectScoreSegmentThresholds: { 化学: [95, 80, 60] },
  },
};

const context: GradeImportContext = {
  cohort: { key: "grad-2027", label: "2027届高二", grade: "高二", gradYear: 2027, classIds: ["class-1"], studentCount: 3 },
  classes: [{
    id: "class-1",
    type: "school",
    schoolId: "school-1",
    name: "高二(1)班",
    grade: "高二",
    studentCount: 3,
    createdBy: "teacher-1",
    createdAt: "2026-01-01T00:00:00.000Z",
  }],
  students: [],
  teachers: [{ id: "teacher-chemistry", name: "屈春芸", subject: "化学", teachingClassIds: ["class-1"] }],
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
  records: [92, 82, 68].map((chemistry, index) => ({
    id: `record-${index + 1}`,
    studentId: `student-${index + 1}`,
    studentName: `学生${index + 1}`,
    studentNo: `00${index + 1}`,
    classId: "class-1",
    className: "高二(1)班",
    scores: { 化学: chemistry, 生物: 80 - index * 10 },
    assignedScores: { 化学: chemistry, 生物: 80 - index * 10 },
    rawTotal: chemistry,
    assignedTotal: chemistry,
    gradeRank: index + 1,
    classRank: index + 1,
  })),
  settings: {
    subjectTeacherIds: {},
    classSubjectTeacherIds: { "class-1": { 化学: ["teacher-chemistry"], 生物: [] } },
    assignmentRules: {
      化学: DEFAULT_ASSIGNMENT_RULES.map((rule) => ({ ...rule })),
      生物: DEFAULT_ASSIGNMENT_RULES.map((rule) => ({ ...rule })),
    },
    classSubjects: [{ classId: "class-1", examSubjects: ["化学", "生物"], statisticSubjects: ["化学", "生物"] }],
    templates: [template],
  },
  createdAt: "2026-05-26T00:00:00.000Z",
  updatedAt: "2026-05-26T00:00:00.000Z",
};

describe("grade elective score segment report", () => {
  it("groups assignable subjects by A-E bands and cumulative score thresholds", () => {
    const report = buildGradeElectiveScoreSegmentReport(exam, template, context);
    const chemistry = report.subjects.find((item) => item.subject === "化学");

    expect(chemistry?.title).toBe("2027届高二四校联合考试化学选修分数段统计表");
    expect(chemistry?.gradeLabels).toEqual(["A", "B", "C", "D", "E"]);
    expect(chemistry?.thresholds).toEqual([95, 80, 60]);
    expect(chemistry?.rows[0]).toMatchObject({
      classLabel: "1班",
      teacherNames: ["屈春芸"],
      candidateCount: 3,
      gradeCounts: { A: 1, B: 1, C: 1, D: 0, E: 0 },
      thresholdCounts: { 95: 0, 80: 2, 60: 3 },
    });
    expect(chemistry?.totalCandidateCount).toBe(3);
    expect(chemistry?.totalGradeCounts).toEqual({ A: 1, B: 1, C: 1, D: 0, E: 0 });
  });

  it("uses 90 through 40 as the default adjustable score thresholds", () => {
    expect(resolveGradeElectiveScoreThresholds(template, "生物")).toEqual([90, 80, 70, 60, 50, 40]);
  });
});
