import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TreeView } from "@/components/tree/TreeView";
import type { TreeNode } from "@/types";

const tree: TreeNode = {
  id: "root",
  name: "全部章节",
  type: "chapter",
  count: 0,
  children: [
    {
      id: "book",
      name: "教材",
      type: "chapter",
      count: 0,
      level: 0,
      children: [
        {
          id: "lesson-a",
          name: "同层节点 A",
          type: "chapter",
          count: 0,
          level: 1,
          children: [],
        },
        {
          id: "legacy-wrapper",
          name: "旧父节点",
          type: "chapter",
          count: 0,
          level: 0,
          children: [
            {
              id: "lesson-b",
              name: "同层节点 B",
              type: "chapter",
              count: 0,
              level: 1,
              children: [
                {
                  id: "detail",
                  name: "下一层节点",
                  type: "chapter",
                  count: 0,
                  level: 2,
                  children: [],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};

describe("TreeView", () => {
  it("aligns nodes by their declared level and indents the next level", () => {
    render(<TreeView data={tree} defaultExpandAll />);

    const rowA = screen.getByText("同层节点 A").parentElement;
    const rowB = screen.getByText("同层节点 B").parentElement;
    const detailRow = screen.getByText("下一层节点").parentElement;

    expect(rowA).toHaveStyle({ paddingLeft: "40px" });
    expect(rowB).toHaveStyle({ paddingLeft: "40px" });
    expect(detailRow).toHaveStyle({ paddingLeft: "56px" });
  });
  it("drops a node onto another node to request reparenting", () => {
    const onNodeDrop = vi.fn();
    render(<TreeView data={tree} defaultExpandAll onNodeDrop={onNodeDrop} />);

    const sourceRow = screen.getByText("同层节点 A").parentElement!;
    const targetRow = screen.getByText("同层节点 B").parentElement!;
    const dataTransfer = {
      effectAllowed: "none",
      dropEffect: "none",
      setData: vi.fn(),
      getData: vi.fn(),
    };

    fireEvent.dragStart(sourceRow, { dataTransfer });
    fireEvent.dragOver(targetRow, { dataTransfer });
    expect(targetRow).toHaveAttribute("data-drop-target", "true");
    fireEvent.drop(targetRow, { dataTransfer });

    expect(onNodeDrop).toHaveBeenCalledTimes(1);
    expect(onNodeDrop).toHaveBeenCalledWith(
      expect.objectContaining({ id: "lesson-a" }),
      expect.objectContaining({ id: "lesson-b" }),
    );
  });

  it("does not allow a node to be dropped into its own subtree", () => {
    const onNodeDrop = vi.fn();
    render(<TreeView data={tree} defaultExpandAll onNodeDrop={onNodeDrop} />);

    const sourceRow = screen.getByText("教材").parentElement!;
    const descendantRow = screen.getByText("下一层节点").parentElement!;
    const dataTransfer = {
      effectAllowed: "none",
      dropEffect: "none",
      setData: vi.fn(),
      getData: vi.fn(),
    };

    fireEvent.dragStart(sourceRow, { dataTransfer });
    fireEvent.dragOver(descendantRow, { dataTransfer });
    fireEvent.drop(descendantRow, { dataTransfer });

    expect(descendantRow).not.toHaveAttribute("data-drop-target", "true");
    expect(onNodeDrop).not.toHaveBeenCalled();
  });

  it("shows only directly linked questions and progress without descendant counts", () => {
    const data: TreeNode = {
      id: "root", name: "全部章节", type: "chapter", count: 3,
      children: [{
        id: "parent", name: "父章节", type: "chapter",
        count: 3, directCount: 1, doneCount: 2, directDoneCount: 0,
        masteryRate: 0.75,
        children: [{
          id: "child", name: "子章节", type: "chapter",
          count: 2, directCount: 2, doneCount: 2, directDoneCount: 2,
          masteryRate: 0.75, directMasteryRate: 0.75, children: [],
        }],
      }],
    };
    const { rerender } = render(<TreeView data={data} showDoneCount defaultExpandAll />);
    expect(screen.getByText("父章节").parentElement).toHaveTextContent("2（75%）/3");

    rerender(<TreeView data={data} showDoneCount defaultExpandAll includeDescendantCounts={false} />);
    expect(screen.getByText("父章节").parentElement).toHaveTextContent("0/1");
    expect(screen.getByText("父章节").parentElement).not.toHaveTextContent("75%");
    expect(screen.getByText("子章节").parentElement).toHaveTextContent("2（75%）/2");
  });

  it("shows mastery percentage after the completed-question count", () => {
    const progressTree: TreeNode = {
      id: "root",
      name: "全部章节",
      type: "chapter",
      count: 5,
      children: [{
        id: "chapter-a",
        name: "第一章",
        type: "chapter",
        count: 5,
        doneCount: 3,
        masteryRate: 2 / 3,
        children: [],
      }],
    };

    render(<TreeView data={progressTree} showDoneCount />);

    expect(screen.getByText("3（67%）/")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
  });
});
