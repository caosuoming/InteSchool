import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { BoardDocument } from "@/types";
import { BoardCanvas } from "./BoardCanvas";
import { focusBoardNodes } from "./board-layout";

const board: BoardDocument = {
  id: "master:teacher-a", kind: "master", teacherId: "teacher-a", schoolId: "school-a", subject: "数学", title: "总导图", rootNodeId: "root",
  nodes: [
    { id: "root", parentId: null, label: "总导图", x: 50, y: 8 },
    { id: "parent", parentId: "root", label: "一级", x: 50, y: 25 },
    { id: "sibling", parentId: "root", label: "兄弟", x: 60, y: 25 },
    { id: "focus", parentId: "parent", label: "聚焦", x: 50, y: 40 },
    { id: "child", parentId: "focus", label: "子节点", x: 40, y: 60 },
    { id: "leaf", parentId: "child", label: "孙节点", x: 40, y: 80 },
  ],
  edges: [{ id: "parent:focus", from: "parent", to: "focus", style: "solid", arrow: "forward", route: "straight" }],
  createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("board canvas focus view", () => {
  it("places the parent above the focus and children below", () => {
    const positioned = focusBoardNodes(board, "focus");
    const location = (id: string) => positioned.find((item) => item.node.id === id)!;
    expect(location("parent").y).toBeLessThan(location("focus").y);
    expect(location("child").y).toBeGreaterThan(location("focus").y);
    expect(location("leaf").distance).toBe(2);
  });

  it("renders focus labels and SVG links", () => {
    const result = render(<BoardCanvas board={board} selectedNodeId="focus" readonly />);
    expect(screen.getByRole("button", { name: "导图节点 聚焦" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "导图节点 子节点" })).toBeInTheDocument();
    expect(result.container.querySelector("svg path[marker-end]")).toBeTruthy();
  });
});
