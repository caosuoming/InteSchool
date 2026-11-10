import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ExamPaper, ExamPaperQuestion } from "@/types";
import ExamPaperAnswerSheetPage from "./ExamPaperAnswerSheetPage";

const mocks = vi.hoisted(() => ({
  getPaper: vi.fn(),
  markAnswerSheetCreated: vi.fn(),
  composer: vi.fn(),
}));

vi.mock("@/services/examPaper", () => ({
  examPaperService: {
    getPaper: mocks.getPaper,
    markAnswerSheetCreated: mocks.markAnswerSheetCreated,
  },
}));
vi.mock("@/components/answer-sheet/AnswerSheetComposer", () => ({
  AnswerSheetComposer: (props: {
    questions: Array<{ id: string }>;
    questionTypeLabels?: Record<string, string>;
  }) => {
    mocks.composer(props);
    return <div data-testid="answer-sheet-order">{props.questions.map((question) => question.id).join(",")}</div>;
  },
}));
vi.mock("@/lib/navigation", () => ({ openPage: vi.fn() }));
vi.mock("@/stores/ui", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const question = (id: string, type: ExamPaperQuestion["type"], projectId?: string) =>
  ({ id, type, projectId, stem: id, score: 5 }) as ExamPaperQuestion;

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/exam-papers/paper-1/answer-sheet"]}>
      <Routes>
        <Route path="/exam-papers/:id/answer-sheet" element={<ExamPaperAnswerSheetPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ExamPaperAnswerSheetPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("numbers grouped answer sheets in the exact order shown by the paper editor", async () => {
    const paper = {
      id: "paper-1",
      teacherId: "teacher-1",
      schoolId: "school-1",
      chapterIds: [],
      knowledgePointIds: [],
      totalScore: 25,
      status: "draft" as const,
      createdAt: "2026-11-01T00:00:00.000Z",
      updatedAt: "2026-11-01T00:00:00.000Z",
      title: "数学试卷",
      grade: "高一",
      schoolYear: "2026",
      duration: 90,
      hasAnswerSheet: true,
      layoutMode: "grouped",
      questionTypeOrder: ["single", "multiple", "short", "essay"],
      questionTypeLabels: { single: "选择题", essay: "解答与证明" },
      questions: [
        question("essay-1", "essay"),
        question("single-1", "single"),
        question("short-1", "short"),
        question("multiple-1", "multiple"),
        question("single-2", "single"),
      ],
    } as ExamPaper;
    mocks.getPaper.mockResolvedValue(paper);
    renderPage();
    expect(await screen.findByTestId("answer-sheet-order")).toHaveTextContent(
      "single-1,single-2,multiple-1,short-1,essay-1",
    );
    await waitFor(() => expect(mocks.composer).toHaveBeenCalledWith(
      expect.objectContaining({ questionTypeLabels: paper.questionTypeLabels }),
    ));
    expect(mocks.markAnswerSheetCreated).not.toHaveBeenCalled();
  });

  it("preserves the project-based order without applying type grouping", async () => {
    mocks.getPaper.mockResolvedValue({
      id: "paper-1",
      teacherId: "teacher-1",
      schoolId: "school-1",
      chapterIds: [],
      knowledgePointIds: [],
      totalScore: 15,
      status: "draft",
      createdAt: "2026-11-01T00:00:00.000Z",
      updatedAt: "2026-11-01T00:00:00.000Z",
      title: "试卷",
      grade: "高一",
      schoolYear: "2026",
      duration: 90,
      hasAnswerSheet: true,
      layoutMode: "flat",
      projects: [{ id: "first", name: "第一部分" }, { id: "second", name: "第二部分" }],
      questions: [
        question("second-essay", "essay", "second"),
        question("first-single", "single", "first"),
        question("second-single", "single", "second"),
      ],
    } as ExamPaper);
    renderPage();
    expect(await screen.findByTestId("answer-sheet-order")).toHaveTextContent(
      "first-single,second-essay,second-single",
    );
  });
});
