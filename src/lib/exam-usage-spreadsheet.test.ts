import { describe, expect, it } from "vitest";
import type { ExamPaperQuestion, Student } from "@/types";
import { detectUsageHeader, detectUsageRole, normalizeUsageAnswer, prepareUsageImport, usageConflictKey, type UsageSheet } from "./exam-usage-spreadsheet";

const questions = [
  { id: "q1", score: 5 },
  { id: "q2", score: 10 },
  { id: "q3", score: 12 },
] as ExamPaperQuestion[];
const students = [
  { id: "s1", name: "张三", studentNo: "001" },
  { id: "s2", name: "李四", studentNo: "002" },
  { id: "s3", name: "张三", studentNo: "003" },
] as Student[];

describe("试卷 Excel 使用数据映射", () => {
  it("识别姓名学号、题目得分、选择题作答和小题得分", () => {
    const sheet: UsageSheet = { name: "成绩", rows: [
      ["答题卡使用数据", null, null, null, null, null],
      ["姓名", "学号", "第1题得分", "第1题作答", "第2题第(1)小题得分", "2-2分"],
      ["张三", "001", 5, "A", 4, 3],
      ["李四", "002", 0, "C", 1, 2],
    ] };
    const detection = detectUsageHeader(sheet, questions.length);
    expect(detection.headerRow).toBe(1);
    expect(detection.columns.map((c) => c.role))
      .toEqual(["studentName", "studentNo", "score:1", "answer:1", "subscore:2:1", "subscore:2:2"]);
    const preview = prepareUsageImport(sheet, detection.headerRow, detection.columns, questions, students);
    expect(preview.matchedStudents).toBe(2);
    expect(preview.entries).toEqual([
      { studentId: "s1", paperQuestionId: "q1", earnedScore: 5, studentAnswer: "A" },
      { studentId: "s1", paperQuestionId: "q2", subScores: { "1": 4, "2": 3 } },
      { studentId: "s2", paperQuestionId: "q1", earnedScore: 0, studentAnswer: "C" },
      { studentId: "s2", paperQuestionId: "q2", subScores: { "1": 1, "2": 2 } },
    ]);
  });

  it("姓名重名时必须凭学号唯一匹配，不能猜测学生", () => {
    const sheet: UsageSheet = { name: "成绩", rows: [
      ["姓名", "第1题得分"], ["张三", 5],
    ] };
    const detected = detectUsageHeader(sheet, questions.length);
    const preview = prepareUsageImport(sheet, detected.headerRow, detected.columns, questions, students);
    expect(preview.entries).toEqual([]);
    expect(preview.unmatchedStudents).toHaveLength(1);
  });

  it("不导入越界得分、未匹配学生和重复行", () => {
    const sheet: UsageSheet = { name: "成绩", rows: [
      ["姓名", "学号", "第1题得分"],
      ["张三", "001", 7], ["张三", "001", 5], ["张三", "001", 3], ["陌生", "009", 2],
    ] };
    const found = detectUsageHeader(sheet, questions.length);
    const preview = prepareUsageImport(sheet, found.headerRow, found.columns, questions, students);
    expect(preview.entries).toHaveLength(0);
    expect(preview.warnings.join(" ")).toContain("超过满分");
    expect(preview.warnings.join(" ")).toContain("重复出现");
    expect(preview.unmatchedStudents).toHaveLength(1);
  });

  it("Excel 数字学号丢失前导零后仍能无歧义匹配", () => {
    const sheet: UsageSheet = { name: "成绩", rows: [
      ["学号", "第1题得分"], [1, 4], [2, 5],
    ] };
    const detected = detectUsageHeader(sheet, questions.length);
    const preview = prepareUsageImport(sheet, detected.headerRow, detected.columns, questions, students);
    expect(preview.entries.map((item) => item.studentId)).toEqual(["s1", "s2"]);
  });

  it("无法识别的非题目列保持忽略，数字题号按实际值判断类型", () => {
    expect(detectUsageRole("总分", [100], 3)).toBe("ignore");
    expect(detectUsageRole("4题得分", [3], 3)).toBe("ignore");
    expect(detectUsageRole("3", ["B"], 3)).toBe("answer:3");
    expect(detectUsageRole("Q3分数", [5], 3)).toBe("score:3");
  });
});

describe("带满分与标准答案的 Excel 表头", () => {
  it("将 1 2分、答案B 映射到第一题得分并检查差异", () => {
    const sheet: UsageSheet = { name: "成绩", rows: [
      ["学号", "1 2分、答案B", "学生解答", "2 10分、答案C"],
      ["001", 2, "B", 6],
    ] };
    const found = detectUsageHeader(sheet, 3);
    expect(found.columns.map((column) => column.role)).toEqual(["studentNo", "score:1", "answer:1", "score:2"]);
    const preview = prepareUsageImport(sheet, 0, found.columns, questions, students);
    expect(preview.entries[0]).toMatchObject({ studentId: "s1", paperQuestionId: "q1", earnedScore: 2, studentAnswer: "B" });
    expect(preview.firstStudent?.values[1].value).toBe("2");
    expect(preview.conflicts).toContainEqual({ column: "1 2分、答案B", questionNo: 1, attribute: "score", excel: "2", paper: "5", paperQuestionId: "q1" });
  });
  it("识别题号后携带的标准答案，显示空答案冲突，允许采用 Excel 的新满分", () => {
    const sheet: UsageSheet = { name: "成绩", rows: [
      ["学号", "1 8分、答案（D）", "学生解答"],
      ["001", 7, "D"],
    ] };
    const columns = detectUsageHeader(sheet, questions.length).columns;
    expect(columns.map((column) => column.role)).toEqual(["studentNo", "score:1", "answer:1"]);
    const paper = [{ ...questions[0], stem: "题干", answer: "A" }, ...questions.slice(1)];
    const initial = prepareUsageImport(sheet, 0, columns, paper, students);
    expect(initial.conflicts).toEqual([
      { column: "1 8分、答案（D）", questionNo: 1, paperQuestionId: "q1", attribute: "score", excel: "8", paper: "5" },
      { column: "1 8分、答案（D）", questionNo: 1, paperQuestionId: "q1", attribute: "answer", excel: "D", paper: "A" },
    ]);
    expect(initial.entries).toEqual([]);
    const selected = { [usageConflictKey(initial.conflicts![0])]: "excel" as const };
    const updated = prepareUsageImport(sheet, 0, columns, paper, students, selected);
    expect(updated.entries).toEqual([{ studentId: "s1", paperQuestionId: "q1", earnedScore: 7, studentAnswer: "D" }]);
    expect(updated.conflicts).toEqual(initial.conflicts);

    const noPaperAnswer = prepareUsageImport(sheet, 0, columns, [{ ...paper[0], answer: "" }, ...paper.slice(1)], students);
    expect(noPaperAnswer.conflicts?.find((item) => item.attribute === "answer")?.paper).toBe("");
  });

  it("多选答案比较忽略大小写、顺序和标点差异", () => {
    expect(normalizeUsageAnswer("C、A")).toBe(normalizeUsageAnswer("ac"));
    const sheet: UsageSheet = { name: "成绩", rows: [["学号", "1 5分、答案C/A"], ["001", 5]] };
    const columns = detectUsageHeader(sheet, questions.length).columns;
    const preview = prepareUsageImport(sheet, 0, columns, [{ ...questions[0], answer: "AC" }, ...questions.slice(1)], students);
    expect(preview.conflicts).toEqual([]);
  });

});
