import type {
  GradeExam,
  GradeExamSettings,
  GradeImportContext,
  GradeImportRow,
  GradeStatisticsTemplate,
} from "../types/index.js";
import {
  buildGradeClassAverageReport,
  classAverageScoreCellValue,
  formatGradeClassRangeLabel,
  type GradeClassAverageReport,
} from "./grade-class-average.js";
import {
  buildGradeTotalScoreSegmentReport,
  type GradeTotalScoreSegmentReport,
} from "./grade-total-score-segment.js";
import {
  buildGradeTotalScoreRankingReport,
  type GradeTotalScoreRankingReport,
} from "./grade-total-score-ranking.js";
import {
  buildGradeSubjectScoreSegmentReport,
  type GradeSubjectScoreSegmentReport,
} from "./grade-subject-score-segment.js";
import {
  buildGradeElectiveScoreSegmentReport,
  type GradeElectiveScoreSegmentReport,
} from "./grade-elective-score-segment.js";
import type { GradeClassStatisticsReport } from "./grade-class-statistics.js";
import { buildGradeReportTable } from "./grade-reports.js";
import {
  ASSIGNABLE_GRADE_SUBJECTS,
  isAssignableGradeSubject,
} from "./grade-subjects.js";

export type GradeCellValue = string | number | null;
export type GradeColumnRole =
  | "ignore"
  | "className"
  | "studentName"
  | "studentNo"
  | "subjectSelection"
  | "classType"
  | `subject:${string}`
  | `assignedSubject:${string}`;

export interface GradeWorkbookSheet {
  name: string;
  rows: GradeCellValue[][];
}

export interface GradeWorkbookData {
  fileName: string;
  sheets: GradeWorkbookSheet[];
}

export interface GradeColumnMapping {
  columnIndex: number;
  header: string;
  role: GradeColumnRole;
  confidence: "high" | "medium" | "low";
}

export interface GradeSheetDetection {
  headerRowIndex: number;
  mappings: GradeColumnMapping[];
}

export interface GradeSubjectScoreAvailability {
  subject: string;
  hasRaw: boolean;
  hasAssigned: boolean;
}

const CLASS_ALIASES = new Set(["班级", "班别", "行政班", "教学班", "班"]);
const NAME_ALIASES = new Set(["姓名", "学生姓名", "考生姓名", "名字"]);
const STUDENT_NO_ALIASES = new Set(["学号", "学生学号", "考号", "准考证号", "学籍号", "考生号"]);
const SUBJECT_SELECTION_ALIASES = new Set(["选科", "科类", "选科组合", "科目组合", "选考科目"]);
const CLASS_TYPE_ALIASES = new Set(["班型", "班类", "班级类型", "班型类别"]);
const IGNORED_HEADERS = ["总分", "合计", "排名", "名次", "年级名次", "班级名次", "序号", "备注", "类别"];
const ASSIGNED_SUBJECT_SHORTHANDS: Record<string, string> = Object.fromEntries(
  ASSIGNABLE_GRADE_SUBJECTS.map((subject) => [`${subject[0]}赋`, subject]),
);

const SUBJECT_ALIASES: Record<string, string[]> = {
  语文: ["语文", "语文科"],
  数学: ["数学", "数学科"],
  英语: ["英语", "外语", "英语科"],
  物理: ["物理", "物理科"],
  化学: ["化学", "化学科"],
  生物: ["生物", "生物学", "生物科"],
  政治: ["政治", "思想政治", "道德与法治"],
  历史: ["历史", "历史科"],
  地理: ["地理", "地理科"],
  体育: ["体育", "体育与健康"],
  信息技术: ["信息技术", "信息"],
  通用技术: ["通用技术", "技术"],
  日语: ["日语"],
  俄语: ["俄语"],
  法语: ["法语"],
  德语: ["德语"],
  西班牙语: ["西班牙语"],
  音乐: ["音乐"],
  美术: ["美术"],
};

export const GRADE_SUBJECT_OPTIONS = Object.keys(SUBJECT_ALIASES);

function stringValue(value: GradeCellValue): string {
  return value === null ? "" : String(value).trim();
}

export function normalizeGradeHeader(value: GradeCellValue): string {
  return stringValue(value)
    .replace(/[\s\n\r]+/g, "")
    .replace(/[（）()【】]/g, "")
    .split("[").join("")
    .split("]").join("")
    .replace(/[:：]/g, "")
    .toLowerCase();
}

export function normalizeClassName(value: string): string {
  return value
    .trim()
    .replace(/[（【]/g, "(")
    .replace(/[）】]/g, ")")
    .replace(/\s+/g, "")
    .replace(/[一壹]/g, "1")
    .replace(/[二贰]/g, "2")
    .replace(/[三叁]/g, "3")
    .replace(/[四肆]/g, "4")
    .replace(/[五伍]/g, "5")
    .replace(/[六陆]/g, "6")
    .replace(/[七柒]/g, "7")
    .replace(/[八捌]/g, "8")
    .replace(/[九玖]/g, "9")
    .replace(/[零〇]/g, "0")
    .toLowerCase();
}

function normalizedSubjectHeader(header: GradeCellValue): string {
  return normalizeGradeHeader(header)
    .replace(/^(原始|卷面|最终|期中|期末|月考|联考)/, "")
    .replace(/(成绩|分数|得分|原始分|卷面分|赋分|等级分|标准分)$/g, "");
}

function subjectFromHeader(header: GradeCellValue): string | null {
  const normalized = normalizedSubjectHeader(header);
  for (const [subject, aliases] of Object.entries(SUBJECT_ALIASES)) {
    if (aliases.some((alias) => normalized === normalizeGradeHeader(alias))) return subject;
  }
  return null;
}

function assignedSubjectFromHeader(header: GradeCellValue): string | null {
  const normalized = normalizeGradeHeader(header);
  if (ASSIGNED_SUBJECT_SHORTHANDS[normalized]) return ASSIGNED_SUBJECT_SHORTHANDS[normalized];
  if (!/(赋分|等级分|标准分|赋)$/.test(normalized)) return null;
  const subject = subjectFromHeader(header);
  return subject && isAssignableGradeSubject(subject)
    ? subject
    : null;
}

function suggestedRole(header: GradeCellValue): Omit<GradeColumnMapping, "columnIndex" | "header"> {
  const normalized = normalizeGradeHeader(header);
  if (!normalized) return { role: "ignore", confidence: "low" };
  if (CLASS_ALIASES.has(normalized)) return { role: "className", confidence: "high" };
  if (NAME_ALIASES.has(normalized)) return { role: "studentName", confidence: "high" };
  if (STUDENT_NO_ALIASES.has(normalized)) return { role: "studentNo", confidence: "high" };
  if (SUBJECT_SELECTION_ALIASES.has(normalized)) return { role: "subjectSelection", confidence: "high" };
  if (CLASS_TYPE_ALIASES.has(normalized)) return { role: "classType", confidence: "high" };
  if (IGNORED_HEADERS.some((item) => normalized.includes(normalizeGradeHeader(item)))) {
    return { role: "ignore", confidence: "medium" };
  }
  const assignedSubject = assignedSubjectFromHeader(header);
  if (assignedSubject) return { role: `assignedSubject:${assignedSubject}`, confidence: "high" };
  const subject = subjectFromHeader(header);
  if (subject) return { role: `subject:${subject}`, confidence: "high" };
  return { role: "ignore", confidence: "low" };
}

function scoreHeaderRow(row: GradeCellValue[]): number {
  let score = 0;
  let hasName = false;
  let subjectCount = 0;
  row.forEach((cell) => {
    const suggestion = suggestedRole(cell);
    if (suggestion.role === "studentName") {
      hasName = true;
      score += 8;
    } else if (suggestion.role === "className") {
      score += 5;
    } else if (suggestion.role === "studentNo") {
      score += 5;
    } else if (suggestion.role.startsWith("subject:") || suggestion.role.startsWith("assignedSubject:")) {
      subjectCount += 1;
      score += 3;
    } else if (suggestion.role === "subjectSelection" || suggestion.role === "classType") {
      score += 2;
    }
  });
  if (!hasName) score -= 10;
  if (subjectCount === 0) score -= 8;
  return score;
}

export function detectGradeSheet(sheet: GradeWorkbookSheet): GradeSheetDetection {
  if (sheet.rows.length === 0) throw new Error("工作表为空");
  const limit = Math.min(sheet.rows.length, 30);
  let headerRowIndex = 0;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < limit; index += 1) {
    const score = scoreHeaderRow(sheet.rows[index] || []);
    if (score > bestScore) {
      bestScore = score;
      headerRowIndex = index;
    }
  }
  if (bestScore < 3) throw new Error("未识别到包含姓名和成绩科目的表头，请手动整理工作表后重试");

  const headerRow = sheet.rows[headerRowIndex] || [];
  const seenRoles = new Set<string>();
  const mappings = headerRow.map((cell, columnIndex) => {
    const header = stringValue(cell) || `第 ${columnIndex + 1} 列`;
    const suggestion = suggestedRole(cell);
    let role = suggestion.role;
    let confidence = suggestion.confidence;
    if (role !== "ignore" && seenRoles.has(role)) {
      role = "ignore";
      confidence = "low";
    }
    if (role !== "ignore") seenRoles.add(role);
    return { columnIndex, header, role, confidence } satisfies GradeColumnMapping;
  });
  return { headerRowIndex, mappings };
}

function parseScore(value: GradeCellValue): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const text = stringValue(value);
  if (!text || ["-", "--", "/", "缺考", "缺", "免考", "未考", "absent"].includes(text.toLowerCase())) {
    return null;
  }
  const normalized = text.replace(/,/g, "").replace(/分$/, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function validateGradeMappings(mappings: GradeColumnMapping[]): void {
  const activeRoles = mappings.map((item) => item.role).filter((role) => role !== "ignore");
  if (!activeRoles.includes("studentName")) throw new Error("请指定“姓名”字段");
  if (!activeRoles.includes("className")) throw new Error("请指定“班级”字段");
  const subjects = activeRoles.filter((role) =>
    role.startsWith("subject:") || role.startsWith("assignedSubject:"),
  );
  if (subjects.length === 0) throw new Error("请至少指定一个成绩科目");
  if (new Set(activeRoles).size !== activeRoles.length) throw new Error("同一字段或科目不能重复映射");
}

export function gradeSubjectScoreAvailability(
  mappings: GradeColumnMapping[],
): GradeSubjectScoreAvailability[] {
  const bySubject = new Map<string, GradeSubjectScoreAvailability>();
  mappings.forEach((mapping) => {
    const raw = mapping.role.startsWith("subject:");
    const assigned = mapping.role.startsWith("assignedSubject:");
    if (!raw && !assigned) return;
    const prefix = raw ? "subject:" : "assignedSubject:";
    const subject = mapping.role.slice(prefix.length);
    const current = bySubject.get(subject) || { subject, hasRaw: false, hasAssigned: false };
    if (raw) current.hasRaw = true;
    if (assigned) current.hasAssigned = true;
    bySubject.set(subject, current);
  });
  return [...bySubject.values()];
}

export function parseGradeRows(
  sheet: GradeWorkbookSheet,
  headerRowIndex: number,
  mappings: GradeColumnMapping[],
): GradeImportRow[] {
  validateGradeMappings(mappings);
  const roleColumn = new Map(mappings.map((item) => [item.role, item.columnIndex]));
  const subjectMappings = mappings.filter((item) => item.role.startsWith("subject:"));
  const assignedSubjectMappings = mappings.filter((item) => item.role.startsWith("assignedSubject:"));
  const rows: GradeImportRow[] = [];

  for (let index = headerRowIndex + 1; index < sheet.rows.length; index += 1) {
    const source = sheet.rows[index] || [];
    const sourceName = stringValue(source[roleColumn.get("studentName")!]);
    if (!sourceName) continue;
    const sourceClassName = stringValue(source[roleColumn.get("className")!]);
    const studentNoColumn = roleColumn.get("studentNo");
    const sourceStudentNo = studentNoColumn === undefined ? "" : stringValue(source[studentNoColumn]);
    const subjectSelectionColumn = roleColumn.get("subjectSelection");
    const classTypeColumn = roleColumn.get("classType");
    const scores = Object.fromEntries(subjectMappings.map((mapping) => [
      mapping.role.slice("subject:".length),
      parseScore(source[mapping.columnIndex]),
    ]));
    const assignedScores = Object.fromEntries(assignedSubjectMappings.map((mapping) => [
      mapping.role.slice("assignedSubject:".length),
      parseScore(source[mapping.columnIndex]),
    ]));
    rows.push({
      rowKey: `${sheet.name}:${index + 1}`,
      sourceRowNumber: index + 1,
      sourceName,
      sourceStudentNo,
      sourceClassName,
      subjectSelection: subjectSelectionColumn === undefined ? undefined : stringValue(source[subjectSelectionColumn]) || undefined,
      classType: classTypeColumn === undefined ? undefined : stringValue(source[classTypeColumn]) || undefined,
      scores,
      assignedScores: assignedSubjectMappings.length > 0 ? assignedScores : undefined,
    });
  }
  if (rows.length === 0) throw new Error("表头下方没有可导入的学生成绩");
  return rows;
}

function excelCellValue(value: unknown): GradeCellValue {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" || typeof value === "number") return value;
  if (typeof value === "boolean") return value ? "是" : "否";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value);
}

export async function readGradeWorkbook(file: File): Promise<GradeWorkbookData> {
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (!extension || !["xlsx", "xlsm"].includes(extension)) {
    throw new Error("暂不支持旧版 .xls 文件，请在 Excel/WPS 中另存为 .xlsx 后导入");
  }
  if (file.size > 20 * 1024 * 1024) throw new Error("成绩文件不能超过 20MB");
  const { default: readXlsxFile } = await import("read-excel-file/browser");
  const workbookSheets = await readXlsxFile(file);
  const sheets = workbookSheets.map((sheet) => ({
    name: sheet.sheet,
    rows: sheet.data
      .slice(0, 10000)
      .map((row) => row.slice(0, 100).map(excelCellValue)),
  }));
  if (sheets.length === 0) throw new Error("Excel 文件中没有工作表");
  return { fileName: file.name, sheets };
}

export async function exportGradeExam(exam: GradeExam): Promise<void> {
  const { default: writeXlsxFile } = await import("write-excel-file/browser");
  const border = { borderStyle: "thin" as const, borderColor: "#D5DBE5" };
  const header = (value: string) => ({
    value,
    fontWeight: "bold" as const,
    backgroundColor: "#F1F4F8",
    textColor: "#24324A",
    align: "center" as const,
    alignVertical: "center" as const,
    height: 24,
    ...border,
  });
  const valueCell = (value: string | number | null | undefined) => ({
    value: value ?? undefined,
    type: typeof value === "number" ? Number : String,
    align: typeof value === "number" ? "right" as const : "left" as const,
    alignVertical: "center" as const,
    height: 22,
    ...border,
  });

  const enabledTemplates = exam.settings.templates.filter((template) => template.enabled);
  if (enabledTemplates.length === 0) throw new Error("没有启用的成绩输出模板");

  const usedNames = new Set<string>();
  const safeSheetName = (name: string, index: number): string => {
    const base = name
      .replace(/[\\/:*?]/g, "_")
      .split("[").join("_")
      .split("]").join("_")
      .trim()
      .slice(0, 31) || `统计表${index + 1}`;
    let candidate = base;
    let suffix = 2;
    while (usedNames.has(candidate)) {
      const ending = `-${suffix}`;
      candidate = `${base.slice(0, 31 - ending.length)}${ending}`;
      suffix += 1;
    }
    usedNames.add(candidate);
    return candidate;
  };

  const sheets = enabledTemplates.map((template, index) => {
    const report = buildGradeReportTable(exam, template);
    if (report.headers.length === 0) throw new Error(`模板“${template.name}”没有输出列`);
    return {
      sheet: safeSheetName(template.name, index),
      data: [
        report.headers.map(header),
        ...report.rows.map((row) => row.map(valueCell)),
      ],
      stickyRowsCount: 1,
      columns: report.headers.map((_, columnIndex) => ({
        width: Math.max(8, Math.min(40, report.widths?.[columnIndex] || 14)),
      })),
    };
  });

  const safeName = exam.name.replace(/[\\/:*?"<>|]/g, "_");
  await writeXlsxFile(sheets).toFile(`${safeName}_成绩统计.xlsx`);
}

export async function exportGradeClassAverageReport(report: GradeClassAverageReport): Promise<void> {
  const { default: writeXlsxFile } = await import("write-excel-file/browser");
  const border = { borderStyle: "thin" as const, borderColor: "#9CA3AF" };
  const textCell = (value: string | number | null, options: Record<string, unknown> = {}) => ({
    value: value ?? undefined,
    type: typeof value === "number" ? Number : String,
    align: typeof value === "number" ? "right" as const : "center" as const,
    alignVertical: "center" as const,
    height: 22,
    ...border,
    ...options,
  });
  const rows: Array<Array<ReturnType<typeof textCell>>> = [];
  rows.push([
    textCell(report.title, { fontWeight: "bold", fontSize: 16, align: "left" }),
    ...Array.from({ length: report.subjects.length + 1 }, () => textCell(null)),
    textCell(report.reportDate.replace(/-/g, "."), { fontWeight: "bold" }),
  ]);
  rows.push(["类别", "班级", "班主任 / 人数", ...report.subjects, "总分平均"].map((value) => textCell(value, {
    fontWeight: "bold",
    backgroundColor: "#F3F4F6",
  })));

  report.groups.forEach((group) => {
    group.rows.forEach((row) => {
      if (report.options.showTeacherRows) {
        rows.push([
          textCell(group.category),
          textCell(row.classLabel),
          textCell(row.homeroomTeachers.join("、")),
          ...report.subjects.map((subject) => textCell(row.subjectTeachers[subject]?.join("、") || "")),
          textCell(null),
        ]);
      }
      rows.push([
        textCell(report.options.showTeacherRows ? "" : group.category),
        textCell(row.classLabel),
        textCell(`${row.studentCount} 人`),
        ...report.subjects.map((subject) => textCell(classAverageScoreCellValue(
          row.subjectAverages[subject],
          row.subjectScoreModes[subject],
        ))),
        textCell(classAverageScoreCellValue(
          row.totalAverages,
          report.options.totalScoreMode || "assigned",
        ), { fontWeight: "bold" }),
      ]);
    });
    if (group.rows.length > 1 && report.options.showGroupDifference) {
      rows.push([
        textCell(group.category),
        textCell("分差", { fontWeight: "bold" }),
        textCell(""),
        ...report.subjects.map((subject) => textCell(classAverageScoreCellValue(
          group.difference.subjectValues[subject],
          group.subjectScoreModes[subject],
        ))),
        textCell(classAverageScoreCellValue(
          group.difference.totalValues,
          report.options.totalScoreMode || "assigned",
        ), { fontWeight: "bold" }),
      ]);
    }
    if (group.rows.length > 1 && report.options.showGroupAverage) {
      rows.push([
        textCell(group.category),
        textCell(`平均（${formatGradeClassRangeLabel(group.rows.map((row) => row.classLabel))}）`, { fontWeight: "bold" }),
        textCell(""),
        ...report.subjects.map((subject) => textCell(classAverageScoreCellValue(
          group.average.subjectValues[subject],
          group.subjectScoreModes[subject],
        ), { fontWeight: "bold" })),
        textCell(classAverageScoreCellValue(
          group.average.totalValues,
          report.options.totalScoreMode || "assigned",
        ), { fontWeight: "bold" }),
      ]);
    }
  });
  if (report.options.showOverallAverage) {
    rows.push([
      textCell("全校平均", { fontWeight: "bold" }),
      textCell(""),
      textCell(""),
      ...report.subjects.map((subject) => textCell(classAverageScoreCellValue(
        report.overallAverage.subjectValues[subject],
        report.overallSubjectScoreModes[subject],
      ), { fontWeight: "bold" })),
      textCell(classAverageScoreCellValue(
        report.overallAverage.totalValues,
        report.options.totalScoreMode || "assigned",
      ), { fontWeight: "bold" }),
    ]);
  }

  const safeName = report.title.replace(/[\\/:*?"<>|]/g, "_") || "班级平均分统计表";
  await writeXlsxFile(rows, {
    columns: [
      { width: 16 },
      { width: 14 },
      { width: 18 },
      ...report.subjects.map(() => ({ width: 14 })),
      { width: 14 },
    ],
    stickyRowsCount: 2,
  }).toFile(`${safeName}.xlsx`);
}

export async function exportGradeTotalScoreSegmentReport(
  report: GradeTotalScoreSegmentReport,
): Promise<void> {
  const { default: writeXlsxFile } = await import("write-excel-file/browser");
  const border = { borderStyle: "thin" as const, borderColor: "#9CA3AF" };
  const cell = (value: string | number | null, options: Record<string, unknown> = {}) => ({
    value: value ?? undefined,
    type: typeof value === "number" ? Number : String,
    align: "center" as const,
    alignVertical: "center" as const,
    height: 22,
    ...border,
    ...options,
  });
  const rows: Array<Array<ReturnType<typeof cell>>> = [];
  rows.push([
    cell(report.title, { fontWeight: "bold", fontSize: 16, align: "left" }),
    ...Array.from({ length: Math.max(0, report.columns.length - 1) }, () => cell(null)),
    cell(report.reportDate.replace(/-/g, "."), { fontWeight: "bold" }),
  ]);
  rows.push([
    cell("总分分数段", { fontWeight: "bold", backgroundColor: "#F3F4F6" }),
    ...report.columns.map((column) => cell(column.label, {
      fontWeight: "bold",
      backgroundColor: "#F3F4F6",
    })),
  ]);
  report.rows.forEach((row) => {
    rows.push([
      cell(`${row.threshold}分以上`, { fontWeight: "bold" }),
      ...report.columns.map((column) => cell(row.counts[column.key] || null)),
    ]);
  });
  const standardSummary = (["science", "arts"] as const).map((track) => {
    const values = report.trackStandards[track];
    const trackLabel = track === "science" ? "理科标准" : "文科标准";
    const display = (value: number | null) => value === null ? "未设置" : `${value}分`;
    return `${trackLabel}：高分1 ${display(values.highScore1)} | 高分2 ${display(values.highScore2)} | 一本 ${display(values.firstTier)} | 二本 ${display(values.undergraduate)}`;
  }).join("    ");
  rows.push([
    cell(standardSummary, {
      fontWeight: "bold",
      backgroundColor: "#FFFBEB",
      columnSpan: report.columns.length + 1,
      height: 34,
      wrap: true,
    }),
    ...report.columns.map(() => cell(null)),
  ]);
  report.summaryRows.forEach((row) => {
    rows.push([
      cell(row.label, { fontWeight: "bold" }),
      ...report.columns.map((column) => {
        const value = row.values[column.key];
        return cell(row.kind === "count" && value === 0 ? null : value);
      }),
    ]);
  });

  const safeName = report.title.replace(/[\\/:*?"<>|]/g, "_") || "总分分数段汇总表";
  await writeXlsxFile(rows, {
    columns: [
      { width: 16 },
      ...report.columns.map(() => ({ width: 12 })),
    ],
    stickyRowsCount: 2,
  }).toFile(`${safeName}.xlsx`);
}

export async function exportGradeTotalScoreRankingReport(
  report: GradeTotalScoreRankingReport,
): Promise<void> {
  if (report.tables.length === 0) throw new Error("暂无可导出的总分排名");
  const { default: writeXlsxFile } = await import("write-excel-file/browser");
  const border = { borderStyle: "thin" as const, borderColor: "#9CA3AF" };
  const cell = (value: string | number | null, options: Record<string, unknown> = {}) => ({
    value: value ?? undefined,
    type: typeof value === "number" ? Number : String,
    align: "center" as const,
    alignVertical: "center" as const,
    height: 22,
    ...border,
    ...options,
  });
  const sheets = report.tables.map((table) => {
    const headers = ["名次", "学号", "姓名", "班级", ...report.subjects, `总分（${report.scoreModeLabel}）`];
    return {
      sheet: table.key === "science" ? "理科" : table.key === "arts" ? "文科" : "总分排名",
      data: [
        [
          cell(table.title, { fontWeight: "bold", fontSize: 16, align: "left" }),
          ...Array.from({ length: Math.max(0, headers.length - 2) }, () => cell(null)),
          cell(report.reportDate.replace(/-/g, "."), { fontWeight: "bold" }),
        ],
        headers.map((header) => cell(header, { fontWeight: "bold", backgroundColor: "#F3F4F6" })),
        ...table.rows.map((row) => [
          cell(row.rank),
          cell(row.studentNo),
          cell(row.studentName),
          cell(row.classLabel),
          ...report.subjects.map((subject) => cell(row.subjectScores[subject])),
          cell(row.score),
        ]),
      ],
      stickyRowsCount: 2,
      columns: [
        { width: 10 },
        { width: 16 },
        { width: 14 },
        { width: 14 },
        ...report.subjects.map(() => ({ width: 12 })),
        { width: 14 },
      ],
    };
  });
  const safeName = `${report.tables[0].title}${report.tables.length > 1 ? "等" : ""}`
    .replace(/[\\/:*?"<>|]/g, "_");
  await writeXlsxFile(sheets).toFile(`${safeName}.xlsx`);
}

export async function exportGradeSubjectScoreSegmentReport(
  report: GradeSubjectScoreSegmentReport,
): Promise<void> {
  if (report.subjects.length === 0) throw new Error("暂无可导出的单科分数段");
  const { default: writeXlsxFile } = await import("write-excel-file/browser");
  const border = { borderStyle: "thin" as const, borderColor: "#9CA3AF" };
  const cell = (value: string | number | null, options: Record<string, unknown> = {}) => ({
    value: value ?? undefined,
    type: typeof value === "number" ? Number : String,
    align: "center" as const,
    alignVertical: "center" as const,
    height: 22,
    ...border,
    ...options,
  });
  const sheets = report.subjects.map((subjectReport) => {
    const rows: Array<Array<ReturnType<typeof cell>>> = [
      [
        cell(subjectReport.title, { fontWeight: "bold", fontSize: 16, align: "left" }),
        ...Array.from({ length: subjectReport.thresholds.length + 1 }, () => cell(null)),
        cell(report.reportDate.replace(/-/g, "."), { fontWeight: "bold" }),
      ],
      [
        cell("班级", { fontWeight: "bold", backgroundColor: "#F3F4F6" }),
        cell(subjectReport.subject, { fontWeight: "bold", backgroundColor: "#F3F4F6" }),
        cell("实考人数", { fontWeight: "bold", backgroundColor: "#F3F4F6" }),
        ...subjectReport.thresholds.map((threshold) => cell(`${threshold}分以上`, {
          fontWeight: "bold",
          backgroundColor: "#F3F4F6",
        })),
      ],
      ...subjectReport.rows.map((row) => [
        cell(row.classLabel),
        cell(row.teacherNames.join("、") || null),
        cell(row.candidateCount || null),
        ...subjectReport.thresholds.map((threshold) => cell(row.counts[threshold] || null)),
      ]),
      [
        cell("累计", { fontWeight: "bold" }),
        cell(null),
        cell(subjectReport.totalCandidateCount || null, { fontWeight: "bold" }),
        ...subjectReport.thresholds.map((threshold) => cell(subjectReport.totalCounts[threshold] || null, { fontWeight: "bold" })),
      ],
      [
        cell("所占比例", { fontWeight: "bold" }),
        cell(null),
        cell(null),
        ...subjectReport.thresholds.map((threshold) => cell(
          subjectReport.totalCandidateCount > 0 ? subjectReport.totalRates[threshold] : null,
          { fontWeight: "bold" },
        )),
      ],
    ];
    return {
      sheet: subjectReport.subject,
      data: rows,
      stickyRowsCount: 2,
      columns: [
        { width: 12 },
        { width: 16 },
        { width: 12 },
        ...subjectReport.thresholds.map(() => ({ width: 12 })),
      ],
    };
  });
  const safeName = report.subjects[0].title
    .replace(report.subjects[0].subject, "各单科")
    .replace(/[\\/:*?"<>|]/g, "_");
  await writeXlsxFile(sheets).toFile(`${safeName}.xlsx`);
}

export async function exportGradeElectiveScoreSegmentReport(
  report: GradeElectiveScoreSegmentReport,
): Promise<void> {
  if (report.subjects.length === 0) throw new Error("暂无可导出的选修分数段");
  const { default: writeXlsxFile } = await import("write-excel-file/browser");
  const border = { borderStyle: "thin" as const, borderColor: "#9CA3AF" };
  const cell = (value: string | number | null, options: Record<string, unknown> = {}) => ({
    value: value ?? undefined,
    type: typeof value === "number" ? Number : String,
    align: "center" as const,
    alignVertical: "center" as const,
    height: 22,
    ...border,
    ...options,
  });
  const sheets = report.subjects.map((subjectReport) => {
    const columnCount = 3 + subjectReport.gradeLabels.length + subjectReport.thresholds.length;
    const rows: Array<Array<ReturnType<typeof cell>>> = [
      [
        cell(subjectReport.title, { fontWeight: "bold", fontSize: 16, align: "left" }),
        ...Array.from({ length: Math.max(0, columnCount - 2) }, () => cell(null)),
        cell(report.reportDate.replace(/-/g, "."), { fontWeight: "bold" }),
      ],
      [
        cell("班级", { fontWeight: "bold", backgroundColor: "#F3F4F6" }),
        cell("任课教师", { fontWeight: "bold", backgroundColor: "#F3F4F6" }),
        cell("实际考试人数", { fontWeight: "bold", backgroundColor: "#F3F4F6" }),
        ...subjectReport.gradeLabels.map((label) => cell(label, {
          fontWeight: "bold",
          backgroundColor: "#F3F4F6",
        })),
        ...subjectReport.thresholds.map((threshold) => cell(`${threshold}分以上`, {
          fontWeight: "bold",
          backgroundColor: "#F3F4F6",
        })),
      ],
      ...subjectReport.rows.map((row) => [
        cell(row.classLabel),
        cell(row.teacherNames.join("、") || null),
        cell(row.candidateCount || null),
        ...subjectReport.gradeLabels.map((label) => cell(row.gradeCounts[label] || null)),
        ...subjectReport.thresholds.map((threshold) => cell(row.scoreCounts[threshold] || null)),
      ]),
      [
        cell("累计", { fontWeight: "bold" }),
        cell(null),
        cell(subjectReport.totalCandidateCount || null, { fontWeight: "bold" }),
        ...subjectReport.gradeLabels.map((label) => cell(subjectReport.totalGradeCounts[label] || null, { fontWeight: "bold" })),
        ...subjectReport.thresholds.map((threshold) => cell(subjectReport.totalScoreCounts[threshold] || null, { fontWeight: "bold" })),
      ],
      [
        cell("所占比例", { fontWeight: "bold" }),
        cell(null),
        cell(null),
        ...subjectReport.gradeLabels.map((label) => cell(
          subjectReport.totalCandidateCount > 0 ? subjectReport.totalGradeRates[label] : null,
          { fontWeight: "bold" },
        )),
        ...subjectReport.thresholds.map((threshold) => cell(
          subjectReport.totalCandidateCount > 0 ? subjectReport.totalScoreRates[threshold] : null,
          { fontWeight: "bold" },
        )),
      ],
    ];
    return {
      sheet: subjectReport.subject,
      data: rows,
      stickyRowsCount: 2,
      columns: [
        { width: 12 },
        { width: 16 },
        { width: 14 },
        ...subjectReport.gradeLabels.map(() => ({ width: 8 })),
        ...subjectReport.thresholds.map(() => ({ width: 12 })),
      ],
    };
  });
  const safeName = report.subjects[0].title
    .replace(report.subjects[0].subject, "选修")
    .replace(/[\\/:*?"<>|]/g, "_");
  await writeXlsxFile(sheets).toFile(`${safeName}.xlsx`);
}

function combinedWorkbookCell(
  value: string | number | null | undefined,
  options: Record<string, unknown> = {},
) {
  const border = { borderStyle: "thin" as const, borderColor: "#D1D5DB" };
  return {
    value: value ?? undefined,
    type: typeof value === "number" ? Number : String,
    align: typeof value === "number" ? "right" as const : "center" as const,
    alignVertical: "center" as const,
    height: 22,
    ...border,
    ...options,
  };
}

type CombinedWorkbookCell = ReturnType<typeof combinedWorkbookCell>;
interface CombinedWorkbookSheet {
  sheet: string;
  data: CombinedWorkbookCell[][];
  columns: Array<{ width: number }>;
  stickyRowsCount?: number;
}

function uniqueWorkbookSheetName(name: string, usedNames: Set<string>): string {
  const base = name
    .replace(/[\\/:*?]/g, "_")
    .split("[").join("_")
    .split("]").join("_")
    .trim()
    .slice(0, 31) || "统计表";
  let candidate = base;
  let suffix = 2;
  while (usedNames.has(candidate)) {
    const ending = `-${suffix}`;
    candidate = `${base.slice(0, 31 - ending.length)}${ending}`;
    suffix += 1;
  }
  usedNames.add(candidate);
  return candidate;
}

function titleRow(title: string, columnCount: number, reportDate?: string): CombinedWorkbookCell[] {
  return Array.from({ length: columnCount }, (_, index) => {
    if (index === 0) {
      return combinedWorkbookCell(title, { fontWeight: "bold", fontSize: 15, align: "left" });
    }
    if (reportDate && index === columnCount - 1) {
      return combinedWorkbookCell(reportDate.replace(/-/g, "."), { fontWeight: "bold" });
    }
    return combinedWorkbookCell(null);
  });
}

function headingRow(values: string[]): CombinedWorkbookCell[] {
  return values.map((value) => combinedWorkbookCell(value, {
    fontWeight: "bold",
    backgroundColor: "#F3F4F6",
  }));
}

function classAverageWorkbookSheet(
  report: GradeClassAverageReport,
  usedNames: Set<string>,
): CombinedWorkbookSheet {
  const headers = ["类别", "班级", "班主任 / 人数", ...report.subjects, "总分平均"];
  const rows: CombinedWorkbookCell[][] = [titleRow(report.title, headers.length, report.reportDate), headingRow(headers)];
  report.groups.forEach((group) => {
    group.rows.forEach((row) => {
      if (report.options.showTeacherRows) {
        rows.push([
          combinedWorkbookCell(group.category),
          combinedWorkbookCell(row.classLabel),
          combinedWorkbookCell(row.homeroomTeachers.join("、")),
          ...report.subjects.map((subject) => combinedWorkbookCell(row.subjectTeachers[subject]?.join("、") || "")),
          combinedWorkbookCell(null),
        ]);
      }
      rows.push([
        combinedWorkbookCell(report.options.showTeacherRows ? "" : group.category),
        combinedWorkbookCell(row.classLabel),
        combinedWorkbookCell(`${row.studentCount} 人`),
        ...report.subjects.map((subject) => combinedWorkbookCell(classAverageScoreCellValue(
          row.subjectAverages[subject],
          row.subjectScoreModes[subject],
        ))),
        combinedWorkbookCell(classAverageScoreCellValue(
          row.totalAverages,
          report.options.totalScoreMode || "assigned",
        ), { fontWeight: "bold" }),
      ]);
    });
    if (group.rows.length > 1 && report.options.showGroupDifference) {
      rows.push([
        combinedWorkbookCell(group.category),
        combinedWorkbookCell("分差", { fontWeight: "bold" }),
        combinedWorkbookCell(null),
        ...report.subjects.map((subject) => combinedWorkbookCell(classAverageScoreCellValue(
          group.difference.subjectValues[subject],
          group.subjectScoreModes[subject],
        ))),
        combinedWorkbookCell(classAverageScoreCellValue(
          group.difference.totalValues,
          report.options.totalScoreMode || "assigned",
        ), { fontWeight: "bold" }),
      ]);
    }
    if (group.rows.length > 1 && report.options.showGroupAverage) {
      rows.push([
        combinedWorkbookCell(group.category),
        combinedWorkbookCell(`平均（${formatGradeClassRangeLabel(group.rows.map((row) => row.classLabel))}）`, { fontWeight: "bold" }),
        combinedWorkbookCell(null),
        ...report.subjects.map((subject) => combinedWorkbookCell(classAverageScoreCellValue(
          group.average.subjectValues[subject],
          group.subjectScoreModes[subject],
        ))),
        combinedWorkbookCell(classAverageScoreCellValue(
          group.average.totalValues,
          report.options.totalScoreMode || "assigned",
        ), { fontWeight: "bold" }),
      ]);
    }
  });
  if (report.options.showOverallAverage) {
    rows.push([
      combinedWorkbookCell("全校平均", { fontWeight: "bold" }),
      combinedWorkbookCell(null),
      combinedWorkbookCell(null),
      ...report.subjects.map((subject) => combinedWorkbookCell(classAverageScoreCellValue(
        report.overallAverage.subjectValues[subject],
        report.overallSubjectScoreModes[subject],
      ), { fontWeight: "bold" })),
      combinedWorkbookCell(classAverageScoreCellValue(
        report.overallAverage.totalValues,
        report.options.totalScoreMode || "assigned",
      ), { fontWeight: "bold" }),
    ]);
  }
  return {
    sheet: uniqueWorkbookSheetName("表一、班级平均分", usedNames),
    data: rows,
    stickyRowsCount: 2,
    columns: [
      { width: 14 },
      { width: 14 },
      { width: 18 },
      ...report.subjects.map(() => ({ width: 14 })),
      { width: 14 },
    ],
  };
}

function totalScoreSegmentWorkbookSheet(
  report: GradeTotalScoreSegmentReport,
  usedNames: Set<string>,
): CombinedWorkbookSheet {
  const headers = ["总分分数段", ...report.columns.map((column) => column.label)];
  const rows: CombinedWorkbookCell[][] = [titleRow(report.title, headers.length, report.reportDate), headingRow(headers)];
  report.rows.forEach((row) => {
    rows.push([
      combinedWorkbookCell(`${row.threshold}分以上`, { fontWeight: "bold" }),
      ...report.columns.map((column) => combinedWorkbookCell(row.counts[column.key] || null)),
    ]);
  });
  const standardSummary = (["science", "arts"] as const).map((track) => {
    const values = report.trackStandards[track];
    const trackLabel = track === "science" ? "理科标准" : "文科标准";
    const display = (value: number | null) => value === null ? "未设置" : `${value}分`;
    return `${trackLabel}：高分1 ${display(values.highScore1)} | 高分2 ${display(values.highScore2)} | 一本 ${display(values.firstTier)} | 二本 ${display(values.undergraduate)}`;
  }).join("    ");
  rows.push([
    combinedWorkbookCell(standardSummary, {
      fontWeight: "bold",
      backgroundColor: "#FFFBEB",
      columnSpan: report.columns.length + 1,
      height: 34,
      wrap: true,
    }),
    ...report.columns.map(() => combinedWorkbookCell(null)),
  ]);
  report.summaryRows.forEach((row) => {
    rows.push([
      combinedWorkbookCell(row.label, { fontWeight: "bold" }),
      ...report.columns.map((column) => {
        const value = row.values[column.key];
        return combinedWorkbookCell(row.kind === "count" && value === 0 ? null : value);
      }),
    ]);
  });
  return {
    sheet: uniqueWorkbookSheetName("表二、总分分数段", usedNames),
    data: rows,
    stickyRowsCount: 2,
    columns: [{ width: 16 }, ...report.columns.map(() => ({ width: 12 }))],
  };
}

function subjectScoreSegmentWorkbookSheets(
  report: GradeSubjectScoreSegmentReport,
  usedNames: Set<string>,
): CombinedWorkbookSheet[] {
  return report.subjects.map((subjectReport) => {
    const headers = ["班级", "任课教师", "实考人数", ...subjectReport.thresholds.map((threshold) => `${threshold}分以上`)];
    const rows: CombinedWorkbookCell[][] = [
      titleRow(subjectReport.title, headers.length, report.reportDate),
      headingRow(headers),
      ...subjectReport.rows.map((row) => [
        combinedWorkbookCell(row.classLabel),
        combinedWorkbookCell(row.teacherNames.join("、")),
        combinedWorkbookCell(row.candidateCount || null),
        ...subjectReport.thresholds.map((threshold) => combinedWorkbookCell(row.counts[threshold] || null)),
      ]),
      [
        combinedWorkbookCell("累计", { fontWeight: "bold" }),
        combinedWorkbookCell(null),
        combinedWorkbookCell(subjectReport.totalCandidateCount || null, { fontWeight: "bold" }),
        ...subjectReport.thresholds.map((threshold) => combinedWorkbookCell(subjectReport.totalCounts[threshold] || null, { fontWeight: "bold" })),
      ],
      [
        combinedWorkbookCell("所占比例", { fontWeight: "bold" }),
        combinedWorkbookCell(null),
        combinedWorkbookCell(null),
        ...subjectReport.thresholds.map((threshold) => combinedWorkbookCell(
          subjectReport.totalCandidateCount > 0 ? subjectReport.totalRates[threshold] : null,
          { fontWeight: "bold" },
        )),
      ],
    ];
    return {
      sheet: uniqueWorkbookSheetName(`表三-${subjectReport.subject}`, usedNames),
      data: rows,
      stickyRowsCount: 2,
      columns: [{ width: 12 }, { width: 16 }, { width: 12 }, ...subjectReport.thresholds.map(() => ({ width: 12 }))],
    };
  });
}

function electiveScoreSegmentWorkbookSheets(
  report: GradeElectiveScoreSegmentReport,
  usedNames: Set<string>,
): CombinedWorkbookSheet[] {
  return report.subjects.map((subjectReport) => {
    const headers = [
      "班级",
      "任课教师",
      "实际考试人数",
      ...subjectReport.gradeLabels,
      ...subjectReport.thresholds.map((threshold) => `${threshold}分以上`),
    ];
    const rows: CombinedWorkbookCell[][] = [
      titleRow(subjectReport.title, headers.length, report.reportDate),
      headingRow(headers),
      ...subjectReport.rows.map((row) => [
        combinedWorkbookCell(row.classLabel),
        combinedWorkbookCell(row.teacherNames.join("、")),
        combinedWorkbookCell(row.candidateCount || null),
        ...subjectReport.gradeLabels.map((label) => combinedWorkbookCell(row.gradeCounts[label] || null)),
        ...subjectReport.thresholds.map((threshold) => combinedWorkbookCell(row.scoreCounts[threshold] || null)),
      ]),
      [
        combinedWorkbookCell("累计", { fontWeight: "bold" }),
        combinedWorkbookCell(null),
        combinedWorkbookCell(subjectReport.totalCandidateCount || null, { fontWeight: "bold" }),
        ...subjectReport.gradeLabels.map((label) => combinedWorkbookCell(subjectReport.totalGradeCounts[label] || null, { fontWeight: "bold" })),
        ...subjectReport.thresholds.map((threshold) => combinedWorkbookCell(subjectReport.totalScoreCounts[threshold] || null, { fontWeight: "bold" })),
      ],
      [
        combinedWorkbookCell("所占比例", { fontWeight: "bold" }),
        combinedWorkbookCell(null),
        combinedWorkbookCell(null),
        ...subjectReport.gradeLabels.map((label) => combinedWorkbookCell(
          subjectReport.totalCandidateCount > 0 ? subjectReport.totalGradeRates[label] : null,
          { fontWeight: "bold" },
        )),
        ...subjectReport.thresholds.map((threshold) => combinedWorkbookCell(
          subjectReport.totalCandidateCount > 0 ? subjectReport.totalScoreRates[threshold] : null,
          { fontWeight: "bold" },
        )),
      ],
    ];
    return {
      sheet: uniqueWorkbookSheetName(`表四-${subjectReport.subject}`, usedNames),
      data: rows,
      stickyRowsCount: 2,
      columns: [
        { width: 12 },
        { width: 16 },
        { width: 14 },
        ...subjectReport.gradeLabels.map(() => ({ width: 8 })),
        ...subjectReport.thresholds.map(() => ({ width: 12 })),
      ],
    };
  });
}

function totalScoreRankingWorkbookSheets(
  report: GradeTotalScoreRankingReport,
  usedNames: Set<string>,
): CombinedWorkbookSheet[] {
  return report.tables.map((table) => {
    const headers = ["名次", "学号", "姓名", "班级", ...report.subjects, `总分（${report.scoreModeLabel}）`];
    return {
      sheet: uniqueWorkbookSheetName(
        `表五-${table.key === "science" ? "理科" : table.key === "arts" ? "文科" : "总分排名"}`,
        usedNames,
      ),
      data: [
        titleRow(table.title, headers.length, report.reportDate),
        headingRow(headers),
        ...table.rows.map((row) => [
          combinedWorkbookCell(row.rank),
          combinedWorkbookCell(row.studentNo),
          combinedWorkbookCell(row.studentName),
          combinedWorkbookCell(row.classLabel),
          ...report.subjects.map((subject) => combinedWorkbookCell(row.subjectScores[subject])),
          combinedWorkbookCell(row.score),
        ]),
      ],
      stickyRowsCount: 2,
      columns: [
        { width: 10 },
        { width: 16 },
        { width: 14 },
        { width: 14 },
        ...report.subjects.map(() => ({ width: 12 })),
        { width: 14 },
      ],
    };
  });
}

export async function exportGradeTablesOneToFive(params: {
  exam: GradeExam;
  settings: GradeExamSettings;
  context: GradeImportContext;
  classAverageTemplate: GradeStatisticsTemplate;
  totalScoreSegmentTemplate: GradeStatisticsTemplate;
}): Promise<void> {
  const { exam, settings, context, classAverageTemplate, totalScoreSegmentTemplate } = params;
  const classAverageReport = buildGradeClassAverageReport(exam, classAverageTemplate, context, settings);
  const totalScoreSegmentReport = buildGradeTotalScoreSegmentReport(
    exam,
    totalScoreSegmentTemplate,
    context,
    classAverageTemplate,
  );
  const subjectScoreSegmentReport = buildGradeSubjectScoreSegmentReport(
    exam,
    totalScoreSegmentTemplate,
    context,
    settings,
    classAverageTemplate,
  );
  const electiveScoreSegmentReport = buildGradeElectiveScoreSegmentReport(
    exam,
    totalScoreSegmentTemplate,
    context,
    settings,
    classAverageTemplate,
  );
  const totalScoreRankingReport = buildGradeTotalScoreRankingReport(
    exam,
    totalScoreSegmentTemplate,
    context,
    classAverageTemplate,
  );
  const usedNames = new Set<string>();
  const sheets: CombinedWorkbookSheet[] = [
    classAverageWorkbookSheet(classAverageReport, usedNames),
    totalScoreSegmentWorkbookSheet(totalScoreSegmentReport, usedNames),
    ...subjectScoreSegmentWorkbookSheets(subjectScoreSegmentReport, usedNames),
    ...electiveScoreSegmentWorkbookSheets(electiveScoreSegmentReport, usedNames),
    ...totalScoreRankingWorkbookSheets(totalScoreRankingReport, usedNames),
  ];
  const { default: writeXlsxFile } = await import("write-excel-file/browser");
  const safeName = `${exam.cohortLabel}${exam.name}_表一至表五`.replace(/[\\/:*?"<>|]/g, "_");
  await writeXlsxFile(sheets).toFile(`${safeName}.xlsx`);
}

export async function exportGradeClassStatisticsReport(
  report: GradeClassStatisticsReport,
): Promise<void> {
  if (report.classes.length === 0) throw new Error("当前考试没有可导出的班级成绩");
  const usedNames = new Set<string>();
  const sheets: CombinedWorkbookSheet[] = report.classes.map((classTable) => ({
    sheet: uniqueWorkbookSheetName(classTable.className, usedNames),
    data: [
      titleRow(`${report.title} · ${classTable.className}`, report.columns.length),
      headingRow(report.columns.map((column) => column.label)),
      ...classTable.rows.map((row) => report.columns.map((column) => combinedWorkbookCell(row.values[column.key]))),
    ],
    stickyRowsCount: 2,
    columns: report.columns.map((column) => ({ width: column.width })),
  }));
  const { default: writeXlsxFile } = await import("write-excel-file/browser");
  const safeName = report.title.replace(/[\\/:*?"<>|]/g, "_") || "各班成绩统计";
  await writeXlsxFile(sheets).toFile(`${safeName}.xlsx`);
}
