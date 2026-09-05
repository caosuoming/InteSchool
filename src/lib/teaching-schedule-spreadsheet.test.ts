import { describe, expect, it } from "vitest";
import type { ExamArrangementContext } from "@/types";
import { parseTeachingScheduleTable } from "./teaching-schedule-spreadsheet";

const context: ExamArrangementContext = {
  cohort: {
    key: "grad-2027",
    label: "2027届高三",
    grade: "高三",
    gradYear: 2027,
    classIds: ["class-1", "class-2"],
    studentCount: 80,
  },
  classes: [
    { id: "class-1", type: "school", schoolId: "school-1", name: "高三1班", grade: "高三", studentCount: 40, createdBy: "teacher-1", createdAt: "2026-09-01T00:00:00.000Z" },
    { id: "class-2", type: "school", schoolId: "school-1", name: "高三2班", grade: "高三", studentCount: 40, createdBy: "teacher-1", createdAt: "2026-09-01T00:00:00.000Z" },
  ],
  students: [],
  teachers: [
    { id: "teacher-math", name: "张老师", subject: "数学", teachingClassIds: ["class-1", "class-2"] },
    { id: "teacher-chinese", name: "李老师", subject: "语文", teachingClassIds: ["class-1"] },
  ],
};

describe("teaching schedule spreadsheet", () => {
  it("reads the standard period row and class teacher matrix", () => {
    const parsed = parseTeachingScheduleTable([
      ["2026年秋季班级教学分工表"],
      ["年级", "班级", "年级组长", "班主任", "语文", "数学", "体育", "合计"],
      ["高三", "标准", "王老师", "", 6, 6, 3, 15],
      ["高三", "高三1班", "王老师", "赵老师", "李老师", "张老师", "周老师", ""],
      ["高三", "高三2班", "王老师", "钱老师", "", "张老师", "孙老师", ""],
    ], context);

    expect(parsed.subjects).toEqual([
      { subject: "语文", weeklyPeriods: 6 },
      { subject: "数学", weeklyPeriods: 6 },
      { subject: "体育", weeklyPeriods: 3 },
    ]);
    expect(parsed.assignments).toEqual(expect.arrayContaining([
      expect.objectContaining({ classId: "class-1", subject: "语文", teacherName: "李老师", teacherId: "teacher-chinese" }),
      expect.objectContaining({ classId: "class-1", subject: "数学", teacherName: "张老师", teacherId: "teacher-math" }),
      expect.objectContaining({ classId: "class-2", subject: "数学", teacherName: "张老师", teacherId: "teacher-math" }),
      expect.objectContaining({ classId: "class-2", subject: "体育", teacherName: "孙老师" }),
    ]));
  });

  it("rejects rows for classes outside the selected cohort", () => {
    expect(() => parseTeachingScheduleTable([
      ["班级", "语文", "数学"],
      ["标准", 6, 6],
      ["高二9班", "甲老师", "乙老师"],
    ], context)).toThrow("不属于当前年级");
  });
});
