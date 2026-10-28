import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { DocumentQuestionBatchActions } from "./DocumentQuestionBatchActions";
import { batchQuestionCatalogPatch } from "./document-question-batch";
import { questionService } from "@/services/question";
import { knowledgeService } from "@/services/knowledge";
import type { Question } from "@/types";

vi.mock("@/services/question", () => ({
  questionService: { getQuestion: vi.fn(), updateQuestion: vi.fn() },
}));
vi.mock("@/services/knowledge", () => ({
  knowledgeService: { getChapterTree: vi.fn(), getKnowledgeTree: vi.fn(), getMethodTree: vi.fn() },
}));
vi.mock("@/stores/ui", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

const question = {
  id: "q-1", chapterIds: ["old"], knowledgePointIds: ["k-1"], thoughtMethodIds: ["m-1"],
} as Question;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(questionService.getQuestion).mockResolvedValue(question);
  vi.mocked(questionService.updateQuestion).mockImplementation(async (_, patch) => ({ ...question, ...patch }));
  vi.mocked(knowledgeService.getChapterTree).mockResolvedValue({ id: "root", name: "章节", type: "chapter", count: 0, children: [{ id: "new", name: "新章节", type: "chapter", count: 0, children: [] }] });
  vi.mocked(knowledgeService.getKnowledgeTree).mockResolvedValue({ id: "root", name: "知识点", type: "knowledge", count: 0, children: [{ id: "k-2", name: "新知识点", type: "knowledge", count: 0, children: [] }] });
  vi.mocked(knowledgeService.getMethodTree).mockResolvedValue({ id: "root", name: "思想方法", type: "method", count: 0, children: [{ id: "m-2", name: "新思想方法", type: "method", count: 0, children: [] }] });
});

describe("question directory batch semantics", () => {
  it("replaces chapters without changing other associations", () => {
    expect(batchQuestionCatalogPatch(question, "chapter", ["new"])).toEqual({ chapterIds: ["new"] });
  });
  it("adds knowledge and methods without replacing or duplicating existing values", () => {
    expect(batchQuestionCatalogPatch(question, "knowledge", ["k-1", "k-2"])).toEqual({ knowledgePointIds: ["k-1", "k-2"] });
    expect(batchQuestionCatalogPatch(question, "method", ["m-1", "m-2"])).toEqual({ thoughtMethodIds: ["m-1", "m-2"] });
  });
  it("deduplicates document references and updates the parent after saving", async () => {
    const onUpdated = vi.fn();
    render(<DocumentQuestionBatchActions schoolId="school" questionIds={["q-1", "q-1"]} onUpdated={onUpdated} />);
    fireEvent.click(screen.getByRole("button", { name: "修改章节课" }));
    expect(await screen.findByText("新章节")).toBeInTheDocument();
    fireEvent.click(screen.getByText("新章节").parentElement!.querySelector("button")!);
    fireEvent.click(screen.getByRole("button", { name: "确认修改" }));
    await waitFor(() => expect(questionService.updateQuestion).toHaveBeenCalledTimes(1));
    expect(questionService.updateQuestion).toHaveBeenCalledWith("q-1", { chapterIds: ["new"] });
    await waitFor(() => expect(onUpdated).toHaveBeenCalledTimes(1));
  });
  it("disables modifications for locked documents", () => {
    render(<DocumentQuestionBatchActions schoolId="school" questionIds={["q-1"]} onUpdated={vi.fn()} disabled />);
    expect(screen.getByRole("button", { name: "修改章节课" })).toBeDisabled();
  });
});
