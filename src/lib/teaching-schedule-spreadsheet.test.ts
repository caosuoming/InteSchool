import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TeachingScheduleConfig, TeachingScheduleContext } from "@/types";
import {
  downloadTeachingScheduleTemplate,
  fillTeachingScheduleMergedCells,
  parseTeachingScheduleTable,
} from "./teaching-schedule-spreadsheet";

const { writeXlsxFile, toFile } = vi.hoisted(() => ({
  writeXlsxFile: vi.fn(),
  toFile: vi.fn(),
}));

vi.mock("write-excel-file/browser", () => ({ default: writeXlsxFile }));

const highThree = {
  key: "grad-2027",
  label: "2027届高三",
  grade: "高三",
  gradYear: 2027,
  classIds: ["class-1", "class-2"],
  studentCount: 80,
};
const highTwo = {
  key: "grad-2028",
  label: "2028届高二",
  grade: "高二",
  gradYear: 2028,
  classIds: ["class-3"],
  studentCount: 40,
};

const context: TeachingScheduleContext = {
  cohort: {
    key: "school:school-1",
    label: "全校",
    grade: "全校",
    classIds: ["class-1", "class-2", "class-3"],
    studentCount: 120,
  },
  cohorts: [highThree, highTwo],
  classCohortKeys: {
    "class-1": highThree.key,
    "class-2": highThree.key,
    "class-3": highTwo.key,
  },
  classes: [
    { id: "class-1", type: "school", schoolId: "school-1", name: "高三1班", grade: "高三", studentCount: 40, createdBy: "teacher-1", createdAt: "2026-09-01T00:00:00.000Z" },
    { id: "class-2", type: "school", schoolId: "school-1", name: "高三2班", grade: "高三", studentCount: 40, createdBy: "teacher-1", createdAt: "2026-09-01T00:00:00.000Z" },
    { id: "class-3", type: "school", schoolId: "school-1", name: "高二1班", grade: "高二", studentCount: 40, createdBy: "teacher-1", createdAt: "2026-09-01T00:00:00.000Z" },
  ],
  students: [],
  teachers: [
    { id: "teacher-math", name: "张老师", subject: "数学", teachingClassIds: ["class-1", "class-2"] },
    { id: "teacher-chinese", name: "李老师", subject: "语文", teachingClassIds: ["class-1"] },
    { id: "teacher-english", name: "陈老师", subject: "英语", teachingClassIds: ["class-3"] },
  ],
};

describe("teaching schedule spreadsheet", () => {
  beforeEach(() => {
    writeXlsxFile.mockReset();
    toFile.mockReset();
    writeXlsxFile.mockReturnValue({ toFile });
  });

  it("reads standards and teacher assignments for every grade", () => {
    const parsed = parseTeachingScheduleTable([
      ["测试学校2026-2027学年上学期教师分工表"],
      ["年级", "班级", "年级组长", "班主任", "语文", "数学", "英语", "合计"],
      ["高三", "标准", "王老师", "", 6, 6, 5, 17],
      ["高三", "高三1班", "王老师", "赵老师", "李老师", "张老师", "", ""],
      ["高三", "高三2班", "王老师", "钱老师", "", "张老师", "", ""],
      ["高二", "标准", "周老师", "", 5, 5, 5, 15],
      ["高二", "高二1班", "周老师", "孙老师", "", "", "陈老师", ""],
    ], context);

    expect(parsed.subjects).toEqual([
      { subject: "语文", weeklyPeriods: 6, weeklyPeriodsByCohort: { "grad-2027": 6, "grad-2028": 5 } },
      { subject: "数学", weeklyPeriods: 6, weeklyPeriodsByCohort: { "grad-2027": 6, "grad-2028": 5 } },
      { subject: "英语", weeklyPeriods: 5, weeklyPeriodsByCohort: { "grad-2027": 5, "grad-2028": 5 } },
    ]);
    expect(parsed.assignments).toEqual(expect.arrayContaining([
      expect.objectContaining({ classId: "class-1", cohortKey: "grad-2027", subject: "语文", teacherName: "李老师", teacherId: "teacher-chinese" }),
      expect.objectContaining({ classId: "class-2", cohortKey: "grad-2027", subject: "数学", teacherName: "张老师", teacherId: "teacher-math" }),
      expect.objectContaining({ classId: "class-3", cohortKey: "grad-2028", subject: "英语", teacherName: "陈老师", teacherId: "teacher-english" }),
    ]));
  });

  it("expands only actual merged ranges, including teacher cells", () => {
    const rows = fillTeachingScheduleMergedCells([
      ["年级", "班级", "数学", "语文"],
      ["高三", "高三1班", "张老师", "李老师"],
      [null, "高三2班", null, null],
    ], [
      { startRow: 1, endRow: 2, startColumn: 0, endColumn: 0 },
      { startRow: 1, endRow: 2, startColumn: 2, endColumn: 2 },
    ]);

    expect(rows[2]).toEqual(["高三", "高三2班", "张老师", null]);
    const parsed = parseTeachingScheduleTable(rows, context);
    expect(parsed.assignments).toEqual(expect.arrayContaining([
      expect.objectContaining({ classId: "class-2", subject: "数学", teacherName: "张老师" }),
    ]));
    expect(parsed.assignments).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ classId: "class-2", subject: "语文", teacherName: "李老师" }),
    ]));
  });

  it("accepts common school header and class-name variants while inheriting merged grades", () => {
    const parsed = parseTeachingScheduleTable([
      ["年段", "行政班", "年级主任", "班主任姓名", "数学", "总计", "备注"],
      ["高三", "标准", "王老师", "", 6, 6, ""],
      [null, "高三（1）班", "王老师", "赵老师", "张老师", "", "重点班"],
      ["高二", "标准", "周老师", "", 5, 5, ""],
      [null, "高二-1", "周老师", "孙老师", "陈老师", "", ""],
    ], context);

    expect(parsed.assignments).toEqual(expect.arrayContaining([
      expect.objectContaining({ classId: "class-1", cohortKey: "grad-2027", subject: "数学", teacherName: "张老师" }),
      expect.objectContaining({ classId: "class-3", cohortKey: "grad-2028", subject: "数学", teacherName: "陈老师" }),
    ]));
    expect(parsed.subjects).toEqual([
      { subject: "数学", weeklyPeriods: 6, weeklyPeriodsByCohort: { "grad-2027": 6, "grad-2028": 5 } },
    ]);
  });

  it("rejects rows for classes outside the current school", () => {
    expect(() => parseTeachingScheduleTable([
      ["年级", "班级", "语文", "数学"],
      ["高一", "高一9班", "甲老师", "乙老师"],
    ], context)).toThrow("不属于当前学校");
  });

  it("exports a school-marked term template containing every grade", async () => {
    const config: TeachingScheduleConfig = {
      assignments: [
        { id: "a-1", classId: "class-1", cohortKey: highThree.key, subject: "语文", teacherName: "李老师", teacherId: "teacher-chinese" },
        { id: "a-2", classId: "class-1", cohortKey: highThree.key, subject: "数学", teacherName: "张老师", teacherId: "teacher-math" },
        { id: "a-3", classId: "class-3", cohortKey: highTwo.key, subject: "英语", teacherName: "陈老师", teacherId: "teacher-english" },
      ],
      subjects: [
        { subject: "语文", weeklyPeriods: 6, weeklyPeriodsByCohort: { [highThree.key]: 6, [highTwo.key]: 5 } },
        { subject: "数学", weeklyPeriods: 6, weeklyPeriodsByCohort: { [highThree.key]: 6, [highTwo.key]: 5 } },
        { subject: "英语", weeklyPeriods: 5, weeklyPeriodsByCohort: { [highThree.key]: 5, [highTwo.key]: 5 } },
      ],
      subjectRequirements: {},
      teacherNotes: {},
      slots: {},
    };

    await downloadTeachingScheduleTemplate(context, config, {
      schoolName: "测试学校",
      schoolYear: "2026-2027",
      semester: "上学期",
    });

    expect(writeXlsxFile).toHaveBeenCalledTimes(1);
    const workbook = writeXlsxFile.mock.calls[0][0];
    const rows = workbook[0].data;
    expect(rows[0][0]).toMatchObject({
      value: "测试学校2026-2027学年上学期教师分工表",
      columnSpan: 8,
    });
    expect(rows[1].map((cell: { value?: unknown }) => cell?.value)).toEqual([
      "年级", "班级", "年级组长", "班主任", "语文", "数学", "英语", "合计",
    ]);
    expect(rows[2][0]).toMatchObject({ value: "高三", rowSpan: 3 });
    expect(rows[2].map((cell: { value?: unknown } | null) => cell?.value)).toEqual([
      "高三", "标准", "", "", 6, 6, 5, 17,
    ]);
    expect(rows[5][0]).toMatchObject({ value: "高二", rowSpan: 2 });
    expect(rows[5].map((cell: { value?: unknown } | null) => cell?.value)).toEqual([
      "高二", "标准", "", "", 5, 5, 5, 15,
    ]);
    expect(rows[6][6]).toMatchObject({ value: "陈老师" });
    expect(toFile).toHaveBeenCalledWith("测试学校-2026-2027学年上学期-教师分工表模板.xlsx");
  });
});
