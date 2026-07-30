import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { QuestionListItem } from "@/pages/resources/MyResourcesPage";
import type { Question } from "@/types";

const question: Question = {
  id: "question-1",
  teacherId: "teacher-1",
  schoolId: "school-1",
  type: "short",
  stem: "这是一道需要完整显示的长题干，列表收起时也不能只展示两行内容。",
  answer: "答案",
  analysis: "解析",
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

describe("QuestionListItem", () => {
  it("shows the complete question stem while collapsed", () => {
    render(
      <QuestionListItem
        question={question}
        expanded={false}
        onToggle={vi.fn()}
        onShare={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    expect(screen.getByText(question.stem)).not.toHaveClass("line-clamp-2");
  });
});
