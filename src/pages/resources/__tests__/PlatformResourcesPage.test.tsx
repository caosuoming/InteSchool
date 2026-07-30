import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PlatformQuestionContent } from "@/pages/resources/PlatformResourcesPage";
import type { Question } from "@/types";

const question: Question = {
  id: "question-61",
  teacherId: "teacher-1",
  schoolId: "school-1",
  type: "single",
  stem: "已知函数 $f(x)=x^2$，这里是必须完整显示的后续题干内容。",
  options: ["$x=1$", "$x=2$"],
  answer: "$x=2$",
  analysis: "由 $f(2)=4$ 可得结论。",
  summary: "注意函数值的计算。",
  chapterIds: [],
  knowledgePointIds: [],
  difficulty: 3,
  recommendation: 3,
  usageCount: 0,
  remark: "",
  isShared: false,
  createdAt: "2026-07-30T00:00:00.000Z",
  updatedAt: "2026-07-30T00:00:00.000Z",
};

describe("PlatformQuestionContent", () => {
  it("renders the complete stem, options, and formulas while collapsed", () => {
    const { container } = render(
      <PlatformQuestionContent question={question} expanded={false} onToggle={vi.fn()} />,
    );

    expect(screen.getByText(/这里是必须完整显示的后续题干内容/)).not.toHaveClass("line-clamp-2");
    expect(screen.getByText("A.")).toBeInTheDocument();
    expect(screen.getByText("B.")).toBeInTheDocument();
    expect(container.querySelectorAll(".katex").length).toBeGreaterThanOrEqual(3);
    expect(screen.queryByText("答案")).not.toBeInTheDocument();
  });

  it("reveals answer, analysis, and summary when the stem is clicked", async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    const { rerender } = render(
      <PlatformQuestionContent question={question} expanded={false} onToggle={onToggle} />,
    );

    await user.click(screen.getByRole("button", { name: "展开题目详情" }));
    expect(onToggle).toHaveBeenCalledOnce();

    rerender(<PlatformQuestionContent question={question} expanded onToggle={onToggle} />);

    expect(screen.getByText("答案")).toBeInTheDocument();
    expect(screen.getByText("解析")).toBeInTheDocument();
    expect(screen.getByText("总结")).toBeInTheDocument();
    expect(screen.getByText("注意函数值的计算。")).toBeInTheDocument();
  });
});
