import type { StudentRosterImportRow } from "@/types";

type CellValue = string | number | boolean | Date | null | undefined;

const HEADER_ALIASES = {
  className: ["班级", "学生班级", "班级名称"],
  name: ["姓名", "学生姓名"],
  studentNo: ["学号", "学生学号", "学籍号"],
  subjectSelection: ["选科", "选科组合", "科目组合", "科类", "选考科目"],
  isExternal: ["借读生", "是否借读", "借读"],
  gender: ["性别"],
  guardian1Name: ["家长1姓名", "家长一姓名", "监护人1姓名", "监护人一姓名"],
  guardian1Phone: ["家长1电话", "家长一电话", "监护人1电话", "监护人一电话", "家长1手机号"],
  guardian2Name: ["家长2姓名", "家长二姓名", "监护人2姓名", "监护人二姓名"],
  guardian2Phone: ["家长2电话", "家长二电话", "监护人2电话", "监护人二电话", "家长2手机号"],
} as const;

export const STUDENT_ROSTER_TEMPLATE_HEADERS = [
  "班级*",
  "姓名*",
  "学号",
  "选科",
  "借读生",
  "性别",
  "家长1姓名",
  "家长1电话",
  "家长2姓名",
  "家长2电话",
] as const;

function text(value: CellValue): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).trim();
}

function findColumn(headers: string[], aliases: readonly string[], required: boolean): number {
  const index = headers.findIndex((header) => aliases.includes(
    header.replace(/\s+/g, "").replace(/[＊*]+$/, ""),
  ));
  if (required && index < 0) throw new Error(`模板缺少“${aliases[0]}”列`);
  return index;
}

function normalizeClassName(value: string): string {
  return /^\d+$/.test(value) ? `${value}班` : value;
}

function parseExternal(value: string): boolean {
  return ["是", "有", "借读", "true", "yes", "1"].includes(value.trim().toLowerCase());
}

function parseGender(value: string): "male" | "female" | undefined {
  const normalized = value.trim().toLowerCase();
  if (["男", "male", "m"].includes(normalized)) return "male";
  if (["女", "female", "f"].includes(normalized)) return "female";
  return undefined;
}

export function parseStudentRosterTable(rows: CellValue[][]): StudentRosterImportRow[] {
  const firstNonEmpty = rows.findIndex((row) => row.some((cell) => text(cell)));
  if (firstNonEmpty < 0) throw new Error("Excel 文件中没有数据");
  const headers = rows[firstNonEmpty].map(text);
  const classColumn = findColumn(headers, HEADER_ALIASES.className, true);
  const nameColumn = findColumn(headers, HEADER_ALIASES.name, true);
  const studentNoColumn = findColumn(headers, HEADER_ALIASES.studentNo, false);
  const subjectSelectionColumn = findColumn(headers, HEADER_ALIASES.subjectSelection, false);
  const externalColumn = findColumn(headers, HEADER_ALIASES.isExternal, false);
  const genderColumn = findColumn(headers, HEADER_ALIASES.gender, false);
  const guardian1NameColumn = findColumn(headers, HEADER_ALIASES.guardian1Name, false);
  const guardian1PhoneColumn = findColumn(headers, HEADER_ALIASES.guardian1Phone, false);
  const guardian2NameColumn = findColumn(headers, HEADER_ALIASES.guardian2Name, false);
  const guardian2PhoneColumn = findColumn(headers, HEADER_ALIASES.guardian2Phone, false);

  const parsed = rows.slice(firstNonEmpty + 1).flatMap((row, index) => {
    if (row.every((cell) => !text(cell))) return [];
    const className = normalizeClassName(text(row[classColumn]));
    const name = text(row[nameColumn]);
    const studentNo = studentNoColumn >= 0 ? text(row[studentNoColumn]) : "";
    if (!className || !name) {
      throw new Error(`第 ${firstNonEmpty + index + 2} 行缺少班级或姓名`);
    }
    return [{
      className,
      name,
      studentNo,
      subjectSelection: subjectSelectionColumn >= 0
        ? text(row[subjectSelectionColumn]) || undefined
        : undefined,
      isExternal: externalColumn >= 0 ? parseExternal(text(row[externalColumn])) : false,
      gender: genderColumn >= 0 ? parseGender(text(row[genderColumn])) : undefined,
      guardian1Name: guardian1NameColumn >= 0 ? text(row[guardian1NameColumn]) || undefined : undefined,
      guardian1Phone: guardian1PhoneColumn >= 0 ? text(row[guardian1PhoneColumn]) || undefined : undefined,
      guardian2Name: guardian2NameColumn >= 0 ? text(row[guardian2NameColumn]) || undefined : undefined,
      guardian2Phone: guardian2PhoneColumn >= 0 ? text(row[guardian2PhoneColumn]) || undefined : undefined,
    } satisfies StudentRosterImportRow];
  });
  if (parsed.length === 0) throw new Error("Excel 文件中没有学生数据");
  return parsed;
}

export async function readStudentRosterFile(file: File): Promise<StudentRosterImportRow[]> {
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (!extension || !["xlsx", "xlsm"].includes(extension)) {
    throw new Error("请上传 .xlsx 或 .xlsm 文件");
  }
  if (file.size > 20 * 1024 * 1024) throw new Error("导入文件不能超过 20MB");
  const { default: readXlsxFile } = await import("read-excel-file/browser");
  const sheets = await readXlsxFile(file);
  if (sheets.length === 0) throw new Error("Excel 文件中没有工作表");
  return parseStudentRosterTable(sheets[0].data as CellValue[][]);
}

export async function downloadStudentRosterTemplate(gradeName: string): Promise<void> {
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
  await writeXlsxFile([{
    sheet: "学生导入模板",
    data: [
      STUDENT_ROSTER_TEMPLATE_HEADERS.map(header),
      ["1", "张三", "20260001", "物化生", "否", "男", "张父", "13800138000", "张母", "13900139000"].map(cell),
      ["17", "李四", "", "史政地", "是", "女", "", "", "", ""].map(cell),
    ],
    stickyRowsCount: 1,
    columns: [
      { width: 14 }, { width: 14 }, { width: 18 }, { width: 14 }, { width: 12 }, { width: 10 },
      { width: 14 }, { width: 18 }, { width: 14 }, { width: 18 },
    ],
  }]).toFile(`${gradeName.replace(/[\\/:*?"<>|]/g, "_")}_学生导入模板.xlsx`);
}
