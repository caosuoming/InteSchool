import { describe, expect, it } from "vitest";
import type { GradeImportContext, GradeImportRow } from "@/types";
import {
  applyGradeRowBatchResolution,
  createGradeStudentDraft,
  orderGradeImportRows,
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
  it("places unresolved rows first without changing order within each group", () => {
    const rows = [
      row("resolved-1", 2, { studentId: "student-1" }),
      row("unresolved-1", 3),
      row("resolved-2", 4, { createStudent: { name: "学生4", studentNo: "20264", classId: "class-1" } }),
      row("unresolved-2", 5, { createStudent: { name: "学生5", studentNo: "", classId: "class-1" } }),
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
