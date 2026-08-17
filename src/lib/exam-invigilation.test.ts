import { describe, expect, it } from "vitest";
import type { ExamArrangement, ExamInvigilationConfig } from "@/types";
import {
  buildExamInvigilationTable,
  examInvigilationPeriodLabel,
  formatExamDateWithWeekday,
  formatExamTimeRange,
  invigilationSlotKey,
} from "./exam-invigilation";

function arrangement(): ExamArrangement {
  return {
    id: "arr-1",
    schoolId: "school-1",
    teacherId: "teacher-1",
    cohortKey: "grad-2026",
    cohortLabel: "2026届高三",
    name: "期中考试",
    examDate: "2026-10-20",
    mode: "subject",
    subjects: ["物理", "历史", "数学"],
    separateSubjects: ["物理", "历史", "数学"],
    rooms: [
      { id: "room-1", name: "1", number: "1", location: "教学楼101", capacity: 40 },
      { id: "room-2", name: "2", number: "2", location: "教学楼102", capacity: 40 },
      { id: "room-unused", name: "3", number: "3", location: "教学楼103", capacity: 40 },
    ],
    classRules: [],
    studentSubjects: [],
    assignments: [
      {
        id: "physics:s1",
        studentId: "s1",
        studentName: "甲",
        studentNo: "001",
        classId: "c1",
        className: "高三1班",
        subjectLabel: "物理",
        sessionKey: "subject:物理",
        roomId: "room-1",
        roomName: "1",
        roomNumber: "1",
        roomLocation: "教学楼101",
        seatNo: 1,
        admissionNo: "001",
      },
      {
        id: "history:s2",
        studentId: "s2",
        studentName: "乙",
        studentNo: "002",
        classId: "c1",
        className: "高三1班",
        subjectLabel: "历史",
        sessionKey: "subject:历史",
        roomId: "room-2",
        roomName: "2",
        roomNumber: "2",
        roomLocation: "教学楼102",
        seatNo: 1,
        admissionNo: "002",
      },
      {
        id: "math:s1",
        studentId: "s1",
        studentName: "甲",
        studentNo: "001",
        classId: "c1",
        className: "高三1班",
        subjectLabel: "数学",
        sessionKey: "subject:数学",
        roomId: "room-1",
        roomName: "1",
        roomNumber: "1",
        roomLocation: "教学楼101",
        seatNo: 1,
        admissionNo: "001",
      },
    ],
    createdAt: "2026-08-17T00:00:00.000Z",
    updatedAt: "2026-08-17T00:00:00.000Z",
  };
}

function config(): ExamInvigilationConfig {
  return {
    teachers: [
      { id: "physics", name: "物理教师", subject: "物理" },
      { id: "history", name: "历史教师", subject: "历史" },
      { id: "prep", name: "物理备课组长", subject: "物理", isPrepLeader: true },
      { id: "leader", name: "年级领导", subject: "数学", isLeader: true },
    ],
    subjectTimes: [
      { subject: "物理", date: "2026-10-20", period: "morning", time: "08:00", durationMinutes: 90 },
      { subject: "历史", date: "2026-10-20", period: "morning", time: "08:00", durationMinutes: 90 },
      { subject: "数学", date: "2026-10-20", period: "afternoon", time: "14:00", durationMinutes: 120 },
    ],
    overrides: {},
  };
}

describe("exam invigilation table", () => {
  it("groups simultaneous subjects, skips unused rooms, and prefers matching roles", () => {
    const table = buildExamInvigilationTable(arrangement(), config());

    expect(table.rooms.map((room) => room.roomId)).toEqual(["room-1", "room-2"]);
    expect(table.rooms.map((room) => room.studentCount)).toEqual([1, 1]);
    expect(table.rows).toHaveLength(2);
    expect(table.rows[0]).toMatchObject({
      subjectLabel: "物理 / 历史",
      roomStudentCounts: { "room-1": 1, "room-2": 1 },
      roomTeacherIds: { "room-1": "physics", "room-2": "history" },
      outsideTeacherId: "prep",
    });
    expect(table.patrolTeacherIds).toEqual(["leader"]);
    expect(table.rows[1].subjectLabel).toBe("数学");
    expect(table.rows[1].roomTeacherIds["room-1"]).toBeNull();
    expect(table.rows[1].roomTeacherIds["room-2"]).toBeNull();
  });

  it("honors manual overrides and recomputes automatic assignments around them", () => {
    const input = arrangement();
    const settings = config();
    const simultaneous = settings.subjectTimes.slice(0, 2);
    const key = invigilationSlotKey(simultaneous);
    settings.overrides = {
      [key]: {
        roomTeacherIds: { "room-1": "prep" },
      },
    };

    const table = buildExamInvigilationTable(input, settings);
    expect(table.rows[0].roomTeacherIds["room-1"]).toBe("prep");
    expect(table.rows[0].outsideTeacherId).toBeNull();
    expect(table.rows[0].roomTeacherIds["room-2"]).toBe("history");
    expect(table.teacherStats.find((item) => item.teacherId === "prep")).toMatchObject({ minutes: 90, sessions: 1 });
  });

  it("uses explicit blank overrides instead of refilling the cell", () => {
    const input = arrangement();
    const settings = config();
    const key = invigilationSlotKey(settings.subjectTimes.slice(0, 2));
    settings.overrides = {
      [key]: {
        roomTeacherIds: { "room-1": null },
        outsideTeacherId: null,
      },
    };
    settings.patrolTeacherIds = [];

    const table = buildExamInvigilationTable(input, settings);
    expect(table.rows[0].roomTeacherIds["room-1"]).toBeNull();
    expect(table.rows[0].outsideTeacherId).toBeNull();
    expect(table.patrolTeacherIds).toEqual([]);
  });

  it("groups rooms that share one physical address into one header group", () => {
    const input = arrangement();
    input.rooms[1].location = input.rooms[0].location;

    const table = buildExamInvigilationTable(input, config());

    expect(table.roomLocationGroups).toEqual([{
      roomLocation: "教学楼101",
      roomIds: ["room-1", "room-2"],
    }]);
  });

  it("reports duplicate teachers instead of silently clearing another assignment", () => {
    const settings = config();
    const key = invigilationSlotKey(settings.subjectTimes.slice(0, 2));
    settings.overrides = {
      [key]: {
        roomTeacherIds: { "room-1": "physics", "room-2": "physics" },
      },
    };

    const table = buildExamInvigilationTable(arrangement(), settings);

    expect(table.rows[0].roomTeacherIds).toMatchObject({ "room-1": "physics", "room-2": "physics" });
    expect(table.rows[0].duplicateTeacherIds).toEqual(["physics"]);
  });

  it("formats weekday, evening period, and end time for the four exam-info columns", () => {
    expect(formatExamDateWithWeekday("2026-10-20")).toBe("2026-10-20 星期二");
    expect(examInvigilationPeriodLabel("evening")).toBe("晚上");
    expect(formatExamTimeRange("18:30", 120)).toBe("18:30–20:30");
    expect(formatExamTimeRange("23:30", 120)).toBe("23:30–次日01:30");
  });
});
