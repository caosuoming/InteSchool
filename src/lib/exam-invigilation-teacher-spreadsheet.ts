import type { ExamInvigilationTeacher } from "@/types";

type CellValue = string | number | boolean | Date | null | undefined;

export interface ExamInvigilationTeacherImportRow {
  cohortLabel: string;
  subject: string;
  name: string;
  isPrepLeader: boolean;
  isLeader: boolean;
}

export interface ExamInvigilationTeacherMergeResult {
  teachers: ExamInvigilationTeacher[];
  addedCount: number;
  mergedCount: number;
}

export const INVIGILATION_TEACHER_TEMPLATE_HEADERS = [
  "年级",
  "学科",
  "姓名",
  "备课组长",
  "领导",
] as const;

const HEADER_ALIASES = {
  cohortLabel: ["年级", "年级名称"],
  subject: ["学科", "科目", "任教学科"],
  name: ["姓名", "教师姓名", "老师姓名"],
  isPrepLeader: ["备课组长", "是否备课组长"],
  isLeader: ["领导", "是否领导", "年级领导", "学校领导"],
} as const;

function text(value: CellValue): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).trim();
}

function normalizeHeader(value: string): string {
  return value.replace(/\s+/g, "").replace(/[＊*]+$/, "");
}

function normalizeValue(value: string): string {
  return value.trim().replace(/\s+/g, "").toLocaleLowerCase("zh-CN");
}

function findColumn(headers: string[], aliases: readonly string[]): number {
  const normalizedAliases = new Set(aliases.map(normalizeHeader));
  const index = headers.findIndex((header) => normalizedAliases.has(normalizeHeader(header)));
  if (index < 0) throw new Error(`模板缺少“${aliases[0]}”列`);
  return index;
}

function parseBooleanMarker(value: string, columnName: string, rowNumber: number): boolean {
  const normalized = normalizeValue(value);
  if (!normalized || ["否", "false", "0", "no", "n", "×", "✕"].includes(normalized)) return false;
  if (["是", "true", "1", "yes", "y", "√", "✓", "备课组长", "领导"].includes(normalized)) return true;
  throw new Error(`第 ${rowNumber} 行“${columnName}”请填写“是”或“否”`);
}

export function parseInvigilationTeacherTable(
  rows: CellValue[][],
  expectedCohortLabel: string,
  subjects: string[],
): ExamInvigilationTeacherImportRow[] {
  const firstNonEmpty = rows.findIndex((row) => row.some((cell) => text(cell)));
  if (firstNonEmpty < 0) throw new Error("Excel 文件中没有数据");

  const headers = rows[firstNonEmpty].map((cell) => text(cell));
  const cohortColumn = findColumn(headers, HEADER_ALIASES.cohortLabel);
  const subjectColumn = findColumn(headers, HEADER_ALIASES.subject);
  const nameColumn = findColumn(headers, HEADER_ALIASES.name);
  const prepLeaderColumn = findColumn(headers, HEADER_ALIASES.isPrepLeader);
  const leaderColumn = findColumn(headers, HEADER_ALIASES.isLeader);
  const expectedCohort = normalizeValue(expectedCohortLabel);
  const subjectsByName = new Map(subjects.map((subject) => [normalizeValue(subject), subject]));
  const parsedByTeacher = new Map<string, ExamInvigilationTeacherImportRow>();

  rows.slice(firstNonEmpty + 1).forEach((row, index) => {
    const rowNumber = firstNonEmpty + index + 2;
    if (row.every((cell) => !text(cell))) return;

    const cohortLabel = text(row[cohortColumn]);
    const subjectText = text(row[subjectColumn]);
    const name = text(row[nameColumn]);
    const prepLeaderText = text(row[prepLeaderColumn]);
    const leaderText = text(row[leaderColumn]);

    // 下载的模板会为当前考试学科预留空行；未填写姓名的空行不参与导入。
    if (!name && cohortLabel && subjectText && !prepLeaderText && !leaderText) return;
    if (!cohortLabel || !subjectText || !name) {
      throw new Error(`第 ${rowNumber} 行缺少年级、学科或姓名`);
    }
    if (normalizeValue(cohortLabel) !== expectedCohort) {
      throw new Error(`第 ${rowNumber} 行年级“${cohortLabel}”与当前年级“${expectedCohortLabel}”不一致`);
    }
    const isPrepLeader = parseBooleanMarker(prepLeaderText, "备课组长", rowNumber);
    const isLeader = parseBooleanMarker(leaderText, "领导", rowNumber);
    const subject = subjectsByName.get(normalizeValue(subjectText)) || subjectText;

    const imported = {
      cohortLabel: expectedCohortLabel,
      subject,
      name,
      isPrepLeader,
      isLeader,
    } satisfies ExamInvigilationTeacherImportRow;
    const key = `${normalizeValue(subject)}\u0000${normalizeValue(name)}`;
    const existing = parsedByTeacher.get(key);
    if (existing) {
      existing.isPrepLeader ||= imported.isPrepLeader;
      existing.isLeader ||= imported.isLeader;
    } else {
      parsedByTeacher.set(key, imported);
    }
  });

  const parsed = [...parsedByTeacher.values()];
  if (parsed.length === 0) throw new Error("Excel 文件中没有可导入的监考教师");
  return parsed;
}

export async function readInvigilationTeacherFile(
  file: File,
  expectedCohortLabel: string,
  subjects: string[],
): Promise<ExamInvigilationTeacherImportRow[]> {
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (!extension || !["xlsx", "xlsm"].includes(extension)) {
    throw new Error("请上传 .xlsx 或 .xlsm 文件");
  }
  if (file.size > 20 * 1024 * 1024) throw new Error("导入文件不能超过 20MB");
  const { default: readXlsxFile } = await import("read-excel-file/browser");
  const sheets = await readXlsxFile(file);
  if (sheets.length === 0) throw new Error("Excel 文件中没有工作表");
  return parseInvigilationTeacherTable(sheets[0].data as CellValue[][], expectedCohortLabel, subjects);
}

export async function downloadInvigilationTeacherTemplate(
  cohortLabel: string,
  subjects: string[],
  teachers: ExamInvigilationTeacher[],
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
  const subjectsWithTeachers = new Set(teachers.map((teacher) => teacher.subject));
  const dataRows = [
    ...teachers.map((teacher) => [
      cohortLabel,
      teacher.subject,
      teacher.name,
      teacher.isPrepLeader ? "是" : "否",
      teacher.isLeader ? "是" : "否",
    ]),
    ...subjects.filter((subject) => !subjectsWithTeachers.has(subject)).map((subject) => [
      cohortLabel,
      subject,
      "",
      "",
      "",
    ]),
  ];
  const safeName = cohortLabel.replace(/[\\/:*?"<>|]/g, "_");

  await writeXlsxFile([{
    sheet: "监考教师",
    data: [
      INVIGILATION_TEACHER_TEMPLATE_HEADERS.map(header),
      ...dataRows.map((row) => row.map(cell)),
    ],
    stickyRowsCount: 1,
    columns: [
      { width: 20 },
      { width: 14 },
      { width: 18 },
      { width: 16 },
      { width: 14 },
    ],
  }]).toFile(`${safeName}_监考教师导入模板.xlsx`);
}

export function mergeInvigilationTeachers(
  existingTeachers: ExamInvigilationTeacher[],
  importedRows: ExamInvigilationTeacherImportRow[],
  createId: () => string,
): ExamInvigilationTeacherMergeResult {
  const teachers = existingTeachers.map((teacher) => ({ ...teacher }));
  const indexByKey = new Map(teachers.map((teacher, index) => [
    `${normalizeValue(teacher.subject)}\u0000${normalizeValue(teacher.name)}`,
    index,
  ]));
  let addedCount = 0;
  let mergedCount = 0;

  importedRows.forEach((row) => {
    const key = `${normalizeValue(row.subject)}\u0000${normalizeValue(row.name)}`;
    const existingIndex = indexByKey.get(key);
    if (existingIndex !== undefined) {
      const teacher = teachers[existingIndex];
      const nextPrepLeader = Boolean(teacher.isPrepLeader || row.isPrepLeader);
      const nextLeader = Boolean(teacher.isLeader || row.isLeader);
      if (nextPrepLeader !== Boolean(teacher.isPrepLeader) || nextLeader !== Boolean(teacher.isLeader)) {
        teacher.isPrepLeader = nextPrepLeader;
        teacher.isLeader = nextLeader;
        mergedCount += 1;
      }
      return;
    }

    const teacher: ExamInvigilationTeacher = {
      id: createId(),
      subject: row.subject,
      name: row.name,
      isPrepLeader: row.isPrepLeader,
      isLeader: row.isLeader,
    };
    indexByKey.set(key, teachers.length);
    teachers.push(teacher);
    addedCount += 1;
  });

  return { teachers, addedCount, mergedCount };
}
