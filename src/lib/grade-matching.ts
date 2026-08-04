import type { GradeImportContext, GradeImportRow, Student } from "../types/index.js";
import { normalizeClassName } from "./grade-spreadsheet.js";

export type GradeRowBatchResolution = "create" | "clear";

function normalizeName(value: string): string {
  return value.trim().replace(/\s+/g, "").toLowerCase();
}

function classIdForSourceName(sourceClassName: string, context: GradeImportContext): string | undefined {
  const normalized = normalizeClassName(sourceClassName);
  if (!normalized) return undefined;
  const exact = context.classes.filter((item) => normalizeClassName(item.name) === normalized);
  if (exact.length === 1) return exact[0].id;
  const contained = context.classes.filter((item) => {
    const candidate = normalizeClassName(item.name);
    return candidate.includes(normalized) || normalized.includes(candidate);
  });
  return contained.length === 1 ? contained[0].id : undefined;
}

export function createGradeStudentDraft(
  row: GradeImportRow,
  context: GradeImportContext,
): NonNullable<GradeImportRow["createStudent"]> {
  return {
    name: row.sourceName,
    studentNo: row.sourceStudentNo,
    classId: classIdForSourceName(row.sourceClassName, context) || context.classes[0]?.id || "",
  };
}

function uniqueStudent(candidates: Student[]): Student | undefined {
  return candidates.length === 1 ? candidates[0] : undefined;
}

export function autoMatchGradeRows(
  rows: GradeImportRow[],
  context: GradeImportContext,
): GradeImportRow[] {
  const claimed = new Set<string>();
  return rows.map((row) => {
    const normalizedNo = row.sourceStudentNo.trim();
    const normalizedName = normalizeName(row.sourceName);
    const classId = classIdForSourceName(row.sourceClassName, context);
    let matched: Student | undefined;

    if (normalizedNo) {
      matched = uniqueStudent(context.students.filter((student) =>
        student.studentNo.trim() === normalizedNo && !claimed.has(student.id),
      ));
    }
    if (!matched && classId) {
      matched = uniqueStudent(context.students.filter((student) =>
        student.classId === classId
        && normalizeName(student.name) === normalizedName
        && !claimed.has(student.id),
      ));
    }
    if (!matched) {
      matched = uniqueStudent(context.students.filter((student) =>
        normalizeName(student.name) === normalizedName && !claimed.has(student.id),
      ));
    }

    if (matched) {
      claimed.add(matched.id);
      return {
        ...row,
        studentId: matched.id,
        updateStudentName: normalizeName(matched.name) !== normalizedName,
      };
    }
    return { ...row };
  });
}

export function gradeRowResolutionError(row: GradeImportRow): string | null {
  if (row.studentId && row.createStudent) return "只能选择匹配已有学生或新增学生中的一种";
  if (row.studentId) return null;
  if (!row.createStudent) return "尚未匹配学生";
  if (!row.createStudent.name.trim()) return "新增学生姓名不能为空";
  if (!row.createStudent.studentNo.trim()) return "新增学生学号不能为空";
  if (!row.createStudent.classId) return "请选择新增学生所属班级";
  return null;
}

export function orderGradeImportRows(rows: GradeImportRow[]): GradeImportRow[] {
  return rows
    .map((row, index) => ({ row, index, unresolved: Boolean(gradeRowResolutionError(row)) }))
    .sort((left, right) => Number(right.unresolved) - Number(left.unresolved) || left.index - right.index)
    .map(({ row }) => row);
}

export function applyGradeRowBatchResolution(
  rows: GradeImportRow[],
  rowKeys: ReadonlySet<string>,
  resolution: GradeRowBatchResolution,
  context: GradeImportContext,
): GradeImportRow[] {
  if (rowKeys.size === 0) return rows;
  return rows.map((row) => {
    if (!rowKeys.has(row.rowKey)) return row;
    if (resolution === "clear") {
      return {
        ...row,
        studentId: undefined,
        createStudent: undefined,
        updateStudentName: false,
      };
    }
    return {
      ...row,
      studentId: undefined,
      updateStudentName: false,
      createStudent: createGradeStudentDraft(row, context),
    };
  });
}
