import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import KnowledgeTreePage from "@/pages/knowledge-tree/KnowledgeTreePage";
import { useAuthStore } from "@/stores/auth";
import { knowledgeService } from "@/services/knowledge";
import { questionService } from "@/services/question";
import { basketService } from "@/services/basket";
import type { Teacher, TreeNode } from "@/types";

vi.mock("@/services/knowledge", () => ({
  knowledgeService: {
    getChapterTree: vi.fn(),
    getKnowledgeTree: vi.fn(),
    getAliasIds: vi.fn(),
    listChapters: vi.fn(),
    listKnowledgePoints: vi.fn(),
    addChapter: vi.fn(),
    addKnowledgePoint: vi.fn(),
    renameNode: vi.fn(),
    deleteNode: vi.fn(),
    moveNode: vi.fn(),
    reorderSiblings: vi.fn(),
  },
}));

vi.mock("@/services/question", () => ({
  questionService: {
    listQuestions: vi.fn(),
  },
}));

vi.mock("@/services/basket", () => ({
  basketService: {
    listBaskets: vi.fn(),
    addQuestion: vi.fn(),
  },
}));

const chapterTree: TreeNode = {
  id: "root",
  name: "全部章节",
  type: "chapter",
  count: 0,
  children: [
    {
      id: "chapter-course",
      name: "章节课",
      type: "chapter",
      count: 0,
      children: [],
    },
  ],
};

const knowledgeTree: TreeNode = {
  id: "root",
  name: "全部知识点",
  type: "knowledge",
  count: 0,
  children: [],
};

describe("KnowledgeTreePage", () => {
  beforeEach(() => {
    useAuthStore.setState({
      teacher: {
        id: "teacher-1",
        schoolId: "school-1",
      } as Teacher,
      loading: false,
      error: null,
    });

    vi.mocked(knowledgeService.getChapterTree).mockResolvedValue(chapterTree);
    vi.mocked(knowledgeService.getKnowledgeTree).mockResolvedValue(knowledgeTree);
    vi.mocked(questionService.listQuestions).mockResolvedValue([]);
    vi.mocked(basketService.listBaskets).mockResolvedValue([]);
  });

  it("uses the knowledge-tree root after switching from a selected chapter", async () => {
    render(
      <MemoryRouter>
        <KnowledgeTreePage />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByText("章节课"));
    expect(screen.getByRole("button", { name: "添加节点到「章节课」" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "知识点" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "添加节点到「全部知识点」" })).toBeInTheDocument();
    });
    expect(screen.queryByText("章节课")).not.toBeInTheDocument();
  });
});
