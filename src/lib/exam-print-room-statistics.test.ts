import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ExamArrangement, ExamSeatAssignment } from "@/types";
import {
  buildExamPrintRoomStatistics,
} from "./exam-print-room-statistics";
import { downloadExamPrintRoomStatistics } from "./exam-arrangement-export";

const { writeXlsxFile, toFile } = vi.hoisted(() => ({
  writeXlsxFile: vi.fn(),
  toFile: vi.fn(),
}));

vi.mock("write-excel-file/browser", () => ({
  default: writeXlsxFile,
}));

function assignment(overrides: Partial<ExamSeatAssignment>): ExamSeatAssignment {
  return {
    id: "assignment-1",
    studentId: "student-1",
    studentName: "甲",
    studentNo: "001",
    classId: "class-1",
    className: "高三（1）班",
    subjectLabel: "语文 / 数学 / 英语 / 物理 / 化学 / 生物",
    sessionKey: "combined",
    roomId: "room-1",
    roomName: "1考场",
    roomNumber: "1考场",
    roomLocation: "高三1班教室",
    seatNo: 1,
    admissionNo: "20260816010001",
    ...overrides,
  };
}

function arrangement(overrides: Partial<ExamArrangement> = {}): ExamArrangement {
  return {
    id: "arrangement-1",
    schoolId: "school-1",
    teacherId: "teacher-1",
    cohortKey: "grad-2027",
    cohortLabel: "2027届高三",
    name: "高三期中考试",
    examDate: "2026-10-20",
    mode: "combination",
    subjectSetupMode: "selection",
    subjects: ["语文", "数学", "英语", "物理", "化学", "生物", "政治", "历史", "地理"],
    selectionSubjects: {},
    separateSubjects: [],
    seatOrder: "random",
    rooms: [
      { id: "room-1", name: "1考场", number: "1考场", location: "高三1班教室", capacity: 40 },
      { id: "room-2", name: "2考场", number: "2考场", location: "高三2班教室", capacity: 40 },
    ],
    groupRoomIds: {},
    classRules: [],
    studentSubjects: [
      { studentId: "student-1", subjects: ["语文", "数学", "英语", "物理", "化学", "生物"] },
      { studentId: "student-2", subjects: ["语文", "数学", "英语", "历史", "政治", "地理"] },
    ],
    assignments: [
      assignment({}),
      assignment({
        id: "assignment-2",
        studentId: "student-2",
        studentName: "乙",
        studentNo: "002",
        classId: "class-2",
        className: "高三（2）班",
        subjectLabel: "语文 / 数学 / 英语 / 政治 / 历史 / 地理",
        roomId: "room-2",
        roomName: "2考场",
        roomNumber: "2考场",
        roomLocation: "高三2班教室",
      }),
    ],
    createdAt: "2026-08-16T00:00:00.000Z",
    updatedAt: "2026-08-16T00:00:00.000Z",
    ...overrides,
  };
}

describe("exam print-room statistics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    writeXlsxFile.mockReturnValue({ toFile });
  });

  it("builds room headers, elective combinations, subject counts, and totals", () => {
    const report = buildExamPrintRoomStatistics(arrangement());

    expect(report.rooms).toEqual([
      {
        roomId: "room-1",
        roomNumber: "1考场",
        roomLocation: "高三1班教室",
        selectionLabel: "物化生",
      },
      {
        roomId: "room-2",
        roomNumber: "2考场",
        roomLocation: "高三2班教室",
        selectionLabel: "史政地",
      },
    ]);
    expect(report.rows.map((row) => row.label)).toEqual([
      "语数外",
      "物理",
      "化学",
      "生物",
      "历史",
      "政治",
      "地理",
    ]);
    expect(report.rows[0]).toMatchObject({ counts: [1, 1], total: 2 });
    expect(report.rows.find((row) => row.label === "物理")).toMatchObject({ counts: [1, 0], total: 1 });
    expect(report.rows.find((row) => row.label === "历史")).toMatchObject({ counts: [0, 1], total: 1 });
  });

  it("uses the actual subject session rooms and avoids grouping core subjects when their counts differ", () => {
    const source = arrangement({
      separateSubjects: ["语文"],
      assignments: [
        assignment({
          id: "combined-1",
          subjectLabel: "数学 / 英语 / 物理 / 化学 / 生物",
        }),
        assignment({
          id: "combined-2",
          studentId: "student-2",
          studentName: "乙",
          studentNo: "002",
          subjectLabel: "数学 / 英语 / 政治 / 历史 / 地理",
          roomId: "room-2",
          roomName: "2考场",
          roomNumber: "2考场",
          roomLocation: "高三2班教室",
        }),
        assignment({
          id: "chinese-1",
          sessionKey: "subject:语文",
          subjectLabel: "语文",
          roomId: "room-2",
          roomName: "2考场",
          roomNumber: "2考场",
          roomLocation: "高三2班教室",
        }),
        assignment({
          id: "chinese-2",
          studentId: "student-2",
          studentName: "乙",
          studentNo: "002",
          sessionKey: "subject:语文",
          subjectLabel: "语文",
          roomId: "room-2",
          roomName: "2考场",
          roomNumber: "2考场",
          roomLocation: "高三2班教室",
          seatNo: 2,
        }),
      ],
    });

    const report = buildExamPrintRoomStatistics(source);

    expect(report.rows.slice(0, 3).map((row) => row.label)).toEqual(["语文", "数学", "英语"]);
    expect(report.rows.find((row) => row.label === "语文")).toMatchObject({ counts: [0, 2], total: 2 });
    expect(report.rows.find((row) => row.label === "数学")).toMatchObject({ counts: [1, 1], total: 2 });
  });

  it("exports the same three header rows and subject totals to xlsx", async () => {
    await downloadExamPrintRoomStatistics(arrangement());

    expect(toFile).toHaveBeenCalledWith("高三期中考试_文印室统计表.xlsx");
    const workbook = writeXlsxFile.mock.calls[0]?.[0];
    expect(workbook[0].sheet).toBe("表一、文印室统计表");
    expect(workbook[0].data.slice(0, 3).map((row: Array<{ value: unknown }>) => row[0].value)).toEqual([
      "考场号",
      "考试地点",
      "组合",
    ]);
    expect(workbook[0].data[3].map((cell: { value: unknown }) => cell.value)).toEqual(["语数外", 1, 1, 2]);
  });
});
