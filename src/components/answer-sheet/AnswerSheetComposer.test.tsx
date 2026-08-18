import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AnswerSheetComposer } from "./AnswerSheetComposer";

describe("AnswerSheetComposer", () => {
  it("renders a real QR code and lets the teacher adjust student-number digits", () => {
    const { container } = render(
      <AnswerSheetComposer
        title="高一数学期中考试"
        description="高一 · 2026-2027学年 · 90分钟"
        resourceType="exam-paper"
        resourceId="paper-1"
        resourceLabel="试卷"
        totalScore={100}
        questions={[
          { id: "q1", type: "single", stem: "选择题", options: ["A", "B", "C", "D"], score: 5 },
          { id: "q2", type: "short", stem: "填空题", score: 5 },
        ]}
        onBack={vi.fn()}
      />,
    );

    expect(screen.getByRole("heading", { name: "制作答题卡" })).toBeInTheDocument();
    expect(screen.getByLabelText("试卷答题卡二维码").tagName.toLowerCase()).toBe("svg");
    expect(screen.getAllByTestId("student-number-row")).toHaveLength(5);
    expect(container).toHaveTextContent("[A]");

    fireEvent.change(screen.getByLabelText("学号位数"), { target: { value: "8" } });
    expect(screen.getAllByTestId("student-number-row")).toHaveLength(8);
  });
});
