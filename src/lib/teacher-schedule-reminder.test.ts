import { describe, expect, it } from "vitest";
import type { TeacherLessonSchedule } from "@/types";
import { dueTeacherScheduleReminders, teacherScheduleWeekParity } from "@/lib/teacher-schedule-reminder";

function mondaySchedule(): TeacherLessonSchedule {
  return {
    entries: [
      { day: 1, period: 1, weekParity: "all", classId: "class-1" },
      { day: 1, period: 2, weekParity: "all", classId: "class-1" },
    ],
    timeRanges: [
      { period: 1, startTime: "07:50", endTime: "08:35" },
      { period: 2, startTime: "08:45", endTime: "09:30" },
    ],
  };
}

describe("teacher schedule reminders", () => {
  it("fires once inside the ten-minute window and not before or after class starts", () => {
    const schedule = mondaySchedule();
    expect(dueTeacherScheduleReminders(schedule, new Date(2026, 8, 7, 7, 39))).toEqual([]);

    const due = dueTeacherScheduleReminders(schedule, new Date(2026, 8, 7, 7, 45));
    expect(due).toHaveLength(1);
    expect(due[0]).toMatchObject({
      key: "2026-09-07:1:all:1",
      slotLabel: "第 1 节",
      entry: { classId: "class-1" },
    });

    expect(dueTeacherScheduleReminders(schedule, new Date(2026, 8, 7, 7, 50))).toEqual([]);
  });

  it("treats adjacent slots for the same class as one lesson", () => {
    expect(dueTeacherScheduleReminders(mondaySchedule(), new Date(2026, 8, 7, 8, 40))).toEqual([]);

    const schedule = mondaySchedule();
    schedule.entries[1] = { day: 1, period: 2, weekParity: "all", classId: "class-2" };
    expect(dueTeacherScheduleReminders(schedule, new Date(2026, 8, 7, 8, 40))).toHaveLength(1);
  });

  it("uses stable ISO week parity for weekend schedules", () => {
    expect(teacherScheduleWeekParity(new Date(2026, 8, 12))).toBe("odd");
    expect(teacherScheduleWeekParity(new Date(2026, 8, 19))).toBe("even");
  });
});
