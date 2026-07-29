import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SearchableTree } from "@/components/tree/SearchableTree";
import type { TreeNode } from "@/types";

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

  it("shows an empty state when no node matches", () => {
    render(<SearchableTree data={tree} title="知识点目录" />);

    fireEvent.change(screen.getByPlaceholderText("搜索目录..."), {
      target: { value: "不存在的知识点" },
    });

    expect(screen.getByText("未匹配到节点")).toBeVisible();
  });
});
