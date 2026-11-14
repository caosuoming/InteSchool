import { describe, expect, it } from "vitest";
import type { BoardDocument, BoardEdge } from "@/types";
import { addBoardNodeAtPoint, connectBoardPorts, edgeGeometry, parentConnection, portPoint } from "./board-routing";

const bounds = { cx: 100, cy: 150, width: 120, height: 60 };
const edge: BoardEdge = { id: "parent:b", from: "a", to: "b", style: "solid", arrow: "forward", route: "curve" };
const board: BoardDocument = {
  id: "master:a", kind: "master", teacherId: "t", schoolId: "s", subject: "数学", title: "总导图", rootNodeId: "root",
  nodes: [
    { id: "root", label: "根", parentId: null, x: 50, y: 9 },
    { id: "a", label: "A", parentId: "root", x: 30, y: 40 },
    { id: "b", label: "B", parentId: "root", x: 60, y: 40 },
    { id: "c", label: "C", parentId: "a", x: 60, y: 60 },
  ],
  edges: [{ ...edge, id: "parent:a", from: "root", to: "a" },
    { ...edge, id: "parent:b", from: "root", to: "b" },
    { ...edge, id: "parent:c", from: "a", to: "c" }],
  createdAt: "2026-01-01", updatedAt: "2026-01-01",
};

describe("board connection geometry", () => {
  it("uses all six border anchors rather than the node center", () => {
    expect(portPoint(bounds, "top-left")).toEqual({ x: 76, y: 120 });
    expect(portPoint(bounds, "top-right")).toEqual({ x: 124, y: 120 });
    expect(portPoint(bounds, "bottom-left")).toEqual({ x: 76, y: 180 });
    expect(portPoint(bounds, "bottom-right")).toEqual({ x: 124, y: 180 });
    expect(portPoint(bounds, "left")).toEqual({ x: 40, y: 150 });
    expect(portPoint(bounds, "right")).toEqual({ x: 160, y: 150 });
  });
  it("draws bezier curves and orthogonal paths that end at border ports", () => {
    const end = { cx: 340, cy: 370, width: 100, height: 70 };
    const curved = edgeGeometry(bounds, end, edge);
    expect(curved.path).toContain(" C");
    expect(curved.path).toContain(` ${portPoint(end, curved.toPort).y}`);
    const elbow = edgeGeometry(bounds, end, { ...edge, route: "elbow" });
    expect(elbow.path).not.toContain(" C");
    expect(elbow.path.match(/ L/g)).toHaveLength(3);
  });
  it("distinguishes hierarchy and sibling ports", () => {
    expect(parentConnection("bottom-left", "top-right")).toBe("forward");
    expect(parentConnection("top-right", "bottom-left")).toBe("reverse");
    expect(parentConnection("right", "left")).toBeNull();
  });
  it("updates hierarchy without cycles and adds lateral links separately", () => {
    const changed = connectBoardPorts(board, "b", "bottom-right", "c", "top-left");
    expect(changed.nodes.find((n) => n.id === "c")?.parentId).toBe("b");
    expect(changed.edges.find((e) => e.id === "parent:c")).toMatchObject({ from: "b", to: "c", route: "curve" });
    expect(connectBoardPorts(board, "c", "bottom-left", "a", "top-right")).toBe(board);
    const related = connectBoardPorts(board, "a", "right", "b", "left");
    expect(related.edges[related.edges.length - 1]).toMatchObject({ from: "a", to: "b", fromPort: "right", toPort: "left" });
    expect(related.nodes).toEqual(board.nodes);
    expect(connectBoardPorts(board, "a", "right", "a", "left")).toBe(board);
  });
});


describe("dragging a port onto empty canvas", () => {
  it("creates a child and a persisted port-to-port edge without changing existing nodes", () => {
    const next = addBoardNodeAtPoint(board, "root", "right", { x: 72, y: 41 }, "new");
    expect(next.nodes).toHaveLength(board.nodes.length + 1);
    expect(next.nodes.find((node) => node.id === "new")).toMatchObject({
      label: "新节点", parentId: "root", x: 72, y: 41,
    });
    expect(next.edges.find((item) => item.id === "parent:new")).toMatchObject({
      from: "root", to: "new", fromPort: "right", toPort: "left",
    });
    expect(board.nodes.some((node) => node.id === "new")).toBe(false);
    expect(addBoardNodeAtPoint(board, "absent", "left", { x: 50, y: 50 }, "n")).toBe(board);
  });

  it("keeps created nodes inside editable canvas bounds", () => {
    const next = addBoardNodeAtPoint(board, "root", "bottom-left", { x: 101, y: -10 }, "new");
    expect(next.nodes.at(-1)).toMatchObject({ x: 96, y: 5 });
    expect(next.edges.at(-1)).toMatchObject({ fromPort: "bottom-left", toPort: "top-left" });
  });
});
