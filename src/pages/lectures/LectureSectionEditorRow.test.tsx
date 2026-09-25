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

function renderRow(
  overrides: Partial<LectureSection> = {},
  questionOverride: Question = question,
  readOnly = false,
) {
  const onLabelChange = vi.fn();
  const onReplaceQuestion = vi.fn();
  const view = render(
    <LectureSectionEditorRow
      section={{ ...section, ...overrides }}
      index={2}
      question={questionOverride}
      canMoveUp
      canMoveDown
      onLabelChange={onLabelChange}
      onMoveUp={vi.fn()}
      onMoveDown={vi.fn()}
      onEditSection={vi.fn()}
      onReplaceQuestion={onReplaceQuestion}
      onRemove={vi.fn()}
      readOnly={readOnly}
    />,
  );
  return { ...view, onLabelChange, onReplaceQuestion };
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

  it("displays an existing custom number and exposes question replacement", () => {
    const { container, onReplaceQuestion } = renderRow({ customLabel: "变式 2" });

    expect(screen.getByRole("textbox", { name: "题目编号：一次函数练习" })).toHaveValue("变式 2");
    expect(container).toHaveTextContent("函数");
    expect(container).toHaveTextContent("的斜率是多少？");
    fireEvent.click(screen.getByRole("button", { name: "换题" }));
    expect(onReplaceQuestion).toHaveBeenCalledOnce();
  });

  it("expands the answer and analysis", () => {
    const { container } = renderRow();

    expect(container).not.toHaveTextContent("斜率为");
    fireEvent.click(screen.getByRole("button", { name: "查看答案与解析" }));
    expect(container).toHaveTextContent("一次函数");
    expect(container).toHaveTextContent("的斜率为 k。");
  });

  it("renders formulas in the stem, options, answer, and analysis", () => {
    const formulaQuestion = {
      ...question,
      stem: "已知椭圆 $\\frac{x^2}{4}+\\frac{y^2}{3}=1$",
      options: ["$\\frac{1}{2}$", "$\\sqrt{3}$"],
      answer: "$\\frac{1}{2}$",
      analysis: "离心率为 $e=\\frac{c}{a}$。",
    } as Question;
    const { container } = renderRow({}, formulaQuestion);

    expect(container.querySelectorAll(".katex").length).toBeGreaterThanOrEqual(3);
    fireEvent.click(screen.getByRole("button", { name: "查看答案与解析" }));
    expect(container.querySelectorAll(".katex").length).toBeGreaterThanOrEqual(5);
  });

  it("keeps a locked document section readable without structure actions", () => {
    const { container } = renderRow({ customLabel: "例 3" }, question, true);

    expect(container).toHaveTextContent("函数");
    expect(container).toHaveTextContent("的斜率是多少？");
    expect(screen.queryByRole("textbox", { name: "题目编号：一次函数练习" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "换题" })).not.toBeInTheDocument();
    expect(screen.queryByTitle("上移")).not.toBeInTheDocument();
    expect(screen.queryByTitle("删除内容块")).not.toBeInTheDocument();
  });
});
