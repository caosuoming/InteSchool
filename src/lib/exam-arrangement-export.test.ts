import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ExamArrangement, ExamSeatAssignment } from "@/types";
import {
  downloadExamPreviewPdf,
  downloadExamPrintRoomStatistics,
  downloadDeskLabels,
  groupDeskLabels,
  groupDeskLabelsByRoom,
  groupStudentArrangements,
} from "./exam-arrangement-export";

const { writeXlsxFile, toFile, saveVectorExamPdf } = vi.hoisted(() => {
  return {
    writeXlsxFile: vi.fn(),
    toFile: vi.fn(),
    saveVectorExamPdf: vi.fn(),
  };
});

vi.mock("write-excel-file/browser", () => ({
  default: writeXlsxFile,
}));

vi.mock("./exam-vector-pdf", () => ({ saveVectorExamPdf }));

function assignment(overrides: Partial<ExamSeatAssignment>): ExamSeatAssignment {
  return {
    id: "assignment-1",
    studentId: "student-1",
    studentName: "甲",
    studentNo: "001",
    classId: "class-1",
    className: "高二（1）班",
    subjectLabel: "物理",
    sessionKey: "subject:物理",
    roomId: "room-1",
    roomName: "A01",
    roomNumber: "A01",
    roomLocation: "教学楼 101",
    seatNo: 1,
    admissionNo: "20260620010001",
    ...overrides,
  };
}

describe("groupDeskLabels", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    writeXlsxFile.mockReturnValue({ toFile });
  });

  it("merges different exam sessions assigned to the same physical desk", () => {
    const groups = groupDeskLabels([
      assignment({ id: "physics", studentId: "student-1", studentName: "甲", subjectLabel: "物理" }),
      assignment({
        id: "history",
        studentId: "student-2",
        studentName: "乙",
        studentNo: "002",
        classId: "class-2",
        className: "高二（2）班",
        subjectLabel: "历史",
        sessionKey: "subject:历史",
      }),
      assignment({
        id: "room-2",
        studentId: "student-3",
        studentName: "丙",
        studentNo: "003",
        roomId: "room-2",
        roomName: "A02",
        roomNumber: "A02",
        roomLocation: "教学楼 102",
      }),
    ]);

    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({ roomNumber: "A01", seatNo: 1 });
    expect(groups[0].assignments.map((item) => item.studentName)).toEqual(["甲", "乙"]);
    expect(groups[1]).toMatchObject({ roomNumber: "A02", seatNo: 1 });
  });

  it("uses natural numeric room order for preview, spreadsheet and PDF source pages", () => {
    const assignments = [
      assignment({ id: "ten", roomId: "r10", roomNumber: "第10考场", seatNo: 2 }),
      assignment({ id: "two", roomId: "r2", roomNumber: "第2考场", seatNo: 10 }),
      assignment({ id: "one", roomId: "r1", roomNumber: "第1考场", seatNo: 1 }),
      assignment({ id: "two-first", roomId: "r2", roomNumber: "第2考场", seatNo: 1 }),
    ];
    expect(groupDeskLabels(assignments).map((label) => `${label.roomNumber}/${label.seatNo}`)).toEqual([
      "第1考场/1", "第2考场/1", "第2考场/10", "第10考场/2",
    ]);
    expect(groupDeskLabelsByRoom(assignments).map((room) => room.roomNumber)).toEqual([
      "第1考场", "第2考场", "第10考场",
    ]);
  });

  it("groups all exam sessions for one student into one class-preview record", () => {
    const groups = groupStudentArrangements([
      assignment({ id: "combined", studentId: "student-1", subjectLabel: "语文 / 数学" }),
      assignment({ id: "physics", studentId: "student-1", subjectLabel: "物理", sessionKey: "subject:物理" }),
      assignment({ id: "student-2", studentId: "student-2", studentName: "乙", studentNo: "002" }),
    ]);

    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({ studentId: "student-1", studentName: "甲" });
    expect(groups[0].assignments.map((item) => item.subjectLabel)).toEqual(["语文 / 数学", "物理"]);
  });

  it("organizes desk labels under their room number for selectable previews", () => {
    const rooms = groupDeskLabelsByRoom([
      assignment({ id: "seat-1", seatNo: 1 }),
      assignment({ id: "seat-2", studentId: "student-2", studentNo: "002", seatNo: 2 }),
      assignment({
        id: "room-2",
        studentId: "student-3",
        studentNo: "003",
        roomId: "room-2",
        roomName: "A02",
        roomNumber: "A02",
        roomLocation: "教学楼 102",
      }),
    ]);

    expect(rooms).toHaveLength(2);
    expect(rooms[0]).toMatchObject({ roomNumber: "A01", roomLocation: "教学楼 101" });
    expect(rooms[0].labels.map((label) => label.seatNo)).toEqual([1, 2]);
  });

  it("omits optional identifiers from downloaded desk-label spreadsheets", async () => {
    await downloadDeskLabels({
      id: "arrangement-1",
      schoolId: "school-1",
      teacherId: "teacher-1",
      cohortKey: "cohort-1",
      cohortLabel: "高二",
      name: "期末考试",
      examDate: "2026-06-20",
      mode: "combination",
      subjectSetupMode: "all",
      subjects: ["物理"],
      selectionSubjects: {},
      separateSubjects: [],
      seatOrder: "random",
      rooms: [],
      classRules: [],
      studentSubjects: [],
      assignments: [assignment({})],
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-01T00:00:00.000Z",
    }, undefined, {
      showStudentNo: false,
      showAdmissionNo: false,
    });

    const workbook = writeXlsxFile.mock.calls[0][0];
    expect(workbook[0].data[0].map((item: { value: string }) => item.value)).toEqual([
      "考场号",
      "考场位置",
      "座位号",
      "考试科目与考生",
      "班级",
    ]);
    expect(workbook[0].data[1].map((item: { value: string | number }) => item.value)).toEqual([
      "A01",
      "教学楼 101",
      1,
      "物理：甲",
      "高二（1）班",
    ]);
  });

  it("exports each preview page through the vector PDF renderer", async () => {
    const first = document.createElement("section");
    first.textContent = "第一页";
    const second = document.createElement("section");
    second.textContent = "第二页";
    await downloadExamPreviewPdf([first, second], "期末考试_考场安排", "A4");
    expect(saveVectorExamPdf).toHaveBeenCalledWith([first, second], "期末考试_考场安排", 210, 297);
    await downloadExamPreviewPdf([first], "桌贴", "8K");
    expect(saveVectorExamPdf).toHaveBeenLastCalledWith([first], "桌贴", 260, 370);
  });

  it("exports table one in natural room order and table two with mixed-subject counts", async () => {
    const arrangement: ExamArrangement = {
      id: "exam-1", schoolId: "school-1", teacherId: "teacher-1",
      cohortKey: "grade-1", cohortLabel: "高二", name: "期中考试",
      examDate: "2026-10-20", mode: "subject",
      subjects: ["物理", "历史"], separateSubjects: ["物理", "历史"],
      rooms: [
        { id: "r10", name: "10", number: "10", location: "教学楼101", capacity: 30 },
        { id: "r2", name: "2", number: "2", location: "教学楼101", capacity: 30 },
      ],
      classRules: [], studentSubjects: [],
      assignments: [
        assignment({ id: "p1", roomId: "r10", roomNumber: "10", roomName: "10", roomLocation: "教学楼101", subjectLabel: "物理" }),
        assignment({ id: "h1", roomId: "r2", roomNumber: "2", roomName: "2", roomLocation: "教学楼101", subjectLabel: "历史", studentId: "s2", studentNo: "002" }),
      ],
      invigilation: {
        teachers: [
          { id: "physics", name: "物理老师", subject: "物理" },
          { id: "history", name: "历史老师", subject: "历史" },
        ],
        subjectTimes: [
          { subject: "物理", date: "2026-10-20", period: "morning", time: "09:00", durationMinutes: 90 },
          { subject: "历史", date: "2026-10-20", period: "morning", time: "09:00", durationMinutes: 90 },
        ],
        patrolTeacherIds: [], overrides: {},
      },
      createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z",
    };
    await downloadExamPrintRoomStatistics(arrangement);
    const sheets = writeXlsxFile.mock.calls[0][0];
    expect(sheets[0].data[0].slice(1, 3).map((cell: { value: string }) => cell.value)).toEqual(["2", "10"]);
    expect(sheets[1].data[1][4].value).toBe("2、10");
    expect(sheets[1].data[3][4].value).toContain("物理 1人");
    expect(sheets[1].data[3][4].value).toContain("历史 1人");
  });
});
