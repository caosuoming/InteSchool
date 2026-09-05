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
    listDirectoryCatalogs: vi.fn(),
    listDirectoryDonations: vi.fn(),
    donateDirectory: vi.fn(),
    acceptDirectoryDonation: vi.fn(),
    activateDirectoryCatalog: vi.fn(),
    getAliasIds: vi.fn(),
    listChapters: vi.fn(),
    listKnowledgePoints: vi.fn(),
    addChapter: vi.fn(),
    addKnowledgePoint: vi.fn(),
    renameNode: vi.fn(),
    deleteNode: vi.fn(),
    mergeNodes: vi.fn(),
    moveNode: vi.fn(),
    reorderSiblings: vi.fn(),
  },
}));

vi.mock("@/services/question", () => ({
  questionService: {
    listQuestions: vi.fn(),
  },
}));

vi.mock("@/components/question/QuestionCard", () => ({
  QuestionCard: () => <div data-testid="question-card" />,
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
    {
      id: "chapter-target",
      name: "目标章节",
      type: "chapter",
      count: 2,
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
    vi.clearAllMocks();
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
    vi.mocked(knowledgeService.listDirectoryCatalogs).mockImplementation(async (_teacherId, type) => [{
      id: `current-school-1-${type}`,
      schoolId: "school-1",
      type,
      name: type === "chapter" ? "默认章节课目录" : "默认知识点目录",
      nodeCount: type === "chapter" ? 2 : 0,
      isActive: true,
      createdAt: "2026-08-21T00:00:00.000Z",
      updatedAt: "2026-08-21T00:00:00.000Z",
    }]);
    vi.mocked(knowledgeService.listDirectoryDonations).mockResolvedValue([]);
    vi.mocked(knowledgeService.donateDirectory).mockResolvedValue({
      donation: {
        id: "donation-current",
        donorTeacherId: "teacher-1",
        donorSchoolId: "school-1",
        donorNickname: "本人",
        subject: "数学",
        type: "chapter",
        nodes: [],
        createdAt: "2026-08-21T00:00:00.000Z",
        updatedAt: "2026-08-21T00:00:00.000Z",
      },
      replaced: false,
    });
    vi.mocked(knowledgeService.activateDirectoryCatalog).mockImplementation(async (_teacherId, catalogId) => ({
      id: catalogId,
      schoolId: "school-1",
      type: "chapter",
      name: "目录",
      nodeCount: 0,
      isActive: true,
      createdAt: "2026-08-21T00:00:00.000Z",
      updatedAt: "2026-08-21T00:00:00.000Z",
    }));
    vi.mocked(knowledgeService.acceptDirectoryDonation).mockResolvedValue({
      id: "catalog-accepted",
      schoolId: "school-1",
      type: "chapter",
      name: "甲老师的章节课目录",
      nodeCount: 2,
      isActive: true,
      createdAt: "2026-08-21T00:00:00.000Z",
      updatedAt: "2026-08-21T00:00:00.000Z",
    });
    vi.mocked(knowledgeService.listKnowledgePoints).mockResolvedValue([]);
    vi.mocked(knowledgeService.addKnowledgePoint).mockResolvedValue({
      id: "point-new",
      schoolId: "school-1",
      parentId: null,
      name: "独立知识点",
      order: 1,
      level: 0,
    });
    vi.mocked(questionService.listQuestions).mockResolvedValue([]);
    vi.mocked(basketService.listBaskets).mockResolvedValue([]);
  });

  it("loads the personal directory without an active school", async () => {
    useAuthStore.setState({
      teacher: {
        id: "teacher-1",
        schoolId: null,
      } as Teacher,
      loading: false,
      error: null,
    });

    render(
      <MemoryRouter>
        <KnowledgeTreePage />
      </MemoryRouter>,
    );

    expect(await screen.findByText("章节课")).toBeInTheDocument();
    expect(knowledgeService.getChapterTree).toHaveBeenCalledWith(null);
    expect(knowledgeService.listDirectoryCatalogs).toHaveBeenCalledWith("teacher-1", "chapter");
    expect(basketService.listBaskets).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText("章节课"));
    await waitFor(() => {
      expect(questionService.listQuestions).not.toHaveBeenCalled();
    });
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

  it("adds a knowledge point without loading or selecting a chapter", async () => {
    render(
      <MemoryRouter>
        <KnowledgeTreePage />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "知识点" }));
    fireEvent.click(await screen.findByRole("button", { name: "添加节点到「全部知识点」" }));
    fireEvent.change(screen.getByLabelText("节点名称"), { target: { value: "独立知识点" } });
    fireEvent.click(screen.getByRole("button", { name: "添加" }));

    await waitFor(() => {
      expect(knowledgeService.addKnowledgePoint).toHaveBeenCalledWith(
        "school-1",
        null,
        "独立知识点",
        undefined,
      );
    });
    expect(knowledgeService.listChapters).not.toHaveBeenCalled();
  });

  it("moves a chapter by dragging it onto the new parent", async () => {
    render(
      <MemoryRouter>
        <KnowledgeTreePage />
      </MemoryRouter>,
    );

    const sourceRow = (await screen.findByText("章节课")).parentElement!;
    const targetRow = screen.getByText("目标章节").parentElement!;
    const dataTransfer = {
      effectAllowed: "none",
      dropEffect: "none",
      setData: vi.fn(),
      getData: vi.fn(),
    };

    fireEvent.dragStart(sourceRow, { dataTransfer });
    fireEvent.dragOver(targetRow, { dataTransfer });
    fireEvent.drop(targetRow, { dataTransfer });

    await waitFor(() => {
      expect(knowledgeService.moveNode).toHaveBeenCalledWith(
        "chapter-course",
        "chapter",
        "chapter-target",
      );
    });
  });

  it("merges a selected node into another child of the same parent", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);

    render(
      <MemoryRouter>
        <KnowledgeTreePage />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByText("章节课"));
    fireEvent.click(screen.getByRole("button", { name: "合并" }));
    fireEvent.click(screen.getByRole("button", { name: /合并到.*目标章节/ }));

    await waitFor(() => {
      expect(knowledgeService.mergeNodes).toHaveBeenCalledWith(
        "chapter-course",
        "chapter-target",
        "chapter",
      );
    });
    expect(window.confirm).toHaveBeenCalledWith(
      "确定将「章节课」合并到「目标章节」吗？目标节点将保留，子节点和资源关联会一并迁移。",
    );
  });

  it("previews a same-subject donated directory before accepting it as a new catalog", async () => {
    vi.mocked(knowledgeService.listDirectoryDonations).mockResolvedValue([{
      id: "directory-donation-1",
      donorTeacherId: "teacher-2",
      donorSchoolId: "school-2",
      donorNickname: "甲老师",
      subject: "数学",
      type: "chapter",
      nodes: [
        {
          id: "donated-parent",
          parentId: null,
          name: "必修一",
          order: 1,
          level: 0,
        },
        {
          id: "donated-child",
          parentId: "donated-parent",
          name: "集合",
          order: 1,
          level: 1,
        },
      ],
      createdAt: "2026-08-20T00:00:00.000Z",
      updatedAt: "2026-08-21T00:00:00.000Z",
    }]);

    render(
      <MemoryRouter>
        <KnowledgeTreePage />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole("button", { name: /浏览同学科捐赠/ }));
    fireEvent.click(await screen.findByRole("button", { name: /甲老师/ }));

    expect(screen.getByText("甲老师捐赠的章节课目录")).toBeInTheDocument();
    expect(screen.getByText("必修一")).toBeInTheDocument();
    expect(screen.getByText("集合")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "新建目录体系" }));
    await waitFor(() => {
      expect(knowledgeService.acceptDirectoryDonation).toHaveBeenCalledWith(
        "teacher-1",
        "directory-donation-1",
        "new",
      );
    });
  });
});
