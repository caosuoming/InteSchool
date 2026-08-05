import type {
  TeacherLessonScheduleDay,
  TeacherLessonScheduleEntry,
  TeacherLessonSchedulePeriod,
  TeacherLessonScheduleTimeRange,
  TeacherLessonScheduleWeekParity,
} from "../types/index.js";

export interface TeacherScheduleSlotDefinition {
  period: TeacherLessonSchedulePeriod;
  label: string;
  defaultStartTime: string;
  defaultEndTime: string;
}

export interface TeacherScheduleColumn {
  key: string;
  day: TeacherLessonScheduleDay;
  weekParity: TeacherLessonScheduleWeekParity;
  label: string;
  shortLabel?: string;
}

export interface TeacherScheduleRenderedCell {
  entry?: TeacherLessonScheduleEntry;
  rowSpan: number;
  hidden: boolean;
}

/**
 * 默认作息只用于首次创建课表；教师可在编辑状态中按本校作息调整。
 * 时段编码保留原有 1—8 节，确保旧数据无需迁移即可继续显示。
 */
export const TEACHER_SCHEDULE_SLOTS = [
  { period: -2, label: "早早读", defaultStartTime: "06:40", defaultEndTime: "07:10" },
  { period: -1, label: "早读", defaultStartTime: "07:10", defaultEndTime: "07:40" },
  { period: 1, label: "第 1 节", defaultStartTime: "07:50", defaultEndTime: "08:35" },
  { period: 2, label: "第 2 节", defaultStartTime: "08:45", defaultEndTime: "09:30" },
  { period: 3, label: "第 3 节", defaultStartTime: "09:55", defaultEndTime: "10:40" },
  { period: 4, label: "第 4 节", defaultStartTime: "10:50", defaultEndTime: "11:35" },
  { period: 0, label: "午间练", defaultStartTime: "12:35", defaultEndTime: "13:05" },
  { period: 5, label: "第 5 节", defaultStartTime: "13:40", defaultEndTime: "14:25" },
  { period: 6, label: "第 6 节", defaultStartTime: "14:35", defaultEndTime: "15:20" },
  { period: 7, label: "第 7 节", defaultStartTime: "15:45", defaultEndTime: "16:30" },
  { period: 8, label: "第 8 节", defaultStartTime: "16:40", defaultEndTime: "17:25" },
  { period: 9, label: "晚一", defaultStartTime: "18:20", defaultEndTime: "19:05" },
  { period: 10, label: "晚二", defaultStartTime: "19:15", defaultEndTime: "20:00" },
  { period: 11, label: "晚三", defaultStartTime: "20:10", defaultEndTime: "20:55" },
  { period: 12, label: "晚四", defaultStartTime: "21:05", defaultEndTime: "21:50" },
] as const satisfies ReadonlyArray<TeacherScheduleSlotDefinition>;

export const TEACHER_SCHEDULE_WEEKDAY_COLUMNS = [
  { key: "1:all", day: 1, weekParity: "all", label: "星期一" },
  { key: "2:all", day: 2, weekParity: "all", label: "星期二" },
  { key: "3:all", day: 3, weekParity: "all", label: "星期三" },
  { key: "4:all", day: 4, weekParity: "all", label: "星期四" },
  { key: "5:all", day: 5, weekParity: "all", label: "星期五" },
] as const satisfies ReadonlyArray<TeacherScheduleColumn>;

export const TEACHER_SCHEDULE_WEEKEND_COLUMNS = [
  { key: "6:odd", day: 6, weekParity: "odd", label: "星期六 单周", shortLabel: "单周" },
  { key: "6:even", day: 6, weekParity: "even", label: "星期六 双周", shortLabel: "双周" },
  { key: "7:odd", day: 7, weekParity: "odd", label: "星期日 单周", shortLabel: "单周" },
  { key: "7:even", day: 7, weekParity: "even", label: "星期日 双周", shortLabel: "双周" },
] as const satisfies ReadonlyArray<TeacherScheduleColumn>;

export const TEACHER_SCHEDULE_COLUMNS = [
  ...TEACHER_SCHEDULE_WEEKDAY_COLUMNS,
  ...TEACHER_SCHEDULE_WEEKEND_COLUMNS,
] as const satisfies ReadonlyArray<TeacherScheduleColumn>;

const SLOT_INDEX = new Map<TeacherLessonSchedulePeriod, number>(
  TEACHER_SCHEDULE_SLOTS.map((slot, index) => [slot.period, index]),
);

export function teacherScheduleSlotIndex(period: TeacherLessonSchedulePeriod): number {
  return SLOT_INDEX.get(period) ?? Number.MAX_SAFE_INTEGER;
}

export function teacherScheduleEntryParity(
  entry: Pick<TeacherLessonScheduleEntry, "day" | "weekParity">,
): TeacherLessonScheduleWeekParity {
  if (entry.day <= 5) return "all";
  return entry.weekParity === "even" ? "even" : "odd";
}

export function teacherScheduleEntryKey(
  day: TeacherLessonScheduleDay,
  period: TeacherLessonSchedulePeriod,
  weekParity: TeacherLessonScheduleWeekParity = day <= 5 ? "all" : "odd",
): string {
  const normalizedParity = day <= 5 ? "all" : weekParity;
  return `${day}:${normalizedParity}:${period}`;
}

export function defaultTeacherScheduleTimeRanges(): TeacherLessonScheduleTimeRange[] {
  return TEACHER_SCHEDULE_SLOTS.map((slot) => ({
    period: slot.period,
    startTime: slot.defaultStartTime,
    endTime: slot.defaultEndTime,
  }));
}

export function withDefaultTeacherScheduleTimeRanges(
  timeRanges: readonly TeacherLessonScheduleTimeRange[] | undefined,
): TeacherLessonScheduleTimeRange[] {
  const supplied = new Map((timeRanges || []).map((range) => [range.period, range]));
  return TEACHER_SCHEDULE_SLOTS.map((slot) => {
    const range = supplied.get(slot.period);
    return {
      period: slot.period,
      startTime: range?.startTime || slot.defaultStartTime,
      endTime: range?.endTime || slot.defaultEndTime,
    };
  });
}

export function buildTeacherScheduleColumnCells(
  entries: readonly TeacherLessonScheduleEntry[],
  column: Pick<TeacherScheduleColumn, "day" | "weekParity">,
): TeacherScheduleRenderedCell[] {
  const byPeriod = new Map<TeacherLessonSchedulePeriod, TeacherLessonScheduleEntry>();
  for (const entry of entries) {
    if (entry.day !== column.day || teacherScheduleEntryParity(entry) !== column.weekParity) continue;
    byPeriod.set(entry.period, entry);
  }

  const cells: TeacherScheduleRenderedCell[] = TEACHER_SCHEDULE_SLOTS.map((slot) => ({
    entry: byPeriod.get(slot.period),
    rowSpan: 1,
    hidden: false,
  }));

  for (let index = 0; index < cells.length; index += 1) {
    const entry = cells[index].entry;
    if (!entry) continue;
    let end = index + 1;
    while (end < cells.length && cells[end].entry?.classId === entry.classId) end += 1;
    cells[index].rowSpan = end - index;
    for (let mergedIndex = index + 1; mergedIndex < end; mergedIndex += 1) {
      cells[mergedIndex].hidden = true;
    }
    index = end - 1;
  }

  return cells;
}
