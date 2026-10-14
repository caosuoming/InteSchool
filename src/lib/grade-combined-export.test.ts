import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GradeExam, GradeImportContext } from "@/types";
import { buildDefaultGradeSettings } from "./grade-statistics";
import { buildGradeClassAverageReport } from "./grade-class-average";
import { buildGradeTotalScoreSegmentReport } from "./grade-total-score-segment";
import { buildGradeSubjectScoreSegmentReport } from "./grade-subject-score-segment";
import { buildGradeElectiveScoreSegmentReport } from "./grade-elective-score-segment";
import {
  exportGradeClassAverageReport,
  exportGradeClassStatisticsReport,
  exportGradeElectiveScoreSegmentReport,
  exportGradeSubjectScoreSegmentReport,
  exportGradeTotalScoreRankingReport,
  exportGradeTotalScoreSegmentReport,
  exportGradeTablesOneToFive,
} from "./grade-spreadsheet";
import { buildGradeClassStatisticsReport } from "./grade-class-statistics";
import { buildGradeTotalScoreRankingReport } from "./grade-total-score-ranking";

const { writeXlsxFile, toFile } = vi.hoisted(() => ({
  writeXlsxFile: vi.fn(),
  toFile: vi.fn(),
}));

vi.mock("write-excel-file/browser", () => ({ default: writeXlsxFile }));

const settings = buildDefaultGradeSettings(["语文", "化学"], ["class-1", "class-2"]);
const classAverageTemplate = settings.templates.find((item) => item.kind === "classAverage")!;
const totalScoreSegmentTemplate = settings.templates.find((item) => item.kind === "totalScoreSegment")!;

const exam: GradeExam = {
  id: "exam-1",
  schoolId: "school-1",
  teacherId: "teacher-1",
  cohortKey: "cohort-1",
  cohortLabel: "2027届高三",
  name: "期末考试",
  examDate: "2026-07-01",
  sourceFileName: "scores.xlsx",
  sourceSheetName: "成绩",
  subjects: ["语文", "化学"],
  records: [
    {
      id: "r1",
      studentId: "s1",
      studentName: "张三",
      studentNo: "001",
      classId: "class-1",
      className: "高三（1）班",
      subjectSelection: "物化生",
      scores: { 语文: 120, 化学: 80 },
      assignedScores: { 语文: 120, 化学: 90 },
      rawTotal: 200,
      assignedTotal: 210,
      gradeRank: 1,
      classRank: 1,
    },
    {
      id: "r2",
      studentId: "s2",
      studentName: "李四",
      studentNo: "002",
      classId: "class-2",
      className: "高三（2）班",
      subjectSelection: "物化生",
      scores: { 语文: 110, 化学: 75 },
      assignedScores: { 语文: 110, 化学: 85 },
      rawTotal: 185,
      assignedTotal: 195,
      gradeRank: 2,
      classRank: 1,
    },
  ],
  settings,
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-01T00:00:00.000Z",
};

const context: GradeImportContext = {
  cohort: {
    key: "cohort-1",
    label: "2027届高三",
    grade: "高三",
    gradYear: 2027,
    classIds: ["class-1", "class-2"],
    studentCount: 2,
  },
  classes: [
    {
      id: "class-1",
      type: "school",
      schoolId: "school-1",
      name: "高三（1）班",
      grade: "高三",
      gradYear: 2027,
      studentCount: 1,
      createdBy: "teacher-1",
      createdAt: "2025-09-01T00:00:00.000Z",
    },
    {
      id: "class-2",
      type: "school",
      schoolId: "school-1",
      name: "高三（2）班",
      grade: "高三",
      gradYear: 2027,
      studentCount: 1,
      createdBy: "teacher-1",
      createdAt: "2025-09-01T00:00:00.000Z",
    },
  ],
  students: [
    { id: "s1", name: "张三", studentNo: "001", classId: "class-1", schoolId: "school-1", grade: "高三", status: "active" },
    { id: "s2", name: "李四", studentNo: "002", classId: "class-2", schoolId: "school-1", grade: "高三", status: "active" },
  ],
  teachers: [],
};

describe("combined grade exports", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    writeXlsxFile.mockReturnValue({ toFile });
    toFile.mockResolvedValue(undefined);
  });

  it("places tables one through five in one workbook", async () => {
    await exportGradeTablesOneToFive({
      exam,
      settings,
      context,
      classAverageTemplate,
      totalScoreSegmentTemplate,
    });

    expect(writeXlsxFile).toHaveBeenCalledTimes(1);
    const sheets = writeXlsxFile.mock.calls[0][0] as Array<{
      sheet: string;
      data: Array<Array<{ value?: string | number }>>;
    }>;
    expect(sheets.some((sheet) => sheet.sheet.startsWith("表一"))).toBe(true);
    expect(sheets.some((sheet) => sheet.sheet.startsWith("表二"))).toBe(true);
    expect(sheets.some((sheet) => sheet.sheet.startsWith("表三"))).toBe(true);
    expect(sheets.some((sheet) => sheet.sheet.startsWith("表四"))).toBe(true);
    expect(sheets.some((sheet) => sheet.sheet.startsWith("表五"))).toBe(true);

    const tableTwo = sheets.find((sheet) => sheet.sheet.startsWith("表二"))!;
    expect(tableTwo.data[2].slice(1).every((cell) => cell.value === undefined)).toBe(true);

    const tableFive = sheets.find((sheet) => sheet.sheet.startsWith("表五"))!;
    expect(tableFive.data[1].map((cell) => cell.value)).toEqual([
      "名次",
      "学号",
      "姓名",
      "班级",
      "语文",
      "化学",
      "总分（赋分）",
    ]);
    expect(tableFive.data[2].map((cell) => cell.value)).toEqual([1, "001", "张三", "1班", 120, 90, 210]);
    expect(toFile).toHaveBeenCalledWith("期末考试表一至表五.xlsx");
  });

  it("uses valid merged cells that mirror the on-screen tables", async () => {
    await exportGradeTablesOneToFive({
      exam,
      settings,
      context,
      classAverageTemplate,
      totalScoreSegmentTemplate,
    });

    const sheets = writeXlsxFile.mock.calls[0][0] as Array<{
      sheet: string;
      data: Array<Array<null | { value?: string | number; align?: string; columnSpan?: number; rowSpan?: number }>>;
    }>;

    expect(sheets.every((sheet) => sheet.data.every((row) => row.every(
      (cell) => cell === null || cell.align === "center",
    )))).toBe(true);

    const tableOne = sheets.find((sheet) => sheet.sheet.startsWith("表一"))!;
    const firstCategoryRow = tableOne.data.slice(2).find((row) => row[0]?.rowSpan);
    expect(firstCategoryRow?.[0]?.rowSpan).toBeGreaterThan(1);
    const firstCategoryIndex = tableOne.data.indexOf(firstCategoryRow!);
    expect(tableOne.data[firstCategoryIndex + 1][0]).toBeNull();
    expect(tableOne.data[firstCategoryIndex][1]?.rowSpan).toBe(2);
    expect(tableOne.data[firstCategoryIndex + 1][1]).toBeNull();
    const overallRow = tableOne.data.find((row) => row[0]?.value === "全校平均")!;
    expect(overallRow[0]?.columnSpan).toBe(3);
    expect(overallRow.slice(1, 3)).toEqual([null, null]);

    const tableTwo = sheets.find((sheet) => sheet.sheet.startsWith("表二"))!;
    const standardRow = tableTwo.data.find((row) => typeof row[0]?.value === "string" && row[0].value.includes("理科标准"))!;
    expect(standardRow[0]?.columnSpan).toBe(standardRow.length);
    expect(standardRow.slice(1).every((cell) => cell === null)).toBe(true);

    const tableThree = sheets.find((sheet) => sheet.sheet.startsWith("表三"))!;
    const tableThreeTotal = tableThree.data.find((row) => row[0]?.value === "累计")!;
    const tableThreeRate = tableThree.data.find((row) => row[0]?.value === "所占比例")!;
    expect(tableThree.data[1][1]?.value).toBe("语文");
    expect(tableThreeTotal[0]?.columnSpan).toBe(2);
    expect(tableThreeTotal[1]).toBeNull();
    expect(tableThreeRate[0]?.columnSpan).toBe(3);
    expect(tableThreeRate.slice(1, 3)).toEqual([null, null]);

    const tableFour = sheets.find((sheet) => sheet.sheet.startsWith("表四"))!;
    const tableFourTotal = tableFour.data.find((row) => row[0]?.value === "累计")!;
    const tableFourRate = tableFour.data.find((row) => row[0]?.value === "所占比例")!;
    expect(tableFourTotal[0]?.columnSpan).toBe(2);
    expect(tableFourTotal[1]).toBeNull();
    expect(tableFourRate[0]?.columnSpan).toBe(3);
    expect(tableFourRate.slice(1, 3)).toEqual([null, null]);

    const tableFive = sheets.find((sheet) => sheet.sheet.startsWith("表五"))!;
    expect(tableFive.data[2].every((cell) => cell?.align === "center")).toBe(true);
  });

  it("exports the unified-only school mean with an exclusion note", async () => {
    const separateSettings = {
      ...settings,
      classSubjects: settings.classSubjects.map((item) => item.classId === "class-1"
        ? { ...item, statisticSubjects: ["语文"], separateRankSubjects: ["化学"] }
        : item),
    };
    const report = buildGradeClassAverageReport(exam, classAverageTemplate, context, separateSettings);
    await exportGradeClassAverageReport(report);

    const rows = writeXlsxFile.mock.calls[0][0] as Array<Array<null | {
      value?: string | number;
      columnSpan?: number;
      wrap?: boolean;
    }>>;
    const overallRow = rows.find((row) => String(row[0]?.value).startsWith("全校平均"))!;
    expect(overallRow[0]).toMatchObject({
      value: "全校平均（部分）",
      columnSpan: 3,
      wrap: true,
    });
    expect(overallRow[3]?.value).toBe(115);
    expect(overallRow[4]?.value).toBe(85);
    expect(overallRow[5]?.value).toBe(195);
  });

  it("exports separate ranking group standards alongside the summary counts", async () => {
    const separateSettings = {
      ...settings,
      classSubjects: settings.classSubjects.map((item) => item.classId === "class-1"
        ? { ...item, separateRankSubjects: ["化学"] }
        : item),
    };
    const report = buildGradeTotalScoreSegmentReport(exam, {
      ...totalScoreSegmentTemplate,
      totalScoreSegmentOptions: {
        ...totalScoreSegmentTemplate.totalScoreSegmentOptions,
        highScore1Threshold: 190,
        separateRankThresholds: { '["化学"]': { highScore1: 215 } },
      },
    }, context, classAverageTemplate, separateSettings);
    await exportGradeTotalScoreSegmentReport(report);
    const rows = writeXlsxFile.mock.calls[0][0] as Array<Array<null | { value?: string | number; columnSpan?: number }>>;
    const groupRow = rows.find((row) => String(row[0]?.value).includes("单独排名（化学）"))!;
    expect(groupRow[0]?.value).toContain("高分1 215分");
    expect(groupRow[0]?.columnSpan).toBe(groupRow.length);
    expect(groupRow.slice(1).every((cell) => cell === null)).toBe(true);
    const countRow = rows.find((row) => row[0]?.value === "高分1达线数")!;
    expect(countRow[1]?.value).toBeUndefined();
    expect(countRow.slice(1).some((cell) => cell?.value === 1)).toBe(true);
  });

  it("names standalone exports from the exam name plus table type", async () => {
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
    const classStatisticsReport = buildGradeClassStatisticsReport(exam, [], {
      showSubjectClassRanks: false,
      showSubjectGradeRanks: false,
      showRawSubjectScores: false,
      showAssignedSubjectScores: false,
      showRawTotal: false,
      showAssignedTotal: false,
      comparisonExamIds: [],
    });

    await exportGradeClassAverageReport(classAverageReport, exam.name);
    await exportGradeTotalScoreSegmentReport(totalScoreSegmentReport, exam.name);
    await exportGradeSubjectScoreSegmentReport(subjectScoreSegmentReport, exam.name);
    await exportGradeElectiveScoreSegmentReport(electiveScoreSegmentReport, exam.name);
    await exportGradeTotalScoreRankingReport(totalScoreRankingReport, exam.name);
    await exportGradeClassStatisticsReport(classStatisticsReport, exam.name);

    expect(toFile.mock.calls.map(([fileName]) => fileName)).toEqual([
      "期末考试班级平均分统计表.xlsx",
      "期末考试总分分数段汇总表.xlsx",
      "期末考试各单科分数段.xlsx",
      "期末考试选修分数段.xlsx",
      "期末考试总分前50名.xlsx",
      "期末考试各班成绩统计.xlsx",
    ]);
  });

  it("places every class from table six in its own sheet", async () => {
    const report = buildGradeClassStatisticsReport(exam, [], {
      showSubjectClassRanks: true,
      showSubjectGradeRanks: true,
      showRawSubjectScores: true,
      showAssignedSubjectScores: true,
      showRawTotal: true,
      showAssignedTotal: true,
      comparisonExamIds: [],
    });

    await exportGradeClassStatisticsReport(report, exam.name);

    expect(writeXlsxFile).toHaveBeenCalledTimes(1);
    const sheets = writeXlsxFile.mock.calls[0][0] as Array<{ sheet: string }>;
    expect(sheets.map((sheet) => sheet.sheet)).toEqual(["高三（1）班", "高三（2）班"]);
    expect(toFile).toHaveBeenCalledWith("期末考试各班成绩统计.xlsx");
  });

  it("exports separate raw and assigned elective values into the table-six workbook", async () => {
    const report = buildGradeClassStatisticsReport(exam, [], {
      showSubjectClassRanks: false,
      showSubjectGradeRanks: false,
      showRawSubjectScores: true,
      showAssignedSubjectScores: true,
      showRawTotal: false,
      showAssignedTotal: false,
      comparisonExamIds: [],
    });
    await exportGradeClassStatisticsReport(report, exam.name);
    const sheets = writeXlsxFile.mock.calls[0][0] as Array<{
      data: Array<Array<{ value?: string | number }>>;
    }>;
    expect(sheets[0].data[0].map((cell) => cell.value)).toEqual([
      "班级", "姓名", "语文", "化学（原始分）", "化学（赋分）",
    ]);
    expect(sheets[0].data[1].map((cell) => cell.value)).toEqual([
      "高三（1）班", "张三", 120, 80, 90,
    ]);
  });

  it("includes every subject score in the standalone table-five export", async () => {
    const report = buildGradeTotalScoreRankingReport(
      exam,
      totalScoreSegmentTemplate,
      context,
      classAverageTemplate,
    );

    await exportGradeTotalScoreRankingReport(report);

    expect(writeXlsxFile).toHaveBeenCalledTimes(1);
    const sheets = writeXlsxFile.mock.calls[0][0] as Array<{
      data: Array<Array<{ value?: string | number }>>;
    }>;
    expect(sheets[0].data[1].map((cell) => cell.value)).toEqual([
      "名次",
      "学号",
      "姓名",
      "班级",
      "语文",
      "化学",
      "总分（赋分）",
    ]);
    expect(sheets[0].data[2].map((cell) => cell.value)).toEqual([1, "001", "张三", "1班", 120, 90, 210]);
  });
});
