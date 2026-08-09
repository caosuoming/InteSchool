import { describe, expect, it } from "vitest";
import type { GradeImportContext, GradeImportRow } from "@/types";
import {
  applyGradeRowBatchResolution,
  autoMatchGradeRows,
  createGradeStudentDraft,
  gradeImportRowIssues,
  orderGradeImportRows,
  sortGradeImportRows,
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

const matchingContext = {
  ...context,
  students: [
    {
      id: "student-1",
      name: "张三",
      studentNo: "20260001",
      classId: "class-1",
    },
    {
      id: "student-2",
      name: "李四",
      studentNo: "20260002",
      classId: "class-2",
    },
  ],
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

  it("explains when two imported rows point to the same database student", () => {
    const imported = [
      row("row-1", 2, {
        sourceName: "张三",
        sourceStudentNo: "20260001",
        studentId: "student-1",
      }),
      row("row-2", 7, {
        sourceName: "张三",
        sourceStudentNo: "20260001",
        studentId: "student-1",
      }),
    ];

    const issues = gradeImportRowIssues(imported, matchingContext);

    expect(issues.get("row-1")).toContain("一名学生匹配了多行成绩");
    expect(issues.get("row-1")).toContain("Excel 第 7 行");
    expect(issues.get("row-2")).toContain("Excel 第 2 行");
    expect(issues.get("row-1")).toContain("高一1班 · 张三 · 20260001");
  });

  it("explains a duplicate row blocked by automatic matching", () => {
    const imported = autoMatchGradeRows([
      row("row-1", 2, {
        sourceName: "张三",
        sourceStudentNo: "20260001",
      }),
      row("row-2", 3, {
        sourceName: "张三",
        sourceStudentNo: "20260001",
      }),
    ], matchingContext);

    expect(imported[0].studentId).toBe("student-1");
    expect(imported[1].studentId).toBeUndefined();
    expect(gradeImportRowIssues(imported, matchingContext).get("row-2")).toContain(
      "疑似重复成绩：与 Excel 第 2 行都指向学生库中的",
    );
  });

  it("sorts imported source fields in both directions", () => {
    const imported = [
      row("row-10", 10, { sourceName: "王五", sourceClassName: "高一10班" }),
      row("row-2", 2, { sourceName: "李四", sourceClassName: "高一2班" }),
      row("row-3", 3, { sourceName: "张三", sourceClassName: "高一1班" }),
    ];

    expect(sortGradeImportRows(imported, "sourceClassName", "asc").map((item) => item.rowKey)).toEqual([
      "row-3",
      "row-2",
      "row-10",
    ]);
    expect(sortGradeImportRows(imported, "sourceRowNumber", "desc").map((item) => item.rowKey)).toEqual([
      "row-10",
      "row-3",
      "row-2",
    ]);
  });

  it("sorts rows by validation status", () => {
    const imported = [
      row("ok", 2, { studentId: "student-1" }),
      row("bad", 3),
    ];
    const issues = new Map([["bad", "尚未匹配"]]);

    expect(sortGradeImportRows(imported, "status", "desc", issues).map((item) => item.rowKey)).toEqual([
      "bad",
      "ok",
    ]);
  });
});
