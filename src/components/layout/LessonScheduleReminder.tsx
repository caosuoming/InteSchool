import { useCallback, useEffect, useState } from "react";
import type { TeacherLessonSchedule } from "@/types";
import { classService } from "@/services/class";
import { lessonCoursewareService } from "@/services/lessonCourseware";
import { dueTeacherScheduleReminders } from "@/lib/teacher-schedule-reminder";

const SCHEDULE_REFRESH_MS = 5 * 60_000;
const REMINDER_CHECK_MS = 15_000;
const REMINDER_STORAGE_PREFIX = "inteschool:lesson-reminders:";

interface ReminderHistory {
  date: string;
  keys: string[];
}

function localDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function readReminderHistory(teacherId: string, now: Date): ReminderHistory {
  const date = localDateKey(now);
  try {
    const parsed = JSON.parse(localStorage.getItem(`${REMINDER_STORAGE_PREFIX}${teacherId}`) || "null") as ReminderHistory | null;
    if (parsed?.date === date && Array.isArray(parsed.keys)) return parsed;
  } catch {
    // Corrupt local reminder history should never block current reminders.
  }
  return { date, keys: [] };
}

function writeReminderHistory(teacherId: string, history: ReminderHistory): void {
  try {
    localStorage.setItem(`${REMINDER_STORAGE_PREFIX}${teacherId}`, JSON.stringify(history));
  } catch {
    // Private browsing or storage quotas may make localStorage unavailable.
  }
}

interface LessonScheduleReminderProps {
  teacherId: string;
  schoolId: string | null;
}

/** Keeps lesson reminders active anywhere inside the signed-in application. */
export function LessonScheduleReminder({ teacherId, schoolId }: LessonScheduleReminderProps) {
  const [schedule, setSchedule] = useState<TeacherLessonSchedule | null>(null);
  const [classNames, setClassNames] = useState<Map<string, string>>(new Map());

  const refresh = useCallback(async () => {
    if (!schoolId) {
      setSchedule(null);
      setClassNames(new Map());
      return;
    }
    try {
      const [nextSchedule, classes] = await Promise.all([
        lessonCoursewareService.getLessonSchedule(),
        classService.listSchoolClasses(schoolId),
      ]);
      setSchedule(nextSchedule);
      setClassNames(new Map(classes.map((item) => [item.id, `${item.grade} · ${item.name}`])));
    } catch {
      // Reminder refresh failure must not interrupt the signed-in application.
    }
  }, [schoolId]);

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => void refresh(), SCHEDULE_REFRESH_MS);
    const handleFocus = () => void refresh();
    window.addEventListener("focus", handleFocus);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", handleFocus);
    };
  }, [refresh]);

  useEffect(() => {
    if (!schedule) return;

    const check = () => {
      if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
      const now = new Date();
      const history = readReminderHistory(teacherId, now);
      let changed = false;
      for (const occurrence of dueTeacherScheduleReminders(schedule, now, 10)) {
        if (history.keys.includes(occurrence.key)) continue;
        const className = classNames.get(occurrence.entry.classId);
        try {
          const notification = new Notification("上课提醒", {
            body: className
              ? `${className} · ${occurrence.slotLabel}将在 10 分钟后开始`
              : `${occurrence.slotLabel}将在 10 分钟后开始`,
            tag: `inteschool-${occurrence.key}`,
            silent: false,
          });
          notification.onclick = () => window.focus();
          history.keys.push(occurrence.key);
          changed = true;
        } catch {
          // Permission or platform state can change between the permission check and constructor.
        }
      }
      if (changed) writeReminderHistory(teacherId, history);
    };

    check();
    const interval = window.setInterval(check, REMINDER_CHECK_MS);
    return () => window.clearInterval(interval);
  }, [classNames, schedule, teacherId]);

  return null;
}
