import { useMemo, useState } from "react";
import { BellRing, CalendarDays, Edit3, Save, Settings2 } from "lucide-react";
import type {
  SchoolClass,
  TeacherLessonScheduleDay,
  TeacherLessonScheduleDisplayOptions,
  TeacherLessonScheduleEntry,
  TeacherLessonSchedulePeriod,
  TeacherLessonScheduleTimeRange,
  TeacherLessonScheduleWeekParity,
} from "@/types";
import {
  buildTeacherScheduleColumnCells,
  TEACHER_SCHEDULE_COLUMNS,
  TEACHER_SCHEDULE_SLOTS,
  teacherScheduleEntryKey,
  withDefaultTeacherScheduleDisplayOptions,
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
  displayOptions: TeacherLessonScheduleDisplayOptions;
  draftDisplayOptions: TeacherLessonScheduleDisplayOptions;
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
  onDisplayOptionsChange: (options: TeacherLessonScheduleDisplayOptions) => void;
}

type DesktopNotificationState = NotificationPermission | "unsupported";

function currentDesktopNotificationState(): DesktopNotificationState {
  return typeof Notification === "undefined" ? "unsupported" : Notification.permission;
}

function SettingChip({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: () => void;
}) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-ink-150 bg-paper px-2 py-1 text-[11px] text-ink-700 hover:border-gold-300">
      <input type="checkbox" checked={checked} onChange={onChange} className="accent-amber-500" />
      <span className="whitespace-nowrap">{label}</span>
    </label>
  );
}

const baseHeaderClass = "border-b border-b-ink-150 px-2 py-2 text-center font-medium whitespace-nowrap";

export function TeacherTimetable({
  classes,
  classNames,
  entries,
  draftEntries,
  timeRanges,
  draftTimeRanges,
  displayOptions,
  draftDisplayOptions,
  loading,
  editing,
  saving,
  onStartEditing,
  onCancelEditing,
  onSave,
  onSlotChange,
  onTimeRangeChange,
  onDisplayOptionsChange,
}: TeacherTimetableProps) {
  const [notificationState, setNotificationState] = useState<DesktopNotificationState>(
    currentDesktopNotificationState,
  );
  const visibleEntries = editing ? draftEntries : entries;
  const activeDisplayOptions = useMemo(
    () => withDefaultTeacherScheduleDisplayOptions(editing ? draftDisplayOptions : displayOptions),
    [displayOptions, draftDisplayOptions, editing],
  );
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
  const visibleSlots = useMemo(
    () => editing
      ? [...TEACHER_SCHEDULE_SLOTS]
      : TEACHER_SCHEDULE_SLOTS.filter((slot) => !activeDisplayOptions.hiddenPeriods.includes(slot.period)),
    [activeDisplayOptions.hiddenPeriods, editing],
  );
  const visibleColumns = useMemo(
    () => editing
      ? [...TEACHER_SCHEDULE_COLUMNS]
      : TEACHER_SCHEDULE_COLUMNS.filter((column) => !activeDisplayOptions.hiddenColumns.includes(column.key)),
    [activeDisplayOptions.hiddenColumns, editing],
  );
  const visibleWeekdayColumns = visibleColumns.filter((column) => column.day <= 5);
  const visibleWeekendColumns = visibleColumns.filter((column) => column.day >= 6);
  const saturdayColumns = visibleWeekendColumns.filter((column) => column.day === 6);
  const sundayColumns = visibleWeekendColumns.filter((column) => column.day === 7);
  const hasWeekendColumns = visibleWeekendColumns.length > 0;
  const mergedCellsByColumn = useMemo(
    () => new Map(visibleColumns.map((column) => [
      column.key,
      buildTeacherScheduleColumnCells(visibleEntries, column, visibleSlots),
    ])),
    [visibleColumns, visibleEntries, visibleSlots],
  );

  const togglePeriodOption = (
    field: "hiddenPeriods" | "boldAfterPeriods",
    period: TeacherLessonSchedulePeriod,
  ) => {
    const current = draftDisplayOptions[field];
    onDisplayOptionsChange({
      ...draftDisplayOptions,
      [field]: current.includes(period)
        ? current.filter((item) => item !== period)
        : [...current, period],
    });
  };

  const toggleColumnOption = (
    field: "hiddenColumns" | "boldAfterColumns",
    columnKey: string,
  ) => {
    const current = draftDisplayOptions[field];
    onDisplayOptionsChange({
      ...draftDisplayOptions,
      [field]: current.includes(columnKey)
        ? current.filter((item) => item !== columnKey)
        : [...current, columnKey],
    });
  };

  const columnBorderClass = (columnKey: string, isLast: boolean) => {
    if (activeDisplayOptions.boldAfterColumns.includes(columnKey)) {
      return "border-r-2 border-r-ink-400";
    }
    return isLast ? "border-r-0" : "border-r border-r-ink-100";
  };

  const rowBorderClass = (period: TeacherLessonSchedulePeriod) => (
    activeDisplayOptions.boldAfterPeriods.includes(period)
      ? "border-b-2 border-b-ink-400"
      : "border-b border-b-ink-100"
  );

  const requestDesktopNotifications = async () => {
    if (typeof Notification === "undefined") return;
    const permission = await Notification.requestPermission();
    setNotificationState(permission);
  };

  const notificationLabel = notificationState === "granted"
    ? "电脑提醒已开启"
    : notificationState === "denied"
      ? "电脑提醒已禁用"
      : notificationState === "unsupported"
        ? "浏览器不支持提醒"
        : "开启电脑提醒";

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
              支持自定义显示与分隔线；开启电脑提醒后，有课时将在上课前 10 分钟弹出通知。
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={notificationState !== "default"}
            onClick={() => void requestDesktopNotifications()}
          >
            <BellRing className="h-4 w-4" />{notificationLabel}
          </Button>
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
      </div>

      {editing && (
        <div className="mb-4 rounded-lg border border-ink-150 bg-mist/35 p-3">
          <div className="mb-3 flex items-center gap-2 text-sm font-medium text-ink-800">
            <Settings2 className="h-4 w-4" />显示与分隔线
          </div>
          <div className="grid gap-3 xl:grid-cols-2">
            <div>
              <div className="mb-1.5 text-xs font-medium text-ink-600">显示行</div>
              <div className="flex flex-wrap gap-1.5">
                {TEACHER_SCHEDULE_SLOTS.map((slot) => (
                  <SettingChip
                    key={`show-row-${slot.period}`}
                    checked={!draftDisplayOptions.hiddenPeriods.includes(slot.period)}
                    label={slot.label}
                    onChange={() => togglePeriodOption("hiddenPeriods", slot.period)}
                  />
                ))}
              </div>
            </div>
            <div>
              <div className="mb-1.5 text-xs font-medium text-ink-600">显示列</div>
              <div className="flex flex-wrap gap-1.5">
                {TEACHER_SCHEDULE_COLUMNS.map((column) => (
                  <SettingChip
                    key={`show-column-${column.key}`}
                    checked={!draftDisplayOptions.hiddenColumns.includes(column.key)}
                    label={column.label}
                    onChange={() => toggleColumnOption("hiddenColumns", column.key)}
                  />
                ))}
              </div>
            </div>
            <div>
              <div className="mb-1.5 text-xs font-medium text-ink-600">加粗横线</div>
              <div className="flex flex-wrap gap-1.5">
                {TEACHER_SCHEDULE_SLOTS.map((slot) => (
                  <SettingChip
                    key={`bold-row-${slot.period}`}
                    checked={draftDisplayOptions.boldAfterPeriods.includes(slot.period)}
                    label={`${slot.label} 后`}
                    onChange={() => togglePeriodOption("boldAfterPeriods", slot.period)}
                  />
                ))}
              </div>
            </div>
            <div>
              <div className="mb-1.5 text-xs font-medium text-ink-600">加粗竖线</div>
              <div className="flex flex-wrap gap-1.5">
                {TEACHER_SCHEDULE_COLUMNS.map((column) => (
                  <SettingChip
                    key={`bold-column-${column.key}`}
                    checked={draftDisplayOptions.boldAfterColumns.includes(column.key)}
                    label={`${column.label} 后`}
                    onChange={() => toggleColumnOption("boldAfterColumns", column.key)}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="py-12 text-center text-sm text-ink-400">课表加载中...</div>
      ) : classes.length === 0 ? (
        <div className="rounded-lg border border-dashed border-ink-200 py-12 text-center text-sm text-ink-400">
          当前没有可加入课表的任教班级
        </div>
      ) : visibleSlots.length === 0 || visibleColumns.length === 0 ? (
        <div className="rounded-lg border border-dashed border-ink-200 py-12 text-center text-sm text-ink-400">
          当前显示设置隐藏了全部{visibleSlots.length === 0 ? "行" : "课程列"}，点击“编辑课表”调整。
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-ink-150">
          <table className="w-max min-w-full table-auto border-collapse text-xs">
            <thead>
              <tr className="bg-mist/80 text-ink-700">
                <th
                  rowSpan={hasWeekendColumns ? 2 : 1}
                  className={`${baseHeaderClass} sticky left-0 z-20 w-20 min-w-20 border-r border-r-ink-150 bg-mist`}
                >
                  节次
                </th>
                <th
                  rowSpan={hasWeekendColumns ? 2 : 1}
                  className={`${baseHeaderClass} sticky left-20 z-20 w-32 min-w-32 border-r border-r-ink-150 bg-mist`}
                >
                  时间区间
                </th>
                {visibleWeekdayColumns.map((column) => {
                  const columnIndex = visibleColumns.findIndex((item) => item.key === column.key);
                  return (
                    <th
                      key={column.key}
                      rowSpan={hasWeekendColumns ? 2 : 1}
                      className={`${baseHeaderClass} ${columnBorderClass(column.key, columnIndex === visibleColumns.length - 1)}`}
                    >
                      {column.label}
                    </th>
                  );
                })}
                {saturdayColumns.length > 0 && (
                  <th
                    colSpan={saturdayColumns.length}
                    className={`${baseHeaderClass} ${columnBorderClass(
                      saturdayColumns[saturdayColumns.length - 1].key,
                      visibleColumns[visibleColumns.length - 1]?.key === saturdayColumns[saturdayColumns.length - 1].key,
                    )}`}
                  >
                    星期六
                  </th>
                )}
                {sundayColumns.length > 0 && (
                  <th
                    colSpan={sundayColumns.length}
                    className={`${baseHeaderClass} ${columnBorderClass(
                      sundayColumns[sundayColumns.length - 1].key,
                      true,
                    )}`}
                  >
                    星期日
                  </th>
                )}
              </tr>
              {hasWeekendColumns && (
                <tr className="bg-mist/80 text-[11px] text-ink-600">
                  {visibleWeekendColumns.map((column) => {
                    const columnIndex = visibleColumns.findIndex((item) => item.key === column.key);
                    return (
                      <th
                        key={column.key}
                        className={`${baseHeaderClass} py-1.5 ${columnBorderClass(column.key, columnIndex === visibleColumns.length - 1)}`}
                      >
                        {column.weekParity === "odd" ? "单周" : "双周"}
                      </th>
                    );
                  })}
                </tr>
              )}
            </thead>
            <tbody>
              {visibleSlots.map((slot, slotIndex) => {
                const timeRange = timeRangeByPeriod.get(slot.period);
                return (
                  <tr key={slot.period} className="even:bg-mist/30">
                    <th
                      scope="row"
                      className={`sticky left-0 z-10 border-r border-r-ink-100 bg-paper px-2 py-2 text-center font-medium text-ink-600 whitespace-nowrap ${rowBorderClass(slot.period)}`}
                    >
                      {slot.label}
                    </th>
                    <td className={`sticky left-20 z-10 border-r border-r-ink-100 bg-paper px-2 py-1.5 text-center text-[11px] text-ink-600 ${rowBorderClass(slot.period)}`}>
                      {editing ? (
                        <div className="flex items-center justify-center gap-1">
                          <input
                            type="time"
                            aria-label={`${slot.label} 开始时间`}
                            value={timeRange?.startTime || ""}
                            onChange={(event) => onTimeRangeChange(slot.period, "startTime", event.target.value)}
                            className="h-8 w-[5.1rem] rounded-md border border-ink-200 bg-paper px-1 text-[11px] text-ink-700 outline-none focus:border-gold-400"
                          />
                          <span aria-hidden="true">—</span>
                          <input
                            type="time"
                            aria-label={`${slot.label} 结束时间`}
                            value={timeRange?.endTime || ""}
                            onChange={(event) => onTimeRangeChange(slot.period, "endTime", event.target.value)}
                            className="h-8 w-[5.1rem] rounded-md border border-ink-200 bg-paper px-1 text-[11px] text-ink-700 outline-none focus:border-gold-400"
                          />
                        </div>
                      ) : (
                        <span className="whitespace-nowrap font-medium tabular-nums">
                          {timeRange?.startTime}—{timeRange?.endTime}
                        </span>
                      )}
                    </td>
                    {visibleColumns.map((column, columnIndex) => {
                      const key = teacherScheduleEntryKey(column.day, slot.period, column.weekParity);
                      const entry = entryByKey.get(key);
                      const verticalBorder = columnBorderClass(column.key, columnIndex === visibleColumns.length - 1);
                      if (editing) {
                        return (
                          <td
                            key={column.key}
                            className={`px-1.5 py-1.5 text-center ${rowBorderClass(slot.period)} ${verticalBorder}`}
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
                              className="h-8 min-w-[7rem] max-w-[10rem] rounded-md border border-ink-200 bg-paper px-1.5 text-[11px] text-ink-700 outline-none focus:border-gold-400"
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
                      const rowSpan = renderedCell?.rowSpan || 1;
                      const lastSpannedPeriod = visibleSlots[slotIndex + rowSpan - 1]?.period || slot.period;
                      return (
                        <td
                          key={column.key}
                          rowSpan={rowSpan}
                          className={`px-1.5 py-1.5 text-center align-middle ${rowBorderClass(lastSpannedPeriod)} ${verticalBorder}`}
                        >
                          {renderedCell?.entry ? (
                            <span className="inline-flex whitespace-nowrap rounded-md bg-gold-50 px-2 py-1 text-[11px] font-medium text-gold-800">
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
