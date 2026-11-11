import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ExamArrangement, ExamArrangementContext, ExamSeatAssignment } from "@/types";
import { generateExamAssignments } from "./exam-arrangement";
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

  it("builds room headers, subject counts, and totals", () => {
    const report = buildExamPrintRoomStatistics(arrangement());

    expect(report.rooms).toEqual([
      {
        roomId: "room-1",
        roomNumber: "1考场",
        roomLocation: "高三1班教室",
      },
      {
        roomId: "room-2",
        roomNumber: "2考场",
        roomLocation: "高三2班教室",
      },
    ]);
    expect(report.rows.map((row) => row.label)).toEqual([
      "语文",
      "数学",
      "英语",
      "物理",
      "化学",
      "生物",
      "历史",
      "政治",
      "地理",
    ]);
    for (const subject of ["语文", "数学", "英语"]) {
      expect(report.rows.find((row) => row.label === subject)).toMatchObject({
        subjects: [subject],
        counts: [1, 1],
        total: 2,
      });
    }
    expect(report.rows.find((row) => row.label === "物理")).toMatchObject({ counts: [1, 0], total: 1 });
    expect(report.rows.find((row) => row.label === "历史")).toMatchObject({ counts: [0, 1], total: 1 });
  });

  it("uses the actual subject session rooms even when core-subject counts differ", () => {
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

  it("counts actual seat assignments across new and legacy session keys without duplicate students", () => {
    const source = arrangement({
      subjects: ["语文", "数学", "英语", "物理", "历史", "化学"],
      sameSeatSubjectGroups: [["语文", "数学", "英语"], ["物理", "历史"], ["化学"]],
      assignments: [
        assignment({ id: "core-1", sessionKey: "seat:语文|数学|英语", subjectLabel: "语文 / 数学 / 英语" }),
        assignment({ id: "physics-1", sessionKey: "seat-session:物理|历史|化学", subjectLabel: "物理" }),
        assignment({ id: "physics-repeat", sessionKey: "seat-session:物理|历史|化学", subjectLabel: "物理" }),
        assignment({ id: "history-2", studentId: "student-2", roomId: "room-2", roomName: "2考场",
          sessionKey: "simultaneous:物理|历史", subjectLabel: "历史" }),
        assignment({ id: "chemistry-2", studentId: "student-2", roomId: "room-2", roomName: "2考场",
          sessionKey: "subject:化学", subjectLabel: "化学" }),
      ],
    });
    const report = buildExamPrintRoomStatistics(source);
    expect(report.rows.find((row) => row.label === "语文")).toMatchObject({ counts: [1, 0], total: 1 });
    expect(report.rows.find((row) => row.label === "物理")).toMatchObject({ counts: [1, 0], total: 1 });
    expect(report.rows.find((row) => row.label === "历史")).toMatchObject({ counts: [0, 1], total: 1 });
    expect(report.rows.find((row) => row.label === "化学")).toMatchObject({ counts: [0, 1], total: 1 });
  });

  it("counts assignments created by the current same-seat seating generator", () => {
    const source = arrangement({
      subjects: ["物理", "化学"],
      sameSeatSubjectGroups: [["物理", "化学"]],
      studentSubjects: [
        { studentId: "student-1", subjects: ["物理", "化学"] },
        { studentId: "student-2", subjects: ["化学"] },
      ],
      assignments: [],
    });
    const context = {
      cohort: { key: "grad-2027", label: "2027届高三", grade: "高三", gradYear: 2027,
        classIds: ["class-1", "class-2"], studentCount: 2 },
      classes: [
        { id: "class-1", schoolId: "school-1", name: "高三（1）班", type: "school", grade: "高三", studentCount: 1 },
        { id: "class-2", schoolId: "school-1", name: "高三（2）班", type: "school", grade: "高三", studentCount: 1 },
      ],
      students: [
        { id: "student-1", schoolId: "school-1", classId: "class-1", name: "甲", studentNo: "001", status: "active" },
        { id: "student-2", schoolId: "school-1", classId: "class-2", name: "乙", studentNo: "002", status: "active" },
      ],
    } as ExamArrangementContext;
    const assignments = generateExamAssignments(source, context);
    expect(assignments).toHaveLength(2);
    expect(assignments.every((item) => item.sessionKey === "seat:物理|化学")).toBe(true);

    const report = buildExamPrintRoomStatistics({ ...source, assignments });
    expect(report.rows.find((row) => row.label === "物理")?.total).toBe(1);
    expect(report.rows.find((row) => row.label === "化学")?.total).toBe(2);
  });

  it("exports two header rows, gray empty cells, and correct subject totals to xlsx", async () => {
    await downloadExamPrintRoomStatistics(arrangement());

    expect(toFile).toHaveBeenCalledWith("高三期中考试_文印室统计表.xlsx");
    const workbook = writeXlsxFile.mock.calls[0]?.[0];
    expect(workbook[0].sheet).toBe("表一、文印室统计表");
    expect(workbook[0].stickyRowsCount).toBe(2);
    expect(workbook[0].data.slice(0, 2).map((row: Array<{ value: unknown }>) => row[0].value)).toEqual([
      "考场号", "考试地点",
    ]);
    expect(workbook[0].data.slice(2).map((row: Array<{ value: unknown }>) => row[0].value)).toEqual([
      "语文", "数学", "英语", "物理", "化学", "生物", "历史", "政治", "地理",
    ]);
    expect(workbook[0].data[2].map((cell: { value: unknown }) => cell.value)).toEqual(["语文", 1, 1, 2]);
    expect(workbook[0].data[3].map((cell: { value: unknown }) => cell.value)).toEqual(["数学", 1, 1, 2]);
    expect(workbook[0].data[4].map((cell: { value: unknown }) => cell.value)).toEqual(["英语", 1, 1, 2]);
    expect(workbook[0].data[5][2]).toMatchObject({ value: "", backgroundColor: "#E5E7EB" });
  });
  it("exports wrapped room headers, multiple outside teachers, and the shared footer note", async () => {
    const source = arrangement({
      invigilation: {
        teachers: [
          { id: "room-a", name: "监考甲", subject: "语文" },
          { id: "room-b", name: "监考乙", subject: "语文" },
          { id: "outside-a", name: "场外甲", subject: "语文", isPrepLeader: true },
          { id: "outside-b", name: "场外乙", subject: "语文", isPrepLeader: true },
        ],
        subjectTimes: [{ subject: "语文", date: "2026-10-20", period: "morning", time: "08:00", durationMinutes: 90 }],
        patrolTeacherIds: [],
        overrides: {},
        footerNote: "第一行说明\n第二行说明",
      },
    });

    await downloadExamPrintRoomStatistics(source);

    const workbook = writeXlsxFile.mock.calls[0]?.[0] as Array<{
      sheet: string;
      data: Array<Array<{ value?: unknown; columnSpan?: number; wrap?: boolean } | null>>;
    }>;
    const sheet = workbook.find((item) => item.sheet === "表二、监考表");
    expect(sheet).toBeDefined();
    expect(sheet?.data[0][4]).toMatchObject({ value: "高三1班\n教室", wrap: true });
    expect(sheet?.data[3][6]).toMatchObject({ value: "场外甲\n场外乙" });
    expect(sheet?.data.at(-1)?.[0]).toMatchObject({
      value: "第一行说明\n第二行说明",
      columnSpan: 8,
      wrap: true,
    });
  });

});
