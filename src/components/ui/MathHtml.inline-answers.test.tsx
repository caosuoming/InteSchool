import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MathHtml } from "./MathHtml";

vi.mock("@/lib/math-html", () => ({ renderMathHtml: (value: string) => value }));

describe("knowledge answer masking", () => {
  it("reveals exactly one more answer per presentation step", () => {
    const content = '一 <span class="lesson-inline-answer" data-answer-step="1">甲</span> 二 <span class="lesson-inline-answer" data-answer-step="2">乙</span>';
    const { rerender } = render(<MathHtml revealedAnswerStep={0}>{content}</MathHtml>);
    expect(screen.queryByText("甲")).not.toBeInTheDocument();
    expect(screen.queryByText("乙")).not.toBeInTheDocument();
    rerender(<MathHtml revealedAnswerStep={1}>{content}</MathHtml>);
    expect(screen.getByText("甲")).toBeInTheDocument();
    expect(screen.queryByText("乙")).not.toBeInTheDocument();
    rerender(<MathHtml revealedAnswerStep={2}>{content}</MathHtml>);
    expect(screen.getByText("甲")).toBeInTheDocument();
    expect(screen.getByText("乙")).toBeInTheDocument();
  });
});
