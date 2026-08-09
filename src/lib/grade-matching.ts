import type { GradeImportContext, GradeImportRow, Student } from "../types/index.js";
import { normalizeClassName } from "./grade-spreadsheet.js";

export type GradeRowBatchResolution = "create" | "clear";
export type GradeImportSortKey =
  | "sourceRowNumber"
  | "sourceClassName"
  | "sourceName"
  | "sourceStudentNo"
  | "subjectSelection"
  | "classType"
  | "status";
export type GradeImportSortDirection = "asc" | "desc";

const gradeImportCollator = new Intl.Collator("zh-CN", {
  numeric: true,
  sensitivity: "base",
});

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

interface GradeMatchCandidates {
  normalizedNo: string;
  normalizedName: string;
  classId?: string;
  byStudentNo: Student[];
  byClassAndName: Student[];
  byName: Student[];
}

function gradeMatchCandidates(
  row: GradeImportRow,
  context: GradeImportContext,
  excludedStudentIds: ReadonlySet<string> = new Set(),
): GradeMatchCandidates {
  const normalizedNo = row.sourceStudentNo.trim();
  const normalizedName = normalizeName(row.sourceName);
  const classId = classIdForSourceName(row.sourceClassName, context);
  const availableStudents = context.students.filter((student) => !excludedStudentIds.has(student.id));
  return {
    normalizedNo,
    normalizedName,
    classId,
    byStudentNo: normalizedNo
      ? availableStudents.filter((student) => student.studentNo.trim() === normalizedNo)
      : [],
    byClassAndName: classId && normalizedName
      ? availableStudents.filter((student) =>
          student.classId === classId && normalizeName(student.name) === normalizedName,
        )
      : [],
    byName: normalizedName
      ? availableStudents.filter((student) => normalizeName(student.name) === normalizedName)
      : [],
  };
}

function studentLabel(student: Student, context: GradeImportContext): string {
  const className = context.classes.find((item) => item.id === student.classId)?.name || "未分班";
  const studentNo = student.studentNo.trim() || "无学号";
  return `${className} · ${student.name} · ${studentNo}`;
}

function claimedByOtherRow(
  studentId: string,
  rowKey: string,
  rows: GradeImportRow[],
): GradeImportRow | undefined {
  return rows.find((item) => item.rowKey !== rowKey && item.studentId === studentId);
}

function unresolvedMatchIssue(
  row: GradeImportRow,
  rows: GradeImportRow[],
  context: GradeImportContext,
): string {
  const {
    normalizedNo,
    normalizedName,
    classId,
    byStudentNo,
    byClassAndName,
    byName,
  } = gradeMatchCandidates(row, context);

  if (normalizedNo) {
    if (byStudentNo.length > 1) {
      return `学号/考号“${normalizedNo}”在学生库中对应 ${byStudentNo.length} 名学生，无法自动确定`;
    }
    if (byStudentNo.length === 1) {
      const claimedRow = claimedByOtherRow(byStudentNo[0].id, row.rowKey, rows);
      if (claimedRow) {
        return `疑似重复成绩：与 Excel 第 ${claimedRow.sourceRowNumber} 行都指向学生库中的 ${studentLabel(byStudentNo[0], context)}`;
      }
      return `学生库中已找到 ${studentLabel(byStudentNo[0], context)}，请确认是否匹配该学生`;
    }
  }

  if (classId && normalizedName) {
    if (byClassAndName.length > 1) {
      return `班级和姓名“${row.sourceClassName} · ${row.sourceName}”在学生库中对应 ${byClassAndName.length} 人，无法自动确定`;
    }
    if (byClassAndName.length === 1) {
      const claimedRow = claimedByOtherRow(byClassAndName[0].id, row.rowKey, rows);
      if (claimedRow) {
        return `疑似重复成绩：与 Excel 第 ${claimedRow.sourceRowNumber} 行都指向学生库中的 ${studentLabel(byClassAndName[0], context)}`;
      }
      return `学生库中已找到 ${studentLabel(byClassAndName[0], context)}，请确认是否匹配该学生`;
    }
  }

  if (normalizedName) {
    if (byName.length > 1) {
      return `姓名“${row.sourceName}”在学生库中有 ${byName.length} 人，请结合班级或学号/考号确认`;
    }
    if (byName.length === 1) {
      const claimedRow = claimedByOtherRow(byName[0].id, row.rowKey, rows);
      if (claimedRow) {
        return `疑似重复成绩：与 Excel 第 ${claimedRow.sourceRowNumber} 行都指向学生库中的 ${studentLabel(byName[0], context)}`;
      }
      return `学生库中已找到 ${studentLabel(byName[0], context)}，请确认是否匹配该学生`;
    }
  }

  if (row.sourceClassName.trim() && !classId) {
    return `上传表格中的班级“${row.sourceClassName}”无法唯一对应当前年级班级`;
  }
  return "学生库中未找到可唯一匹配的学生，请手动匹配或作为新增学生导入";
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

export function gradeImportRowIssues(
  rows: GradeImportRow[],
  context: GradeImportContext,
): Map<string, string> {
  const issues = new Map<string, string>();

  const existingStudentRows = new Map<string, GradeImportRow[]>();
  const newStudentNoRows = new Map<string, GradeImportRow[]>();
  rows.forEach((row) => {
    if (row.studentId) {
      const group = existingStudentRows.get(row.studentId) || [];
      group.push(row);
      existingStudentRows.set(row.studentId, group);
    }
    const newStudentNo = row.createStudent?.studentNo.trim();
    if (newStudentNo) {
      const group = newStudentNoRows.get(newStudentNo) || [];
      group.push(row);
      newStudentNoRows.set(newStudentNo, group);
    }
  });

  existingStudentRows.forEach((group, studentId) => {
    if (group.length < 2) return;
    const student = context.students.find((item) => item.id === studentId);
    const label = student ? studentLabel(student, context) : "同一名学生库学生";
    group.forEach((row) => {
      const otherRows = group
        .filter((item) => item.rowKey !== row.rowKey)
        .map((item) => item.sourceRowNumber)
        .sort((left, right) => left - right)
        .join("、");
      issues.set(row.rowKey, `一名学生匹配了多行成绩：${label} 同时匹配 Excel 第 ${otherRows} 行`);
    });
  });

  newStudentNoRows.forEach((group, studentNo) => {
    if (group.length < 2) return;
    group.forEach((row) => {
      const otherRows = group
        .filter((item) => item.rowKey !== row.rowKey)
        .map((item) => item.sourceRowNumber)
        .sort((left, right) => left - right)
        .join("、");
      issues.set(row.rowKey, `新增学生学号“${studentNo}”与 Excel 第 ${otherRows} 行重复`);
    });
  });

  rows.forEach((row) => {
    if (issues.has(row.rowKey)) return;
    const error = gradeRowResolutionError(row);
    if (!error) return;
    issues.set(
      row.rowKey,
      error === "尚未匹配学生" ? unresolvedMatchIssue(row, rows, context) : error,
    );
  });

  return issues;
}

export function orderGradeImportRows(
  rows: GradeImportRow[],
  issues?: ReadonlyMap<string, string>,
): GradeImportRow[] {
  return rows
    .map((row, index) => ({
      row,
      index,
      unresolved: issues ? issues.has(row.rowKey) : Boolean(gradeRowResolutionError(row)),
    }))
    .sort((left, right) => Number(right.unresolved) - Number(left.unresolved) || left.index - right.index)
    .map(({ row }) => row);
}

function gradeImportSortValue(row: GradeImportRow, key: Exclude<GradeImportSortKey, "status">): string | number {
  if (key === "sourceRowNumber") return row.sourceRowNumber;
  if (key === "sourceClassName") return row.sourceClassName;
  if (key === "sourceName") return row.sourceName;
  if (key === "sourceStudentNo") return row.sourceStudentNo;
  if (key === "subjectSelection") return row.subjectSelection || "";
  return row.classType || "";
}

export function sortGradeImportRows(
  rows: GradeImportRow[],
  key: GradeImportSortKey,
  direction: GradeImportSortDirection,
  issues?: ReadonlyMap<string, string>,
): GradeImportRow[] {
  const directionFactor = direction === "asc" ? 1 : -1;
  return rows
    .map((row, index) => ({ row, index }))
    .sort((left, right) => {
      let compared = 0;
      if (key === "status") {
        const leftIssue = issues?.get(left.row.rowKey) || "";
        const rightIssue = issues?.get(right.row.rowKey) || "";
        compared = Number(Boolean(leftIssue)) - Number(Boolean(rightIssue));
        if (compared === 0) compared = gradeImportCollator.compare(leftIssue, rightIssue);
      } else {
        const leftValue = gradeImportSortValue(left.row, key);
        const rightValue = gradeImportSortValue(right.row, key);
        compared = typeof leftValue === "number" && typeof rightValue === "number"
          ? leftValue - rightValue
          : gradeImportCollator.compare(String(leftValue), String(rightValue));
      }
      return compared * directionFactor || left.index - right.index;
    })
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
