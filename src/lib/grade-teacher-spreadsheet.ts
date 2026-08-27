import type { GradeExamSettings, GradeImportContext } from "@/types";
import { normalizeClassName, normalizeGradeHeader } from "@/lib/grade-spreadsheet";

type CellValue = string | number | boolean | Date | null | undefined;

export interface GradeTeacherImportRow {
  className: string;
  homeroomTeacherNames?: string[];
  teacherNamesBySubject: Record<string, string[]>;
}

export interface GradeTeacherImportCell {
  classId: string;
  className: string;
  subject: string;
  importedNames: string[];
}

export interface GradeTeacherHomeroomImportCell {
  classId: string;
  className: string;
  importedNames: string[];
}

export interface GradeTeacherImportPlan {
  cells: GradeTeacherImportCell[];
  homeroomCells: GradeTeacherHomeroomImportCell[];
}

const CLASS_HEADERS = new Set(["班级", "班级名称", "行政班"].map(normalizeGradeHeader));
const HOMEROOM_HEADERS = new Set(["班主任", "班主任姓名"].map(normalizeGradeHeader));

function text(value: CellValue): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).trim();
}

function normalizeTeacherName(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("zh-CN");
}

function uniqueTeacherNames(values: string[]): string[] {
  const seen = new Set<string>();
  return values.flatMap((value) => {
    const trimmed = value.trim();
    const key = normalizeTeacherName(trimmed);
    if (!key || seen.has(key)) return [];
    seen.add(key);
    return [trimmed];
  });
}

export function parseGradeTeacherNames(value: string): string[] {
  return uniqueTeacherNames(value.split(/[、,，;；\n]+/)).slice(0, 10);
}

function teacherNamesForCell(
  settings: GradeExamSettings,
  context: GradeImportContext,
  classId: string,
  subject: string,
): string[] {
  const teacherById = new Map(context.teachers.map((teacher) => [teacher.id, teacher]));
  const teacherIds = settings.classSubjectTeacherIds?.[classId]?.[subject]
    ?? settings.subjectTeacherIds?.[subject]
    ?? [];
  const linkedNames = teacherIds.flatMap((teacherId) => {
    const name = teacherById.get(teacherId)?.name;
    return name ? [name] : [];
  });
  const manualNames = settings.classSubjectTeacherNames?.[classId]?.[subject] || [];
  return uniqueTeacherNames([...linkedNames, ...manualNames]);
}

function homeroomTeacherNames(
  settings: GradeExamSettings,
  context: GradeImportContext,
  classId: string,
): string[] {
  if (Object.prototype.hasOwnProperty.call(settings.classHomeroomTeacherNames || {}, classId)) {
    return uniqueTeacherNames(settings.classHomeroomTeacherNames?.[classId] || []);
  }
  return uniqueTeacherNames(context.teachers
    .filter((teacher) => teacher.homeroomClassIds?.includes(classId))
    .map((teacher) => teacher.name));
}

export function parseGradeTeacherTable(
  rows: CellValue[][],
  subjects: string[],
): GradeTeacherImportRow[] {
  const firstNonEmpty = rows.findIndex((row) => row.some((cell) => text(cell)));
  if (firstNonEmpty < 0) throw new Error("Excel 文件中没有数据");

  const headers = rows[firstNonEmpty].map((cell) => normalizeGradeHeader(text(cell)));
  const classColumn = headers.findIndex((header) => CLASS_HEADERS.has(header));
  if (classColumn < 0) throw new Error("模板缺少“班级”列");
  const homeroomColumn = headers.findIndex((header) => HOMEROOM_HEADERS.has(header));

  const subjectsByHeader = new Map(subjects.map((subject) => [normalizeGradeHeader(subject), subject]));
  const subjectColumns = headers.flatMap((header, columnIndex) => {
    const subject = subjectsByHeader.get(header);
    return subject ? [{ columnIndex, subject }] : [];
  });
  if (subjectColumns.length === 0) throw new Error("模板中没有当前年级的任课学科列");

  const seenClasses = new Set<string>();
  const parsed = rows.slice(firstNonEmpty + 1).flatMap((row, index) => {
    if (row.every((cell) => !text(cell))) return [];
    const className = text(row[classColumn]);
    if (!className) throw new Error(`第 ${firstNonEmpty + index + 2} 行缺少班级`);
    const classKey = normalizeClassName(className);
    if (seenClasses.has(classKey)) throw new Error(`班级“${className}”在模板中重复出现`);
    seenClasses.add(classKey);
    return [{
      className,
      homeroomTeacherNames: homeroomColumn >= 0
        ? parseGradeTeacherNames(text(row[homeroomColumn]))
        : undefined,
      teacherNamesBySubject: Object.fromEntries(subjectColumns.map(({ columnIndex, subject }) => [
        subject,
        parseGradeTeacherNames(text(row[columnIndex])),
      ])),
    } satisfies GradeTeacherImportRow];
  });
  if (parsed.length === 0) throw new Error("Excel 文件中没有班级任课教师数据");
  return parsed;
}

export async function readGradeTeacherFile(
  file: File,
  subjects: string[],
): Promise<GradeTeacherImportRow[]> {
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (!extension || !["xlsx", "xlsm"].includes(extension)) {
    throw new Error("请上传 .xlsx 或 .xlsm 文件");
  }
  if (file.size > 20 * 1024 * 1024) throw new Error("导入文件不能超过 20MB");
  const { default: readXlsxFile } = await import("read-excel-file/browser");
  const sheets = await readXlsxFile(file);
  if (sheets.length === 0) throw new Error("Excel 文件中没有工作表");
  return parseGradeTeacherTable(sheets[0].data as CellValue[][], subjects);
}

export async function downloadGradeTeacherTemplate(
  cohortLabel: string,
  subjects: string[],
  settings: GradeExamSettings,
  context: GradeImportContext,
): Promise<void> {
  const { default: writeXlsxFile } = await import("write-excel-file/browser");
  const border = { borderStyle: "thin" as const, borderColor: "#D5DBE5" };
  const header = (value: string) => ({
    value,
    type: String,
    fontWeight: "bold" as const,
    backgroundColor: "#F1F4F8",
    align: "center" as const,
    ...border,
  });
  const cell = (value: string) => ({ value, type: String, ...border });
  const classes = [...context.classes].sort((left, right) =>
    left.name.localeCompare(right.name, "zh-CN", { numeric: true, sensitivity: "base" }),
  );
  const rows = classes.map((classItem) => [
    classItem.name,
    context.classProfiles?.[classItem.id]?.classTypeName || "",
    homeroomTeacherNames(settings, context, classItem.id).join("、"),
    ...subjects.map((subject) => teacherNamesForCell(settings, context, classItem.id, subject).join("、")),
  ]);
  const safeName = cohortLabel.replace(/[\\/:*?"<>|]/g, "_");

  await writeXlsxFile([{
    sheet: "班级任课教师",
    data: [
      ["班级", "班型", "班主任", ...subjects].map(header),
      ...rows.map((row) => row.map(cell)),
    ],
    stickyRowsCount: 1,
    columns: [
      { width: 18 },
      { width: 16 },
      { width: 18 },
      ...subjects.map(() => ({ width: 18 })),
    ],
  }]).toFile(`${safeName}_班级任课教师模板.xlsx`);
}

export function buildGradeTeacherImportPlan(
  settings: GradeExamSettings,
  context: GradeImportContext,
  rows: GradeTeacherImportRow[],
): GradeTeacherImportPlan {
  const classesByName = new Map<string, GradeImportContext["classes"][number]>();
  context.classes.forEach((classItem) => {
    const key = normalizeClassName(classItem.name);
    if (classesByName.has(key)) throw new Error(`当前年级存在重名班级“${classItem.name}”，无法自动匹配`);
    classesByName.set(key, classItem);
  });

  const homeroomCells: GradeTeacherHomeroomImportCell[] = [];
  const cells = rows.flatMap((row) => {
    const classItem = classesByName.get(normalizeClassName(row.className));
    if (!classItem) throw new Error(`模板中的班级“${row.className}”不属于当前年级`);
    if (row.homeroomTeacherNames !== undefined) {
      homeroomCells.push({
        classId: classItem.id,
        className: classItem.name,
        importedNames: row.homeroomTeacherNames,
      });
    }
    return Object.entries(row.teacherNamesBySubject).map(([subject, importedNames]) => ({
      classId: classItem.id,
      className: classItem.name,
      subject,
      importedNames,
    } satisfies GradeTeacherImportCell));
  });
  return { cells, homeroomCells };
}

function resolveImportedTeacherAssignment(
  cell: GradeTeacherImportCell,
  settings: GradeExamSettings,
  context: GradeImportContext,
): { teacherIds: string[]; manualNames: string[] } {
  const importedByName = new Map(cell.importedNames.map((name) => [normalizeTeacherName(name), name]));
  const teacherById = new Map(context.teachers.map((teacher) => [teacher.id, teacher]));
  const existingIds = settings.classSubjectTeacherIds?.[cell.classId]?.[cell.subject]
    ?? settings.subjectTeacherIds?.[cell.subject]
    ?? [];
  const teacherIds: string[] = [];
  const resolvedNames = new Set<string>();

  existingIds.forEach((teacherId) => {
    const teacher = teacherById.get(teacherId);
    const key = teacher ? normalizeTeacherName(teacher.name) : "";
    if (!key || !importedByName.has(key)) return;
    teacherIds.push(teacherId);
    resolvedNames.add(key);
  });

  cell.importedNames.forEach((name) => {
    const key = normalizeTeacherName(name);
    if (resolvedNames.has(key)) return;
    const candidates = context.teachers.filter((teacher) => (
      teacher.subject === cell.subject
      && normalizeTeacherName(teacher.name) === key
    ));
    if (candidates.length === 1) {
      teacherIds.push(candidates[0].id);
      resolvedNames.add(key);
    }
  });

  return {
    teacherIds: [...new Set(teacherIds)],
    manualNames: cell.importedNames.filter((name) => !resolvedNames.has(normalizeTeacherName(name))),
  };
}

export function applyGradeTeacherImportPlan(
  settings: GradeExamSettings,
  context: GradeImportContext,
  subjects: string[],
  plan: GradeTeacherImportPlan,
): GradeExamSettings {
  const classSubjectTeacherIds: Record<string, Record<string, string[]>> = Object.fromEntries(
    context.classes.map((classItem) => [
      classItem.id,
      Object.fromEntries(subjects.map((subject) => [
        subject,
        [...(settings.classSubjectTeacherIds?.[classItem.id]?.[subject]
          ?? settings.subjectTeacherIds?.[subject]
          ?? [])],
      ])),
    ]),
  );
  const classSubjectTeacherNames: Record<string, Record<string, string[]>> = Object.fromEntries(
    context.classes.map((classItem) => [
      classItem.id,
      Object.fromEntries(subjects.map((subject) => [
        subject,
        [...(settings.classSubjectTeacherNames?.[classItem.id]?.[subject] || [])],
      ])),
    ]),
  );
  const classHomeroomTeacherNames: Record<string, string[]> = {
    ...(settings.classHomeroomTeacherNames || {}),
  };

  plan.homeroomCells.forEach((cell) => {
    classHomeroomTeacherNames[cell.classId] = [...cell.importedNames];
  });

  plan.cells.forEach((cell) => {
    const resolved = resolveImportedTeacherAssignment(cell, settings, context);
    classSubjectTeacherIds[cell.classId] = {
      ...classSubjectTeacherIds[cell.classId],
      [cell.subject]: resolved.teacherIds,
    };
    classSubjectTeacherNames[cell.classId] = {
      ...classSubjectTeacherNames[cell.classId],
      [cell.subject]: resolved.manualNames,
    };
  });

  const subjectTeacherIds = {
    ...settings.subjectTeacherIds,
    ...Object.fromEntries(subjects.map((subject) => [
      subject,
      [...new Set(Object.values(classSubjectTeacherIds).flatMap((classTeachers) => classTeachers[subject] || []))],
    ])),
  };

  return {
    ...settings,
    subjectTeacherIds,
    classSubjectTeacherIds,
    classSubjectTeacherNames,
    classHomeroomTeacherNames,
  };
}
