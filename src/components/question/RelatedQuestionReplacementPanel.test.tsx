import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Question } from "@/types";

const mocks = vi.hoisted(() => ({
  listQuestions: vi.fn(),
}));

vi.mock("@/services/question", () => ({
  questionService: { listQuestions: mocks.listQuestions },
}));

import { RelatedQuestionReplacementPanel } from "./RelatedQuestionReplacementPanel";

const timestamp = "2026-09-29T00:00:00.000Z";
const source = {
  id: "source",
  schoolId: "school-1",
  type: "single",
  stem: "原题",
  answer: "A",
  analysis: "",
  chapterIds: [],
  knowledgePointIds: ["k1", "k2"],
  difficulty: 3,
  recommendation: 3,
  usageCount: 0,
  updatedAt: timestamp,
  createdAt: timestamp,
} as Question;

function candidate(id: string, stem: string, knowledgePointIds: string[]): Question {
  return {
    ...source,
    id,
    stem,
    knowledgePointIds,
  } as Question;
}

describe("RelatedQuestionReplacementPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("defaults to same questions, shows two, and expands with 更多", async () => {
    mocks.listQuestions.mockResolvedValue([
      candidate("same-1", "同类一", ["k1", "k2"]),
      candidate("same-2", "同类二", ["k2", "k1"]),
      candidate("same-3", "同类三", ["k1", "k2"]),
      candidate("foundation", "基础", ["k1"]),
      candidate("extension", "拓展", ["k1", "k2", "k3"]),
    ]);

    render(
      <RelatedQuestionReplacementPanel
        question={source}
        schoolId="school-1"
        onReplace={vi.fn()}
      />,
    );

    const sameTab = screen.getByRole("tab", { name: "同类题" });
    await waitFor(() => expect(sameTab).toHaveAttribute("aria-selected", "true"));
    expect(await screen.findByText("同类一")).toBeInTheDocument();
    expect(screen.getByText("同类二")).toBeInTheDocument();
    expect(screen.queryByText("同类三")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "更多" }));
    expect(screen.getByText("同类三")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "基础题" }));
    expect(screen.getByText("基础")).toBeInTheDocument();
    expect(screen.queryByText("同类一")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "拓展题" }));
    expect(screen.getByText("拓展")).toBeInTheDocument();
  });

  it("replaces from the active category and excludes document questions", async () => {
    const onReplace = vi.fn();
    mocks.listQuestions.mockResolvedValue([
      candidate("same-1", "同类一", ["k1", "k2"]),
      candidate("excluded", "已在文档中", ["k1", "k2"]),
    ]);

    render(
      <RelatedQuestionReplacementPanel
        question={source}
        schoolId="school-1"
        excludedQuestionIds={new Set(["excluded"])}
        onReplace={onReplace}
      />,
    );

    const panel = await screen.findByTestId("related-question-replacement-panel");
    expect(within(panel).queryByText("已在文档中")).not.toBeInTheDocument();
    fireEvent.click(await within(panel).findByRole("button", { name: "替换为：同类一" }));
    expect(onReplace).toHaveBeenCalledWith(expect.objectContaining({ id: "same-1" }));
  });
});
