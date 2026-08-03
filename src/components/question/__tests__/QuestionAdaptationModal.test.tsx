import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { QuestionAdaptationModal } from "@/components/question/QuestionAdaptationModal";
import { questionService } from "@/services/question";
import type { Question } from "@/types";

vi.mock("@/services/question", () => ({
  questionService: {
    adaptQuestion: vi.fn(),
  },
}));

vi.mock("@/stores/ui", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const question: Question = {
  id: "question-1",
  teacherId: "teacher-1",
  schoolId: "school-1",
  type: "short",
  stem: "原始题干",
  answer: "答案",
  analysis: "解析",
  summary: "总结",
  chapterIds: [],
  knowledgePointIds: [],
  difficulty: 3,
  recommendation: 3,
  usageCount: 0,
  remark: "",
  isShared: false,
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
};

describe("QuestionAdaptationModal", () => {
  it("enables confirmation only after all adapted fields change", async () => {
    const adapted = {
      ...question,
      id: "question-2",
      stem: "改编后的题干",
      answer: "新答案",
      analysis: "新解析",
      summary: "新总结",
    };
    vi.mocked(questionService.adaptQuestion).mockResolvedValue(adapted);
    const onCreated = vi.fn();

    render(
      <QuestionAdaptationModal
        open
        question={question}
        onClose={vi.fn()}
        onCreated={onCreated}
      />,
    );

    const confirm = screen.getByRole("button", { name: /改编新题确认/ });
    expect(confirm).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText("修改题干"), {
      target: { value: "改编后的题干" },
    });
    fireEvent.change(screen.getByPlaceholderText("修改答案"), {
      target: { value: "新答案" },
    });
    fireEvent.change(screen.getByPlaceholderText("修改解析"), {
      target: { value: "新解析" },
    });
    expect(confirm).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText("修改总结"), {
      target: { value: "新总结" },
    });
    expect(confirm).toBeEnabled();

    fireEvent.click(confirm);

    await waitFor(() => {
      expect(questionService.adaptQuestion).toHaveBeenCalledWith("question-1", {
        stem: "改编后的题干",
        answer: "新答案",
        analysis: "新解析",
        summary: "新总结",
      });
      expect(onCreated).toHaveBeenCalledWith(adapted);
    });
  });
});
