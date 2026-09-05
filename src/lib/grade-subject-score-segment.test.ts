import { describe, expect, it } from "vitest";
import type { GradeExam, GradeImportContext, GradeStatisticsTemplate } from "../types/index.js";
import {
  buildGradeSubjectScoreSegmentReport,
  resolveGradeSubjectScoreThresholds,
} from "./grade-subject-score-segment.js";

const template: GradeStatisticsTemplate = {
  id: "total-score-segment",
  kind: "totalScoreSegment",
  name: "总分分数段",
  enabled: true,
  scoreMode: "assigned",
  subjects: ["语文", "物理"],
  totalScoreSegmentOptions: {
    subjectScoreSegmentThresholds: { 语文: [111, 100, 90] },
  },
};

const context: GradeImportContext = {
  cohort: { key: "grad-2027", label: "2027届高二", grade: "高二", gradYear: 2027, classIds: ["class-1"], studentCount: 2 },
  classes: [{
    id: "class-1",
    type: "school",
    schoolId: "school-1",
    name: "高二(1)班",
    grade: "高二",
    studentCount: 2,
    createdBy: "teacher-1",
    createdAt: "2026-01-01T00:00:00.000Z",
  }],
  students: [],
  teachers: [{ id: "teacher-chinese", name: "周虹", subject: "语文", teachingClassIds: ["class-1"] }],
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
  subjects: ["语文", "物理"],
  records: [120, 95].map((chinese, index) => ({
    id: `record-${index + 1}`,
    studentId: `student-${index + 1}`,
    studentName: `学生${index + 1}`,
    studentNo: `00${index + 1}`,
    classId: "class-1",
    className: "高二(1)班",
    scores: { 语文: chinese, 物理: index === 0 ? 88 : 72 },
    assignedScores: { 语文: chinese, 物理: index === 0 ? 88 : 72 },
    rawTotal: chinese,
    assignedTotal: chinese,
    gradeRank: index + 1,
    classRank: index + 1,
  })),
  settings: {
    subjectTeacherIds: {},
    classSubjectTeacherIds: { "class-1": { 语文: ["teacher-chinese"], 物理: [] } },
    assignmentRules: {},
    classSubjects: [{ classId: "class-1", examSubjects: ["语文", "物理"], statisticSubjects: ["语文", "物理"] }],
    templates: [template],
  },
  createdAt: "2026-05-26T00:00:00.000Z",
  updatedAt: "2026-05-26T00:00:00.000Z",
};

describe("grade subject score segment report", () => {
  it("uses configurable cumulative thresholds and includes teacher and actual examinee counts", () => {
    const report = buildGradeSubjectScoreSegmentReport(exam, template, context);
    const chinese = report.subjects.find((item) => item.subject === "语文");

    expect(chinese?.title).toBe("四校联合考试语文成绩情况统计表");
    expect(chinese?.thresholds).toEqual([111, 100, 90]);
    expect(chinese?.rows[0]).toMatchObject({
      classLabel: "1班",
      teacherNames: ["周虹"],
      candidateCount: 2,
      counts: { 111: 1, 100: 1, 90: 2 },
    });
    expect(chinese?.totalCounts).toEqual({ 111: 1, 100: 1, 90: 2 });
    expect(chinese?.totalRates).toEqual({ 111: "50.0%", 100: "50.0%", 90: "100.0%" });
  });

  it("uses 90 through 40 defaults for physics/history", () => {
    expect(resolveGradeSubjectScoreThresholds(template, "物理")).toEqual([90, 80, 70, 60, 50, 40]);
    expect(resolveGradeSubjectScoreThresholds(template, "历史")).toEqual([90, 80, 70, 60, 50, 40]);
  });
});
