import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GradeExam, GradeImportContext } from "@/types";
import { buildDefaultGradeSettings } from "./grade-statistics";
import {
  exportGradeClassStatisticsReport,
  exportGradeTotalScoreRankingReport,
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
    expect(toFile).toHaveBeenCalledWith("2027届高三期末考试_表一至表五.xlsx");
  });

  it("places every class from table six in its own sheet", async () => {
    const report = buildGradeClassStatisticsReport(exam, [], {
      showSubjectClassRanks: true,
      showSubjectGradeRanks: true,
      showRawTotal: true,
      showAssignedTotal: true,
      comparisonExamIds: [],
    });

    await exportGradeClassStatisticsReport(report);

    expect(writeXlsxFile).toHaveBeenCalledTimes(1);
    const sheets = writeXlsxFile.mock.calls[0][0] as Array<{ sheet: string }>;
    expect(sheets.map((sheet) => sheet.sheet)).toEqual(["高三（1）班", "高三（2）班"]);
    expect(toFile).toHaveBeenCalledWith("2027届高三期末考试各班成绩统计.xlsx");
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
