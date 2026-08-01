import { describe, expect, it } from "vitest";
import {
  detectGradeSheet,
  gradeSubjectScoreAvailability,
  normalizeClassName,
  parseGradeRows,
  validateGradeMappings,
  type GradeWorkbookSheet,
} from "./grade-spreadsheet.js";

const sheet: GradeWorkbookSheet = {
  name: "高三成绩",
  rows: [
    ["2026届高三第一次联考成绩"],
    ["班级", "姓名", "考号", "语文成绩", "数学", "化学原始分", "总分", "年级名次"],
    ["高三（1）班", "张三", "202601", 112, 128, 86, 326, 10],
    ["高三(1)班", "李四", "202602", 105, "缺考", 72, 177, 52],
  ],
};

const assignedSheet: GradeWorkbookSheet = {
  name: "赋分成绩",
  rows: [
    ["班级", "姓名", "考号", "班型", "科类", "化学", "化赋", "生赋", "政赋", "地赋"],
    ["高三(1)班", "王五", "202603", "强基班", "物化生", 72, 88, 91, 86, 87],
  ],
};

describe("grade spreadsheet detection", () => {
  it("finds a header below title rows and recognizes identity and subject columns", () => {
    const detection = detectGradeSheet(sheet);

    expect(detection.headerRowIndex).toBe(1);
    expect(detection.mappings.map((item) => item.role)).toEqual([
      "className",
      "studentName",
      "studentNo",
      "subject:语文",
      "subject:数学",
      "subject:化学",
      "ignore",
      "ignore",
    ]);
  });

  it("parses scores while preserving absent exams as null", () => {
    const detection = detectGradeSheet(sheet);
    const rows = parseGradeRows(sheet, detection.headerRowIndex, detection.mappings);

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      sourceName: "张三",
      sourceStudentNo: "202601",
      sourceClassName: "高三（1）班",
      scores: { 语文: 112, 数学: 128, 化学: 86 },
    });
    expect(rows[1].scores.数学).toBeNull();
  });

  it("rejects duplicate field mappings", () => {
    const detection = detectGradeSheet(sheet);
    const duplicate = detection.mappings.map((item, index) => index === 4
      ? { ...item, role: "subject:语文" as const }
      : item);

    expect(() => validateGradeMappings(duplicate)).toThrow("不能重复映射");
  });

  it("normalizes common Chinese class-name variants", () => {
    expect(normalizeClassName("高三（一）班")).toBe(normalizeClassName("高三(1)班"));
  });

  it("recognizes selection, class type, and imported assigned scores", () => {
    const detection = detectGradeSheet(assignedSheet);

    expect(detection.mappings.map((item) => item.role)).toEqual([
      "className",
      "studentName",
      "studentNo",
      "classType",
      "subjectSelection",
      "subject:化学",
      "assignedSubject:化学",
      "assignedSubject:生物",
      "assignedSubject:政治",
      "assignedSubject:地理",
    ]);
    expect(gradeSubjectScoreAvailability(detection.mappings)).toEqual([
      { subject: "化学", hasRaw: true, hasAssigned: true },
      { subject: "生物", hasRaw: false, hasAssigned: true },
      { subject: "政治", hasRaw: false, hasAssigned: true },
      { subject: "地理", hasRaw: false, hasAssigned: true },
    ]);

    expect(parseGradeRows(assignedSheet, 0, detection.mappings)[0]).toMatchObject({
      sourceName: "王五",
      classType: "强基班",
      subjectSelection: "物化生",
      scores: { 化学: 72 },
      assignedScores: { 化学: 88, 生物: 91, 政治: 86, 地理: 87 },
    });
  });
});
