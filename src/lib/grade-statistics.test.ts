import { describe, expect, it } from "vitest";
import type { GradeExamSettings } from "../types/index.js";
import {
  buildDefaultGradeSettings,
  calculateGradeRecords,
  inferClassSubjectAvailability,
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
  it("infers complete score subjects for each class", () => {
    const availability = inferClassSubjectAvailability([
      { classId: "class-1", scores: { 数学: 100, 化学: 90 } },
      { classId: "class-1", scores: { 数学: 80, 化学: null } },
      { classId: "class-2", scores: { 数学: 70, 化学: 60 } },
      {
        classId: "class-3",
        scores: { 数学: 88, 化学: null },
        assignedScores: { 数学: 88, 化学: 92 },
      },
    ], ["数学", "化学"], {
      "class-1": 2,
      "class-2": 2,
      "class-3": 1,
    });

    expect(availability).toEqual({
      "class-1": ["数学"],
      "class-2": [],
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

  it("ranks non-unified subjects inside each class and keeps them out of that class total", () => {
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
    expect(firstClassTop.rawTotal).toBe(100);
    expect(secondClassTop.rawTotal).toBe(80);
    expect(firstClassTop.assignedScores.化学).toBe(100);
    expect(secondClassTop.assignedScores.化学).toBe(100);
    expect(firstClassTop.subjectRanks?.化学).toBe(1);
    expect(firstClassSecond.subjectRanks?.化学).toBe(2);
    expect(firstClassTop.subjectRankScopes?.化学).toBe("class");
    expect(secondClassTop.subjectRanks?.化学).toBe(1);
    expect(secondClassSecond.subjectRanks?.化学).toBe(2);
    expect(secondClassTop.subjectRankScopes?.化学).toBe("cohort");
  });

  it("migrates legacy subject-wide teachers into every class", () => {
    const settings = normalizeGradeSettings({
      subjectTeacherIds: { 数学: ["teacher-math"] },
      assignmentRules: {},
      classSubjects: [],
      templates: [],
    }, ["数学"], ["class-1", "class-2"], ["teacher-math"]);

    expect(settings.classSubjectTeacherIds).toEqual({
      "class-1": { 数学: ["teacher-math"] },
      "class-2": { 数学: ["teacher-math"] },
    });
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
