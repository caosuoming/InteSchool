import { describe, expect, it } from "vitest";
import type {
  GradeExam,
  GradeImportContext,
  GradeStatisticsTemplate,
} from "../types/index.js";
import {
  buildDefaultClassAverageOptions,
  buildGradeClassAverageReport,
  formatGradeClassRangeLabel,
} from "./grade-class-average.js";

const context: GradeImportContext = {
  cohort: {
    key: "grad-2026",
    label: "2026届高三",
    grade: "高三",
    gradYear: 2026,
    classIds: ["class-10", "class-2"],
    studentCount: 3,
  },
  classes: [
    {
      id: "class-10",
      type: "school",
      schoolId: "school-1",
      name: "高三(10)班",
      grade: "高三",
      studentCount: 1,
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
  teachers: [
    {
      id: "teacher-homeroom",
      name: "班主任甲",
      subject: "数学",
      homeroomClassIds: ["class-2"],
    },
    {
      id: "teacher-math",
      name: "数学教师乙",
      subject: "数学",
      teachingClassIds: ["class-2"],
    },
  ],
  classProfiles: {
    "class-2": {
      classTypeName: "实验班",
      subjectSelections: ["物化生"],
      scoreSubjects: ["数学", "英语"],
      hasImportedScores: true,
    },
    "class-10": {
      classTypeName: "实验班",
      subjectSelections: ["物化生"],
      scoreSubjects: ["数学", "英语"],
      hasImportedScores: true,
    },
  },
};

const template: GradeStatisticsTemplate = {
  id: "class-average",
  kind: "classAverage",
  name: "班级平均分表",
  enabled: true,
  scoreMode: "assigned",
  subjects: ["数学", "英语"],
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
  subjects: ["数学", "英语"],
  records: [
    {
      id: "record-1",
      studentId: "student-1",
      studentName: "甲",
      studentNo: "001",
      classId: "class-2",
      className: "高三(2)班",
      scores: { 数学: 100, 英语: 90 },
      assignedScores: { 数学: 100, 英语: 90 },
      rawTotal: 190,
      assignedTotal: 190,
      gradeRank: 1,
      classRank: 1,
    },
    {
      id: "record-2",
      studentId: "student-2",
      studentName: "乙",
      studentNo: "002",
      classId: "class-2",
      className: "高三(2)班",
      scores: { 数学: 80, 英语: 70 },
      assignedScores: { 数学: 80, 英语: 70 },
      rawTotal: 150,
      assignedTotal: 150,
      gradeRank: 2,
      classRank: 2,
    },
    {
      id: "record-3",
      studentId: "student-3",
      studentName: "丙",
      studentNo: "003",
      classId: "class-10",
      className: "高三(10)班",
      scores: { 数学: 70, 英语: 100 },
      assignedScores: { 数学: 70, 英语: 100 },
      rawTotal: 170,
      assignedTotal: 170,
      gradeRank: 3,
      classRank: 1,
    },
  ],
  settings: {
    subjectTeacherIds: {},
    classSubjectTeacherIds: {
      "class-2": { 数学: ["teacher-math"], 英语: [] },
      "class-10": { 数学: [], 英语: [] },
    },
    classSubjectTeacherNames: {
      "class-2": { 数学: ["外聘数学教师"], 英语: ["英语教师"] },
      "class-10": { 数学: [], 英语: [] },
    },
    assignmentRules: {},
    classSubjects: [],
    templates: [template],
  },
  createdAt: "2026-01-27T00:00:00.000Z",
  updatedAt: "2026-01-27T00:00:00.000Z",
};

describe("grade class average report", () => {
  it("compacts only fully continuous numeric class labels", () => {
    expect(formatGradeClassRangeLabel(["1班", "2班", "3班", "4班", "5班"]))
      .toBe("1-5班");
    expect(formatGradeClassRangeLabel(["10班", "8班", "9班"]))
      .toBe("8-10班");
    expect(formatGradeClassRangeLabel(["1班", "2班", "4班", "5班"]))
      .toBe("1班、2班、4班、5班");
    expect(formatGradeClassRangeLabel(["1班", "实验二班"]))
      .toBe("1班、实验二班");
  });

  it("builds defaults from class profiles and natural class order", () => {
    const options = buildDefaultClassAverageOptions(exam, context);

    expect(options.title).toBe("2026届高三期末考试班级平均分统计表");
    expect(options.reportDate).toBe("2026-01-27");
    expect(options.classOrder).toEqual(["class-2", "class-10"]);
    expect(options.classLabels).toEqual({ "class-2": "2班", "class-10": "10班" });
    expect(options.classCategories).toEqual({ "class-2": "实验班", "class-10": "实验班" });
  });

  it("calculates class differences and student-weighted summaries", () => {
    const report = buildGradeClassAverageReport(exam, template, context);
    const group = report.groups[0];

    expect(group.rows.map((row) => row.classLabel)).toEqual(["2班", "10班"]);
    expect(group.rows[0]).toMatchObject({
      studentCount: 2,
      homeroomTeachers: ["班主任甲"],
      subjectTeachers: {
        数学: ["数学教师乙", "外聘数学教师"],
        英语: ["英语教师"],
      },
      subjectAverages: {
        数学: { raw: 90, assigned: 90 },
        英语: { raw: 80, assigned: 80 },
      },
      subjectScoreModes: { 数学: "raw", 英语: "raw" },
      totalAverages: { raw: 170, assigned: 170 },
    });
    expect(group.difference).toEqual({
      subjectValues: {
        数学: { raw: 20, assigned: 20 },
        英语: { raw: 20, assigned: 20 },
      },
      totalValues: { raw: 0, assigned: 0 },
    });
    expect(group.average).toEqual({
      subjectValues: {
        数学: { raw: 83.33, assigned: 83.33 },
        英语: { raw: 86.67, assigned: 86.67 },
      },
      totalValues: { raw: 170, assigned: 170 },
    });
    expect(report.overallAverage).toEqual(group.average);
  });

  it("only allows assigned-score display modes for assignable subjects", () => {
    const scoredExam: GradeExam = {
      ...exam,
      subjects: ["数学", "化学"],
      records: exam.records.map((record) => ({
        ...record,
        scores: {
          数学: record.scores.数学,
          化学: record.scores.英语,
        },
        assignedScores: {
          数学: record.assignedScores.数学,
          化学: record.classId === "class-2"
            ? (record.assignedScores.英语 || 0) + 5
            : record.assignedScores.英语,
        },
      })),
    };
    const adjusted: GradeStatisticsTemplate = {
      ...template,
      subjects: ["数学", "化学"],
      classAverageOptions: {
        subjectScoreModes: {
          "class-2": { 数学: "assigned", 化学: "both" },
          "class-10": { 数学: "assigned", 化学: "assigned" },
        },
        totalScoreMode: "raw",
      },
    };

    const report = buildGradeClassAverageReport(scoredExam, adjusted, context);
    const class2 = report.groups[0].rows.find((row) => row.classId === "class-2")!;

    expect(class2.subjectScoreModes).toEqual({ 数学: "raw", 化学: "both" });
    expect(class2.subjectAverages.化学).toEqual({ raw: 80, assigned: 85 });
    expect(report.options.totalScoreMode).toBe("raw");
    expect(report.groups[0].subjectScoreModes.数学).toBe("raw");
    expect(report.groups[0].subjectScoreModes.化学).toBe("both");
  });

  it("keeps every cohort class in the class-average template even without imported scores", () => {
    const contextWithUnscoredClass: GradeImportContext = {
      ...context,
      cohort: {
        ...context.cohort,
        classIds: [...context.cohort.classIds, "class-3"],
      },
      classes: [
        ...context.classes,
        {
          id: "class-3",
          type: "school",
          schoolId: "school-1",
          name: "高三(3)班",
          grade: "高三",
          studentCount: 2,
          createdBy: "teacher-1",
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      teachers: [
        ...context.teachers,
        {
          id: "teacher-english",
          name: "英语教师丙",
          subject: "英语",
          teachingClassIds: ["class-3"],
        },
      ],
      classProfiles: {
        ...context.classProfiles,
        "class-3": {
          classTypeName: "实验班",
          subjectSelections: ["物化生"],
          scoreSubjects: [],
          hasImportedScores: false,
        },
      },
    };
    const settings = {
      ...exam.settings,
      classSubjectTeacherIds: {
        ...exam.settings.classSubjectTeacherIds,
        "class-3": { 数学: [], 英语: ["teacher-english"] },
      },
    };

    const options = buildDefaultClassAverageOptions(exam, contextWithUnscoredClass);
    expect(options.classOrder).toEqual(["class-2", "class-3", "class-10"]);

    const report = buildGradeClassAverageReport(exam, template, contextWithUnscoredClass, settings);
    const unscored = report.groups[0].rows.find((row) => row.classId === "class-3");
    expect(unscored).toMatchObject({
      classLabel: "3班",
      category: "实验班",
      studentCount: 0,
      subjectTeachers: { 数学: [], 英语: ["英语教师丙"] },
      subjectAverages: {
        数学: { raw: null, assigned: null },
        英语: { raw: null, assigned: null },
      },
      totalAverages: { raw: null, assigned: null },
    });
  });

  it("honors user class labels, categories, order, and hidden classes", () => {
    const adjusted: GradeStatisticsTemplate = {
      ...template,
      classAverageOptions: {
        classOrder: ["class-10", "class-2"],
        hiddenClassIds: ["class-2"],
        classCategories: { "class-10": "物化实验" },
        classLabels: { "class-10": "十班" },
      },
    };

    const report = buildGradeClassAverageReport(exam, adjusted, context);

    expect(report.groups).toHaveLength(1);
    expect(report.groups[0].category).toBe("物化实验");
    expect(report.groups[0].rows.map((row) => row.classLabel)).toEqual(["十班"]);
  });
});
