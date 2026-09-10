import type {
  TeacherLessonSchedule,
  TeacherLessonScheduleEntry,
  TeacherLessonScheduleWeekParity,
} from "@/types";
import {
  TEACHER_SCHEDULE_SLOTS,
  teacherScheduleEntryKey,
  teacherScheduleEntryParity,
  teacherScheduleSlotIndex,
  withDefaultTeacherScheduleTimeRanges,
} from "@/lib/teacher-schedule";

export interface TeacherScheduleReminderOccurrence {
  key: string;
  entry: TeacherLessonScheduleEntry;
  slotLabel: string;
  startAt: Date;
}

function localDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isoWeekNumber(date: Date): number {
  const utc = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  return Math.ceil((((utc.getTime() - yearStart.getTime()) / 86_400_000) + 1) / 7);
}

export function teacherScheduleWeekParity(date: Date): Exclude<TeacherLessonScheduleWeekParity, "all"> {
  return isoWeekNumber(date) % 2 === 0 ? "even" : "odd";
}

function scheduleDay(date: Date): 1 | 2 | 3 | 4 | 5 | 6 | 7 {
  const day = date.getDay();
  return (day === 0 ? 7 : day) as 1 | 2 | 3 | 4 | 5 | 6 | 7;
}

function dateAtTime(date: Date, time: string): Date {
  const [hour, minute] = time.split(":").map(Number);
  const result = new Date(date);
  result.setHours(hour, minute, 0, 0);
  return result;
}

/**
 * Returns today's lessons whose reminder window has opened but whose class has not started yet.
 * Adjacent timetable slots for the same class are treated as one merged lesson, matching the timetable UI.
 */
export function dueTeacherScheduleReminders(
  schedule: Pick<TeacherLessonSchedule, "entries" | "timeRanges">,
  now: Date,
  minutesBefore = 10,
): TeacherScheduleReminderOccurrence[] {
  const day = scheduleDay(now);
  const parity: TeacherLessonScheduleWeekParity = day <= 5 ? "all" : teacherScheduleWeekParity(now);
  const ranges = new Map(
    withDefaultTeacherScheduleTimeRanges(schedule.timeRanges).map((range) => [range.period, range]),
  );
  const entries = schedule.entries
    .filter((entry) => entry.day === day && teacherScheduleEntryParity(entry) === parity)
    .sort((left, right) => teacherScheduleSlotIndex(left.period) - teacherScheduleSlotIndex(right.period));
  const entryByKey = new Map(entries.map((entry) => [
    teacherScheduleEntryKey(entry.day, entry.period, entry.weekParity),
    entry,
  ]));

  return entries.flatMap((entry) => {
    const slotIndex = teacherScheduleSlotIndex(entry.period);
    const previousSlot = slotIndex > 0 ? TEACHER_SCHEDULE_SLOTS[slotIndex - 1] : undefined;
    if (previousSlot) {
      const previousEntry = entryByKey.get(teacherScheduleEntryKey(day, previousSlot.period, parity));
      if (previousEntry?.classId === entry.classId) return [];
    }

    const range = ranges.get(entry.period);
    const slot = TEACHER_SCHEDULE_SLOTS[slotIndex];
    if (!range || !slot) return [];
    const startAt = dateAtTime(now, range.startTime);
    const remindAt = new Date(startAt.getTime() - minutesBefore * 60_000);
    if (now < remindAt || now >= startAt) return [];
    return [{
      key: `${localDateKey(now)}:${teacherScheduleEntryKey(day, entry.period, parity)}`,
      entry,
      slotLabel: slot.label,
      startAt,
    }];
  });
}
