import { describe, expect, it } from "vitest";
import type { GradeExamSettings } from "../types/index.js";
import {
  buildDefaultGradeSettings,
  calculateGradeRecords,
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
  it("builds elective assignment and configurable report defaults", () => {
    const settings = buildDefaultGradeSettings(
      ["数学", "化学"],
      ["class-1", "class-2"],
      [{ id: "teacher-chemistry", name: "化学教师", subject: "化学" }],
    );

    expect(settings.assignmentRules.化学).toHaveLength(5);
    expect(settings.assignmentRules.数学).toBeUndefined();
    expect(settings.subjectTeacherIds.化学).toEqual(["teacher-chemistry"]);
    expect(settings.classSubjects).toHaveLength(2);
    expect(settings.templates.map((item) => item.kind)).toContain("classAverage");
    expect(settings.templates.find((item) => item.kind === "customTable")?.columns?.length).toBeGreaterThan(0);
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
