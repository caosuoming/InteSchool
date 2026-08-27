import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildDefaultGradeSettings } from "@/lib/grade-statistics";
import {
  applyGradeTeacherImportPlan,
  buildGradeTeacherImportPlan,
  downloadGradeTeacherTemplate,
  parseGradeTeacherTable,
} from "@/lib/grade-teacher-spreadsheet";
import type { GradeImportContext } from "@/types";

const { writeXlsxFile, toFile } = vi.hoisted(() => ({
  writeXlsxFile: vi.fn(),
  toFile: vi.fn(),
}));

vi.mock("write-excel-file/browser", () => ({
  default: writeXlsxFile,
}));

const context: GradeImportContext = {
  cohort: {
    key: "grad-2026",
    label: "2026届高三",
    grade: "高三",
    gradYear: 2026,
    classIds: ["class-1", "class-2"],
    studentCount: 80,
  },
  classes: [
    {
      id: "class-1",
      type: "school",
      schoolId: "school-1",
      name: "高三(1)班",
      grade: "高三",
      classTypeId: "type-1",
      studentCount: 40,
      createdBy: "teacher-admin",
      createdAt: "2026-01-01T00:00:00.000Z",
    },
    {
      id: "class-2",
      type: "school",
      schoolId: "school-1",
      name: "高三(2)班",
      grade: "高三",
      classTypeId: "type-2",
      studentCount: 40,
      createdBy: "teacher-admin",
      createdAt: "2026-01-01T00:00:00.000Z",
    },
  ],
  students: [],
  teachers: [
    { id: "math-wang", name: "王老师", subject: "数学", teachingClassIds: ["class-1"] },
    { id: "math-li", name: "李老师", subject: "数学", teachingClassIds: ["class-1", "class-2"] },
    { id: "head-zhang", name: "张班主任", subject: "语文", homeroomClassIds: ["class-1"] },
  ],
  classProfiles: {
    "class-1": {
      classTypeName: "实验班",
      subjectSelections: ["物化生"],
      scoreSubjects: ["数学", "英语"],
      hasImportedScores: true,
    },
    "class-2": {
      classTypeName: "平行班",
      subjectSelections: ["物史地"],
      scoreSubjects: ["数学", "英语"],
      hasImportedScores: true,
    },
  },
};

function settings() {
  const value = buildDefaultGradeSettings(
    ["数学", "英语"],
    context.classes.map((item) => item.id),
    context.teachers,
  );
  value.classSubjectTeacherIds = {
    "class-1": { 数学: ["math-wang"], 英语: [] },
    "class-2": { 数学: ["math-li"], 英语: [] },
  };
  value.classSubjectTeacherNames = {
    "class-1": { 数学: [], 英语: ["陈老师"] },
    "class-2": { 数学: [], 英语: [] },
  };
  value.subjectTeacherIds = { 数学: ["math-wang", "math-li"], 英语: [] };
  return value;
}

describe("grade teacher spreadsheet", () => {
  beforeEach(() => {
    writeXlsxFile.mockReset();
    toFile.mockReset();
    writeXlsxFile.mockReturnValue({ toFile });
  });

  it("parses class, homeroom, and subject teacher rows", () => {
    const rows = parseGradeTeacherTable([
      ["班级", "班型", "班主任", "数学", "英语"],
      ["高三(1)班", "实验班", "张班主任", "李老师、赵老师", "陈老师"],
      ["高三(2)班", "平行班", "", "王老师", ""],
    ], ["数学", "英语"]);

    expect(rows).toEqual([
      {
        className: "高三(1)班",
        homeroomTeacherNames: ["张班主任"],
        teacherNamesBySubject: { 数学: ["李老师", "赵老师"], 英语: ["陈老师"] },
      },
      {
        className: "高三(2)班",
        homeroomTeacherNames: [],
        teacherNamesBySubject: { 数学: ["王老师"], 英语: [] },
      },
    ]);
  });

  it("overwrites existing teacher names and imports homeroom names by default", () => {
    const current = settings();
    const rows = parseGradeTeacherTable([
      ["班级", "班型", "班主任", "数学", "英语"],
      ["高三(1)班", "实验班", "张班主任", "李老师、赵老师", "陈老师"],
      ["高三(2)班", "平行班", "", "李老师", "周老师"],
    ], ["数学", "英语"]);
    const plan = buildGradeTeacherImportPlan(current, context, rows);

    const imported = applyGradeTeacherImportPlan(current, context, ["数学", "英语"], plan);
    expect(imported.classHomeroomTeacherNames).toEqual({
      "class-1": ["张班主任"],
      "class-2": [],
    });
    expect(imported.classSubjectTeacherIds?.["class-1"]?.数学).toEqual(["math-li"]);
    expect(imported.classSubjectTeacherNames?.["class-1"]?.数学).toEqual(["赵老师"]);
    expect(imported.classSubjectTeacherNames?.["class-2"]?.英语).toEqual(["周老师"]);
  });

  it("exports a cohort template prefilled with class type, homeroom teacher, and current subject teachers", async () => {
    await downloadGradeTeacherTemplate("2026届高三", ["数学", "英语"], settings(), context);

    const workbook = writeXlsxFile.mock.calls[0][0];
    expect(workbook).toHaveLength(1);
    const data = workbook[0].data as Array<Array<{ value: string }>>;
    expect(data[0].map((cell) => cell.value)).toEqual(["班级", "班型", "班主任", "数学", "英语"]);
    expect(data[1].map((cell) => cell.value)).toEqual([
      "高三(1)班",
      "实验班",
      "张班主任",
      "王老师",
      "陈老师",
    ]);
    expect(toFile).toHaveBeenCalledWith("2026届高三_班级任课教师模板.xlsx");
  });
});
