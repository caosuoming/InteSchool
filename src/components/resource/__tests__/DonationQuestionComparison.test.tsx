import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DonationQuestionComparison } from "@/components/resource/DonationQuestionComparison";
import type { DonationConflict, DonationDecision, Question } from "@/types";

function question(id: string, stem: string): Question {
  return {
    id,
    teacherId: "teacher-1",
    schoolId: "school-1",
    type: "short",
    stem,
    answer: "$x=2$",
    analysis: "由 $2x=4$ 可得。",
    summary: "使用 $ax=b$ 的基本变形。",
    chapterIds: [],
    knowledgePointIds: [],
    difficulty: 2,
    recommendation: 3,
    usageCount: 0,
    remark: "",
    isShared: false,
    createdAt: "2026-09-28T00:00:00.000Z",
    updatedAt: "2026-09-28T00:00:00.000Z",
  };
}

const conflict: DonationConflict = {
  item: { resourceType: "question", resourceId: "source-question" },
  similarity: 0.92,
  sourceQuestion: question("source-question", "求 $f(x)=x^2$ 的最小值"),
  targetDonationId: "donation-1",
  targetQuestion: question("target-question", "求函数 $f(x)=x^2$ 的最小值"),
  targetDonorNickname: "平台教师",
};

const decision: DonationDecision = {
  sourceResourceId: "source-question",
  action: "merge",
  targetDonationId: "donation-1",
  fields: {
    stem: "target",
    answer: "target",
    analysis: "target",
    summary: "target",
  },
};

describe("DonationQuestionComparison", () => {
  it("renders comparison formulas and keeps answer details collapsed by default", () => {
    const { container } = render(
      <DonationQuestionComparison conflict={conflict} decision={decision} onChange={vi.fn()} />,
    );

    const sourceStemButton = screen.getByRole("button", { name: "选择本次捐赠的题干" });
    const targetStemButton = screen.getByRole("button", { name: "选择平台现有的题干" });
    expect(sourceStemButton.parentElement?.querySelector(".katex-formula")).not.toBeNull();
    expect(targetStemButton.parentElement?.querySelector(".katex-formula")).not.toBeNull();

    const details = screen.getByTestId("donation-question-details-source-question");
    expect(details).not.toHaveAttribute("open");
    expect(container.querySelectorAll(".katex-formula").length).toBeGreaterThanOrEqual(8);
  });

  it("expands secondary fields and preserves the existing merge-selection behavior", () => {
    const onChange = vi.fn();
    render(
      <DonationQuestionComparison conflict={conflict} decision={decision} onChange={onChange} />,
    );

    const details = screen.getByTestId("donation-question-details-source-question") as HTMLDetailsElement;
    fireEvent.click(screen.getByText("查看答案、解析和总结"));
    expect(details.open).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "选择本次捐赠的答案" }));
    expect(onChange).toHaveBeenCalledWith({
      ...decision,
      fields: {
        ...decision.fields,
        answer: "both",
      },
    });
  });
});
