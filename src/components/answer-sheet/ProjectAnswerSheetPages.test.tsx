import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router";
import type { AnswerSheetProject, AnswerSheetQuestion } from "@/lib/answer-sheet";
import ExamPaperAnswerSheetPage from "@/pages/exam-papers/ExamPaperAnswerSheetPage";
import LectureAnswerSheetPage from "@/pages/lectures/LectureAnswerSheetPage";

const mocks = vi.hoisted(() => ({
  getPaper: vi.fn(),
  getLecture: vi.fn(),
  getQuestion: vi.fn(),
  markPaperCreated: vi.fn(),
  markLectureCreated: vi.fn(),
}));

vi.mock("@/services/examPaper", () => ({
  examPaperService: { getPaper: mocks.getPaper, markAnswerSheetCreated: mocks.markPaperCreated },
}));
vi.mock("@/services/lecture", () => ({
  lectureService: { getLecture: mocks.getLecture, markAnswerSheetCreated: mocks.markLectureCreated },
}));
vi.mock("@/services/question", () => ({ questionService: { getQuestion: mocks.getQuestion } }));
vi.mock("@/components/answer-sheet/AnswerSheetComposer", () => ({
  AnswerSheetComposer: (props: {
    sourceLayoutMode?: "grouped" | "flat";
    projects?: AnswerSheetProject[];
    questions: AnswerSheetQuestion[];
  }) => <pre data-testid="captured-answer-sheet">{JSON.stringify(props)}</pre>,
}));

function renderAnswerSheet(kind: "paper" | "lecture") {
  const path = kind === "paper" ? "/exam-papers/paper-1/answer-sheet" : "/lectures/lecture-1/answer-sheet";
  const route = kind === "paper" ? "/exam-papers/:id/answer-sheet" : "/lectures/:id/answer-sheet";
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path={route} element={kind === "paper" ? <ExamPaperAnswerSheetPage /> : <LectureAnswerSheetPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

async function capturedAnswerSheet(): Promise<{
  sourceLayoutMode: "grouped" | "flat";
  projects?: AnswerSheetProject[];
  questions: AnswerSheetQuestion[];
}> {
  const node = await screen.findByTestId("captured-answer-sheet");
  return JSON.parse(node.textContent || "{}");
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("project answer-sheet data", () => {
  it("passes paper project names and project-ordered questions to the composer", async () => {
    mocks.getPaper.mockResolvedValue({
      id: "paper-1", title: "期中试卷", grade: "高一", schoolYear: "2026", duration: 90,
      hasAnswerSheet: true, layoutMode: "flat",
      projects: [{ id: "arithmetic", name: "计算" }, { id: "proof", name: "证明" }],
      questions: [
        { id: "q-proof", projectId: "proof", type: "essay", score: 10 },
        { id: "q-free", type: "single", score: 5 },
        { id: "q-arithmetic", projectId: "arithmetic", type: "short", score: 5 },
      ],
    });
    renderAnswerSheet("paper");
    const data = await capturedAnswerSheet();
    expect(data.sourceLayoutMode).toBe("flat");
    expect(data.projects).toEqual([{ id: "arithmetic", name: "计算" }, { id: "proof", name: "证明" }]);
    expect(data.questions.map((question) => question.id)).toEqual(["q-free", "q-arithmetic", "q-proof"]);
    expect(data.questions.map((question) => question.projectId)).toEqual([undefined, "arithmetic", "proof"]);
  });

  it("maps nested lecture questions to their parent column headings", async () => {
    mocks.getLecture.mockResolvedValue({
      id: "lecture-1", title: "练习讲义", grade: "高一", schoolYear: "2026", hasAnswerSheet: true,
      sections: [
        { id: "column-1", title: "基础练习", type: "chapter", children: [
          { id: "question-1", type: "question", questionId: "bank-1", customLabel: "例1", children: [] },
          { id: "knowledge-1", type: "knowledge", children: [
            { id: "question-2", type: "question", questionId: "bank-2", children: [] },
          ] },
        ] },
        { id: "column-2", title: "拓展练习", type: "chapter", children: [
          { id: "question-3", type: "question", questionId: "bank-3", children: [] },
        ] },
      ],
    });
    mocks.getQuestion.mockImplementation(async (id: string) => ({
      type: id === "bank-1" ? "short" : "essay", stem: id,
    }));
    renderAnswerSheet("lecture");
    const data = await capturedAnswerSheet();
    expect(data.sourceLayoutMode).toBe("flat");
    expect(data.projects).toEqual([
      { id: "column-1", name: "基础练习" },
      { id: "column-2", name: "拓展练习" },
    ]);
    expect(data.questions.map(({ id, projectId, label }) => ({ id, projectId, label }))).toEqual([
      { id: "question-1", projectId: "column-1", label: "例1" },
      { id: "question-2", projectId: "column-1" },
      { id: "question-3", projectId: "column-2" },
    ]);
  });
});
