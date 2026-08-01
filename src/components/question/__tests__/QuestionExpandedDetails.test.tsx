import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { QuestionExpandedDetails } from "@/components/question/QuestionExpandedDetails";

describe("QuestionExpandedDetails", () => {
  it("renders the question summary after answer and analysis", () => {
    render(
      <QuestionExpandedDetails
        question={{
          id: "question-123",
          answer: "A",
          analysis: "逐步解析",
          summary: "考查二次函数的顶点性质",
        }}
      />,
    );

    expect(screen.getByText("答案")).toBeInTheDocument();
    expect(screen.getByText("题目唯一 ID")).toBeInTheDocument();
    expect(screen.getByText("question-123")).toBeInTheDocument();
    expect(screen.getByText("解析")).toBeInTheDocument();
    expect(screen.getByText("总结")).toBeInTheDocument();
    expect(screen.getByText("考查二次函数的顶点性质")).toBeInTheDocument();
  });

  it("does not render an empty summary section", () => {
    const { container } = render(
      <QuestionExpandedDetails
        question={{
          id: "question-456",
          answer: "A",
          analysis: "逐步解析",
        }}
      />,
    );

    expect(within(container).queryByText("总结")).not.toBeInTheDocument();
  });
});
