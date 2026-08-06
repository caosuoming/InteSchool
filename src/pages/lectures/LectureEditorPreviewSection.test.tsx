import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LectureEditorPreviewSection } from "./LectureEditorPage";
import { questionService } from "@/services/question";
import type { LectureSection, Question } from "@/types";

vi.mock("@/services/question", () => ({
  questionService: { getQuestion: vi.fn() },
}));

const section: LectureSection = {
  id: "question-section-1",
  title: "例题 1",
  type: "question",
  content: "",
  questionId: "question-1",
  customLabel: "例1",
  children: [],
};

const question: Question = {
  id: "question-1",
  teacherId: "teacher-1",
  schoolId: "school-1",
  type: "single",
  stem: "已知椭圆 $\\mathbb{C}:\\frac{x^2}{a^2}+\\frac{y^2}{b^2}=1$，求离心率。",
  options: ["$\\frac{1}{2}$", "$\\frac{2}{3}$", "$\\frac{1}{5}$", "$\\frac{2}{5}$"],
  answer: "$\\frac{2}{3}$",
  analysis: "由 $a>b>0$ 及定义计算。",
  summary: "椭圆离心率",
  chapterIds: [],
  knowledgePointIds: [],
  grade: "高二",
  schoolYear: "2025-2026",
  semester: "寒假",
  difficulty: 3,
  recommendation: 4,
  usageCount: 0,
  remark: "",
  isShared: false,
  hiddenByExamIds: [],
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
};

describe("LectureEditorPreviewSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(questionService.getQuestion).mockResolvedValue(question);
  });

  it("renders formulas in the embedded preview stem, options, answer, and analysis", async () => {
    const { container } = render(
      <LectureEditorPreviewSection
        section={section}
        index={0}
        globalQuestionIndex={0}
        showSummary
        answerRecords={[]}
        students={[]}
        lectureStudents={[]}
        baskets={[]}
        answeredQuestionIds={new Set()}
        onEditScore={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(container.querySelectorAll(".katex").length).toBeGreaterThanOrEqual(5);
    });
    expect(container.textContent).not.toContain("$\\frac");

    const label = screen.getByText("例1");
    fireEvent.click(label.parentElement!);

    expect(await screen.findByText("答案：")).toBeInTheDocument();
    expect(screen.getByText("解析：")).toBeInTheDocument();
    await waitFor(() => {
      expect(container.querySelectorAll(".katex").length).toBeGreaterThanOrEqual(7);
    });
    expect(container.textContent).not.toContain("$a>b>0$");
  });
});
