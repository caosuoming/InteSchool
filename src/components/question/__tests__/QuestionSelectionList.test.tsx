import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { QuestionSelectionList } from "../QuestionSelectionList";
import type { Question } from "@/types";

const question = {
  id: "question-1",
  teacherId: "teacher-1",
  schoolId: "school-1",
  type: "single",
  stem: "1 + 1 等于多少？",
  options: ["1", "2"],
  answer: "B",
  analysis: "基础加法。",
  chapterIds: ["chapter-1"],
  knowledgePointIds: ["knowledge-1"],
  difficulty: 1,
  recommendation: 3,
  usageCount: 0,
  remark: "",
  isShared: false,
  createdAt: "2026-08-17T00:00:00.000Z",
  updatedAt: "2026-08-17T00:00:00.000Z",
} as Question;

describe("QuestionSelectionList", () => {
  it("selects with the leading checkbox without using the stem as the selection target", () => {
    const onSelect = vi.fn();
    render(
      <QuestionSelectionList
        questions={[question]}
        selectedIds={[]}
        onSelect={onSelect}
      />,
    );

    fireEvent.click(screen.getByText(question.stem));
    expect(onSelect).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("checkbox", { name: "选择第 1 道题" }));
    expect(onSelect).toHaveBeenCalledWith([question.id]);
  });

  it("reveals the answer and analysis when the stem is clicked", () => {
    render(
      <QuestionSelectionList
        questions={[question]}
        selectedIds={[]}
        onSelect={() => undefined}
      />,
    );

    expect(screen.queryByText("答案：")).not.toBeInTheDocument();
    expect(screen.queryByText(question.analysis)).not.toBeInTheDocument();

    fireEvent.click(screen.getByText(question.stem));

    expect(screen.getByText("答案：")).toBeInTheDocument();
    expect(screen.getByText(question.answer)).toBeInTheDocument();
    expect(screen.getByText(question.analysis)).toBeInTheDocument();
  });
});
