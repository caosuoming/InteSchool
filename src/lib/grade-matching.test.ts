import { describe, expect, it } from "vitest";
import type { GradeImportContext, GradeImportRow } from "@/types";
import {
  applyGradeRowBatchResolution,
  autoMatchGradeRows,
  createGradeStudentDraft,
  gradeRowResolutionError,
  orderGradeImportRows,
  unclaimedGradeStudents,
} from "./grade-matching";

function row(
  rowKey: string,
  sourceRowNumber: number,
  overrides: Partial<GradeImportRow> = {},
): GradeImportRow {
  return {
    rowKey,
    sourceRowNumber,
    sourceName: `学生${sourceRowNumber}`,
    sourceStudentNo: `2026${sourceRowNumber}`,
    sourceClassName: "高一（1）班",
    scores: { 数学: 100 },
    ...overrides,
  };
}

const context = {
  cohort: { key: "2029", label: "2029届", classIds: ["class-1", "class-2"] },
  classes: [
    { id: "class-1", name: "高一1班" },
    { id: "class-2", name: "高一2班" },
  ],
  students: [],
  teachers: [],
} as GradeImportContext;

describe("grade matching batch helpers", () => {
  it("returns only roster students not claimed by imported rows", () => {
    const students = [
      { id: "student-1", name: "甲", studentNo: "001", classId: "class-1" },
      { id: "student-2", name: "乙", studentNo: "002", classId: "class-1" },
      { id: "student-3", name: "丙", studentNo: "003", classId: "class-2" },
    ] as GradeImportContext["students"];

    expect(unclaimedGradeStudents([
      row("matched", 2, { studentId: "student-2" }),
      row("new", 3, { createStudent: { name: "新生", studentNo: "004", classId: "class-1" } }),
      row("unresolved", 4),
    ], students).map((student) => student.id)).toEqual(["student-1", "student-3"]);
  });

  it("keeps automatic matching unique while using roster indexes", () => {
    const indexedContext = {
      ...context,
      students: [
        { id: "student-1", name: "张三", studentNo: "001", classId: "class-1" },
        { id: "student-2", name: "李四", studentNo: "002", classId: "class-1" },
      ],
    } as GradeImportContext;

    const result = autoMatchGradeRows([
      row("first", 2, { sourceName: "张三", sourceStudentNo: "001" }),
      row("duplicate", 3, { sourceName: "张三", sourceStudentNo: "001" }),
      row("second", 4, { sourceName: "李四", sourceStudentNo: "" }),
    ], indexedContext);

    expect(result.map((item) => item.studentId)).toEqual(["student-1", undefined, "student-2"]);
  });

  it("places unresolved rows first without changing order within each group", () => {
    const rows = [
      row("resolved-1", 2, { studentId: "student-1" }),
      row("unresolved-1", 3),
      row("resolved-2", 4, { createStudent: { name: "学生4", studentNo: "20264", classId: "class-1" } }),
      row("unresolved-2", 5, { createStudent: { name: "学生5", studentNo: "", classId: "" } }),
    ];

    expect(orderGradeImportRows(rows).map((item) => item.rowKey)).toEqual([
      "unresolved-1",
      "unresolved-2",
      "resolved-1",
      "resolved-2",
    ]);
    expect(rows.map((item) => item.rowKey)).toEqual([
      "resolved-1",
      "unresolved-1",
      "resolved-2",
      "unresolved-2",
    ]);
  });

  it("builds a new-student draft from the imported row and inferred class", () => {
    expect(createGradeStudentDraft(row("row-1", 2), context)).toEqual({
      name: "学生2",
      studentNo: "20262",
      classId: "class-1",
    });
  });

  it("treats a new student without a student number as resolved", () => {
    const pending = row("row-blank-no", 2, { sourceStudentNo: "" });
    const resolved = applyGradeRowBatchResolution(
      [pending],
      new Set([pending.rowKey]),
      "create",
      context,
    )[0];

    expect(resolved.createStudent).toEqual({
      name: "学生2",
      studentNo: "",
      classId: "class-1",
    });
    expect(gradeRowResolutionError(resolved)).toBeNull();
  });

  it("applies new-student handling only to selected rows", () => {
    const rows = [
      row("selected", 2, { studentId: "student-1", updateStudentName: true }),
      row("untouched", 3, { studentId: "student-2" }),
    ];

    const result = applyGradeRowBatchResolution(rows, new Set(["selected"]), "create", context);

    expect(result[0]).toMatchObject({
      rowKey: "selected",
      studentId: undefined,
      updateStudentName: false,
      createStudent: { name: "学生2", studentNo: "20262", classId: "class-1" },
    });
    expect(result[1]).toBe(rows[1]);
  });

  it("clears matching decisions only for selected rows", () => {
    const rows = [
      row("selected", 2, {
        createStudent: { name: "学生2", studentNo: "20262", classId: "class-1" },
      }),
      row("untouched", 3, { studentId: "student-2" }),
    ];

    const result = applyGradeRowBatchResolution(rows, new Set(["selected"]), "clear", context);

    expect(result[0]).toMatchObject({
      rowKey: "selected",
      studentId: undefined,
      createStudent: undefined,
      updateStudentName: false,
    });
    expect(result[1]).toBe(rows[1]);
  });
});
