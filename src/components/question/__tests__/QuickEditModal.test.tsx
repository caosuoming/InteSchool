import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QuickEditModal } from "@/components/question/QuickEditModal";
import { knowledgeService } from "@/services/knowledge";
import { questionService } from "@/services/question";
import { useAuthStore } from "@/stores/auth";
import type { Question, Teacher, TreeNode } from "@/types";

vi.mock("@/services/knowledge", () => ({
  knowledgeService: {
    getChapterTree: vi.fn(),
    getKnowledgeTree: vi.fn(),
    listChapters: vi.fn(),
    listKnowledgePoints: vi.fn(),
    addChapter: vi.fn(),
    addKnowledgePoint: vi.fn(),
    renameNode: vi.fn(),
  },
}));

vi.mock("@/services/question", () => ({
  questionService: {
    updateQuestion: vi.fn(),
  },
}));

vi.mock("@/stores/ui", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  },
}));

const chapterTree: TreeNode = {
  id: "root",
  name: "全部章节",
  type: "chapter",
  count: 1,
  children: [
    {
      id: "chapter-1",
      name: "第一章 集合",
      type: "chapter",
      count: 1,
      children: [],
    },
  ],
};

const knowledgeTree: TreeNode = {
  id: "root",
  name: "全部知识点",
  type: "knowledge",
  count: 1,
  children: [
    {
      id: "knowledge-1",
      name: "集合的概念",
      type: "knowledge",
      count: 1,
      children: [],
    },
  ],
};

const question: Question = {
  id: "question-1",
  teacherId: "teacher-1",
  schoolId: "school-1",
  type: "single",
  stem: "已知集合 A，求 A 的补集。",
  options: ["A", "B", "C", "D"],
  answer: "A",
  analysis: "按补集定义计算。",
  chapterIds: ["chapter-1"],
  knowledgePointIds: ["knowledge-1"],
  difficulty: 2,
  recommendation: 3,
  usageCount: 0,
  remark: "",
  remarks: [],
  sectionOrder: ["knowledge", "chapter", "remark"],
  isShared: false,
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
};

describe("QuickEditModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({
      teacher: { id: "teacher-1", schoolId: "school-1" } as Teacher,
      loading: false,
      error: null,
    });
    vi.mocked(knowledgeService.getChapterTree).mockResolvedValue(chapterTree);
    vi.mocked(knowledgeService.getKnowledgeTree).mockResolvedValue(knowledgeTree);
    vi.mocked(questionService.updateQuestion).mockResolvedValue(question);
  });

  it("switches chapter and knowledge directories as two tabs with a taller selection area", async () => {
    render(
      <QuickEditModal
        open
        question={question}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );

    const chapterTab = screen.getByRole("tab", { name: /章节课目录/ });
    const knowledgeTab = screen.getByRole("tab", { name: /知识点目录/ });

    expect(chapterTab).toHaveAttribute("aria-selected", "true");
    expect(knowledgeTab).toHaveAttribute("aria-selected", "false");
    expect(await screen.findByPlaceholderText("搜索章节课目录...")).toBeVisible();
    expect(screen.queryByPlaceholderText("搜索知识点目录...")).not.toBeInTheDocument();
    expect(screen.getByTestId("quick-edit-directory-panel")).toHaveClass("min-h-[390px]");

    fireEvent.click(knowledgeTab);

    await waitFor(() => {
      expect(knowledgeTab).toHaveAttribute("aria-selected", "true");
      expect(screen.getByPlaceholderText("搜索知识点目录...")).toBeVisible();
    });
    expect(screen.queryByPlaceholderText("搜索章节课目录...")).not.toBeInTheDocument();
  });

  it("preserves legacy sectionOrder instead of rewriting it when saving the new tab layout", async () => {
    render(
      <QuickEditModal
        open
        question={question}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );

    await screen.findByPlaceholderText("搜索章节课目录...");
    fireEvent.click(screen.getByRole("button", { name: "保存修改" }));

    await waitFor(() => expect(questionService.updateQuestion).toHaveBeenCalledOnce());
    const [, payload] = vi.mocked(questionService.updateQuestion).mock.calls[0];
    expect(payload).toMatchObject({
      chapterIds: ["chapter-1"],
      knowledgePointIds: ["knowledge-1"],
      remarks: [],
      remark: "",
    });
    expect(payload).not.toHaveProperty("sectionOrder");
  });
});
