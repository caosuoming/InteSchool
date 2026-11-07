import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { QuestionAnnotationSummary } from "./QuestionAnnotationSummary";

describe("QuestionAnnotationSummary", () => {
  it("shows chapter and knowledge-point missing counts on their own line", () => {
    render(<QuestionAnnotationSummary summary={{ totalQuestions: 5, missingChapterCount: 2, missingKnowledgePointCount: 3 }} />);
    const row = screen.getByLabelText("题目属性缺失统计");
    expect(row).toHaveTextContent("缺章节课 2 题");
    expect(row).toHaveTextContent("缺知识点 3 题");
  });

  it("shows zeros and omits an unavailable summary", () => {
    const { rerender } = render(<QuestionAnnotationSummary summary={{ totalQuestions: 0, missingChapterCount: 0, missingKnowledgePointCount: 0 }} />);
    expect(screen.getByLabelText("题目属性缺失统计")).toHaveTextContent("缺章节课 0 题");
    expect(screen.getByLabelText("题目属性缺失统计")).toHaveTextContent("缺知识点 0 题");
    rerender(<QuestionAnnotationSummary />);
    expect(screen.queryByLabelText("题目属性缺失统计")).not.toBeInTheDocument();
  });
});
