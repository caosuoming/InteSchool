import { useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Eye, Pin, Search, X } from "lucide-react";
import sanitizeHtml from "sanitize-html";
import type { BoardDocument, BoardNode, BoardPort } from "@/types";
import { focusBoardNodes, type PositionedNode } from "./board-layout";
import { canReparent, connectBoardPorts, edgeGeometry, portPoint, PORTS, type NodeBounds, type Point } from "./board-routing";
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

const portPositions: Record<BoardPort, { left: string; top: string }> = {
  "top-left": { left: "30%", top: "0%" },
  "top-right": { left: "70%", top: "0%" },
  "bottom-left": { left: "30%", top: "100%" },
  "bottom-right": { left: "70%", top: "100%" },
  left: { left: "0%", top: "50%" },
  right: { left: "100%", top: "50%" },
};

function htmlNotes(html?: string) {
  return sanitizeHtml(html || "", {
    allowedTags: ["b", "strong", "i", "em", "u", "s", "p", "div", "br", "span", "ul", "ol", "li", "code"],
    allowedAttributes: { span: ["style"] },
    allowedStyles: { span: { color: [/^#[0-9a-fA-F]{3,8}$/], "font-size": [/^(?:[1-9]|[1-4][0-9])px$/] } },
  });
}

export function BoardCanvas({
  board, selectedNodeId, selectedEdgeId, onSelectNode, onSelectEdge, onChange, readonly = false, className,
}: BoardCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ id: string; startX: number; startY: number; originalX: number; originalY: number; moved: boolean } | null>(null);
  const connectRef = useRef<{ id: string; port: BoardPort } | null>(null);
  const [preview, setPreview] = useState<{ start: Point; end: Point } | null>(null);
  const [measured, setMeasured] = useState<Record<string, NodeBounds>>({});
  const [query, setQuery] = useState("");
  const positioned = useMemo(() => board.kind === "master"
    ? focusBoardNodes(board, selectedNodeId || board.rootNodeId)
    : board.nodes.filter((node) => !node.hidden).map((node) => ({ node, x: node.id === board.rootNodeId ? 50 : node.x,
      y: node.id === board.rootNodeId ? 9 : node.y, distance: 0 })),
  [board, selectedNodeId]);
  const byId = new Map(positioned.map((entry) => [entry.node.id, entry]));

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const measure = () => {
      const root = container.getBoundingClientRect();
      if (!root.width || !root.height) return;
      const next: Record<string, NodeBounds> = {};
      container.querySelectorAll<HTMLElement>("[data-board-node-id]").forEach((element) => {
        const rect = element.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        next[element.dataset.boardNodeId || ""] = {
          cx: (rect.left + rect.width / 2 - root.left) / root.width * 1000,
          cy: (rect.top + rect.height / 2 - root.top) / root.height * 600,
          width: rect.width / root.width * 1000, height: rect.height / root.height * 600,
        };
      });
      setMeasured((prev) => JSON.stringify(prev) === JSON.stringify(next) ? prev : next);
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    container.querySelectorAll<HTMLElement>("[data-board-node-id]").forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [positioned]);

  const bounds = (entry: PositionedNode): NodeBounds => measured[entry.node.id] || {
    cx: entry.x * 10, cy: entry.y * 6,
    width: Math.min(190, Math.max(90, entry.node.label.length * 14 + 24)),
    height: entry.node.richText || entry.node.imageUrl ? 105 : 46,
  };
  const lines = board.edges.flatMap((edge) => {
    const from = byId.get(edge.from);
    const to = byId.get(edge.to);
    if (!from || !to) return [];
    return [{ edge, geometry: edgeGeometry(bounds(from), bounds(to), edge) }];
  });

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
    const x = Math.max(4, Math.min(96, drag.originalX + dx / rect.width * 100));
    const y = Math.max(5, Math.min(95, drag.originalY + dy / rect.height * 100));
    onChange({ ...board, nodes: board.nodes.map((node) => node.id === drag.id ? { ...node, x, y } : node) });
  };
  const handleUp = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag) return;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (board.kind !== "master" || !drag.moved || !onChange) return;
    const element = document.elementFromPoint?.(event.clientX, event.clientY);
    const targetId = element?.closest("[data-board-node-id]")?.getAttribute("data-board-node-id");
    if (!targetId || !canReparent(board.nodes, targetId, drag.id, board.rootNodeId)) return;
    const nodes = board.nodes.map((node) => node.id === drag.id ? { ...node, parentId: targetId } : node);
    const edges = [...board.edges.filter((edge) => edge.id !== `parent:${drag.id}`), {
      id: `parent:${drag.id}`, from: targetId, to: drag.id,
      style: "solid" as const, arrow: "forward" as const, route: "curve" as const,
    }];
    onChange({ ...board, nodes, edges });
  };
  const startConnection = (event: ReactPointerEvent<HTMLButtonElement>, id: string, port: BoardPort) => {
    if (readonly || !onChange) return;
    event.stopPropagation();
    event.preventDefault();
    const node = byId.get(id);
    if (!node) return;
    const start = portPoint(bounds(node), port);
    connectRef.current = { id, port };
    setPreview({ start, end: start });
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const moveConnection = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!connectRef.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    if (rect.width && rect.height) setPreview((prev) => prev ? ({ ...prev,
      end: { x: (event.clientX - rect.left) / rect.width * 1000,
        y: (event.clientY - rect.top) / rect.height * 600 } }) : prev);
  };
  const endConnection = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const source = connectRef.current;
    connectRef.current = null;
    setPreview(null);
    event.stopPropagation();
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (!source || !onChange) return;
    const element = document.elementFromPoint?.(event.clientX, event.clientY);
    const portButton = element?.closest<HTMLElement>("[data-board-port]");
    const toId = portButton?.dataset.boardNode;
    const toPort = portButton?.dataset.boardPort as BoardPort | undefined;
    if (!toId || !toPort || !PORTS.includes(toPort)) return;
    const next = connectBoardPorts(board, source.id, source.port, toId, toPort);
    if (next !== board) onChange(next);
  };
  const searchResults = query.trim() ? board.nodes.filter((node) =>
    `${node.label} ${sanitizeHtml(node.richText || "", { allowedTags: [], allowedAttributes: {} })}`
      .toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())).slice(0, 12) : [];
  const pinned = board.nodes.filter((node) => node.pinned);
  const hidden = board.nodes.filter((node) => node.hidden);
  const reveal = (id: string) => {
    if (board.nodes.find((node) => node.id === id)?.hidden && onChange) {
      onChange({ ...board, nodes: board.nodes.map((node) => node.id === id ? { ...node, hidden: false } : node) });
    }
    onSelectNode?.(id);
    setQuery("");
  };

  return (
    <div ref={containerRef} role="group" aria-label={board.title}
      className={cn("relative isolate h-full w-full overflow-hidden rounded-lg bg-[#fbfaf6]", className)}>
      <svg viewBox="0 0 1000 600" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true">
        <defs>
          <marker id={`board-arrow-end-${board.id}`} markerWidth="7" markerHeight="7" refX="7" refY="3.5" orient="auto" markerUnits="strokeWidth">
            <path d="M0 0 L7 3.5 L0 7" fill="none" stroke="#667085" strokeWidth="1.4" />
          </marker>
          <marker id={`board-arrow-start-${board.id}`} markerWidth="7" markerHeight="7" refX="0" refY="3.5" orient="auto-start-reverse" markerUnits="strokeWidth">
            <path d="M7 0 L0 3.5 L7 7" fill="none" stroke="#667085" strokeWidth="1.4" />
          </marker>
        </defs>
        {lines.map(({ edge, geometry }) => <g key={edge.id}>
          <path d={geometry.path} fill="none" stroke={edge.id === selectedEdgeId ? "#c28c26" : "#87909b"}
            strokeWidth={edge.style === "double" ? 4 : 1.9}
            strokeDasharray={edge.style === "dashed" ? "6 5" : undefined}
            markerStart={["reverse", "both"].includes(edge.arrow) ? `url(#board-arrow-start-${board.id})` : undefined}
            markerEnd={["forward", "both"].includes(edge.arrow) ? `url(#board-arrow-end-${board.id})` : undefined} />
          {edge.style === "double" && <path d={geometry.path} fill="none" stroke="#fbfaf6" strokeWidth={1.2} />}
        </g>)}
        {preview && <path d={`M${preview.start.x} ${preview.start.y} L${preview.end.x} ${preview.end.y}`}
          fill="none" stroke="#b88a35" strokeWidth="2" strokeDasharray="6 4" />}
      </svg>
      {!readonly && <svg viewBox="0 0 1000 600" preserveAspectRatio="none"
        className="absolute inset-0 h-full w-full" aria-label="板书连线">
        {lines.map(({ edge, geometry }) => <path key={edge.id} d={geometry.path}
          fill="none" stroke="transparent" strokeWidth="16" className="cursor-pointer"
          role="button" aria-label={`编辑连线 ${edge.id}`}
          onClick={() => onSelectEdge?.(edge.id)} />)}
      </svg>}
      {lines.filter(({ edge }) => edge.richText).map(({ edge, geometry }) => <div key={`text:${edge.id}`}
        className="absolute z-[5] max-w-[22%] -translate-x-1/2 -translate-y-1/2 rounded bg-white/90 px-1.5 py-0.5 text-center shadow-sm"
        style={{ left: `${geometry.midpoint.x / 10}%`, top: `${geometry.midpoint.y / 6}%`, fontSize: edge.fontSize || 13 }}
        onClick={() => !readonly && onSelectEdge?.(edge.id)}
        dangerouslySetInnerHTML={{ __html: htmlNotes(edge.richText) }} />)}
      {positioned.map(({ node, x, y, distance }) => {
        const root = node.id === board.rootNodeId;
        const selected = node.id === selectedNodeId;
        const fontSize = node.fontSize || (root && board.kind === "structure" ? 26 : board.kind === "master"
          ? Math.max(10, 17 - distance * 3) : 17);
        return <div key={node.id} data-board-node-id={node.id}
          className="pointer-events-none absolute z-10 w-max min-w-24 max-w-[19%]"
          style={{ left: `${x}%`, top: `${y}%`, transform: "translate(-50%, -50%)" }}>
          <button type="button" aria-label={`导图节点 ${node.label}`}
            onClick={() => onSelectNode?.(node.id)}
            onPointerDown={(event) => handleDown(event, node)} onPointerMove={handleMove} onPointerUp={handleUp}
            onPointerCancel={() => { dragRef.current = null; }}
            className={cn("pointer-events-auto w-full touch-none select-none rounded-lg border px-3 py-2 text-center leading-snug shadow-sm transition-colors",
              root && board.kind === "structure" ? "border-amber-400 bg-amber-50 font-bold text-ink-900"
                : selected ? "border-amber-500 bg-amber-50 font-semibold text-ink-900"
                  : "border-ink-200 bg-white text-ink-700",
              !readonly && node.id !== board.rootNodeId && "cursor-grab active:cursor-grabbing")}
            style={{ fontSize }}>
            <span className="block break-words">{node.label}</span>
            {node.pinned && <Pin size={12} aria-label="已固定" className="ml-auto text-amber-600" />}
            {node.imageUrl && <img src={node.imageUrl} alt={node.label} className="mt-1 max-h-24 w-full rounded object-contain" draggable={false} />}
            {node.richText && <span className="mt-1 block break-words text-left font-normal"
              dangerouslySetInnerHTML={{ __html: htmlNotes(node.richText) }} />}
          </button>
          {!readonly && onChange && PORTS.map((port) => <button type="button" key={port}
            data-board-node={node.id} data-board-port={port}
            aria-label={`连接点 ${node.label} ${port}`} title={`拖动连接：${port}`}
            onPointerDown={(event) => startConnection(event, node.id, port)}
            onPointerMove={moveConnection} onPointerUp={endConnection}
            onPointerCancel={() => { connectRef.current = null; setPreview(null); }}
            className="pointer-events-auto absolute z-20 h-3 w-3 -translate-x-1/2 -translate-y-1/2 touch-none rounded-full border-[1.5px] border-amber-600 bg-white hover:scale-125 hover:bg-amber-100"
            style={portPositions[port]} />)}
        </div>;
      })}
      {!readonly && <div className="absolute bottom-3 left-3 z-30 w-52 max-w-[42%]">
        <div className="flex items-center gap-1 rounded-md border border-ink-200 bg-white/95 px-2 shadow-sm">
          <Search size={14} className="text-ink-400" />
          <input aria-label="搜索导图节点" placeholder="搜索节点..." value={query} onChange={(event) => setQuery(event.target.value)}
            className="min-w-0 flex-1 bg-transparent py-2 text-xs outline-none" />
          {query && <button aria-label="清空搜索" onClick={() => setQuery("")}><X size={12} /></button>}
        </div>
        {query && <div className="mt-1 max-h-48 overflow-y-auto rounded-md border bg-white shadow-md">
          {searchResults.length ? searchResults.map((node) => <button key={node.id} onClick={() => reveal(node.id)}
            className="block w-full truncate px-2 py-1.5 text-left text-xs hover:bg-amber-50">
            {node.label}{node.hidden ? "（已隐藏）" : ""}
          </button>) : <p className="p-2 text-xs text-ink-400">无匹配节点</p>}
        </div>}
      </div>}
      {(pinned.length > 0 || hidden.length > 0) && <div className="absolute bottom-3 right-3 z-30 max-h-44 w-40 max-w-[35%] overflow-y-auto rounded-lg border border-ink-200 bg-white/95 p-2 text-xs shadow-sm">
        {pinned.length > 0 && <div><div className="mb-1 flex items-center gap-1 font-medium text-ink-600"><Pin size={12} />图钉节点</div>
          {pinned.map((node) => <button type="button" key={node.id} onClick={() => reveal(node.id)}
            className="block w-full truncate rounded px-1 py-1 text-left hover:bg-amber-50">{node.label}</button>)}</div>}
        {hidden.length > 0 && !readonly && <div className={pinned.length ? "mt-2 border-t pt-2" : ""}>
          <div className="mb-1 flex items-center gap-1 font-medium text-ink-600"><Eye size={12} />隐藏节点</div>
          {hidden.map((node) => <button type="button" key={node.id} onClick={() => reveal(node.id)}
            className="block w-full truncate rounded px-1 py-1 text-left hover:bg-amber-50">{node.label} · 显示</button>)}
        </div>}
      </div>}
    </div>
  );
}
