import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ExamInvigilationTeacher } from "@/types";
import {
  downloadInvigilationTeacherTemplate,
  INVIGILATION_TEACHER_TEMPLATE_HEADERS,
  mergeInvigilationTeachers,
  parseInvigilationTeacherTable,
} from "@/lib/exam-invigilation-teacher-spreadsheet";

const toFile = vi.fn();
vi.mock("write-excel-file/browser", () => ({
  default: vi.fn(() => ({ toFile })),
}));

describe("exam invigilation teacher spreadsheet", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    toFile.mockResolvedValue(undefined);
  });

  it("parses the documented columns and ignores blank subject placeholders", () => {
    const rows = parseInvigilationTeacherTable([
      ["年级", "学科", "姓名", "备课组长", "领导"],
      ["2026届高三", "语文", "张老师", "是", "否"],
      ["2026届高三", "数学", "李老师", "", "✓"],
      ["2026届高三", "英语", "", "", ""],
    ], "2026届高三", ["语文", "数学", "英语"]);

    expect(rows).toEqual([
      { cohortLabel: "2026届高三", subject: "语文", name: "张老师", isPrepLeader: true, isLeader: false },
      { cohortLabel: "2026届高三", subject: "数学", name: "李老师", isPrepLeader: false, isLeader: true },
    ]);
  });

  it("merges duplicate rows and preserves role markers", () => {
    const rows = parseInvigilationTeacherTable([
      ["年级", "学科", "姓名", "备课组长", "领导"],
      ["2026届高三", "语文", "张老师", "是", "否"],
      ["2026届高三", "语文", "张老师", "否", "是"],
    ], "2026届高三", ["语文"]);

    expect(rows).toEqual([
      { cohortLabel: "2026届高三", subject: "语文", name: "张老师", isPrepLeader: true, isLeader: true },
    ]);
  });

  it("rejects rows for another grade or a subject outside the current exam", () => {
    expect(() => parseInvigilationTeacherTable([
      ["年级", "学科", "姓名", "备课组长", "领导"],
      ["2027届高二", "语文", "张老师", "否", "否"],
    ], "2026届高三", ["语文"])).toThrow("与当前年级");

    expect(() => parseInvigilationTeacherTable([
      ["年级", "学科", "姓名", "备课组长", "领导"],
      ["2026届高三", "历史", "张老师", "否", "否"],
    ], "2026届高三", ["语文"])).toThrow("不属于当前考试");
  });

  it("allows leaders from subjects outside the current exam", () => {
    expect(parseInvigilationTeacherTable([
      ["年级", "学科", "姓名", "备课组长", "领导"],
      ["2026届高三", "历史", "王校长", "否", "是"],
    ], "2026届高三", ["语文"])).toEqual([
      { cohortLabel: "2026届高三", subject: "历史", name: "王校长", isPrepLeader: false, isLeader: true },
    ]);
  });

  it("requires the full import schema", () => {
    expect(() => parseInvigilationTeacherTable([
      ["年级", "姓名", "备课组长", "领导"],
      ["2026届高三", "张老师", "否", "否"],
    ], "2026届高三", ["语文"])).toThrow("模板缺少“学科”列");
  });

  it("downloads a template with grade, subject, name and role columns", async () => {
    await downloadInvigilationTeacherTemplate("2026届高三", ["语文", "数学"], [{
      id: "teacher-1",
      subject: "语文",
      name: "张老师",
      isPrepLeader: true,
      isLeader: false,
    }]);

    const writeXlsxFile = (await import("write-excel-file/browser")).default;
    const workbook = vi.mocked(writeXlsxFile).mock.calls[0][0] as Array<{ data: Array<Array<{ value: string }>> }>;
    expect(workbook[0].data[0].map((cell) => cell.value)).toEqual([...INVIGILATION_TEACHER_TEMPLATE_HEADERS]);
    expect(workbook[0].data[1].map((cell) => cell.value)).toEqual(["2026届高三", "语文", "张老师", "是", "否"]);
    expect(workbook[0].data[2].map((cell) => cell.value)).toEqual(["2026届高三", "数学", "", "", ""]);
    expect(toFile).toHaveBeenCalledWith("2026届高三_监考教师导入模板.xlsx");
  });

  it("adds new teachers without duplicating existing teachers", () => {
    const existing: ExamInvigilationTeacher[] = [{
      id: "existing-1",
      subject: "语文",
      name: "张老师",
      isPrepLeader: false,
      isLeader: false,
    }];
    const result = mergeInvigilationTeachers(existing, [
      { cohortLabel: "2026届高三", subject: "语文", name: "张老师", isPrepLeader: true, isLeader: false },
      { cohortLabel: "2026届高三", subject: "数学", name: "李老师", isPrepLeader: false, isLeader: true },
    ], () => "new-1");

    expect(result.addedCount).toBe(1);
    expect(result.mergedCount).toBe(1);
    expect(result.teachers).toEqual([
      { id: "existing-1", subject: "语文", name: "张老师", isPrepLeader: true, isLeader: false },
      { id: "new-1", subject: "数学", name: "李老师", isPrepLeader: false, isLeader: true },
    ]);
    expect(existing[0].isPrepLeader).toBe(false);
  });
});
