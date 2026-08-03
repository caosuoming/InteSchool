import {
  useEffect,
  useRef,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { GripVertical, Maximize2 } from "lucide-react";
import type { LessonSlideElement } from "@/types";
import { cn } from "@/lib/utils";
import { MathHtml } from "@/components/ui/MathHtml";

interface LessonSlideCanvasProps {
  elements?: LessonSlideElement[];
  children: ReactNode;
  editable?: boolean;
  selectedElementId?: string | null;
  onSelectElement?: (id: string | null) => void;
  onElementsChange?: (elements: LessonSlideElement[]) => void;
  className?: string;
}

type Interaction = {
  mode: "move" | "resize";
  elementId: string;
  startX: number;
  startY: number;
  element: LessonSlideElement;
};

const MIN_SIZE = 6;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function animationStyle(element: LessonSlideElement, editable: boolean): CSSProperties | undefined {
  const enterAnimation = element.enterAnimation || element.animation;
  if (editable || !enterAnimation || enterAnimation === "none") return undefined;
  const animation = {
    fade: "lessonElementFade 420ms ease-out both",
    rise: "lessonElementRise 460ms cubic-bezier(0.16, 1, 0.3, 1) both",
    zoom: "lessonElementZoom 380ms ease-out both",
  }[enterAnimation];
  return animation ? {
    animation,
    animationDelay: `${Math.max(0, (element.animationOrder || 1) - 1) * 160}ms`,
  } : undefined;
}

export function LessonSlideCanvas({
  elements = [],
  children,
  editable = false,
  selectedElementId,
  onSelectElement,
  onElementsChange,
  className,
}: LessonSlideCanvasProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const interactionRef = useRef<Interaction | null>(null);
  const textElementRefs = useRef(new Map<string, HTMLDivElement>());

  useEffect(() => {
    if (!editable || !selectedElementId) return;
    const element = elements.find((item) => item.id === selectedElementId);
    if (element?.kind !== "text" || element.content) return;
    const editor = textElementRefs.current.get(selectedElementId);
    editor?.focus();
  }, [editable, elements, selectedElementId]);

  const startInteraction = (
    event: ReactPointerEvent<HTMLDivElement>,
    element: LessonSlideElement,
    mode: Interaction["mode"],
  ) => {
    if (!editable) return;
    event.preventDefault();
    event.stopPropagation();
    onSelectElement?.(element.id);
    interactionRef.current = {
      mode,
      elementId: element.id,
      startX: event.clientX,
      startY: event.clientY,
      element,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveInteraction = (event: ReactPointerEvent<HTMLDivElement>) => {
    const interaction = interactionRef.current;
    const canvas = canvasRef.current;
    if (!editable || !interaction || !canvas || !onElementsChange) return;

    const rect = canvas.getBoundingClientRect();
    const dx = ((event.clientX - interaction.startX) / rect.width) * 100;
    const dy = ((event.clientY - interaction.startY) / rect.height) * 100;
    const next = elements.map((element) => {
      if (element.id !== interaction.elementId) return element;
      if (interaction.mode === "move") {
        return {
          ...element,
          x: clamp(interaction.element.x + dx, 0, 100 - interaction.element.width),
          y: clamp(interaction.element.y + dy, 0, 100 - interaction.element.height),
        };
      }
      return {
        ...element,
        width: clamp(interaction.element.width + dx, MIN_SIZE, 100 - interaction.element.x),
        height: clamp(interaction.element.height + dy, MIN_SIZE, 100 - interaction.element.y),
      };
    });
    onElementsChange(next);
  };

  const endInteraction = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (interactionRef.current) {
      event.currentTarget.releasePointerCapture(event.pointerId);
      interactionRef.current = null;
    }
  };

  return (
    <div
      ref={canvasRef}
      className={cn(
        "relative aspect-video w-full overflow-hidden rounded-lg bg-paper shadow-lg",
        className,
      )}
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onSelectElement?.(null);
      }}
    >
      <div
        className="absolute inset-0 overflow-hidden"
        onPointerDown={(event) => {
          if (event.target === event.currentTarget) onSelectElement?.(null);
        }}
      >
        {children}
      </div>
      {elements.map((element) => {
        const selected = editable && selectedElementId === element.id;
        const textStyle: CSSProperties = {
          fontSize: `${element.kind === "text" ? element.fontSize || 24 : 24}px`,
          textAlign: element.kind === "text" ? element.textAlign || "left" : "left",
        };
        return (
          <div
            key={element.id}
            className={cn(
              "absolute touch-none",
              element.kind === "text" ? "select-text" : "select-none",
              editable && element.kind === "image" && "cursor-move",
              selected && "ring-2 ring-gold-400 ring-offset-1",
            )}
            style={{
              left: `${element.x}%`,
              top: `${element.y}%`,
              width: `${element.width}%`,
              height: `${element.height}%`,
              ...animationStyle(element, editable),
            }}
            onPointerDown={element.kind === "image"
              ? (event) => startInteraction(event, element, "move")
              : undefined}
            onClick={(event) => {
              if (!editable || element.kind !== "text") return;
              event.stopPropagation();
              onSelectElement?.(element.id);
            }}
            onPointerMove={moveInteraction}
            onPointerUp={endInteraction}
            onPointerCancel={endInteraction}
          >
            {element.kind === "image" ? (
              <img
                src={element.src}
                alt={element.alt || "课件图片"}
                draggable={false}
                className="h-full w-full rounded-md object-contain"
              />
            ) : (
              editable ? (
                <div
                  ref={(node) => {
                    if (node) textElementRefs.current.set(element.id, node);
                    else textElementRefs.current.delete(element.id);
                  }}
                  contentEditable
                  suppressContentEditableWarning
                  data-placeholder="直接输入文字"
                  className={cn(
                    "h-full w-full overflow-hidden whitespace-pre-wrap rounded-md bg-white/85 px-2 py-1 text-ink-900 outline-none",
                    "empty:before:pointer-events-none empty:before:text-ink-300 empty:before:content-[attr(data-placeholder)]",
                    element.href && "text-gold-700 underline decoration-gold-300 underline-offset-4",
                  )}
                  style={textStyle}
                  dangerouslySetInnerHTML={{ __html: element.content }}
                  onClick={(event) => {
                    event.stopPropagation();
                    onSelectElement?.(element.id);
                  }}
                  onBlur={(event) => {
                    if (!onElementsChange) return;
                    const content = event.currentTarget.innerHTML === "<br>"
                      ? ""
                      : event.currentTarget.innerHTML;
                    onElementsChange(elements.map((item) => (
                      item.id === element.id && item.kind === "text"
                        ? { ...item, content }
                        : item
                    )));
                  }}
                />
              ) : element.href ? (
                <a
                  href={element.href}
                  target="_blank"
                  rel="noreferrer"
                  className="block h-full w-full overflow-hidden whitespace-pre-wrap rounded-md bg-white/85 px-2 py-1 text-gold-700 underline decoration-gold-300 underline-offset-4"
                  style={textStyle}
                >
                  <MathHtml className="leading-snug">{element.content || element.href}</MathHtml>
                </a>
              ) : (
                <div
                  className={cn(
                    "h-full w-full overflow-hidden whitespace-pre-wrap rounded-md bg-white/85 px-2 py-1 text-ink-900",
                    element.href && "text-gold-700 underline decoration-gold-300 underline-offset-4",
                  )}
                  style={textStyle}
                >
                  <MathHtml className="leading-snug">{element.content || "文本"}</MathHtml>
                </div>
              )
            )}
            {selected && (
              <>
                {element.kind === "text" && (
                  <div
                    className="absolute -left-2 -top-2 flex h-5 w-5 cursor-move items-center justify-center rounded bg-ink-800 text-paper shadow"
                    title="拖动移动文本"
                    onPointerDown={(event) => startInteraction(event, element, "move")}
                    onPointerMove={moveInteraction}
                    onPointerUp={endInteraction}
                    onPointerCancel={endInteraction}
                  >
                    <GripVertical className="h-3 w-3" />
                  </div>
                )}
                <div
                  className="absolute -bottom-2 -right-2 flex h-5 w-5 cursor-nwse-resize items-center justify-center rounded bg-gold-400 text-ink-900 shadow"
                  title="拖动调整大小"
                  onPointerDown={(event) => startInteraction(event, element, "resize")}
                  onPointerMove={moveInteraction}
                  onPointerUp={endInteraction}
                  onPointerCancel={endInteraction}
                >
                  <Maximize2 className="h-3 w-3" />
                </div>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default LessonSlideCanvas;
