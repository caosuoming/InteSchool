import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ExamSeatAssignment } from "@/types";
import {
  downloadDeskLabels,
  groupDeskLabels,
  groupDeskLabelsByRoom,
  groupStudentArrangements,
} from "./exam-arrangement-export";

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
});
