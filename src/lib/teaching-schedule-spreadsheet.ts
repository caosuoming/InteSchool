import type {
  ExamArrangementContext,
  TeachingScheduleConfig,
  TeachingScheduleSubjectConfig,
  TeachingScheduleTeacherAssignment,
} from "@/types";

export type TeachingScheduleSpreadsheetCell = string | number | boolean | Date | null | undefined;

export interface TeachingScheduleSpreadsheetImport {
  subjects: TeachingScheduleSubjectConfig[];
  assignments: TeachingScheduleTeacherAssignment[];
}

const META_HEADERS = new Set(["年级", "班级", "年级组长", "班主任", "合计"]);

function text(value: TeachingScheduleSpreadsheetCell): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).trim();
}

function normalized(value: string): string {
  return value.trim().replace(/\s+/g, "").toLocaleLowerCase("zh-CN");
}

function safeNumber(value: TeachingScheduleSpreadsheetCell): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number(text(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function parseTeachingScheduleTable(
  rows: TeachingScheduleSpreadsheetCell[][],
  context: ExamArrangementContext,
): TeachingScheduleSpreadsheetImport {
  const headerIndex = rows.findIndex((row) => row.some((cell) => normalized(text(cell)) === "班级"));
  if (headerIndex < 0) throw new Error("模板缺少“班级”表头");
  const headers = rows[headerIndex].map((cell) => text(cell));
  const classColumn = headers.findIndex((header) => normalized(header) === "班级");
  const subjectColumns = headers.flatMap((header, index) => {
    const name = header.trim();
    if (!name || META_HEADERS.has(name)) return [];
    return [{ index, subject: name }];
  });
  if (subjectColumns.length === 0) throw new Error("模板中没有学科列");

  const classByName = new Map(context.classes.map((item) => [normalized(item.name), item]));
  const standardRow = rows.slice(headerIndex + 1).find((row) => normalized(text(row[classColumn])) === "标准");
  const subjects = subjectColumns.map(({ index, subject }) => ({
    subject,
    weeklyPeriods: Math.max(0, Math.min(35, Math.round(standardRow ? safeNumber(standardRow[index]) : 0))),
  }));
  const assignments: TeachingScheduleTeacherAssignment[] = [];
  const seen = new Set<string>();

  rows.slice(headerIndex + 1).forEach((row, offset) => {
    const className = text(row[classColumn]);
    if (!className || normalized(className) === "标准") return;
    const classItem = classByName.get(normalized(className));
    if (!classItem) {
      if (row.some((cell) => text(cell))) {
        throw new Error(`第 ${headerIndex + offset + 2} 行班级“${className}”不属于当前年级`);
      }
      return;
    }
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
        subject,
        teacherName,
        ...(rosterMatch ? { teacherId: rosterMatch.id } : {}),
      });
    }
  });

  return { subjects, assignments };
}

export async function readTeachingScheduleFile(
  file: File,
  context: ExamArrangementContext,
): Promise<TeachingScheduleSpreadsheetImport> {
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (!extension || !["xlsx", "xlsm"].includes(extension)) throw new Error("请上传 .xlsx 或 .xlsm 文件");
  if (file.size > 20 * 1024 * 1024) throw new Error("导入文件不能超过 20MB");
  const { default: readXlsxFile } = await import("read-excel-file/browser");
  const sheets = await readXlsxFile(file);
  if (sheets.length === 0) throw new Error("Excel 文件中没有工作表");
  return parseTeachingScheduleTable(sheets[0].data as TeachingScheduleSpreadsheetCell[][], context);
}

export async function downloadTeachingScheduleTemplate(
  context: ExamArrangementContext,
  config: TeachingScheduleConfig,
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
  const headerRow = ["年级", "班级", "年级组长", "班主任", ...subjects, "合计"];
  const standardValues = config.subjects.map((item) => Math.max(0, Math.round(item.weeklyPeriods)));
  const standardRow = [
    stringCell(context.cohort.label),
    stringCell("标准"),
    stringCell(gradeLeaders),
    stringCell(""),
    ...standardValues.map(numberCell),
    numberCell(standardValues.reduce((sum, value) => sum + value, 0)),
  ];
  const classRows = context.classes.map((classItem) => {
    const subjectCells = subjects.map((subject) => stringCell(assignmentsByCell.get(`${classItem.id}\u0000${subject}`) || ""));
    return [
      stringCell(context.cohort.label),
      stringCell(classItem.name),
      stringCell(gradeLeaders),
      stringCell(homeroomByClass.get(classItem.id) || ""),
      ...subjectCells,
      stringCell(""),
    ];
  });
  const safeName = context.cohort.label.replace(/[\\/:*?"<>|]/g, "_");

  await writeXlsxFile([{
    sheet: "教师分工表",
    data: [headerRow.map(header), standardRow, ...classRows],
    stickyRowsCount: 1,
    columns: headerRow.map((_, index) => ({ width: index < 4 ? 16 : 12 })),
  }]).toFile(`${safeName}_教师分工表模板.xlsx`);
}
