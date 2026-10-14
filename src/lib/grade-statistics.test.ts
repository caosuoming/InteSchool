import { describe, expect, it } from "vitest";
import type { GradeExamSettings } from "../types/index.js";
import {
  buildDefaultGradeSettings,
  calculateGradeRecords,
  inferClassSubjectAvailability,
  inferStatisticSubjectsFromSelections,
  normalizeGradeSettings,
  validateAssignmentRules,
} from "./grade-statistics.js";

const baseRecords = [
  {
    id: "score-1",
    studentId: "student-1",
    studentName: "甲",
    studentNo: "001",
    classId: "class-1",
    className: "高一(1)班",
    scores: { 数学: 100, 化学: 90 },
  },
  {
    id: "score-2",
    studentId: "student-2",
    studentName: "乙",
    studentNo: "002",
    classId: "class-1",
    className: "高一(1)班",
    scores: { 数学: 90, 化学: 70 },
  },
  {
    id: "score-3",
    studentId: "student-3",
    studentName: "丙",
    studentNo: "003",
    classId: "class-2",
    className: "高一(2)班",
    scores: { 数学: 80, 化学: 50 },
  },
];

describe("grade statistics", () => {
  it("keeps excluded students' scores without using them in ranks or grade conversion", () => {
    const settings = buildDefaultGradeSettings(["数学", "化学"], ["class-1", "class-2"]);
    const scores = calculateGradeRecords([
      baseRecords[0],
      { ...baseRecords[1], includeInStatistics: false, scores: { 数学: 999, 化学: 99 } },
      baseRecords[2],
    ], ["数学", "化学"], settings);
    const included = scores.find((record) => record.studentId === "student-1")!;
    const excluded = scores.find((record) => record.studentId === "student-2")!;
    const otherClass = scores.find((record) => record.studentId === "student-3")!;

    expect(scores).toHaveLength(3);
    expect(excluded.scores.数学).toBe(999);
    expect(excluded.rawTotal).toBe(1098);
    expect(excluded.gradeRank).toBe(0);
    expect(excluded.classRank).toBe(0);
    expect(excluded.subjectRanks?.数学).toBeNull();
    expect(included.gradeRank).toBe(1);
    expect(included.classRank).toBe(1);
    expect(otherClass.gradeRank).toBe(2);
    expect(included.subjectRanks?.数学).toBe(1);
    expect(otherClass.subjectRanks?.数学).toBe(2);
    expect(excluded.assignedScores.化学).toBe(99);
    expect(included.assignedScores.化学).toBe(100);
  });

  it("defaults all examined class subjects to unified ranking regardless of elective presets", () => {
    const subjects = ["语文", "数学", "英语", "物理", "化学", "生物", "政治", "历史", "地理"];
    const preset = inferStatisticSubjectsFromSelections(subjects, ["史政地"]);

    expect(preset).toEqual(["语文", "数学", "英语", "政治", "历史", "地理"]);

    const settings = buildDefaultGradeSettings(
      subjects,
      ["class-1"],
      [],
      { "class-1": subjects },
    );
    expect(settings.classSubjects[0]).toMatchObject({
      examSubjects: subjects,
      statisticSubjects: subjects,
      separateRankSubjects: [],
    });
  });

  it("infers all examined subjects even when some students lack a score", () => {
    const availability = inferClassSubjectAvailability([
      { classId: "class-1", scores: { 数学: 100, 化学: 90 } },
      { classId: "class-1", scores: { 数学: 80, 化学: null } },
      { classId: "class-2", scores: { 数学: 70, 化学: 60 } },
      {
        classId: "class-3",
        scores: { 数学: 88, 化学: null },
        assignedScores: { 数学: 88, 化学: 92 },
      },
    ], ["数学", "化学"]);

    expect(availability).toEqual({
      "class-1": ["数学", "化学"],
      "class-2": ["数学", "化学"],
      "class-3": ["数学", "化学"],
    });
  });

  it("uses complete imported subjects as class ranking defaults", () => {
    const settings = buildDefaultGradeSettings(
      ["数学", "化学"],
      ["class-1", "class-2", "class-3"],
      [],
      {
        "class-1": ["数学"],
        "class-2": ["数学", "化学"],
      },
    );

    expect(settings.classSubjects).toEqual([
      {
        classId: "class-1",
        examSubjects: ["数学"],
        statisticSubjects: ["数学"],
        separateRankSubjects: [],
      },
      {
        classId: "class-2",
        examSubjects: ["数学", "化学"],
        statisticSubjects: ["数学", "化学"],
        separateRankSubjects: [],
      },
      {
        classId: "class-3",
        examSubjects: ["数学", "化学"],
        statisticSubjects: ["数学", "化学"],
        separateRankSubjects: [],
      },
    ]);
  });

  it("builds elective assignment and configurable report defaults", () => {
    const settings = buildDefaultGradeSettings(
      ["数学", "化学"],
      ["class-1", "class-2"],
      [
        {
          id: "teacher-chemistry-1",
          name: "一班化学教师",
          subject: "化学",
          teachingClassIds: ["class-1"],
        },
        {
          id: "teacher-chemistry-2",
          name: "二班化学教师",
          subject: "化学",
          teachingClassIds: ["class-2"],
        },
      ],
    );

    expect(settings.assignmentRules.化学).toHaveLength(5);
    expect(settings.assignmentRules.数学).toBeUndefined();
    expect(settings.subjectTeacherIds.化学).toEqual(["teacher-chemistry-1", "teacher-chemistry-2"]);
    expect(settings.classSubjectTeacherIds?.["class-1"].化学).toEqual(["teacher-chemistry-1"]);
    expect(settings.classSubjectTeacherIds?.["class-2"].化学).toEqual(["teacher-chemistry-2"]);
    expect(settings.classSubjects).toHaveLength(2);
    expect(settings.templates.map((item) => item.kind)).toContain("classAverage");
    expect(settings.templates.find((item) => item.kind === "customTable")?.columns?.length).toBeGreaterThan(0);
  });

  it("only enables assignment conversion for chemistry, biology, politics, and geography", () => {
    const subjects = ["物理", "化学", "生物", "政治", "历史", "地理"];
    const settings = buildDefaultGradeSettings(subjects, ["class-1"]);

    expect(Object.keys(settings.assignmentRules).sort()).toEqual(
      ["化学", "生物", "政治", "地理"].sort(),
    );

    settings.assignmentRules.物理 = settings.assignmentRules.化学.map((rule) => ({ ...rule }));
    const normalized = normalizeGradeSettings(settings, subjects, ["class-1"]);
    expect(normalized.assignmentRules.物理).toBeUndefined();
    expect(normalized.assignmentRules.历史).toBeUndefined();
  });

  it("ranks separately configured subjects in their own pool and includes them in each class total", () => {
    const settings = buildDefaultGradeSettings(["数学", "化学"], ["class-1", "class-2"]);
    settings.classSubjects = settings.classSubjects.map((item) => item.classId === "class-1"
      ? { ...item, separateRankSubjects: ["化学"] }
      : item);
    const normalized = normalizeGradeSettings(settings, ["数学", "化学"], ["class-1", "class-2"]);
    const records = calculateGradeRecords([
      { ...baseRecords[0], scores: { 数学: 100, 化学: 90 } },
      { ...baseRecords[1], scores: { 数学: 90, 化学: 80 } },
      { ...baseRecords[2], scores: { 数学: 80, 化学: 70 } },
      {
        ...baseRecords[2],
        id: "score-4",
        studentId: "student-4",
        studentName: "丁",
        studentNo: "004",
        scores: { 数学: 70, 化学: 60 },
      },
    ], ["数学", "化学"], normalized);

    const firstClassTop = records.find((record) => record.studentId === "student-1")!;
    const firstClassSecond = records.find((record) => record.studentId === "student-2")!;
    const secondClassTop = records.find((record) => record.studentId === "student-3")!;
    const secondClassSecond = records.find((record) => record.studentId === "student-4")!;

    expect(normalized.classSubjects.find((item) => item.classId === "class-1")?.statisticSubjects)
      .toEqual(["数学"]);
    expect(firstClassTop.rawTotal).toBe(190);
    expect(secondClassTop.rawTotal).toBe(150);
    expect(firstClassTop.assignedScores.化学).toBe(100);
    expect(secondClassTop.assignedScores.化学).toBe(100);
    expect(firstClassTop.subjectRanks?.化学).toBe(1);
    expect(firstClassSecond.subjectRanks?.化学).toBe(2);
    expect(firstClassTop.subjectRankScopes?.化学).toBe("separate");
    expect(secondClassTop.subjectRanks?.化学).toBe(1);
    expect(secondClassSecond.subjectRanks?.化学).toBe(2);
    expect(secondClassTop.subjectRankScopes?.化学).toBe("cohort");
  });

  it("excludes unchecked subjects from cohort ranks while retaining their imported scores", () => {
    const settings = buildDefaultGradeSettings(["数学", "化学"], ["class-1", "class-2"]);
    settings.assignmentRules = {};
    settings.classSubjects[0].statisticSubjects = ["数学"];
    const normalized = normalizeGradeSettings(settings, ["数学", "化学"], ["class-1", "class-2"]);
    const records = calculateGradeRecords(baseRecords, ["数学", "化学"], normalized);

    const byStudent = Object.fromEntries(records.map((record) => [record.studentId, record]));
    expect(byStudent["student-1"].scores.化学).toBe(90);
    expect(byStudent["student-1"].assignedScores.化学).toBe(90);
    expect(byStudent["student-1"].subjectRanks?.化学).toBeNull();
    expect(byStudent["student-2"].subjectRanks?.化学).toBeNull();
    expect(byStudent["student-3"].subjectRanks?.化学).toBe(1);
    expect([1, 2, 3].map((id) => byStudent[`student-${id}`].subjectRanks?.数学)).toEqual([1, 2, 3]);
    expect([1, 2, 3].map((id) => byStudent[`student-${id}`].rawTotal)).toEqual([100, 90, 130]);
  });

  it("pools several separate classes, keeps other classes together, and partitions total ranks", () => {
    const settings = buildDefaultGradeSettings(["数学", "化学"], ["c1", "c2", "c3", "c4"]);
    settings.assignmentRules = {};
    settings.classSubjects = settings.classSubjects.map((item) => ["c1", "c2"].includes(item.classId)
      ? { ...item, separateRankSubjects: ["化学"] }
      : item);
    const normalized = normalizeGradeSettings(settings, ["数学", "化学"], ["c1", "c2", "c3", "c4"]);
    const values = [
      ["c1", 50, 60], ["c2", 70, 90], ["c3", 80, 100], ["c4", 90, 80],
    ] as const;
    const records = calculateGradeRecords(values.map(([classId, math, chemistry], index) => ({
      id: `r${index}`,
      studentId: `s${index}`,
      studentName: `学生${index}`,
      studentNo: `${index}`,
      classId,
      className: classId,
      scores: { 数学: math, 化学: chemistry },
    })), ["数学", "化学"], normalized);
    const byClass = Object.fromEntries(records.map((record) => [record.classId, record]));

    expect([byClass.c1.subjectRanks?.化学, byClass.c2.subjectRanks?.化学]).toEqual([2, 1]);
    expect([byClass.c3.subjectRanks?.化学, byClass.c4.subjectRanks?.化学]).toEqual([1, 2]);
    expect([byClass.c1.gradeRank, byClass.c2.gradeRank, byClass.c3.gradeRank, byClass.c4.gradeRank])
      .toEqual([2, 1, 1, 2]);
    expect([byClass.c1.rawTotal, byClass.c2.rawTotal, byClass.c3.rawTotal, byClass.c4.rawTotal])
      .toEqual([110, 160, 180, 170]);
  });

  it("separates total rank pools for distinct combinations of separately ranked subjects", () => {
    const settings = buildDefaultGradeSettings(["数学", "化学", "生物"], ["c1", "c2", "c3"]);
    settings.assignmentRules = {};
    settings.classSubjects = settings.classSubjects.map((item) => ({
      ...item,
      separateRankSubjects: item.classId === "c1" ? ["化学"] : item.classId === "c2" ? ["生物"] : [],
    }));
    const records = calculateGradeRecords(["c1", "c2", "c3"].map((classId, index) => ({
      id: `r${index}`, studentId: `s${index}`, studentName: `学生${index}`,
      studentNo: `${index}`, classId, className: classId,
      scores: { 数学: 80, 化学: 80, 生物: 80 },
    })), ["数学", "化学", "生物"], normalizeGradeSettings(settings, ["数学", "化学", "生物"], ["c1", "c2", "c3"]));

    expect(records.map((record) => record.gradeRank)).toEqual([1, 1, 1]);
    expect(records.map((record) => record.assignedTotal)).toEqual([240, 240, 240]);
  });

  it("does not infer class teachers from subject-wide legacy selections", () => {
    const settings = normalizeGradeSettings({
      subjectTeacherIds: { 数学: ["teacher-math"] },
      classSubjectTeacherIds: { "class-1": { 数学: ["teacher-math"] } },
      assignmentRules: {},
      classSubjects: [],
      templates: [],
    }, ["数学"], ["class-1", "class-2"], ["teacher-math"]);

    expect(settings.classSubjectTeacherIds).toEqual({
      "class-1": { 数学: ["teacher-math"] },
      "class-2": { 数学: [] },
    });
  });

  it("only preselects teachers assigned to the specific class", () => {
    const settings = buildDefaultGradeSettings(["数学"], ["class-1", "class-2"], [
      { id: "unassigned", name: "未分配老师", subject: "数学" },
      { id: "assigned", name: "指定老师", subject: "数学", teachingClassIds: ["class-1"] },
    ]);

    expect(settings.classSubjectTeacherIds).toEqual({
      "class-1": { 数学: ["assigned"] },
      "class-2": { 数学: [] },
    });
    expect(settings.subjectTeacherIds.数学).toEqual(["assigned"]);
  });

  it("normalizes manually entered class teachers", () => {
    const settings = buildDefaultGradeSettings(["数学"], ["class-1"]);
    settings.classSubjectTeacherNames = {
      "class-1": { 数学: [" 张老师 ", "张老师", "李老师"] },
    };

    const normalized = normalizeGradeSettings(settings, ["数学"], ["class-1"]);
    expect(normalized.classSubjectTeacherNames).toEqual({
      "class-1": { 数学: ["张老师", "李老师"] },
    });
  });

  it("normalizes editable class-average table options", () => {
    const settings = buildDefaultGradeSettings(["数学"], ["class-1", "class-2"]);
    const template = settings.templates.find((item) => item.kind === "classAverage")!;
    template.classAverageOptions = {
      title: "  期末平均分表  ",
      reportDate: "2026/01/27",
      classOrder: ["class-2", "removed-class"],
      hiddenClassIds: ["class-1", "removed-class"],
      classCategories: { "class-1": "  强基班  ", "removed-class": "旧班级" },
      classLabels: { "class-2": "  二班  " },
      subjectScoreModes: {
        "class-1": { 数学: "both", 不存在学科: "raw" },
        "removed-class": { 数学: "assigned" },
      },
      totalScoreMode: "raw",
      showTeacherRows: false,
    };

    const normalized = normalizeGradeSettings(settings, ["数学"], ["class-1", "class-2"]);
    const options = normalized.templates.find((item) => item.kind === "classAverage")?.classAverageOptions;

    expect(options).toMatchObject({
      title: "期末平均分表",
      classOrder: ["class-2", "class-1"],
      hiddenClassIds: ["class-1"],
      classCategories: { "class-1": "强基班" },
      classLabels: { "class-2": "二班" },
      subjectScoreModes: { "class-1": { 数学: "raw" } },
      totalScoreMode: "raw",
      showTeacherRows: false,
    });
    expect(options?.reportDate).toBeUndefined();
  });

  it("preserves valid separate ranking standards when normalizing grade settings", () => {
    const settings = buildDefaultGradeSettings(["数学", "化学", "生物"], ["class-1"]);
    const template = settings.templates.find((item) => item.kind === "totalScoreSegment")!;
    template.totalScoreSegmentOptions = {
      separateRankThresholds: {
        '["生物","化学"]': { highScore1: 920, firstTier: -20, highScore2: 3000 },
        '["已删除科目"]': { highScore1: 300 },
        invalid: { highScore1: 100 },
      },
    };
    const normalized = normalizeGradeSettings(settings, ["数学", "化学", "生物"], ["class-1"]);
    expect(normalized.templates.find((item) => item.kind === "totalScoreSegment")
      ?.totalScoreSegmentOptions?.separateRankThresholds).toEqual({
      '["化学","生物"]': { highScore1: 920, highScore2: 2000, firstTier: 0, undergraduate: undefined },
    });
  });

  it("normalizes the separate ranking top-N independently", () => {
    const settings = buildDefaultGradeSettings(["数学"], ["class-1"]);
    const template = settings.templates.find((item) => item.kind === "totalScoreSegment")!;
    template.totalScoreSegmentOptions = { totalScoreTopN: 32, totalScoreSeparateTopN: 1200 };
    const normalized = normalizeGradeSettings(settings, ["数学"], ["class-1"]);
    expect(normalized.templates.find((item) => item.kind === "totalScoreSegment")
      ?.totalScoreSegmentOptions).toMatchObject({ totalScoreTopN: 32, totalScoreSeparateTopN: 1000 });
  });

  it("assigns elective scores and produces grade and class competition ranks", () => {
    const settings = buildDefaultGradeSettings(["数学", "化学"], ["class-1", "class-2"]);
    const records = calculateGradeRecords(baseRecords, ["数学", "化学"], settings);

    expect(records.map((record) => record.studentId)).toEqual(["student-1", "student-2", "student-3"]);
    expect(records[0].assignedScores.化学).toBeGreaterThan(records[1].assignedScores.化学!);
    expect(records[1].assignedScores.化学).toBeGreaterThan(records[2].assignedScores.化学!);
    expect(records.map((record) => record.gradeRank)).toEqual([1, 2, 3]);
    expect(records.find((record) => record.studentId === "student-3")?.classRank).toBe(1);
  });

  it("preserves imported assigned scores and supports assigned-only subjects", () => {
    const settings = buildDefaultGradeSettings(["化学", "生物"], ["class-1"]);
    const records = calculateGradeRecords([{
      ...baseRecords[0],
      subjectSelection: "物化生",
      classType: "强基班",
      scores: { 化学: 72, 生物: null },
      sourceAssignedScores: { 化学: 88, 生物: 91 },
    }], ["化学", "生物"], settings);

    expect(records[0]).toMatchObject({
      subjectSelection: "物化生",
      classType: "强基班",
      scores: { 化学: 72, 生物: null },
      sourceAssignedScores: { 化学: 88, 生物: 91 },
      assignedScores: { 化学: 88, 生物: 91 },
      rawTotal: 72,
      assignedTotal: 179,
    });
  });

  it("uses competition ranking for equal totals", () => {
    const settings: GradeExamSettings = {
      subjectTeacherIds: { 数学: [] },
      assignmentRules: {},
      classSubjects: [{ classId: "class-1", examSubjects: ["数学"], statisticSubjects: ["数学"] }],
      templates: [],
    };
    const records = calculateGradeRecords([
      { ...baseRecords[0], scores: { 数学: 90 }, classId: "class-1" },
      { ...baseRecords[1], scores: { 数学: 90 }, classId: "class-1" },
      { ...baseRecords[2], scores: { 数学: 80 }, classId: "class-1" },
    ], ["数学"], settings);

    expect(records.map((record) => record.gradeRank)).toEqual([1, 1, 3]);
    expect(records.map((record) => record.classRank)).toEqual([1, 1, 3]);
  });

  it("rejects assignment bands with percentile gaps", () => {
    expect(() => validateAssignmentRules([
      { label: "A", percentileFrom: 0, percentileTo: 20, assignedMin: 80, assignedMax: 100 },
      { label: "B", percentileFrom: 30, percentileTo: 100, assignedMin: 60, assignedMax: 79 },
    ])).toThrow("首尾相接");
  });

  it("rejects unsupported formulas in custom templates", () => {
    const settings = buildDefaultGradeSettings(["数学"], ["class-1"]);
    const custom = settings.templates.find((item) => item.kind === "customTable")!;
    custom.columns = [{ id: "unsafe", name: "非法列", formula: '=process("x")' }];

    expect(() => normalizeGradeSettings(
      settings,
      ["数学"],
      ["class-1"],
      [],
    )).toThrow("不支持函数");
  });
});
