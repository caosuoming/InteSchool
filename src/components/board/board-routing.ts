import type { BoardDocument, BoardEdge, BoardNode, BoardPort } from "@/types";

export interface NodeBounds { cx: number; cy: number; width: number; height: number }
export interface Point { x: number; y: number }
export const PORTS: readonly BoardPort[] = ["top-left", "top-right", "bottom-left", "bottom-right", "left", "right"];

export function portPoint(bounds: NodeBounds, port: BoardPort): Point {
  const x = bounds.cx - bounds.width / 2;
  const y = bounds.cy - bounds.height / 2;
  switch (port) {
    case "top-left": return { x: x + bounds.width * .30, y };
    case "top-right": return { x: x + bounds.width * .70, y };
    case "bottom-left": return { x: x + bounds.width * .30, y: y + bounds.height };
    case "bottom-right": return { x: x + bounds.width * .70, y: y + bounds.height };
    case "left": return { x, y: bounds.cy };
    case "right": return { x: x + bounds.width, y: bounds.cy };
  }
}

export function suggestedPorts(from: NodeBounds, to: NodeBounds, edge: BoardEdge): [BoardPort, BoardPort] {
  if (edge.fromPort && edge.toPort) return [edge.fromPort, edge.toPort];
  const dx = to.cx - from.cx;
  const dy = to.cy - from.cy;
  if (edge.id.startsWith("parent:") || Math.abs(dy) > Math.abs(dx) * .65) {
    const source: BoardPort = dy >= 0
      ? (dx >= 0 ? "bottom-right" : "bottom-left") : (dx >= 0 ? "top-right" : "top-left");
    const target: BoardPort = dy >= 0
      ? (dx >= 0 ? "top-left" : "top-right") : (dx >= 0 ? "bottom-left" : "bottom-right");
    return [edge.fromPort || source, edge.toPort || target];
  }
  return [edge.fromPort || (dx >= 0 ? "right" : "left"), edge.toPort || (dx >= 0 ? "left" : "right")];
}

function normal(port: BoardPort): Point {
  if (port.startsWith("top")) return { x: 0, y: -1 };
  if (port.startsWith("bottom")) return { x: 0, y: 1 };
  return { x: port === "left" ? -1 : 1, y: 0 };
}

export function edgeGeometry(from: NodeBounds, to: NodeBounds, edge: BoardEdge) {
  const [fromPort, toPort] = suggestedPorts(from, to, edge);
  const a = portPoint(from, fromPort);
  const b = portPoint(to, toPort);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  let path: string;
  if (edge.route === "curve") {
    const distance = Math.min(120, Math.max(30, Math.hypot(dx, dy) * .42));
    const n1 = normal(fromPort);
    const n2 = normal(toPort);
    path = `M${a.x} ${a.y} C${a.x + n1.x * distance} ${a.y + n1.y * distance} ${b.x + n2.x * distance} ${b.y + n2.y * distance} ${b.x} ${b.y}`;
  } else if (edge.route === "elbow") {
    if (fromPort === "left" || fromPort === "right") {
      const mid = a.x + dx / 2;
      path = `M${a.x} ${a.y} L${mid} ${a.y} L${mid} ${b.y} L${b.x} ${b.y}`;
    } else {
      const mid = a.y + dy / 2;
      path = `M${a.x} ${a.y} L${a.x} ${mid} L${b.x} ${mid} L${b.x} ${b.y}`;
    }
  } else {
    path = `M${a.x} ${a.y} L${b.x} ${b.y}`;
  }
  return { path, fromPort, toPort, midpoint: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
}

/** 连接上下边框是层级关系；连接左右边框是额外的横向关系。 */
export function parentConnection(sourcePort: BoardPort, targetPort: BoardPort): "forward" | "reverse" | null {
  if (sourcePort.startsWith("bottom") && targetPort.startsWith("top")) return "forward";
  if (sourcePort.startsWith("top") && targetPort.startsWith("bottom")) return "reverse";
  return null;
}

export function canReparent(nodes: BoardNode[], parentId: string, childId: string, rootId: string) {
  if (parentId === childId || childId === rootId) return false;
  const byId = new Map(nodes.map((node) => [node.id, node]));
  if (!byId.has(parentId) || !byId.has(childId)) return false;
  const seen = new Set<string>();
  let current: string | null = parentId;
  while (current) {
    if (current === childId || seen.has(current)) return false;
    seen.add(current);
    current = byId.get(current)?.parentId || null;
  }
  return true;
}

export function connectBoardPorts(board: BoardDocument, fromId: string, fromPort: BoardPort,
  toId: string, toPort: BoardPort): BoardDocument {
  if (!board.nodes.some((n) => n.id === fromId) || !board.nodes.some((n) => n.id === toId)
    || fromId === toId) return board;
  const relation = parentConnection(fromPort, toPort);
  if (relation) {
    const parentId = relation === "forward" ? fromId : toId;
    const childId = relation === "forward" ? toId : fromId;
    if (!canReparent(board.nodes, parentId, childId, board.rootNodeId)) return board;
    const edge: BoardEdge = { id: `parent:${childId}`, from: parentId, to: childId,
      fromPort: relation === "forward" ? fromPort : toPort,
      toPort: relation === "forward" ? toPort : fromPort,
      route: board.kind === "master" ? "curve" : "elbow", style: "solid", arrow: "forward" };
    return { ...board,
      nodes: board.nodes.map((node) => node.id === childId ? { ...node, parentId } : node),
      edges: [...board.edges.filter((item) => item.id !== edge.id), edge] };
  }
  if (board.edges.some((edge) => edge.from === fromId && edge.to === toId
    && edge.fromPort === fromPort && edge.toPort === toPort)) return board;
  return { ...board, edges: [...board.edges, { id: `link:${crypto.randomUUID()}`, from: fromId, to: toId,
    fromPort, toPort, route: board.kind === "master" ? "curve" : "elbow",
    style: "solid", arrow: "none" }] };
}

/** Releasing a port onto the empty canvas creates a connected, editable child node. */
export function addBoardNodeAtPoint(board: BoardDocument, sourceId: string, fromPort: BoardPort,
  position: { x: number; y: number }, id: string): BoardDocument {
  if (!board.nodes.some((node) => node.id === sourceId) || board.nodes.some((node) => node.id === id)) return board;
  const x = Math.max(4, Math.min(96, position.x));
  const y = Math.max(5, Math.min(95, position.y));
  const opposite: BoardPort = fromPort === "left" ? "right" : fromPort === "right" ? "left"
    : fromPort.startsWith("top") ? fromPort.replace("top", "bottom") as BoardPort
    : fromPort.replace("bottom", "top") as BoardPort;
  const node: BoardNode = { id, label: "新节点", parentId: sourceId, x, y };
  return { ...board,
    nodes: [...board.nodes, node],
    edges: [...board.edges, { id: `parent:${id}`, from: sourceId, to: id, fromPort, toPort: opposite,
      style: "solid", arrow: "forward", route: board.kind === "master" ? "curve" : "elbow" }] };
}
