import { describe, expect, it } from "vitest";
import type {
  GradeExam,
  GradeImportContext,
  GradeStatisticsTemplate,
} from "../types/index.js";
import {
  buildDefaultClassAverageOptions,
  buildGradeClassAverageReport,
  classAverageOverallLabel,
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
  it("compacts continuous numeric class ranges without the 班 suffix", () => {
    expect(formatGradeClassRangeLabel(["1班", "2班", "3班", "4班", "5班"]))
      .toBe("1-5");
    expect(formatGradeClassRangeLabel(["10班", "8班", "9班"]))
      .toBe("8-10");
    expect(formatGradeClassRangeLabel(["1班", "2班", "3班", "4班", "5班", "7班"]))
      .toBe("1-5,7");
    expect(formatGradeClassRangeLabel(["7班", "8班", "9班", "10班", "13班", "14班", "15班", "16班", "17班"]))
      .toBe("7-10,13-17");
    expect(formatGradeClassRangeLabel(["1班", "2班", "4班", "5班"]))
      .toBe("1-2,4-5");
    expect(formatGradeClassRangeLabel(["7班"]))
      .toBe("7");
    expect(formatGradeClassRangeLabel(["1班", "实验二班"]))
      .toBe("1班、实验二班");
  });

  it("builds defaults from class profiles and natural class order", () => {
    const options = buildDefaultClassAverageOptions(exam, context);

    expect(options.title).toBe("期末考试班级平均分统计表");
    expect(options.reportDate).toBe("2026-01-27");
    expect(options.classOrder).toEqual(["class-2", "class-10"]);
    expect(options.classLabels).toEqual({ "class-2": "2班", "class-10": "10班" });
    expect(options.classCategories).toEqual({ "class-2": "实验班", "class-10": "实验班" });
  });

  it("always derives the title and report date from the current exam", () => {
    const legacyTemplate: GradeStatisticsTemplate = {
      ...template,
      classAverageOptions: {
        title: "2026届高三期末考试班级平均分统计表",
      },
    };
    expect(buildGradeClassAverageReport(exam, legacyTemplate, context).title)
      .toBe("期末考试班级平均分统计表");

    const customTemplate: GradeStatisticsTemplate = {
      ...template,
      classAverageOptions: {
        title: "期末质量分析",
        reportDate: "2025-12-31",
      },
    };
    const report = buildGradeClassAverageReport(exam, customTemplate, context);
    expect(report.title).toBe("期末考试班级平均分统计表");
    expect(report.reportDate).toBe("2026-01-27");
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

  it("excludes separately ranked classes per subject and from unified total averages", () => {
    const settings = {
      ...exam.settings,
      classSubjects: [
        { classId: "class-2", examSubjects: ["数学", "英语"], statisticSubjects: ["数学"], separateRankSubjects: ["英语"] },
        { classId: "class-10", examSubjects: ["数学", "英语"], statisticSubjects: ["数学", "英语"], separateRankSubjects: [] },
      ],
    };
    const report = buildGradeClassAverageReport(exam, template, context, settings);

    expect(report.groups[0].rows[0].subjectAverages.英语.raw).toBe(80);
    expect(report.groups[0].average.subjectValues.英语.raw).toBe(86.67);
    expect(report.overallAverage.subjectValues.数学).toEqual({ raw: 83.33, assigned: 83.33 });
    expect(report.overallAverage.subjectValues.英语).toEqual({ raw: 100, assigned: 100 });
    expect(report.overallAverage.totalValues).toEqual({ raw: 170, assigned: 170 });
    expect(report.overallExcludedClasses).toEqual({
      subjects: { 数学: [], 英语: ["2班"] },
      total: ["2班"],
    });
    expect(classAverageOverallLabel(report))
      .toBe("全校平均（部分）");
  });

  it("respects non-participating subjects, custom labels, and hidden classes", () => {
    const settings = {
      ...exam.settings,
      classSubjects: [
        { classId: "class-2", examSubjects: ["数学", "英语"], statisticSubjects: ["英语"], separateRankSubjects: [] },
        { classId: "class-10", examSubjects: ["数学", "英语"], statisticSubjects: ["数学"], separateRankSubjects: ["英语"] },
      ],
    };
    const customized: GradeStatisticsTemplate = {
      ...template,
      classAverageOptions: { classLabels: { "class-2": "二班", "class-10": "十班" } },
    };
    const report = buildGradeClassAverageReport(exam, customized, context, settings);

    expect(report.overallAverage.subjectValues.数学).toEqual({ raw: 70, assigned: 70 });
    expect(report.overallAverage.subjectValues.英语).toEqual({ raw: 80, assigned: 80 });
    expect(report.overallAverage.totalValues).toEqual({ raw: null, assigned: null });
    expect(report.overallExcludedClasses).toEqual({
      subjects: { 数学: ["二班"], 英语: ["十班"] },
      total: ["二班", "十班"],
    });
    expect(classAverageOverallLabel(report))
      .toBe("全校平均（部分）");

    const hiddenReport = buildGradeClassAverageReport(exam, {
      ...customized,
      classAverageOptions: { ...customized.classAverageOptions, hiddenClassIds: ["class-10"] },
    }, context, settings);
    expect(hiddenReport.overallExcludedClasses).toEqual({
      subjects: { 数学: ["二班"], 英语: [] },
      total: ["二班"],
    });
    expect(hiddenReport.overallAverage.subjectValues.数学.raw).toBeNull();
    expect(hiddenReport.overallAverage.subjectValues.英语.raw).toBe(80);
  });

  it("does not mark missing non-exam subjects as manually excluded", () => {
    const settings = {
      ...exam.settings,
      classSubjects: [
        { classId: "class-2", examSubjects: ["数学"], statisticSubjects: ["数学"], separateRankSubjects: [] },
        { classId: "class-10", examSubjects: ["数学", "英语"], statisticSubjects: ["数学", "英语"], separateRankSubjects: [] },
      ],
    };
    const noEnglishExam: GradeExam = {
      ...exam,
      records: exam.records.map((record) => record.classId === "class-2"
        ? { ...record, scores: { ...record.scores, 英语: null }, assignedScores: { ...record.assignedScores, 英语: null } }
        : record),
    };
    const report = buildGradeClassAverageReport(noEnglishExam, template, context, settings);
    expect(report.overallAverage.subjectValues.英语.raw).toBe(100);
    expect(report.overallExcludedClasses).toEqual({
      subjects: { 数学: [], 英语: [] },
      total: [],
    });
    expect(classAverageOverallLabel(report)).toBe("全校平均");
  });

  it("uses only participating class scores when a subject is unchecked without separate ranking", () => {
    const settings = {
      ...exam.settings,
      classSubjects: [
        { classId: "class-2", examSubjects: ["数学", "英语"], statisticSubjects: ["数学"], separateRankSubjects: [] },
        { classId: "class-10", examSubjects: ["数学", "英语"], statisticSubjects: ["数学", "英语"], separateRankSubjects: [] },
      ],
    };
    const report = buildGradeClassAverageReport(exam, template, context, settings);

    expect(report.overallAverage.subjectValues.数学.raw).toBe(83.33);
    expect(report.overallAverage.subjectValues.英语.raw).toBe(100);
    expect(report.overallAverage.totalValues.raw).toBe(170);
    expect(report.overallExcludedClasses).toEqual({
      subjects: { 数学: [], 英语: ["2班"] },
      total: ["2班"],
    });
    expect(classAverageOverallLabel(report)).toBe("全校平均（部分）");
    expect(classAverageOverallLabel(buildGradeClassAverageReport(exam, template, context)))
      .toBe("全校平均");
  });

  it("excludes all separately ranked students without inventing a school-wide average", () => {
    const settings = {
      ...exam.settings,
      classSubjects: [
        { classId: "class-2", examSubjects: ["数学", "英语"], statisticSubjects: ["数学"], separateRankSubjects: ["英语"] },
        { classId: "class-10", examSubjects: ["数学", "英语"], statisticSubjects: ["数学"], separateRankSubjects: ["英语"] },
      ],
    };
    const report = buildGradeClassAverageReport(exam, template, context, settings);

    expect(report.overallAverage.subjectValues.英语).toEqual({ raw: null, assigned: null });
    expect(report.overallAverage.totalValues).toEqual({ raw: null, assigned: null });
    expect(report.overallExcludedClasses).toEqual({
      subjects: { 数学: [], 英语: ["2班", "10班"] },
      total: ["2班", "10班"],
    });
  });

  it("excludes partially absent students from both total averages without excluding individual scores", () => {
    const partialExam: GradeExam = {
      ...exam,
      records: exam.records.map((record) => record.id === "record-2" ? {
        ...record,
        scores: { 数学: 80, 英语: null },
        assignedScores: { 数学: 85, 英语: 95 },
      } : record.id === "record-1" ? {
        ...record,
        assignedScores: { 数学: 110, 英语: 90 },
      } : record),
    };
    const report = buildGradeClassAverageReport(partialExam, template, context);
    const group = report.groups[0];

    expect(group.rows[0].studentCount).toBe(2);
    expect(group.rows[0].subjectAverages).toEqual({
      数学: { raw: 90, assigned: 97.5 },
      英语: { raw: 90, assigned: 92.5 },
    });
    expect(group.rows[0].totalAverages).toEqual({ raw: 190, assigned: 200 });
    expect(group.difference.totalValues).toEqual({ raw: 20, assigned: 30 });
    expect(group.average.totalValues).toEqual({ raw: 180, assigned: 185 });
    expect(report.overallAverage.totalValues).toEqual({ raw: 180, assigned: 185 });

    const subsetReport = buildGradeClassAverageReport(partialExam, {
      ...template,
      subjects: ["数学"],
    }, context);
    expect(subsetReport.groups[0].rows[0].totalAverages).toEqual({ raw: 100, assigned: 110 });
  });

  it("counts real zero scores but not absent or assigned-only scores", () => {
    const partialExam: GradeExam = {
      ...exam,
      records: [
        { ...exam.records[0], scores: { 数学: 0, 英语: 90 }, assignedScores: { 数学: 0, 英语: 90 } },
        { ...exam.records[1], scores: { 数学: null, 英语: null }, assignedScores: { 数学: 80, 英语: 70 } },
        { ...exam.records[2], scores: { 数学: 70, 英语: 100 }, assignedScores: { 数学: 70, 英语: null } },
      ],
    };
    const report = buildGradeClassAverageReport(partialExam, template, context);

    expect(report.groups[0].rows[0].totalAverages).toEqual({ raw: 90, assigned: 90 });
    expect(report.groups[0].rows[1].totalAverages).toEqual({ raw: 170, assigned: null });
    expect(report.groups[0].average.totalValues).toEqual({ raw: 130, assigned: 90 });

    const allAbsent = { ...partialExam, records: partialExam.records.map((record) => ({
      ...record,
      scores: { 数学: null, 英语: null },
    })) };
    expect(buildGradeClassAverageReport(allAbsent, template, context).overallAverage.totalValues)
      .toEqual({ raw: null, assigned: null });
  });

  it("keeps complete students with different elective combinations in total averages", () => {
    const subjects = ["语文", "数学", "英语", "物理", "化学", "生物", "政治", "历史", "地理"];
    const studentScores = (electives: string[], absent?: string) => Object.fromEntries(subjects.map((subject) => [
      subject,
      ["语文", "数学", "英语", ...electives].includes(subject) && subject !== absent ? 100 : null,
    ]));
    const mixedExam: GradeExam = {
      ...exam,
      subjects,
      records: [
        { ...exam.records[0], subjectSelection: "物化生", scores: studentScores(["物理", "化学", "生物"]), assignedScores: studentScores(["物理", "化学", "生物"]) },
        { ...exam.records[1], subjectSelection: "史政地", scores: studentScores(["历史", "政治", "地理"]), assignedScores: studentScores(["历史", "政治", "地理"]) },
        { ...exam.records[2], subjectSelection: "物化生", scores: studentScores(["物理", "化学", "生物"], "化学"), assignedScores: studentScores(["物理", "化学", "生物"], "化学") },
      ],
    };
    const report = buildGradeClassAverageReport(mixedExam, { ...template, subjects }, context);

    expect(report.groups[0].rows[0].totalAverages).toEqual({ raw: 600, assigned: 600 });
    expect(report.groups[0].rows[1].totalAverages).toEqual({ raw: null, assigned: null });
    expect(report.overallAverage.totalValues).toEqual({ raw: 600, assigned: 600 });
  });

  it("uses grade-bound homeroom names ahead of organization defaults", () => {
    const settings = {
      ...exam.settings,
      classHomeroomTeacherNames: { "class-2": ["导入班主任"] },
    };
    const report = buildGradeClassAverageReport(
      { ...exam, settings },
      template,
      context,
      settings,
    );

    expect(report.groups[0].rows[0].homeroomTeachers).toEqual(["导入班主任"]);
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
