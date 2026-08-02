import type { StudentRosterImportRow } from "@/types";

type CellValue = string | number | boolean | Date | null | undefined;

const HEADER_ALIASES = {
  className: ["班级", "学生班级", "班级名称"],
  name: ["姓名", "学生姓名"],
  studentNo: ["学号", "学生学号", "学籍号"],
  subjectSelection: ["选科", "选科组合", "科目组合", "科类", "选考科目"],
  isExternal: ["借读生", "是否借读", "借读"],
  gender: ["性别"],
} as const;

export const STUDENT_ROSTER_TEMPLATE_HEADERS = ["班级*", "姓名*", "学号", "选科", "借读生", "性别"] as const;

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
      ["1", "张三", "20260001", "物化生", "否", "男"].map(cell),
      ["17", "李四", "", "史政地", "是", "女"].map(cell),
    ],
    stickyRowsCount: 1,
    columns: [{ width: 14 }, { width: 14 }, { width: 18 }, { width: 14 }, { width: 12 }, { width: 10 }],
  }]).toFile(`${gradeName.replace(/[\\/:*?"<>|]/g, "_")}_学生导入模板.xlsx`);
}
