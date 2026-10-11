import { useMemo, useRef, useState, type PointerEvent } from "react";
import type { AnswerSheetImageLayout } from "@/lib/answer-sheet";
import { renderMathHtml } from "@/lib/math-html";

interface EssayImage {
  src: string;
  alt: string;
  width: number;
}

function parseEssayImages(markup: string): EssayImage[] {
  const template = document.createElement("template");
  template.innerHTML = renderMathHtml(markup);
  return Array.from(template.content.querySelectorAll("img")).map((image) => ({
    src: image.getAttribute("src") || "",
    alt: image.alt,
    width: Number(image.getAttribute("width")) || 120,
  })).filter((image) => image.src);
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(value, max));
}

function MovableEssayImage({
  image,
  number,
  index,
  editable,
  initialLayout,
  onCommit,
}: {
  image: EssayImage;
  number: number;
  index: number;
  editable: boolean;
  initialLayout?: AnswerSheetImageLayout;
  onCommit: (layout: AnswerSheetImageLayout) => void;
}) {
  const defaultLayout = {
    x: 8,
    y: 10 + index * 25,
    width: clamp(image.width, 40, 180),
  };
  const [layout, setLayout] = useState<AnswerSheetImageLayout>(initialLayout || defaultLayout);
  const currentLayout = useRef(layout);
  const gesture = useRef<{
    pointerId: number;
    x: number;
    y: number;
    layout: AnswerSheetImageLayout;
    resizing: boolean;
  } | null>(null);

  const updateLayout = (next: AnswerSheetImageLayout) => {
    currentLayout.current = next;
    setLayout(next);
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!editable || event.button !== 0) return;
    const resizing = (event.target as Element).closest("[data-essay-image-resize]") !== null;
    gesture.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      layout: currentLayout.current,
      resizing,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const start = gesture.current;
    if (!start || event.pointerId !== start.pointerId) return;
    const box = event.currentTarget.closest<HTMLElement>(".answer-sheet-answer-box");
    if (!box) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    const maxWidth = Math.max(40, box.clientWidth - start.layout.x - 2);

    if (start.resizing) {
      const image = event.currentTarget.querySelector("img");
      const ratio = image?.naturalWidth && image.naturalHeight
        ? image.naturalHeight / image.naturalWidth
        : 1;
      const maxHeightWidth = Math.max(40, (box.clientHeight - start.layout.y - 2) / ratio);
      updateLayout({
        ...start.layout,
        width: clamp(start.layout.width + dx, 40, Math.min(maxWidth, maxHeightWidth)),
      });
    } else {
      updateLayout({
        ...start.layout,
        x: clamp(start.layout.x + dx, 0, Math.max(0, box.clientWidth - start.layout.width - 2)),
        y: clamp(start.layout.y + dy, 0, Math.max(0, box.clientHeight - event.currentTarget.offsetHeight - 2)),
      });
    }
  };

  const finishGesture = (event: PointerEvent<HTMLDivElement>) => {
    if (gesture.current?.pointerId !== event.pointerId) return;
    gesture.current = null;
    onCommit(currentLayout.current);
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  return (
    <div
      className="answer-sheet-essay-image"
      style={{
        left: layout.x,
        top: layout.y,
        width: layout.width,
        cursor: editable ? "grab" : "default",
        touchAction: editable ? "none" : "auto",
      }}
      data-testid="essay-image"
      data-answer-sheet-editable={editable}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishGesture}
      onPointerCancel={finishGesture}
    >
      <img src={image.src} alt={image.alt} draggable={false} />
      {editable && (
        <button
          type="button"
          className="answer-sheet-image-resize no-print"
          data-essay-image-resize
          aria-label={`调整第${number}题第${index + 1}张图片大小`}
          title="拖动缩放图片"
        />
      )}
    </div>
  );
}

export function EssayImages({
  markup,
  number,
  editable,
  layouts,
  onLayoutChange,
}: {
  markup: string;
  number: number;
  editable: boolean;
  layouts?: AnswerSheetImageLayout[];
  onLayoutChange: (index: number, layout: AnswerSheetImageLayout) => void;
}) {
  const images = useMemo(() => parseEssayImages(markup), [markup]);
  return (
    <>
      {images.map((image, index) => (
        <MovableEssayImage
          key={index}
          image={image}
          number={number}
          index={index}
          editable={editable}
          initialLayout={layouts?.[index]}
          onCommit={(layout) => onLayoutChange(index, layout)}
        />
      ))}
    </>
  );
}
