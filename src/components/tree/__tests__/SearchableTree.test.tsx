import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SearchableTree } from "@/components/tree/SearchableTree";
import { knowledgeService } from "@/services/knowledge";
import type { TreeNode } from "@/types";

vi.mock("@/stores/ui", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
}));

const tree: TreeNode = {
  id: "root",
  name: "全部章节",
  type: "chapter",
  count: 2,
  children: [
    {
      id: "chapter-1",
      name: "第一章 集合与函数",
      type: "chapter",
      count: 1,
      children: [
        {
          id: "lesson-1",
          name: "第一节 函数性质",
          type: "chapter",
          count: 1,
          children: [
            {
              id: "point-1",
              name: "函数单调性",
              type: "knowledge",
              count: 1,
              children: [],
            },
          ],
        },
      ],
    },
    {
      id: "chapter-2",
      name: "第二章 几何",
      type: "chapter",
      count: 1,
      children: [],
    },
  ],
};

describe("SearchableTree", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("expands the complete path and highlights matching nodes while searching", () => {
    render(
      <SearchableTree
        data={tree}
        title="章节目录"
        searchPlaceholder="搜索章节..."
      />,
    );

    expect(screen.queryByText("函数单调性")).not.toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("搜索章节..."), {
      target: { value: "单调性" },
    });

    expect(screen.getByText("第一章 集合与函数")).toBeVisible();
    expect(screen.getByText("第一节 函数性质")).toBeVisible();
    expect(screen.getByText("函数单调性")).toBeVisible();
    expect(screen.queryByText("第二章 几何")).not.toBeInTheDocument();
    expect(screen.getByText("函数单调性").closest('[data-search-match="true"]')).not.toBeNull();
  });

  it("keeps descendants selectable under a matching directory", () => {
    const onCheck = vi.fn();
    render(
      <SearchableTree
        data={tree}
        title="章节目录"
        searchPlaceholder="搜索章节..."
        checkable
        checkedIds={[]}
        onCheck={onCheck}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText("搜索章节..."), {
      target: { value: "集合" },
    });

    const childLabel = screen.getByText("第一节 函数性质");
    expect(childLabel).toBeVisible();
    const childRow = childLabel.parentElement;
    expect(childRow).not.toBeNull();
    const childButtons = within(childRow!).getAllByRole("button");
    fireEvent.click(childButtons[1]);

    expect(onCheck).toHaveBeenCalledWith(["lesson-1", "point-1"]);
  });

  it("shows an empty state when no node matches", () => {
    render(<SearchableTree data={tree} title="知识点目录" />);

    fireEvent.change(screen.getByPlaceholderText("搜索目录..."), {
      target: { value: "不存在的知识点" },
    });

    expect(screen.getByText("未匹配到节点")).toBeVisible();
  });

  it("uses the custom reset handler when provided", () => {
    const onCheck = vi.fn();
    const onReset = vi.fn();

    render(
      <SearchableTree
        data={tree}
        title="章节目录"
        checkable
        checkedIds={["chapter-1"]}
        onCheck={onCheck}
        onReset={onReset}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText("搜索目录..."), {
      target: { value: "集合" },
    });
    fireEvent.click(screen.getByRole("button", { name: "重置" }));

    expect(onReset).toHaveBeenCalledOnce();
    expect(onCheck).not.toHaveBeenCalled();
    expect(screen.getByPlaceholderText("搜索目录...")).toHaveValue("");
  });

  it("can hide the title without removing header controls", () => {
    render(
      <SearchableTree
        data={tree}
        title="章节课目录"
        showTitle={false}
        checkable
        showLogicSelector
        onCheck={vi.fn()}
      />,
    );

    expect(screen.queryByText("章节课目录")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "或" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "且" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "重置" })).toBeInTheDocument();
  });
  it("adds a top-level directory node and refreshes the tree", async () => {
    const nextTree: TreeNode = {
      ...tree,
      children: [
        ...tree.children,
        {
          id: "chapter-new",
          name: "新增章节",
          type: "chapter",
          count: 0,
          parentId: null,
          level: 0,
          children: [],
        },
      ],
    };
    vi.spyOn(window, "prompt").mockReturnValue(" 新增章节 ");
    vi.spyOn(knowledgeService, "listChapters").mockResolvedValue([]);
    const addChapter = vi.spyOn(knowledgeService, "addChapter").mockResolvedValue({
      id: "chapter-new",
      schoolId: "school-1",
      parentId: null,
      name: "新增章节",
      order: 1,
      level: 0,
    });
    vi.spyOn(knowledgeService, "getChapterTree").mockResolvedValue(nextTree);
    const onDataChange = vi.fn();

    render(
      <SearchableTree
        data={tree}
        title="章节目录"
        editableSchoolId="school-1"
        onDataChange={onDataChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "在全部章节下添加新节点" }));

    await waitFor(() => {
      expect(addChapter).toHaveBeenCalledWith("school-1", null, "新增章节");
      expect(onDataChange).toHaveBeenCalledWith(nextTree);
    });
    expect(screen.getByText("新增章节")).toBeInTheDocument();
  });

  it("renames a directory node and refreshes the tree", async () => {
    const nextTree: TreeNode = {
      ...tree,
      children: tree.children.map((node) =>
        node.id === "chapter-1" ? { ...node, name: "函数基础" } : node,
      ),
    };
    vi.spyOn(window, "prompt").mockReturnValue("函数基础");
    const renameNode = vi.spyOn(knowledgeService, "renameNode").mockResolvedValue();
    vi.spyOn(knowledgeService, "getChapterTree").mockResolvedValue(nextTree);
    const onDataChange = vi.fn();

    render(
      <SearchableTree
        data={tree}
        title="章节目录"
        editableSchoolId="school-1"
        onDataChange={onDataChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "改名：第一章 集合与函数" }));

    await waitFor(() => {
      expect(renameNode).toHaveBeenCalledWith("chapter-1", "chapter", "函数基础");
      expect(onDataChange).toHaveBeenCalledWith(nextTree);
    });
    expect(screen.getByText("函数基础")).toBeInTheDocument();
  });

});
