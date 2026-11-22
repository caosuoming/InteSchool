import { useEffect, useState, type PointerEvent } from "react";
import { createPortal } from "react-dom";
import { Eraser, MousePointer2, Pencil, Undo2, X } from "lucide-react";

type Point = { x: number; y: number };
type Stroke = { points: Point[]; color: string };

/** A temporary classroom ink layer. The embedded paper stays scrollable in browse mode. */
export function HomeworkPaperAnnotation({ title, url, onClose }: {
  title: string;
  url: string;
  onClose: () => void;
}) {
  const [drawing, setDrawing] = useState(false);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [color, setColor] = useState("#ef4444");

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const keydown = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", keydown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", keydown);
    };
  }, [onClose]);

  const position = (event: PointerEvent<SVGSVGElement>): Point => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1000, (event.clientX - bounds.left) * 1000 / Math.max(1, bounds.width))),
      y: Math.max(0, Math.min(1000, (event.clientY - bounds.top) * 1000 / Math.max(1, bounds.height))),
    };
  };

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={`课堂试卷批注：${title}`}
      className="fixed inset-0 z-[110] flex flex-col bg-neutral-950 p-2 text-white sm:p-4">
      <header className="mb-2 flex flex-wrap items-center gap-2 rounded-lg bg-neutral-800 px-3 py-2">
        <strong className="mr-auto truncate text-sm">{title}</strong>
        <button type="button" onClick={() => setDrawing(false)} aria-label="浏览试卷"
          aria-pressed={!drawing} className={`rounded px-2 py-1.5 text-xs ${!drawing ? "bg-amber-400 text-black" : "bg-neutral-700"}`}>
          <MousePointer2 className="mr-1 inline h-4 w-4" />浏览
        </button>
        <button type="button" onClick={() => setDrawing(true)} aria-label="批注试卷"
          aria-pressed={drawing} className={`rounded px-2 py-1.5 text-xs ${drawing ? "bg-amber-400 text-black" : "bg-neutral-700"}`}>
          <Pencil className="mr-1 inline h-4 w-4" />批注
        </button>
        <input type="color" aria-label="批注笔颜色" value={color} onChange={(event) => setColor(event.target.value)}
          className="h-8 w-8 cursor-pointer" />
        <button type="button" aria-label="撤销批注" disabled={!strokes.length}
          onClick={() => setStrokes((current) => current.slice(0, -1))}
          className="rounded bg-neutral-700 p-2 disabled:opacity-30"><Undo2 className="h-4 w-4" /></button>
        <button type="button" aria-label="清空试卷批注" disabled={!strokes.length}
          onClick={() => setStrokes([])} className="rounded bg-neutral-700 p-2 disabled:opacity-30">
          <Eraser className="h-4 w-4" /></button>
        <button type="button" aria-label="关闭试卷批注" onClick={onClose} className="rounded bg-neutral-700 p-2">
          <X className="h-4 w-4" />
        </button>
      </header>
      <div className="relative min-h-0 flex-1 overflow-hidden rounded-lg bg-white">
        <iframe src={url} title={`试卷：${title}`} className="absolute inset-0 h-full w-full border-0" />
        <svg aria-label="试卷批注画布" viewBox="0 0 1000 1000" preserveAspectRatio="none"
          className={`absolute inset-0 h-full w-full touch-none ${drawing ? "cursor-crosshair pointer-events-auto" : "pointer-events-none"}`}
          onPointerDown={(event) => {
            if (!drawing || (event.button !== undefined && event.button !== 0)) return;
            event.currentTarget.setPointerCapture?.(event.pointerId);
            const start = position(event);
            setStrokes((current) => [...current, { points: [start], color }]);
          }}
          onPointerMove={(event) => {
            if (!drawing || !(event.buttons & 1)) return;
            const next = position(event);
            setStrokes((current) => current.map((stroke, index) => index === current.length - 1
              ? { ...stroke, points: [...stroke.points, next] } : stroke));
          }}
          onPointerUp={(event) => {
            if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
              event.currentTarget.releasePointerCapture(event.pointerId);
            }
          }}>
          {strokes.map((stroke, index) => stroke.points.length === 1 ? (
            <circle key={index} cx={stroke.points[0].x} cy={stroke.points[0].y} r="2"
              fill={stroke.color} />
          ) : (
            <polyline key={index} points={stroke.points.map((point) => `${point.x},${point.y}`).join(" ")}
              fill="none" stroke={stroke.color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          ))}
        </svg>
      </div>
      <p className="mt-2 text-center text-[11px] text-neutral-400">在浏览模式滚动文档，切换批注模式在当前可视区域书写。批注仅在本次预览中保留。</p>
    </div>, document.body,
  );
}
