import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ExamPaperPreview } from "@/components/resource/SchoolResourcePreviewModal";
import type { ExamPaper, ExamPaperQuestion } from "@/types";

vi.mock("@/components/ui/MathHtml", () => ({
  MathHtml: ({ children, className }: { children: string; className?: string }) => (
    <span className={className}>{children}</span>
  ),
}));

function makeQuestion(id: string, stem: string): ExamPaperQuestion {
  return {
    id,
    stem,
    answer: "A",
    analysis: "解析",
    score: 5,
    type: "single",
    options: ["选项 A", "选项 B"],
  };
}

function makePaper(questions: ExamPaperQuestion[]): ExamPaper {
  return {
    id: "paper-1",
    teacherId: "teacher-1",
    schoolId: "school-1",
    title: "平台试卷",
    chapterIds: [],
    knowledgePointIds: [],
    grade: "高一",
    schoolYear: "2025-2026",
    duration: 90,
    totalScore: 100,
    questions,
    status: "published",
    createdAt: "2026-09-29T00:00:00.000Z",
    updatedAt: "2026-09-29T00:00:00.000Z",
  };
}

describe("ExamPaperPreview", () => {
  it("does not add a duplicate number when the question stem already starts with that number", () => {
    render(
      <ExamPaperPreview
        paper={makePaper([
          makeQuestion("q1", "1. 第一题题干"),
          makeQuestion("q2", "第２题：第二题题干"),
        ])}
      />,
    );

    expect(screen.getByText("1. 第一题题干")).toBeInTheDocument();
    expect(screen.getByText("第２题：第二题题干")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "点击展开答案和解析" })).toHaveLength(2);
  });

  it("keeps the generated number when the stem has no matching leading number", () => {
    render(
      <ExamPaperPreview
        paper={makePaper([makeQuestion("q1", "没有自带题号的题干")])}
      />,
    );

    expect(screen.getByRole("button", { name: "第 1 题，点击展开答案和解析" })).toBeInTheDocument();
  });
});
