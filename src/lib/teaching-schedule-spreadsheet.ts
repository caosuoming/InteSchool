import type {
  TeachingScheduleConfig,
  TeachingScheduleContext,
  TeachingScheduleSemester,
  TeachingScheduleSubjectConfig,
  TeachingScheduleTeacherAssignment,
} from "@/types";
import { teachingScheduleWeeklyPeriods } from "@/lib/teaching-schedule";

export type TeachingScheduleSpreadsheetCell = string | number | boolean | Date | null | undefined;

export interface TeachingScheduleSpreadsheetImport {
  subjects: TeachingScheduleSubjectConfig[];
  assignments: TeachingScheduleTeacherAssignment[];
}

export interface TeachingScheduleTemplateOptions {
  schoolName: string;
  schoolYear: string;
  semester: TeachingScheduleSemester;
}

export interface TeachingScheduleMergedRange {
  startRow: number;
  endRow: number;
  startColumn: number;
  endColumn: number;
}

const GRADE_HEADERS = new Set(["年级", "年段"]);
const CLASS_HEADERS = new Set(["班级", "班级名称", "行政班", "教学班"]);
const META_HEADERS = new Set([
  ...GRADE_HEADERS,
  ...CLASS_HEADERS,
  "年级组长",
  "年级主任",
  "年级负责人",
  "班主任",
  "班主任姓名",
  "合计",
  "总计",
  "备注",
]);

function text(value: TeachingScheduleSpreadsheetCell): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).trim();
}

function normalized(value: string): string {
  return value.trim().replace(/\s+/g, "").toLocaleLowerCase("zh-CN");
}

function normalizedClassName(value: string): string {
  return normalized(value)
    .replace(/[（）()【】_[\]-]/g, "")
    .replace(/[—–]/g, "")
    .replace(/班$/, "");
}

function safeNumber(value: TeachingScheduleSpreadsheetCell): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number(text(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

function columnIndex(value: string): number {
  let result = 0;
  for (const char of value.toUpperCase()) result = result * 26 + char.charCodeAt(0) - 64;
  return result - 1;
}

function parseCellAddress(value: string): { row: number; column: number } | null {
  const match = /^([A-Z]+)(\d+)$/i.exec(value);
  if (!match) return null;
  return { row: Number(match[2]) - 1, column: columnIndex(match[1]) };
}

export function fillTeachingScheduleMergedCells(
  rows: TeachingScheduleSpreadsheetCell[][],
  ranges: TeachingScheduleMergedRange[],
): TeachingScheduleSpreadsheetCell[][] {
  const result = rows.map((row) => [...row]);
  for (const range of ranges) {
    const source = result[range.startRow]?.[range.startColumn];
    if (source === undefined || source === null) continue;
    for (let row = range.startRow; row <= range.endRow; row += 1) {
      result[row] ||= [];
      for (let column = range.startColumn; column <= range.endColumn; column += 1) {
        result[row][column] = source;
      }
    }
  }
  return result;
}

function decodeXmlAttribute(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

async function readFirstSheetMergedRanges(file: File): Promise<TeachingScheduleMergedRange[]> {
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const workbookXml = await zip.file("xl/workbook.xml")?.async("text");
  const relationshipsXml = await zip.file("xl/_rels/workbook.xml.rels")?.async("text");
  if (!workbookXml || !relationshipsXml) return [];

  const firstSheet = /<sheet\b[^>]*\br:id=["']([^"']+)["'][^>]*\/?\s*>/i.exec(workbookXml);
  if (!firstSheet) return [];
  const relationshipPattern = /<Relationship\b([^>]*)\/?\s*>/gi;
  let target = "";
  for (const match of relationshipsXml.matchAll(relationshipPattern)) {
    const attributes = match[1];
    const id = /\bId=["']([^"']+)["']/i.exec(attributes)?.[1];
    if (id !== firstSheet[1]) continue;
    target = decodeXmlAttribute(/\bTarget=["']([^"']+)["']/i.exec(attributes)?.[1] || "");
    break;
  }
  if (!target) return [];
  const path = target.startsWith("/")
    ? target.slice(1)
    : target.startsWith("xl/") ? target : `xl/${target.replace(/^\.\//, "")}`;
  const sheetXml = await zip.file(path)?.async("text");
  if (!sheetXml) return [];

  const ranges: TeachingScheduleMergedRange[] = [];
  for (const match of sheetXml.matchAll(/<mergeCell\b[^>]*\bref=["']([^"']+)["'][^>]*\/?\s*>/gi)) {
    const [fromValue, toValue = fromValue] = match[1].split(":");
    const from = parseCellAddress(fromValue);
    const to = parseCellAddress(toValue);
    if (!from || !to) continue;
    ranges.push({
      startRow: Math.min(from.row, to.row),
      endRow: Math.max(from.row, to.row),
      startColumn: Math.min(from.column, to.column),
      endColumn: Math.max(from.column, to.column),
    });
  }
  return ranges;
}

function matchingCohort(value: string, context: TeachingScheduleContext) {
  if (!value) return undefined;
  const candidate = normalized(value);
  return context.cohorts.find((cohort) => (
    [cohort.grade, cohort.label, cohort.key].some((item) => item && normalized(item) === candidate)
  ));
}

export function parseTeachingScheduleTable(
  rows: TeachingScheduleSpreadsheetCell[][],
  context: TeachingScheduleContext,
): TeachingScheduleSpreadsheetImport {
  const headerIndex = rows.findIndex((row) => row.some((cell) => CLASS_HEADERS.has(normalized(text(cell)))));
  if (headerIndex < 0) throw new Error("模板缺少“班级”表头");
  const headers = rows[headerIndex].map((cell) => text(cell));
  const gradeColumn = headers.findIndex((header) => GRADE_HEADERS.has(normalized(header)));
  const classColumn = headers.findIndex((header) => CLASS_HEADERS.has(normalized(header)));
  const subjectColumns = headers.flatMap((header, index) => {
    const name = header.trim();
    if (!name || META_HEADERS.has(normalized(name))) return [];
    return [{ index, subject: name }];
  });
  if (classColumn < 0) throw new Error("模板缺少“班级”表头");
  if (subjectColumns.length === 0) throw new Error("模板中没有学科列");

  const classesByName = new Map<string, typeof context.classes>();
  for (const classItem of context.classes) {
    const key = normalizedClassName(classItem.name);
    classesByName.set(key, [...(classesByName.get(key) || []), classItem]);
  }
  const subjectMap = new Map(subjectColumns.map(({ subject }) => [subject, {
    subject,
    weeklyPeriods: 0,
    weeklyPeriodsByCohort: Object.fromEntries(context.cohorts.map((cohort) => [cohort.key, 0])),
  } satisfies TeachingScheduleSubjectConfig]));
  const assignments: TeachingScheduleTeacherAssignment[] = [];
  const seen = new Set<string>();
  let inheritedGrade = "";

  rows.slice(headerIndex + 1).forEach((row, offset) => {
    const rowNumber = headerIndex + offset + 2;
    const className = text(row[classColumn]);
    if (!className) return;
    const rowGrade = gradeColumn >= 0 ? text(row[gradeColumn]) : "";
    if (rowGrade) inheritedGrade = rowGrade;
    const explicitGrade = rowGrade || (gradeColumn >= 0 ? inheritedGrade : "");
    let cohort = matchingCohort(explicitGrade, context);

    if (normalized(className) === "标准") {
      if (!cohort && context.cohorts.length === 1) cohort = context.cohorts[0];
      if (!cohort) {
        if (explicitGrade) throw new Error(`第 ${rowNumber} 行年级“${explicitGrade}”不属于当前学校`);
        throw new Error(`第 ${rowNumber} 行“标准”缺少可识别的年级`);
      }
      for (const { index, subject } of subjectColumns) {
        const target = subjectMap.get(subject)!;
        target.weeklyPeriodsByCohort![cohort.key] = Math.max(0, Math.min(35, Math.round(safeNumber(row[index]))));
      }
      return;
    }

    const candidates = classesByName.get(normalizedClassName(className)) || [];
    if (!cohort && explicitGrade) throw new Error(`第 ${rowNumber} 行年级“${explicitGrade}”不属于当前学校`);
    if (!cohort && candidates.length === 1) {
      const cohortKey = context.classCohortKeys[candidates[0].id];
      cohort = context.cohorts.find((item) => item.key === cohortKey);
    }
    if (!cohort && candidates.length > 1) {
      throw new Error(`第 ${rowNumber} 行班级“${className}”在多个年级中同名，请在模板中保留年级列`);
    }
    const classItem = candidates.find((item) => !cohort || context.classCohortKeys[item.id] === cohort.key);
    if (!classItem) {
      if (row.some((cell) => text(cell))) throw new Error(`第 ${rowNumber} 行班级“${className}”不属于当前学校`);
      return;
    }
    const cohortKey = context.classCohortKeys[classItem.id];
    for (const { index, subject } of subjectColumns) {
      const teacherName = text(row[index]);
      if (!teacherName) continue;
      const key = `${classItem.id}\u0000${subject}`;
      if (seen.has(key)) throw new Error(`班级“${classItem.name}”的“${subject}”任课教师重复`);
      seen.add(key);
      const rosterMatch = (context.teachers || []).find((teacher) => (
        normalized(teacher.name) === normalized(teacherName) && teacher.subject === subject
      ));
      assignments.push({
        id: `import:${classItem.id}:${subject}:${normalized(teacherName)}`,
        classId: classItem.id,
        ...(cohortKey ? { cohortKey } : {}),
        subject,
        teacherName,
        ...(rosterMatch ? { teacherId: rosterMatch.id } : {}),
      });
    }
  });

  const subjects = [...subjectMap.values()].map((item) => ({
    ...item,
    weeklyPeriods: context.cohorts.map((cohort) => item.weeklyPeriodsByCohort?.[cohort.key] || 0).find((value) => value > 0) || 0,
  }));
  return { subjects, assignments };
}

export async function readTeachingScheduleFile(
  file: File,
  context: TeachingScheduleContext,
): Promise<TeachingScheduleSpreadsheetImport> {
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (!extension || !["xlsx", "xlsm"].includes(extension)) throw new Error("请上传 .xlsx 或 .xlsm 文件");
  if (file.size > 20 * 1024 * 1024) throw new Error("导入文件不能超过 20MB");
  const [{ default: readXlsxFile }, mergedRanges] = await Promise.all([
    import("read-excel-file/browser"),
    readFirstSheetMergedRanges(file),
  ]);
  const sheets = await readXlsxFile(file);
  if (sheets.length === 0) throw new Error("Excel 文件中没有工作表");
  const rows = fillTeachingScheduleMergedCells(
    sheets[0].data as TeachingScheduleSpreadsheetCell[][],
    mergedRanges,
  );
  return parseTeachingScheduleTable(rows, context);
}

function safeFileName(value: string): string {
  return value.replace(/[\\/:*?"<>|]/g, "_").trim() || "学校";
}

export async function downloadTeachingScheduleTemplate(
  context: TeachingScheduleContext,
  config: TeachingScheduleConfig,
  options: TeachingScheduleTemplateOptions,
): Promise<void> {
  const { default: writeXlsxFile } = await import("write-excel-file/browser");
  const border = { borderStyle: "thin" as const, borderColor: "#8A98A8" };
  const header = (value: string) => ({
    value,
    type: String,
    fontWeight: "bold" as const,
    backgroundColor: "#EAF0F2",
    align: "center" as const,
    wrap: true,
    ...border,
  });
  const stringCell = (value: string) => ({ value, type: String, align: "center" as const, wrap: true, ...border });
  const numberCell = (value: number) => ({ value, type: Number, align: "center" as const, ...border });
  const subjects = config.subjects.map((item) => item.subject);
  const headerRow = ["年级", "班级", "年级组长", "班主任", ...subjects, "合计"];
  const assignmentsByCell = new Map(config.assignments.map((item) => [
    `${item.classId}\u0000${item.subject}`,
    item.teacherName,
  ]));
  const homeroomByClass = new Map<string, string>();
  for (const teacher of context.teachers || []) {
    for (const classId of teacher.homeroomClassIds || []) {
      if (!homeroomByClass.has(classId)) homeroomByClass.set(classId, teacher.name);
    }
  }
  const gradeLeaders = (context.teachers || [])
    .filter((teacher) => teacher.roles?.includes("gradeLeader"))
    .map((teacher) => teacher.name)
    .join("、");
  const dataRows = context.cohorts.flatMap((cohort) => {
    const classes = context.classes.filter((classItem) => context.classCohortKeys[classItem.id] === cohort.key);
    const standardValues = subjects.map((subject) => teachingScheduleWeeklyPeriods(config, subject, cohort.key));
    const gradeCell = {
      ...stringCell(cohort.grade || cohort.label),
      rowSpan: classes.length + 1,
    };
    const standardRow = [
      gradeCell,
      stringCell("标准"),
      stringCell(gradeLeaders),
      stringCell(""),
      ...standardValues.map(numberCell),
      numberCell(standardValues.reduce((sum, value) => sum + value, 0)),
    ];
    const classRows = classes.map((classItem) => [
      null,
      stringCell(classItem.name),
      stringCell(gradeLeaders),
      stringCell(homeroomByClass.get(classItem.id) || ""),
      ...subjects.map((subject) => stringCell(assignmentsByCell.get(`${classItem.id}\u0000${subject}`) || "")),
      stringCell(""),
    ]);
    return [standardRow, ...classRows];
  });
  const title = `${options.schoolName}${options.schoolYear}学年${options.semester}教师分工表`;
  const titleRow = [
    {
      value: title,
      type: String,
      fontWeight: "bold" as const,
      align: "center" as const,
      columnSpan: headerRow.length,
    },
    ...Array.from({ length: headerRow.length - 1 }, () => null),
  ];

  await writeXlsxFile([{
    sheet: "教师分工表",
    data: [titleRow, headerRow.map(header), ...dataRows],
    stickyRowsCount: 2,
    columns: headerRow.map((_, index) => ({ width: index < 4 ? 16 : 12 })),
  }]).toFile(`${safeFileName(options.schoolName)}-${options.schoolYear}学年${options.semester}-教师分工表模板.xlsx`);
}
