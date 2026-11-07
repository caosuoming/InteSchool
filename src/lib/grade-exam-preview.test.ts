import { describe, expect, it } from "vitest";
import type { GradeExam, GradeImportContext } from "../types/index.js";
import { buildDefaultGradeSettings, calculateGradeRecords } from "./grade-statistics.js";
import { previewGradeExam } from "./grade-exam-preview.js";

describe("grade exam preview", () => {
  it("recalculates totals and subject ranks from draft settings without mutating saved exam", () => {
    const subjects = ["数学", "化学"];
    const settings = buildDefaultGradeSettings(subjects, ["c1", "c2"]);
    settings.assignmentRules = {};
    const records = calculateGradeRecords([
      { id: "r1", studentId: "s1", studentName: "甲", studentNo: "1",
        classId: "c1", className: "1班", scores: { 数学: 100, 化学: 90 } },
      { id: "r2", studentId: "s2", studentName: "乙", studentNo: "2",
        classId: "c2", className: "2班", scores: { 数学: 110, 化学: 60 } },
    ], subjects, settings);
    const exam: GradeExam = {
      id: "exam", schoolId: "school", teacherId: "teacher", cohortKey: "grade", cohortLabel: "高三",
      name: "期中", sourceFileName: "期中.xlsx", sourceSheetName: "Sheet1", subjects, records, settings,
      createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z",
    };
    const context: GradeImportContext = {
      cohort: { key: "grade", label: "高三", grade: "高三", classIds: ["c1", "c2"], studentCount: 2 },
      classes: ["c1", "c2"].map((id) => ({
        id, name: id, type: "school" as const, schoolId: "school", grade: "高三",
        studentCount: 1, createdBy: "teacher", createdAt: "2026-01-01T00:00:00Z",
      })),
      students: [], teachers: [],
    };
    const draft = structuredClone(settings);
    draft.classSubjects[0].statisticSubjects = ["数学"];
    const preview = previewGradeExam(exam, draft, context);
    expect(exam.records[0].rawTotal).toBe(190);
    expect(exam.records[0].gradeRank).toBe(1);
    const first = preview.records.find((record) => record.studentId === "s1")!;
    const second = preview.records.find((record) => record.studentId === "s2")!;
    expect(first.rawTotal).toBe(100);
    expect(first.subjectRanks?.化学).toBeNull();
    expect(first.gradeRank).toBe(2);
    expect(second.gradeRank).toBe(1);
    expect(preview.settings.classSubjects[0].statisticSubjects).toEqual(["数学"]);
    expect(exam.settings.classSubjects[0].statisticSubjects).toEqual(subjects);
  });
});
