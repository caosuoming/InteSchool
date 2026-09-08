import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ExamArrangementContext, TeachingScheduleConfig } from "@/types";
import { downloadTeachingScheduleTemplate, parseTeachingScheduleTable } from "./teaching-schedule-spreadsheet";

const { writeXlsxFile, toFile } = vi.hoisted(() => ({
  writeXlsxFile: vi.fn(),
  toFile: vi.fn(),
}));

vi.mock("write-excel-file/browser", () => ({ default: writeXlsxFile }));

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
  beforeEach(() => {
    writeXlsxFile.mockReset();
    toFile.mockReset();
    writeXlsxFile.mockReturnValue({ toFile });
  });
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

  it("imports only the selected grade from an all-grade template with merged grade cells", () => {
    const parsed = parseTeachingScheduleTable([
      ["年级", "班级", "年级组长", "班主任", "语文", "数学", "合计"],
      ["高三", "标准", "王老师", "", 6, 6, 12],
      [null, "高三1班", "王老师", "赵老师", "李老师", "张老师", ""],
      ["高二", "标准", "周老师", "", 5, 5, 10],
      [null, "高二9班", "周老师", "钱老师", "甲老师", "乙老师", ""],
    ], context);

    expect(parsed.subjects).toEqual([
      { subject: "语文", weeklyPeriods: 6 },
      { subject: "数学", weeklyPeriods: 6 },
    ]);
    expect(parsed.assignments).toHaveLength(2);
    expect(parsed.assignments).toEqual(expect.arrayContaining([
      expect.objectContaining({ classId: "class-1", subject: "语文", teacherName: "李老师" }),
      expect.objectContaining({ classId: "class-1", subject: "数学", teacherName: "张老师" }),
    ]));
  });

  it("rejects rows for classes outside the selected cohort", () => {
    expect(() => parseTeachingScheduleTable([
      ["班级", "语文", "数学"],
      ["标准", 6, 6],
      ["高二9班", "甲老师", "乙老师"],
    ], context)).toThrow("不属于当前年级");
  });

  it("exports one matrix containing every grade, class and subject", async () => {
    const highThreeConfig: TeachingScheduleConfig = {
      assignments: [
        { id: "a-1", classId: "class-1", subject: "语文", teacherName: "李老师", teacherId: "teacher-chinese" },
        { id: "a-2", classId: "class-1", subject: "数学", teacherName: "张老师", teacherId: "teacher-math" },
      ],
      subjects: [
        { subject: "语文", weeklyPeriods: 6 },
        { subject: "数学", weeklyPeriods: 6 },
      ],
      subjectRequirements: {},
      teacherNotes: {},
      slots: {},
    };
    const highTwoContext: ExamArrangementContext = {
      cohort: {
        key: "grad-2028",
        label: "2028届高二",
        grade: "高二",
        gradYear: 2028,
        classIds: ["class-3"],
        studentCount: 40,
      },
      classes: [
        { id: "class-3", type: "school", schoolId: "school-1", name: "高二1班", grade: "高二", studentCount: 40, createdBy: "teacher-1", createdAt: "2026-09-01T00:00:00.000Z" },
      ],
      students: [],
      teachers: [
        { id: "teacher-english", name: "陈老师", subject: "英语", teachingClassIds: ["class-3"] },
      ],
    };
    const highTwoConfig: TeachingScheduleConfig = {
      assignments: [
        { id: "a-3", classId: "class-3", subject: "英语", teacherName: "陈老师", teacherId: "teacher-english" },
      ],
      subjects: [
        { subject: "数学", weeklyPeriods: 5 },
        { subject: "英语", weeklyPeriods: 5 },
      ],
      subjectRequirements: {},
      teacherNotes: {},
      slots: {},
    };

    await downloadTeachingScheduleTemplate([
      { context, config: highThreeConfig },
      { context: highTwoContext, config: highTwoConfig },
    ]);

    expect(writeXlsxFile).toHaveBeenCalledTimes(1);
    const workbook = writeXlsxFile.mock.calls[0][0];
    const rows = workbook[0].data;
    expect(rows[0].map((cell: { value?: unknown }) => cell?.value)).toEqual([
      "年级", "班级", "年级组长", "班主任", "语文", "数学", "英语", "合计",
    ]);
    expect(rows[1][0]).toMatchObject({ value: "高三", rowSpan: 3 });
    expect(rows[1].map((cell: { value?: unknown } | null) => cell?.value)).toEqual([
      "高三", "标准", "", "", 6, 6, "", 12,
    ]);
    expect(rows[2][0]).toBeNull();
    expect(rows[2][1]).toMatchObject({ value: "高三1班" });
    expect(rows[4][0]).toMatchObject({ value: "高二", rowSpan: 2 });
    expect(rows[4].map((cell: { value?: unknown } | null) => cell?.value)).toEqual([
      "高二", "标准", "", "", "", 5, 5, 10,
    ]);
    expect(rows[5][1]).toMatchObject({ value: "高二1班" });
    expect(rows[5][6]).toMatchObject({ value: "陈老师" });
    expect(toFile).toHaveBeenCalledWith("教师分工表模板.xlsx");
  });
});
