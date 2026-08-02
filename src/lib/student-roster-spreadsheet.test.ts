import { describe, expect, it } from "vitest";
import { parseStudentRosterTable } from "./student-roster-spreadsheet";

describe("student roster spreadsheet", () => {
  it("parses the downloadable template columns", () => {
    expect(parseStudentRosterTable([
      ["学生班级", "姓名", "学号", "借读生", "性别"],
      ["高二（1）班", "张三", 20270001, "否", "男"],
      ["高二（2）班", "李四", "20270002", "是", "女"],
      [null, null, null, null, null],
    ])).toEqual([
      {
        className: "高二（1）班",
        name: "张三",
        studentNo: "20270001",
        isExternal: false,
        gender: "male",
      },
      {
        className: "高二（2）班",
        name: "李四",
        studentNo: "20270002",
        isExternal: true,
        gender: "female",
      },
    ]);
  });

  it("accepts common header aliases and rejects incomplete rows", () => {
    expect(parseStudentRosterTable([
      ["班级名称", "学生姓名", "学籍号"],
      ["高一(1)班", "王五", "001"],
    ])).toEqual([
      {
        className: "高一(1)班",
        name: "王五",
        studentNo: "001",
        isExternal: false,
        gender: undefined,
      },
    ]);

    expect(() => parseStudentRosterTable([
      ["班级", "姓名", "学号"],
      ["高一(1)班", "", "002"],
    ])).toThrow("缺少班级、姓名或学号");
  });
});
