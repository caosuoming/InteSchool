import { describe, expect, it } from "vitest";
import { buildDefaultGradeSettings } from "./grade-statistics";
import { buildGradeReportNotes } from "./grade-report-notes";
import type { GradeExam } from "../types";

const settings = buildDefaultGradeSettings(["语文", "化学", "生物"], ["c1", "c2"]);
settings.classSubjects = [
  { classId: "c1", examSubjects: ["语文", "化学", "生物"], statisticSubjects: ["语文"], separateRankSubjects: ["化学"] },
  { classId: "c2", examSubjects: ["语文", "化学"], statisticSubjects: ["语文", "化学"] },
];
const exam: GradeExam = {
  id: "e1", schoolId: "s1", teacherId: "t1", cohortKey: "c", cohortLabel: "高三",
  name: "月考", examRemark: "  一班试卷与其他班不同。\n务必说明  ",
  sourceFileName: "score.xlsx", sourceSheetName: "Sheet1",
  subjects: ["语文", "化学", "生物"],
  records: [
    { id: "r1", studentId: "s1", studentNo: "01", studentName: "张三", classId: "c1", className: "一班", scores: {}, assignedScores: {}, rawTotal: 0, assignedTotal: 0, gradeRank: 0, classRank: 0 },
    { id: "r2", studentId: "s2", studentNo: "02", studentName: "李四", classId: "c2", className: "二班", scores: {}, assignedScores: {}, rawTotal: 0, assignedTotal: 0, gradeRank: 0, classRank: 0 },
  ],
  settings, createdAt: "", updatedAt: "",
};

describe("grade report notes", () => {
  it("includes manual remarks and distinguishes separate ranking and excluded subjects", () => {
    expect(buildGradeReportNotes(exam)).toEqual([
      "考试备注：一班试卷与其他班不同。\n务必说明",
      "一班：化学实行单独排名，不计入全年级统一排名。",
      "一班：生物不参与全年级成绩排名。",
    ]);
  });

  it("limits subject and class-specific annotations to the relevant table", () => {
    expect(buildGradeReportNotes(exam, settings, "c2")).toEqual([
      "考试备注：一班试卷与其他班不同。\n务必说明",
    ]);
    expect(buildGradeReportNotes(exam, settings, "c1", "生物")).toEqual([
      "考试备注：一班试卷与其他班不同。\n务必说明",
      "一班：生物不参与全年级成绩排名。",
    ]);
  });

  it("does not mistake a non-sitting class for an excluded ranking class", () => {
    const oneClass = {
      ...exam, examRemark: undefined,
      settings: { ...settings, classSubjects: [
        { classId: "c1", examSubjects: ["语文"], statisticSubjects: ["语文"], separateRankSubjects: [] },
      ] },
    };
    expect(buildGradeReportNotes(oneClass)).toEqual([]);
  });
});
