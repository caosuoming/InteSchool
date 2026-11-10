import { useMemo, useRef, type PointerEvent as ReactPointerEvent } from "react";
import type { BoardDocument, BoardEdge, BoardNode } from "@/types";
import { focusBoardNodes, type PositionedNode } from "./board-layout";
import { cn } from "@/lib/utils";

interface BoardCanvasProps {
  board: BoardDocument;
  selectedNodeId?: string | null;
  selectedEdgeId?: string | null;
  onSelectNode?: (id: string) => void;
  onSelectEdge?: (id: string) => void;
  onChange?: (board: BoardDocument) => void;
  readonly?: boolean;
  className?: string;
}

function edgePath(start: PositionedNode, end: PositionedNode, edge: BoardEdge): string {
  const a = { x: start.x * 10, y: start.y * 6 };
  const b = { x: end.x * 10, y: end.y * 6 };
  if (edge.route === "elbow") {
    const turn = a.y + (b.y - a.y) / 2;
    return `M${a.x} ${a.y} L${a.x} ${turn} L${b.x} ${turn} L${b.x} ${b.y}`;
  }
  return `M${a.x} ${a.y} L${b.x} ${b.y}`;
}

export function BoardCanvas({
  board, selectedNodeId, selectedEdgeId, onSelectNode, onSelectEdge, onChange, readonly = false, className,
}: BoardCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ id: string; startX: number; startY: number; originalX: number; originalY: number; moved: boolean } | null>(null);
  const positioned = useMemo(() => board.kind === "master"
    ? focusBoardNodes(board, selectedNodeId || board.rootNodeId)
    : board.nodes.map((node) => ({ node, x: node.id === board.rootNodeId ? 50 : node.x,
      y: node.id === board.rootNodeId ? 9 : node.y, distance: 0 })),
  [board, selectedNodeId]);
  const byId = new Map(positioned.map((entry) => [entry.node.id, entry]));

  const handleDown = (event: ReactPointerEvent<HTMLButtonElement>, node: BoardNode) => {
    if (readonly || !onChange || node.id === board.rootNodeId) return;
    dragRef.current = { id: node.id, startX: event.clientX, startY: event.clientY,
      originalX: node.x, originalY: node.y, moved: false };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const handleMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || !onChange || !containerRef.current) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (Math.hypot(dx, dy) < 5 && !drag.moved) return;
    drag.moved = true;
    if (board.kind === "master") return;
    const rect = containerRef.current.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const x = Math.max(3, Math.min(97, drag.originalX + dx / rect.width * 100));
    const y = Math.max(5, Math.min(95, drag.originalY + dy / rect.height * 100));
    onChange({ ...board, nodes: board.nodes.map((node) => node.id === drag.id ? { ...node, x, y } : node) });
  };
  const handleUp = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag) return;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (board.kind !== "master" || !drag.moved || !onChange) return;
    const element = document.elementFromPoint(event.clientX, event.clientY);
    const targetId = element?.closest("[data-board-node-id]")?.getAttribute("data-board-node-id");
    if (!targetId || targetId === drag.id) return;
    let parentId: string | null = targetId;
    while (parentId) {
      if (parentId === drag.id) return;
      parentId = board.nodes.find((node) => node.id === parentId)?.parentId || null;
    }
    const nodes = board.nodes.map((node) => node.id === drag.id ? { ...node, parentId: targetId } : node);
    const edges = [...board.edges.filter((edge) => edge.id !== `parent:${drag.id}`), {
      id: `parent:${drag.id}`, from: targetId, to: drag.id,
      style: "solid" as const, arrow: "forward" as const, route: "straight" as const,
    }];
    onChange({ ...board, nodes, edges });
  };

  return (
    <div ref={containerRef} role="group" aria-label={board.title}
      className={cn("relative isolate h-full w-full overflow-hidden rounded-lg bg-[#fbfaf6]", className)}>
      <svg viewBox="0 0 1000 600" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true">
        <defs>
          <marker id="board-arrow-end" markerWidth="7" markerHeight="7" refX="7" refY="3.5" orient="auto" markerUnits="strokeWidth">
            <path d="M0 0 L7 3.5 L0 7" fill="none" stroke="#667085" strokeWidth="1.4" />
          </marker>
          <marker id="board-arrow-start" markerWidth="7" markerHeight="7" refX="0" refY="3.5" orient="auto-start-reverse" markerUnits="strokeWidth">
            <path d="M7 0 L0 3.5 L7 7" fill="none" stroke="#667085" strokeWidth="1.4" />
          </marker>
        </defs>
        {board.kind === "master" && positioned.filter((item) => item.node.parentId === selectedNodeId).slice(1).map((item, index, siblings) => {
          const first = index === 0
            ? positioned.find((entry) => entry.node.parentId === selectedNodeId)
            : siblings[index - 1];
          return first ? <line key={`sibling:${item.node.id}`} x1={first.x * 10} y1={first.y * 6}
            x2={item.x * 10} y2={item.y * 6} stroke="#ccd2d0" strokeWidth="1" /> : null;
        })}
        {board.edges.map((edge) => {
          const from = byId.get(edge.from);
          const to = byId.get(edge.to);
          if (!from || !to) return null;
          const d = edgePath(from, to, edge);
          const stroke = edge.id === selectedEdgeId ? "#c28c26" : "#87909b";
          return <g key={edge.id}>
            <path d={d} fill="none" stroke={stroke} strokeWidth={edge.style === "double" ? 4 : 1.9}
              strokeDasharray={edge.style === "dashed" ? "6 5" : undefined}
              markerStart={["reverse", "both"].includes(edge.arrow) ? "url(#board-arrow-start)" : undefined}
              markerEnd={["forward", "both"].includes(edge.arrow) ? "url(#board-arrow-end)" : undefined} />
            {edge.style === "double" && <path d={d} fill="none" stroke="#fbfaf6" strokeWidth={1.2} />}
          </g>;
        })}
      </svg>
      {!readonly && <svg viewBox="0 0 1000 600" preserveAspectRatio="none"
        className="absolute inset-0 h-full w-full" aria-label="板书连线">
        {board.edges.map((edge) => {
          const from = byId.get(edge.from);
          const to = byId.get(edge.to);
          return from && to ? <path key={edge.id} d={edgePath(from, to, edge)}
            fill="none" stroke="transparent" strokeWidth="16"
            className="cursor-pointer" role="button" aria-label={`编辑连线 ${edge.id}`}
            onClick={() => onSelectEdge?.(edge.id)} /> : null;
        })}
      </svg>}
      {positioned.map(({ node, x, y, distance }) => {
        const root = node.id === board.rootNodeId;
        const selected = node.id === selectedNodeId;
        return <button key={node.id} type="button" data-board-node-id={node.id}
          aria-label={`导图节点 ${node.label}`}
          onClick={() => onSelectNode?.(node.id)}
          onPointerDown={(event) => handleDown(event, node)}
          onPointerMove={handleMove}
          onPointerUp={handleUp}
          onPointerCancel={() => { dragRef.current = null; }}
          className={cn("absolute z-10 max-w-[19%] min-w-16 touch-none select-none rounded-lg border px-3 py-2 text-center leading-snug shadow-sm transition-colors",
            root && board.kind === "structure"
              ? "border-amber-400 bg-amber-50 font-bold text-ink-900"
              : selected ? "border-amber-500 bg-amber-50 font-semibold text-ink-900"
                : board.kind === "structure" ? "border-[#e7e9e5] bg-[#f3f3ef] text-[#9da49f]"
                  : "border-ink-200 bg-white text-ink-700",
            !readonly && node.id !== board.rootNodeId && "cursor-grab active:cursor-grabbing",
          )}
          style={{ left: `${x}%`, top: `${y}%`, transform: "translate(-50%, -50%)",
            fontSize: root && board.kind === "structure" ? 26 : board.kind === "master"
              ? Math.max(10, 17 - distance * 3) : 17 }}
        >{node.label}</button>;
      })}
    </div>
  );
}
