import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { LectureSection, Question } from "@/types";
import { LectureSectionEditorRow } from "./LectureSectionEditorRow";

const section: LectureSection = {
  id: "section-1",
  title: "一次函数练习",
  type: "question",
  content: "",
  questionId: "question-1",
  children: [],
};

const question = {
  id: "question-1",
  type: "single",
  stem: "函数 y = 2x + 1 的斜率是多少？",
  options: ["1", "2", "-1", "-2"],
  answer: "B",
  analysis: "一次函数 y = kx + b 的斜率为 k。",
} as Question;

function renderRow(overrides: Partial<LectureSection> = {}) {
  const onLabelChange = vi.fn();
  const onEditQuestion = vi.fn();
  render(
    <LectureSectionEditorRow
      section={{ ...section, ...overrides }}
      index={2}
      question={question}
      canMoveUp
      canMoveDown
      onLabelChange={onLabelChange}
      onMoveUp={vi.fn()}
      onMoveDown={vi.fn()}
      onEditSection={vi.fn()}
      onEditQuestion={onEditQuestion}
      onRemove={vi.fn()}
    />,
  );
  return { onLabelChange, onEditQuestion };
}

describe("LectureSectionEditorRow", () => {
  it("shows the generated number as a placeholder and reports manual number edits", () => {
    const { onLabelChange } = renderRow();
    const input = screen.getByRole("textbox", { name: "题目编号：一次函数练习" });

    expect(input).toHaveAttribute("placeholder", "3.");
    expect(input).toHaveValue("");

    fireEvent.change(input, { target: { value: "例 7" } });
    expect(onLabelChange).toHaveBeenCalledWith("例 7");
  });

  it("displays an existing custom number and keeps question editing available", () => {
    const { onEditQuestion } = renderRow({ customLabel: "变式 2" });

    expect(screen.getByRole("textbox", { name: "题目编号：一次函数练习" })).toHaveValue("变式 2");
    fireEvent.click(screen.getByRole("button", { name: "编辑题目" }));
    expect(onEditQuestion).toHaveBeenCalledOnce();
  });

  it("expands the answer and analysis", () => {
    renderRow();

    expect(screen.queryByText("一次函数 y = kx + b 的斜率为 k。")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "查看答案与解析" }));
    expect(screen.getByText("一次函数 y = kx + b 的斜率为 k。")).toBeInTheDocument();
  });
});
