import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
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
});
