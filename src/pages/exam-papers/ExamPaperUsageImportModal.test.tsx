import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ExamPaperQuestion, Student } from "@/types";
import { ExamPaperUsageImportModal } from "./ExamPaperUsageImportModal";

vi.mock("@/components/ui/MathHtml", () => ({ MathHtml: ({ children }: { children: string }) => <div>{children}</div> }));

vi.mock("read-excel-file/browser", () => ({
  default: vi.fn().mockResolvedValue([{ sheet: "成绩", data: [
    ["学号", "1 8分、答案D", "学生解答"],
    ["001", 7, "D"],
    ["unknown", 6, "C"],
  ] }]),
}));

const questions = [{
  id: "q1", stem: "下列说法正确的是？", options: ["第一项", "第二项", "第三项", "第四项"],
  answer: "B", score: 5,
}] as ExamPaperQuestion[];
const students = [{ id: "s1", name: "张三", studentNo: "001" }] as Student[];

describe("试卷使用数据冲突确认", () => {
  it("必须分别确认分值与答案；答案冲突展示题干选项，按选择实际保存", async () => {
    const onImport = vi.fn().mockResolvedValue(undefined);
    render(<ExamPaperUsageImportModal open onClose={vi.fn()} questions={questions} students={students} onImport={onImport} />);
    fireEvent.change(screen.getByLabelText("答题数据 Excel"), {
      target: { files: [new File(["data"], "使用数据.xlsx")] },
    });
    const scoreGroup = await screen.findByRole("group", { name: "第1题分值不同" });
    const answerGroup = screen.getByRole("group", { name: "第1题标准答案不同" });
    const submit = screen.getByRole("button", { name: "确认导入 0 条" });
    expect(submit).toBeDisabled();
    expect(within(answerGroup).getByText("下列说法正确的是？")).toBeInTheDocument();
    expect(within(answerGroup).getByText("第四项")).toBeInTheDocument();
    expect(screen.getAllByRole("option", { name: /第1题（5分，答案：B）/ }).length).toBeGreaterThan(0);

    fireEvent.click(within(scoreGroup).getByRole("radio", { name: "采用 Excel（8分）" }));
    expect(screen.getByRole("button", { name: "确认导入 1 条" })).toBeDisabled();
    fireEvent.click(within(answerGroup).getByRole("radio", { name: "采用试卷（B）" }));
    fireEvent.click(screen.getByRole("button", { name: "确认导入 1 条" }));
    await waitFor(() => expect(onImport).toHaveBeenCalledWith(
      [{ studentId: "s1", paperQuestionId: "q1", earnedScore: 7, studentAnswer: "D" }],
      [{ paperQuestionId: "q1", attribute: "score", expected: "5", value: "8" }],
    ));
  });

  it("支持一键采用 Excel 或试卷，并对未匹配行从使用班级学生中手动指定", async () => {
    const onImport = vi.fn().mockResolvedValue(undefined);
    render(<ExamPaperUsageImportModal open onClose={vi.fn()} questions={questions}
      students={[...students, { id: "s2", name: "李四", studentNo: "002" } as Student]} onImport={onImport} />);
    fireEvent.change(screen.getByLabelText("答题数据 Excel"), {
      target: { files: [new File(["data"], "使用数据.xlsx")] },
    });
    await screen.findByRole("group", { name: "第1题分值不同" });
    expect(screen.getByText("试卷使用班级学生（2 人）")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "全部采用试卷" }));
    expect(screen.getByRole("button", { name: "确认导入 0 条" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "全部采用 Excel" }));
    expect(screen.getByRole("button", { name: "确认导入 1 条" })).toBeEnabled();
    fireEvent.change(screen.getByRole("combobox", { name: "第3行匹配学生" }), { target: { value: "s2" } });
    expect(screen.getByRole("button", { name: "确认导入 2 条" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "确认导入 2 条" }));
    await waitFor(() => expect(onImport).toHaveBeenCalledWith(
      [
        { studentId: "s1", paperQuestionId: "q1", earnedScore: 7, studentAnswer: "D" },
        { studentId: "s2", paperQuestionId: "q1", earnedScore: 6, studentAnswer: "C" },
      ],
      expect.arrayContaining([
        { paperQuestionId: "q1", attribute: "score", expected: "5", value: "8" },
        { paperQuestionId: "q1", attribute: "answer", expected: "B", value: "D" },
      ]),
    ));
  });
});
