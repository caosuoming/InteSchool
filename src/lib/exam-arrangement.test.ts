import { describe, expect, it } from "vitest";
import type { ExamArrangementContext, ExamArrangementInput } from "@/types";
import { generateExamAssignments } from "./exam-arrangement";

const context: ExamArrangementContext = {
  cohort: {
    key: "grad-2028",
    label: "2028届高二",
    grade: "高二",
    gradYear: 2028,
    classIds: ["class-1", "class-2"],
    studentCount: 3,
  },
  classes: [
    {
      id: "class-1",
      type: "school",
      schoolId: "school-1",
      name: "高二（1）班",
      grade: "高二",
      studentCount: 2,
      createdBy: "teacher-1",
      createdAt: "2026-01-01T00:00:00.000Z",
    },
    {
      id: "class-2",
      type: "school",
      schoolId: "school-1",
      name: "高二（2）班",
      grade: "高二",
      studentCount: 1,
      createdBy: "teacher-1",
      createdAt: "2026-01-01T00:00:00.000Z",
    },
  ],
  students: [
    { id: "student-1", name: "甲", studentNo: "001", classId: "class-1", schoolId: "school-1", grade: "高二", status: "active" },
    { id: "student-2", name: "乙", studentNo: "002", classId: "class-1", schoolId: "school-1", grade: "高二", status: "active" },
    { id: "student-3", name: "丙", studentNo: "003", classId: "class-2", schoolId: "school-1", grade: "高二", status: "active" },
  ],
};

function input(mode: ExamArrangementInput["mode"]): ExamArrangementInput {
  return {
    cohortKey: context.cohort.key,
    name: "期末考试",
    examDate: "2026-06-20",
    mode,
    subjects: ["物理", "化学"],
    rooms: [
      { id: "room-a", name: "第一考场", capacity: 2 },
      { id: "room-b", name: "第二考场", capacity: 1 },
    ],
    classRules: [
      {
        classId: "class-1",
        defaultSubjects: ["物理", "化学"],
        subjectRoomIds: { 物理: ["room-a"], 化学: ["room-a", "room-b"] },
      },
      {
        classId: "class-2",
        defaultSubjects: ["物理"],
        subjectRoomIds: { 物理: ["room-b"], 化学: ["room-b"] },
      },
    ],
    studentSubjects: [
      { studentId: "student-1", subjects: ["物理", "化学"] },
      { studentId: "student-2", subjects: ["化学"] },
      { studentId: "student-3", subjects: ["物理"] },
    ],
  };
}

describe("generateExamAssignments", () => {
  it("reuses room capacity independently for each subject session", () => {
    const assignments = generateExamAssignments(input("subject"), context);
    expect(assignments).toHaveLength(4);
    expect(assignments.filter((item) => item.subjectLabel === "物理")).toHaveLength(2);
    expect(assignments.filter((item) => item.subjectLabel === "化学")).toHaveLength(2);
    expect(assignments.find((item) => item.studentId === "student-3" && item.subjectLabel === "物理")?.roomId).toBe("room-b");
    expect(new Set(assignments.map((item) => item.admissionNo)).size).toBe(assignments.length);
  });

  it("creates one seat per student and intersects room rules in combination mode", () => {
    const assignments = generateExamAssignments(input("combination"), context);
    expect(assignments).toHaveLength(3);
    expect(assignments.find((item) => item.studentId === "student-1")).toMatchObject({
      roomId: "room-a",
      subjectLabel: "物理 / 化学",
    });
    expect(assignments.find((item) => item.studentId === "student-3")?.roomId).toBe("room-b");
  });

  it("reports the first student that cannot fit into eligible rooms", () => {
    const constrained = input("combination");
    constrained.rooms = [{ id: "room-a", name: "单一考场", capacity: 1 }];
    constrained.classRules = constrained.classRules.map((rule) => ({
      ...rule,
      subjectRoomIds: { 物理: ["room-a"], 化学: ["room-a"] },
    }));
    expect(() => generateExamAssignments(constrained, context)).toThrow(/考场容量不足/);
  });

  it("separates checked subjects and combines the remaining subjects", () => {
    const mixed = input("combination");
    mixed.separateSubjects = ["物理"];

    const assignments = generateExamAssignments(mixed, context);

    expect(assignments).toHaveLength(4);
    expect(assignments.filter((item) => item.sessionKey === "subject:物理")).toHaveLength(2);
    expect(assignments.filter((item) => item.sessionKey === "combined")).toHaveLength(2);
    expect(assignments.find((item) => item.studentId === "student-1" && item.sessionKey === "combined")?.subjectLabel).toBe("化学");
  });

  it("does not create seats for students marked absent", () => {
    const absent = input("combination");
    absent.studentSubjects = absent.studentSubjects.map((selection) => selection.studentId === "student-1"
      ? { ...selection, absent: true }
      : selection);

    const assignments = generateExamAssignments(absent, context);

    expect(assignments).toHaveLength(2);
    expect(assignments.some((item) => item.studentId === "student-1")).toBe(false);
  });

  it("uses the latest grade rank as the seat order when requested", () => {
    const ranked = input("combination");
    ranked.seatOrder = "previousRank";
    ranked.rooms = [{ id: "room-a", name: "第一考场", number: "A01", location: "教学楼 101", capacity: 3 }];
    ranked.classRules = ranked.classRules.map((rule) => ({
      ...rule,
      subjectRoomIds: { 物理: ["room-a"], 化学: ["room-a"] },
    }));
    const rankedContext: ExamArrangementContext = {
      ...context,
      previousGradeRanks: {
        "student-1": 2,
        "student-2": 3,
        "student-3": 1,
      },
    };

    const assignments = generateExamAssignments(ranked, rankedContext);

    expect(assignments.find((item) => item.studentId === "student-3")?.seatNo).toBe(1);
    expect(assignments.find((item) => item.studentId === "student-1")?.seatNo).toBe(2);
    expect(assignments.find((item) => item.studentId === "student-2")?.seatNo).toBe(3);
    expect(assignments[0]).toMatchObject({ roomNumber: "A01", roomLocation: "教学楼 101" });
  });
});
