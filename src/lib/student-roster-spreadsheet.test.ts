import { describe, expect, it } from "vitest";
import {
  parseStudentRosterTable,
  STUDENT_ROSTER_TEMPLATE_HEADERS,
} from "./student-roster-spreadsheet";

describe("student roster spreadsheet", () => {
  it("parses the downloadable template columns", () => {
    expect(parseStudentRosterTable([
      [...STUDENT_ROSTER_TEMPLATE_HEADERS],
      [1, "张三", 20270001, "物化生", "否", "男", "张父", "13800138000", "张母", "13900139000"],
      [17, "李四", "", "史政地", "是", "女"],
      [null, null, null, null, null, null],
    ])).toEqual([
      {
        className: "1班",
        name: "张三",
        studentNo: "20270001",
        subjectSelection: "物化生",
        isExternal: false,
        gender: "male",
        guardian1Name: "张父",
        guardian1Phone: "13800138000",
        guardian2Name: "张母",
        guardian2Phone: "13900139000",
      },
      {
        className: "17班",
        name: "李四",
        studentNo: "",
        subjectSelection: "史政地",
        isExternal: true,
        gender: "female",
        guardian1Name: undefined,
        guardian1Phone: undefined,
        guardian2Name: undefined,
        guardian2Phone: undefined,
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
        subjectSelection: undefined,
        isExternal: false,
        gender: undefined,
        guardian1Name: undefined,
        guardian1Phone: undefined,
        guardian2Name: undefined,
        guardian2Phone: undefined,
      },
    ]);

    expect(() => parseStudentRosterTable([
      ["班级", "姓名", "学号"],
      ["高一(1)班", "", "002"],
    ])).toThrow("缺少班级或姓名");
  });

  it("accepts a roster without a student number column", () => {
    expect(parseStudentRosterTable([
      ["班级*", "姓名*", "选科"],
      ["3", "赵六", "物化地"],
    ])).toEqual([{
      className: "3班",
      name: "赵六",
      studentNo: "",
      subjectSelection: "物化地",
      isExternal: false,
      gender: undefined,
      guardian1Name: undefined,
      guardian1Phone: undefined,
      guardian2Name: undefined,
      guardian2Phone: undefined,
    }]);
  });

  it("accepts guardian header aliases", () => {
    expect(parseStudentRosterTable([
      ["班级", "姓名", "监护人一姓名", "家长1手机号", "家长二姓名", "监护人2电话"],
      ["2", "周七", "周父", "13800138000", "周母", "13900139000"],
    ])[0]).toMatchObject({
      className: "2班",
      name: "周七",
      guardian1Name: "周父",
      guardian1Phone: "13800138000",
      guardian2Name: "周母",
      guardian2Phone: "13900139000",
    });
  });
});
