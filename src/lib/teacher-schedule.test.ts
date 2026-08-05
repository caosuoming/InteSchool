import { describe, expect, it } from "vitest";
import type { TeacherLessonScheduleEntry } from "@/types";
import {
  buildTeacherScheduleColumnCells,
  defaultTeacherScheduleTimeRanges,
  TEACHER_SCHEDULE_SLOTS,
  TEACHER_SCHEDULE_WEEKEND_COLUMNS,
} from "@/lib/teacher-schedule";

describe("teacher schedule helpers", () => {
  it("defines every requested timetable slot in display order", () => {
    expect(TEACHER_SCHEDULE_SLOTS.map((slot) => slot.label)).toEqual([
      "早早读",
      "早读",
      "第 1 节",
      "第 2 节",
      "第 3 节",
      "第 4 节",
      "午间练",
      "第 5 节",
      "第 6 节",
      "第 7 节",
      "第 8 节",
      "晚一",
      "晚二",
      "晚三",
      "晚四",
    ]);
    expect(defaultTeacherScheduleTimeRanges()).toHaveLength(15);
    expect(TEACHER_SCHEDULE_WEEKEND_COLUMNS.map((column) => column.label)).toEqual([
      "星期六 单周",
      "星期六 双周",
      "星期日 单周",
      "星期日 双周",
    ]);
  });

  it("merges only vertically adjacent cells with the same class", () => {
    const entries: TeacherLessonScheduleEntry[] = [
      { day: 1, period: 1, weekParity: "all", classId: "class-1" },
      { day: 1, period: 2, weekParity: "all", classId: "class-1" },
      { day: 1, period: 3, weekParity: "all", classId: "class-2" },
      { day: 1, period: 5, weekParity: "all", classId: "class-2" },
    ];

    const cells = buildTeacherScheduleColumnCells(entries, { day: 1, weekParity: "all" });
    const firstLessonIndex = TEACHER_SCHEDULE_SLOTS.findIndex((slot) => slot.period === 1);
    const secondLessonIndex = TEACHER_SCHEDULE_SLOTS.findIndex((slot) => slot.period === 2);
    const thirdLessonIndex = TEACHER_SCHEDULE_SLOTS.findIndex((slot) => slot.period === 3);
    const fifthLessonIndex = TEACHER_SCHEDULE_SLOTS.findIndex((slot) => slot.period === 5);

    expect(cells[firstLessonIndex]).toMatchObject({ rowSpan: 2, hidden: false });
    expect(cells[secondLessonIndex]).toMatchObject({ rowSpan: 1, hidden: true });
    expect(cells[thirdLessonIndex]).toMatchObject({ rowSpan: 1, hidden: false });
    expect(cells[fifthLessonIndex]).toMatchObject({ rowSpan: 1, hidden: false });
  });

  it("keeps weekend odd and even week schedules independent", () => {
    const entries: TeacherLessonScheduleEntry[] = [
      { day: 6, period: 1, weekParity: "odd", classId: "class-odd" },
      { day: 6, period: 1, weekParity: "even", classId: "class-even" },
    ];
    const firstLessonIndex = TEACHER_SCHEDULE_SLOTS.findIndex((slot) => slot.period === 1);

    const oddCells = buildTeacherScheduleColumnCells(entries, { day: 6, weekParity: "odd" });
    const evenCells = buildTeacherScheduleColumnCells(entries, { day: 6, weekParity: "even" });

    expect(oddCells[firstLessonIndex].entry?.classId).toBe("class-odd");
    expect(evenCells[firstLessonIndex].entry?.classId).toBe("class-even");
  });
});
