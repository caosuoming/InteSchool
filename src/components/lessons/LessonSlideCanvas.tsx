import { useRef, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { Maximize2 } from "lucide-react";
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
  if (editable || !element.animation || element.animation === "none") return undefined;
  const animation = {
    fade: "lessonElementFade 420ms ease-out both",
    rise: "lessonElementRise 460ms cubic-bezier(0.16, 1, 0.3, 1) both",
    zoom: "lessonElementZoom 380ms ease-out both",
  }[element.animation];
  return animation ? { animation } : undefined;
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
      <div className="absolute inset-0 overflow-hidden">{children}</div>
      {elements.map((element) => {
        const selected = editable && selectedElementId === element.id;
        return (
          <div
            key={element.id}
            className={cn(
              "absolute touch-none select-none",
              editable && "cursor-move",
              selected && "ring-2 ring-gold-400 ring-offset-1",
            )}
            style={{
              left: `${element.x}%`,
              top: `${element.y}%`,
              width: `${element.width}%`,
              height: `${element.height}%`,
              ...animationStyle(element, editable),
            }}
            onPointerDown={(event) => startInteraction(event, element, "move")}
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
              <div
                className="h-full w-full overflow-hidden whitespace-pre-wrap rounded-md bg-white/85 px-2 py-1 text-ink-900"
                style={{
                  fontSize: `${element.fontSize || 24}px`,
                  textAlign: element.textAlign || "left",
                }}
              >
                <MathHtml className="leading-snug">{element.content || "文本"}</MathHtml>
              </div>
            )}
            {selected && (
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
            )}
          </div>
        );
      })}
    </div>
  );
}

export default LessonSlideCanvas;
