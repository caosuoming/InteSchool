import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Student } from "@/types";
import { StudentAnswerStatusControl } from "./StudentAnswerStatusControl";

const students = [
  { id: "student-1", name: "一位姓名非常长的学生", studentNo: "202600000001" },
  { id: "student-2", name: "李同学", studentNo: "202600000002" },
] as Student[];

describe("StudentAnswerStatusControl layout", () => {
  it("gives the answer status select three quarters of the row for multiple students", () => {
    const onChange = vi.fn();
    render(<StudentAnswerStatusControl students={students} answerRecords={[]} questionId="question-1" onChange={onChange} />);

    const studentSelect = screen.getByRole("combobox", { name: "选择学生" });
    const answerSelect = screen.getByRole("combobox", { name: "答题情况" });
    expect(studentSelect.parentElement).toHaveClass("sm:grid-cols-[minmax(0,1fr)_minmax(0,3fr)]");
    expect(studentSelect).toHaveClass("min-w-0");
    expect(answerSelect).toHaveClass("w-full", "min-w-0");
    expect(answerSelect).toBeDisabled();

    fireEvent.change(studentSelect, { target: { value: "student-2" } });
    expect(answerSelect).toBeEnabled();
    fireEvent.change(answerSelect, { target: { value: "partial" } });
    expect(onChange).toHaveBeenCalledWith("student-2", "question-1", "partial");
  });

  it("shortens a single student's name without shrinking the answer status select", () => {
    const { container } = render(
      <StudentAnswerStatusControl students={[students[0]]} answerRecords={[]} questionId="question-1" onChange={vi.fn()} />,
    );

    const studentName = container.querySelector('[aria-label="学生"]');
    const answerSelect = screen.getByRole("combobox", { name: "答题情况" });
    expect(studentName?.parentElement).toHaveClass("sm:grid-cols-[minmax(0,1fr)_minmax(0,3fr)]");
    expect(studentName).toHaveClass("min-w-0", "truncate");
    expect(answerSelect).toHaveClass("w-full", "min-w-0");
    expect(answerSelect).toBeEnabled();
  });
});
