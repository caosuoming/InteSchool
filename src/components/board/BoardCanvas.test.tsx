import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
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

  it("exposes six ports and searches hidden nodes without displaying them", () => {
    const modified = { ...board, nodes: board.nodes.map((node) => node.id === "child" ? { ...node, hidden: true, pinned: true } : node) };
    const result = render(<BoardCanvas board={modified} selectedNodeId="focus" onSelectNode={() => {}} onChange={() => {}} />);
    expect(screen.queryByRole("button", { name: "导图节点 子节点" })).toBeNull();
    expect(screen.getByText("隐藏节点")).toBeInTheDocument();
    expect(screen.getByText("图钉节点")).toBeInTheDocument();
    expect(result.container.querySelectorAll('[data-board-port="top-left"]')).toHaveLength(3);
    fireEvent.change(screen.getByRole("textbox", { name: "搜索导图节点" }), { target: { value: "子节点" } });
    expect(screen.getByRole("button", { name: "子节点（已隐藏）" })).toBeInTheDocument();
  });

  it("hides only the visual title and still renders editable node content", () => {
    const modified = { ...board, nodes: board.nodes.map((node) => node.id === "focus"
      ? { ...node, hideLabel: true, richText: "<b>保留内容</b>" } : node) };
    const result = render(<BoardCanvas board={modified} selectedNodeId="focus" readonly />);
    const focus = result.container.querySelector('[data-board-node-id="focus"]')!;
    expect(focus.textContent).not.toContain("聚焦");
    expect(focus.textContent).toContain("保留内容");
    expect(screen.getByRole("button", { name: "导图节点 聚焦" })).toBeInTheDocument();
  });

  it("keeps six tiny connection handles on pinned nodes and applies border options", () => {
    const modified = { ...board, nodes: board.nodes.map((node) => node.id === "focus"
      ? { ...node, pinned: true, borderVisible: false, borderColor: "#123abc" } : node) };
    const { container } = render(<BoardCanvas board={modified} selectedNodeId="focus" onChange={() => {}} />);
    const wrapper = container.querySelector('[data-board-node-id="focus"]')!;
    const button = wrapper.querySelector<HTMLButtonElement>('button[aria-label="导图节点 聚焦"]')!;
    expect(button.style.borderWidth).toBe("0px");
    expect(button.style.borderColor).toBe("rgb(18, 58, 188)");
    expect(wrapper.querySelectorAll("[data-board-port]")).toHaveLength(6);
    expect(wrapper.querySelector("[data-board-port] span")?.className).toContain("h-[2.4px]");
  });

  it("creates a connected node only when a handle is released on empty canvas", () => {
    const change = vi.fn();
    const select = vi.fn();
    const { container } = render(<BoardCanvas board={board} selectedNodeId="focus"
      onChange={change} onSelectNode={select} />);
    const canvas = container.querySelector('[role="group"]') as HTMLDivElement;
    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
      left: 0, top: 0, right: 1000, bottom: 600, width: 1000, height: 600,
      x: 0, y: 0, toJSON: () => ({}),
    });
    const originalHitTest = document.elementFromPoint;
    Object.defineProperty(document, "elementFromPoint", { configurable: true, value: () => null });
    try {
      const source = container.querySelector<HTMLButtonElement>(
        '[data-board-node="focus"][data-board-port="right"]')!;
      fireEvent.pointerDown(source, { clientX: 500, clientY: 200, pointerId: 1 });
      fireEvent.pointerMove(source, { clientX: 800, clientY: 360, pointerId: 1 });
      fireEvent.pointerUp(source, { clientX: 800, clientY: 360, pointerId: 1 });
      expect(change).toHaveBeenCalledTimes(1);
      const updated = change.mock.calls[0][0] as BoardDocument;
      expect(updated.nodes).toHaveLength(board.nodes.length + 1);
      expect(updated.edges.at(-1)).toMatchObject({ from: "focus", fromPort: "right", toPort: "left" });
      expect(select).toHaveBeenCalledWith(updated.nodes.at(-1)?.id);
    } finally {
      Object.defineProperty(document, "elementFromPoint",
        { configurable: true, value: originalHitTest });
    }
  });

  it("renders focus labels and SVG links", () => {
    const result = render(<BoardCanvas board={board} selectedNodeId="focus" readonly />);
    expect(screen.getByRole("button", { name: "导图节点 聚焦" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "导图节点 子节点" })).toBeInTheDocument();
    expect(result.container.querySelector("svg path[marker-end]")).toBeTruthy();
  });
});
