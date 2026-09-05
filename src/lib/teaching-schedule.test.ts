import { describe, expect, it } from "vitest";
import type { TeachingScheduleConfig } from "@/types";
import {
  buildTeachingScheduleTeacherStats,
  canPlaceTeachingScheduleAssignment,
  generateTeachingSchedule,
  parseTeachingScheduleSlotKey,
  teachingScheduleSlotAllowedByRequirement,
  teachingScheduleSlotKey,
} from "./teaching-schedule";

function baseConfig(): TeachingScheduleConfig {
  return {
    assignments: [
      { id: "a1", classId: "class-1", subject: "数学", teacherName: "张老师", teacherId: "teacher-math" },
      { id: "a2", classId: "class-2", subject: "数学", teacherName: "张老师", teacherId: "teacher-math" },
      { id: "a3", classId: "class-1", subject: "语文", teacherName: "李老师", teacherId: "teacher-chinese" },
    ],
    subjects: [
      { subject: "数学", weeklyPeriods: 3 },
      { subject: "语文", weeklyPeriods: 2 },
    ],
    subjectRequirements: {},
    teacherNotes: {},
    slots: {},
  };
}

describe("teaching schedule", () => {
  it("generates the requested weekly periods without double-booking a teacher", () => {
    const result = generateTeachingSchedule(baseConfig());

    expect(result.unscheduled).toEqual([]);
    expect(Object.values(result.slots)).toHaveLength(8);

    const occupied = new Set<string>();
    for (const [key, slot] of Object.entries(result.slots)) {
      const parsed = parseTeachingScheduleSlotKey(key);
      expect(parsed).not.toBeNull();
      const teacherSlot = `${slot.teacherId}:${parsed!.day}:${parsed!.period}`;
      expect(occupied.has(teacherSlot)).toBe(false);
      occupied.add(teacherSlot);
    }
  });

  it("honors required and forbidden half-day constraints", () => {
    const config = baseConfig();
    config.assignments = config.assignments.filter((item) => item.classId === "class-1" && item.subject === "数学");
    config.subjects = [{ subject: "数学", weeklyPeriods: 2 }];
    config.subjectRequirements = {
      数学: {
        "1-morning": "forbidden",
        "2-afternoon": "required",
      },
    };

    const result = generateTeachingSchedule(config);
    expect(result.unscheduled).toEqual([]);
    const keys = Object.keys(result.slots).map((key) => parseTeachingScheduleSlotKey(key)!);
    expect(keys.some((slot) => slot.day === 1 && slot.period <= 4)).toBe(false);
    expect(keys.some((slot) => slot.day === 2 && slot.period >= 5)).toBe(true);
  });

  it("rejects required half-days that exceed the configured weekly periods", () => {
    const config = baseConfig();
    config.assignments = config.assignments.filter((item) => item.classId === "class-1" && item.subject === "数学");
    config.subjects = [{ subject: "数学", weeklyPeriods: 1 }];
    config.subjectRequirements = {
      数学: {
        "1-morning": "required",
        "2-morning": "required",
      },
    };

    expect(() => generateTeachingSchedule(config)).toThrow("每周只有 1 节");
  });

  it("fails instead of silently violating a required half-day when the teacher has no free slot", () => {
    const config = baseConfig();
    config.assignments = Array.from({ length: 5 }, (_, index) => ({
      id: `a${index}`,
      classId: `class-${index + 1}`,
      subject: "数学",
      teacherName: "张老师",
      teacherId: "teacher-math",
    }));
    config.subjects = [{ subject: "数学", weeklyPeriods: 1 }];
    config.subjectRequirements = { 数学: { "1-morning": "required" } };

    expect(() => generateTeachingSchedule(config)).toThrow("无法满足配置三的必排时段");
  });

  it("rejects placing one teacher into two classes at the same time", () => {
    const occupied = {
      [teachingScheduleSlotKey("class-1", 1, 1)]: {
        subject: "数学",
        teacherName: "张老师",
        teacherId: "teacher-math",
      },
    };

    expect(canPlaceTeachingScheduleAssignment(
      occupied,
      teachingScheduleSlotKey("class-2", 1, 1),
      { subject: "数学", teacherName: "张老师", teacherId: "teacher-math" },
    )).toBe(false);
    expect(canPlaceTeachingScheduleAssignment(
      occupied,
      teachingScheduleSlotKey("class-2", 1, 2),
      { subject: "数学", teacherName: "张老师", teacherId: "teacher-math" },
    )).toBe(true);
  });

  it("rejects a course in a half-day marked as forbidden", () => {
    const config = baseConfig();
    config.subjectRequirements = { 数学: { "1-morning": "forbidden" } };
    const value = { subject: "数学", teacherName: "张老师", teacherId: "teacher-math" };

    expect(teachingScheduleSlotAllowedByRequirement(
      config,
      teachingScheduleSlotKey("class-1", 1, 1),
      value,
    )).toBe(false);
    expect(teachingScheduleSlotAllowedByRequirement(
      config,
      teachingScheduleSlotKey("class-1", 1, 5),
      value,
    )).toBe(true);
  });

  it("reports target and current periods for the floating teacher panel", () => {
    const config = baseConfig();
    config.slots = {
      [teachingScheduleSlotKey("class-1", 1, 1)]: { subject: "数学", teacherName: "张老师", teacherId: "teacher-math" },
      [teachingScheduleSlotKey("class-2", 1, 2)]: { subject: "数学", teacherName: "张老师", teacherId: "teacher-math" },
    };

    const math = buildTeachingScheduleTeacherStats(config).find((item) => item.teacherId === "teacher-math");
    expect(math).toMatchObject({ targetPeriods: 6, currentPeriods: 2, subjects: ["数学"] });
  });
});
