import { describe, expect, it } from "vitest";
import type { GradeExam, GradeScoreRecord } from "../types/index.js";
import {
  buildGradeClassStatisticsReport,
  DEFAULT_GRADE_CLASS_STATISTICS_OPTIONS,
} from "./grade-class-statistics.js";

function record(
  id: string,
  classId: string,
  className: string,
  studentNo: string,
  studentName: string,
  chinese: number,
  chemistryRaw: number,
  chemistryAssigned: number,
  rawTotal: number,
  assignedTotal: number,
): GradeScoreRecord {
  return {
    id: `record-${id}`,
    studentId: id,
    studentName,
    studentNo,
    classId,
    className,
    scores: { 语文: chinese, 化学: chemistryRaw },
    assignedScores: { 语文: chinese, 化学: chemistryAssigned },
    rawTotal,
    assignedTotal,
    gradeRank: 0,
    classRank: 0,
  };
}

function exam(id: string, name: string, examDate: string, records: GradeScoreRecord[]): GradeExam {
  return {
    id,
    schoolId: "school-1",
    teacherId: "teacher-1",
    cohortKey: "cohort-1",
    cohortLabel: "2027届高三",
    name,
    examDate,
    sourceFileName: `${name}.xlsx`,
    sourceSheetName: "成绩",
    subjects: ["语文", "化学"],
    records,
    settings: {
      subjectTeacherIds: {},
      assignmentRules: {},
      classSubjects: [],
      templates: [],
    },
    createdAt: `${examDate}T00:00:00.000Z`,
    updatedAt: `${examDate}T00:00:00.000Z`,
  };
}

const current = exam("current", "期末考试", "2026-07-01", [
  record("s1", "c1", "高三（1）班", "001", "张三", 120, 80, 90, 200, 210),
  record("s2", "c1", "高三（1）班", "002", "李四", 115, 85, 90, 200, 205),
  record("s3", "c2", "高三（2）班", "003", "王五", 125, 75, 88, 198, 213),
]);

const previous = exam("previous", "期中考试", "2026-05-01", [
  record("s1", "c1", "高三（1）班", "001", "张三", 110, 70, 82, 180, 192),
  record("s2", "c1", "高三（1）班", "002", "李四", 118, 76, 84, 194, 202),
]);

describe("grade class statistics", () => {
  it("always includes class, name and current subject scores", () => {
    const report = buildGradeClassStatisticsReport(current, [], {
      ...DEFAULT_GRADE_CLASS_STATISTICS_OPTIONS,
      showRawTotal: false,
      showAssignedTotal: false,
    });

    expect(report.title).toBe("期末考试各班成绩统计");
    expect(report.classes.map((item) => item.className)).toEqual(["高三（1）班", "高三（2）班"]);
    expect(report.columns.map((column) => column.label)).toEqual(["班级", "姓名", "语文", "化学"]);
    expect(report.classes[0].rows[0].values["current:subject:化学"]).toBe(90);
  });

  it("calculates subject, raw-total and assigned-total class/grade competition ranks", () => {
    const report = buildGradeClassStatisticsReport(current, [], {
      ...DEFAULT_GRADE_CLASS_STATISTICS_OPTIONS,
      showSubjectClassRanks: true,
      showSubjectGradeRanks: true,
      showRawTotal: true,
      showAssignedTotal: true,
    });
    const zhang = report.classes[0].rows.find((row) => row.studentId === "s1")!;
    const li = report.classes[0].rows.find((row) => row.studentId === "s2")!;

    expect(zhang.values["current:subjectClassRank:化学"]).toBe(1);
    expect(li.values["current:subjectClassRank:化学"]).toBe(1);
    expect(zhang.values["current:subjectGradeRank:化学"]).toBe(1);
    expect(zhang.values["current:rawTotalClassRank"]).toBe(1);
    expect(li.values["current:rawTotalClassRank"]).toBe(1);
    expect(zhang.values["current:rawTotalGradeRank"]).toBe(1);
    expect(zhang.values["current:assignedTotalGradeRank"]).toBe(2);
  });

  it("adds selected previous exams side by side and leaves missing students blank", () => {
    const report = buildGradeClassStatisticsReport(current, [previous], {
      ...DEFAULT_GRADE_CLASS_STATISTICS_OPTIONS,
      showAssignedTotal: true,
      comparisonExamIds: ["previous"],
    });
    const wang = report.classes[1].rows[0];

    expect(report.includedExams.map((item) => item.name)).toEqual(["期末考试", "期中考试"]);
    expect(report.columns.some((column) => column.label === "期中考试·语文")).toBe(true);
    expect(report.classes[0].rows[0].values["previous:subject:语文"]).toBe(110);
    expect(wang.values["previous:subject:语文"]).toBeNull();
    expect(report.columns.some((column) => column.label === "期中考试·总分（赋分）年级排名")).toBe(true);
  });
});
