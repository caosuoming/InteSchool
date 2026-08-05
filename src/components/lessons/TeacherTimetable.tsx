import { useMemo } from "react";
import { CalendarDays, Edit3, Save } from "lucide-react";
import type {
  SchoolClass,
  TeacherLessonScheduleDay,
  TeacherLessonScheduleEntry,
  TeacherLessonSchedulePeriod,
  TeacherLessonScheduleTimeRange,
  TeacherLessonScheduleWeekParity,
} from "@/types";
import {
  buildTeacherScheduleColumnCells,
  TEACHER_SCHEDULE_COLUMNS,
  TEACHER_SCHEDULE_SLOTS,
  TEACHER_SCHEDULE_WEEKDAY_COLUMNS,
  TEACHER_SCHEDULE_WEEKEND_COLUMNS,
  teacherScheduleEntryKey,
  withDefaultTeacherScheduleTimeRanges,
} from "@/lib/teacher-schedule";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

interface TeacherTimetableProps {
  classes: SchoolClass[];
  classNames: ReadonlyMap<string, string>;
  entries: TeacherLessonScheduleEntry[];
  draftEntries: TeacherLessonScheduleEntry[];
  timeRanges: TeacherLessonScheduleTimeRange[];
  draftTimeRanges: TeacherLessonScheduleTimeRange[];
  loading: boolean;
  editing: boolean;
  saving: boolean;
  onStartEditing: () => void;
  onCancelEditing: () => void;
  onSave: () => void;
  onSlotChange: (
    day: TeacherLessonScheduleDay,
    period: TeacherLessonSchedulePeriod,
    weekParity: TeacherLessonScheduleWeekParity,
    classId: string,
  ) => void;
  onTimeRangeChange: (
    period: TeacherLessonSchedulePeriod,
    field: "startTime" | "endTime",
    value: string,
  ) => void;
}

const baseHeaderClass = "border-b border-r border-ink-150 px-3 py-3 text-center font-medium";

export function TeacherTimetable({
  classes,
  classNames,
  entries,
  draftEntries,
  timeRanges,
  draftTimeRanges,
  loading,
  editing,
  saving,
  onStartEditing,
  onCancelEditing,
  onSave,
  onSlotChange,
  onTimeRangeChange,
}: TeacherTimetableProps) {
  const visibleEntries = editing ? draftEntries : entries;
  const visibleTimeRanges = useMemo(
    () => withDefaultTeacherScheduleTimeRanges(editing ? draftTimeRanges : timeRanges),
    [draftTimeRanges, editing, timeRanges],
  );
  const timeRangeByPeriod = useMemo(
    () => new Map(visibleTimeRanges.map((range) => [range.period, range])),
    [visibleTimeRanges],
  );
  const entryByKey = useMemo(
    () => new Map(visibleEntries.map((entry) => [
      teacherScheduleEntryKey(entry.day, entry.period, entry.weekParity),
      entry,
    ])),
    [visibleEntries],
  );
  const mergedCellsByColumn = useMemo(
    () => new Map(TEACHER_SCHEDULE_COLUMNS.map((column) => [
      column.key,
      buildTeacherScheduleColumnCells(visibleEntries, column),
    ])),
    [visibleEntries],
  );

  return (
    <Card className="mb-4 p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-gold-50 text-gold-700">
            <CalendarDays className="h-5 w-5" />
          </div>
          <div>
            <div className="font-semibold text-ink-900">我的课表</div>
            <p className="mt-1 text-xs text-ink-500">
              支持周末单双周与自定义作息；查看时，相邻且班级相同的时段会自动合并。
            </p>
          </div>
        </div>
        {!editing && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={loading || classes.length === 0}
            onClick={onStartEditing}
          >
            <Edit3 className="h-4 w-4" />编辑课表
          </Button>
        )}
      </div>

      {loading ? (
        <div className="py-12 text-center text-sm text-ink-400">课表加载中...</div>
      ) : classes.length === 0 ? (
        <div className="rounded-lg border border-dashed border-ink-200 py-12 text-center text-sm text-ink-400">
          当前没有可加入课表的任教班级
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-ink-150">
          <table className="w-full min-w-[1480px] border-collapse text-sm">
            <thead>
              <tr className="bg-mist/80 text-ink-700">
                <th
                  rowSpan={2}
                  className={`${baseHeaderClass} sticky left-0 z-20 w-24 min-w-24 bg-mist`}
                >
                  节次
                </th>
                <th
                  rowSpan={2}
                  className={`${baseHeaderClass} sticky left-24 z-20 w-36 min-w-36 bg-mist`}
                >
                  时间区间
                </th>
                {TEACHER_SCHEDULE_WEEKDAY_COLUMNS.map((column) => (
                  <th key={column.key} rowSpan={2} className={`${baseHeaderClass} min-w-36`}>
                    {column.label}
                  </th>
                ))}
                <th colSpan={2} className={`${baseHeaderClass} min-w-64`}>星期六</th>
                <th colSpan={2} className={`${baseHeaderClass} min-w-64 border-r-0`}>星期日</th>
              </tr>
              <tr className="bg-mist/80 text-xs text-ink-600">
                {TEACHER_SCHEDULE_WEEKEND_COLUMNS.map((column, index) => (
                  <th
                    key={column.key}
                    className={`${baseHeaderClass} py-2 ${index === TEACHER_SCHEDULE_WEEKEND_COLUMNS.length - 1 ? "border-r-0" : ""}`}
                  >
                    {column.shortLabel}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {TEACHER_SCHEDULE_SLOTS.map((slot, slotIndex) => {
                const timeRange = timeRangeByPeriod.get(slot.period);
                return (
                  <tr key={slot.period} className="even:bg-mist/30">
                    <th
                      scope="row"
                      className="sticky left-0 z-10 border-b border-r border-ink-100 bg-paper px-3 py-3 text-center font-medium text-ink-600"
                    >
                      {slot.label}
                    </th>
                    <td className="sticky left-24 z-10 border-b border-r border-ink-100 bg-paper px-2 py-2 text-center text-xs text-ink-600">
                      {editing ? (
                        <div className="flex items-center justify-center gap-1.5">
                          <input
                            type="time"
                            aria-label={`${slot.label} 开始时间`}
                            value={timeRange?.startTime || ""}
                            onChange={(event) => onTimeRangeChange(slot.period, "startTime", event.target.value)}
                            className="h-9 w-[5.4rem] rounded-md border border-ink-200 bg-paper px-1.5 text-xs text-ink-700 outline-none focus:border-gold-400"
                          />
                          <span aria-hidden="true">—</span>
                          <input
                            type="time"
                            aria-label={`${slot.label} 结束时间`}
                            value={timeRange?.endTime || ""}
                            onChange={(event) => onTimeRangeChange(slot.period, "endTime", event.target.value)}
                            className="h-9 w-[5.4rem] rounded-md border border-ink-200 bg-paper px-1.5 text-xs text-ink-700 outline-none focus:border-gold-400"
                          />
                        </div>
                      ) : (
                        <span className="whitespace-nowrap font-medium tabular-nums">
                          {timeRange?.startTime}—{timeRange?.endTime}
                        </span>
                      )}
                    </td>
                    {TEACHER_SCHEDULE_COLUMNS.map((column, columnIndex) => {
                      const key = teacherScheduleEntryKey(column.day, slot.period, column.weekParity);
                      const entry = entryByKey.get(key);
                      if (editing) {
                        return (
                          <td
                            key={column.key}
                            className={`border-b border-r border-ink-100 p-2 text-center ${
                              columnIndex === TEACHER_SCHEDULE_COLUMNS.length - 1 ? "border-r-0" : ""
                            }`}
                          >
                            <select
                              aria-label={`${column.label} ${slot.label.replace(/\s/g, "")}`}
                              value={entry?.classId || ""}
                              onChange={(event) => onSlotChange(
                                column.day,
                                slot.period,
                                column.weekParity,
                                event.target.value,
                              )}
                              className="h-9 w-full rounded-md border border-ink-200 bg-paper px-2 text-xs text-ink-700 outline-none focus:border-gold-400"
                            >
                              <option value="">无课</option>
                              {classes.map((schoolClass) => (
                                <option key={schoolClass.id} value={schoolClass.id}>
                                  {schoolClass.grade} · {schoolClass.name}
                                </option>
                              ))}
                            </select>
                          </td>
                        );
                      }

                      const renderedCell = mergedCellsByColumn.get(column.key)?.[slotIndex];
                      if (renderedCell?.hidden) return null;
                      return (
                        <td
                          key={column.key}
                          rowSpan={renderedCell?.rowSpan || 1}
                          className={`border-b border-r border-ink-100 p-2 text-center align-middle ${
                            columnIndex === TEACHER_SCHEDULE_COLUMNS.length - 1 ? "border-r-0" : ""
                          }`}
                        >
                          {renderedCell?.entry ? (
                            <span className="inline-flex rounded-md bg-gold-50 px-2.5 py-1.5 text-xs font-medium text-gold-800">
                              {classNames.get(renderedCell.entry.classId) || renderedCell.entry.classId}
                            </span>
                          ) : (
                            <span className="text-ink-300">—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="outline" disabled={saving} onClick={onCancelEditing}>
            取消
          </Button>
          <Button type="button" variant="gold" loading={saving} onClick={onSave}>
            <Save className="h-4 w-4" />保存课表
          </Button>
        </div>
      )}
    </Card>
  );
}
