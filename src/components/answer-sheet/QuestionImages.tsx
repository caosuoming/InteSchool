import { useEffect, useMemo, useRef, type FocusEvent, type PointerEvent } from "react";
import "katex/dist/katex.min.css";
import { renderMathHtml } from "@/lib/math-html";
import { answerSheetImageWrap, type AnswerSheetInlineBlankLayout, type AnswerSheetInlineImageLayout } from "@/lib/answer-sheet";

interface QuestionImagesProps {
  markup: string;
  className?: string;
  editable: boolean;
  number: number | string;
  part: string;
  layouts?: AnswerSheetInlineImageLayout[];
  blankLayouts?: AnswerSheetInlineBlankLayout[];
  onLayoutChange: (index: number, layout: AnswerSheetInlineImageLayout) => void;
  onBlankLayoutChange?: (index: number, layout: AnswerSheetInlineBlankLayout) => void;
}

function buildImageMarkup(
  markup: string, editable: boolean, number: number | string, part: string,
  layouts: AnswerSheetInlineImageLayout[] = [], blankLayouts: AnswerSheetInlineBlankLayout[] = [],
) {
  const template = document.createElement("template");
  template.innerHTML = renderMathHtml(markup);
  template.content.querySelectorAll<HTMLElement>(".answer-sheet-inline-blank").forEach((blank, index) => {
    const layout = blankLayouts[index];
    blank.dataset.answerSheetInlineBlank = String(index);
    blank.dataset.answerSheetEditable = editable ? "true" : "false";
    blank.title = editable ? "拖动书写框调整位置，拖动右下角调整大小" : "";
    blank.style.resize = editable ? "both" : "none";
    blank.style.transform = `translate(${layout?.x || 0}px, ${layout?.y || 0}px)`;
    if (layout?.width) blank.style.width = `${layout.width}px`;
    if (layout?.height) blank.style.height = `${layout.height}px`;
  });
  const partLabel = part === "stem" ? "题干" : `选项${String.fromCharCode(65 + Number(part.split("-")[1]))}`;
  Array.from(template.content.querySelectorAll("img")).forEach((image, index) => {
    const layout = layouts[index];
    const wrapper = document.createElement("span");
    wrapper.className = "answer-sheet-inline-image";
    wrapper.dataset.imageIndex = String(index);
    wrapper.dataset.wrap = answerSheetImageWrap(layout?.wrap);
    wrapper.style.transform = `translate(${layout?.x || 0}px, ${layout?.y || 0}px)`;

    image.classList.add("answer-sheet-floating-image");
    image.draggable = false;
    image.title = editable ? "拖动图片调整位置" : "";
    image.parentNode?.insertBefore(wrapper, image);
    wrapper.appendChild(image);

    if (editable) {
      const input = document.createElement("input");
      input.dataset.imageCaption = "";
      input.setAttribute("aria-label", `第${number}题${partLabel}第${index + 1}张图片备注`);
      input.placeholder = "图片备注";
      input.value = layout?.caption || "";
      input.className = "answer-sheet-image-caption-input no-print";
      wrapper.appendChild(input);
    }
    if (layout?.caption) {
      const caption = document.createElement("span");
      caption.className = `answer-sheet-image-caption ${editable ? "answer-sheet-image-caption-print" : ""}`;
      caption.textContent = layout.caption;
      wrapper.appendChild(caption);
    }
  });
  return template.innerHTML;
}

type Drag = {
  pointerId: number;
  element: HTMLElement;
  index: number;
  kind: "image" | "blank";
  x: number;
  y: number;
  startX: number;
  startY: number;
};

function clampToPaper(drag: Drag, x: number, y: number) {
  const paper = drag.element.closest<HTMLElement>(".answer-sheet-paper");
  if (!paper) return { x, y };
  const bounds = paper.getBoundingClientRect();
  const rect = drag.element.getBoundingClientRect();
  if (!bounds.width || !bounds.height || !rect.width || !rect.height) return { x, y };
  const baseLeft = rect.left - Number(drag.element.dataset.dragX ?? drag.x);
  const baseTop = rect.top - Number(drag.element.dataset.dragY ?? drag.y);
  return {
    x: Math.max(bounds.left - baseLeft, Math.min(x, bounds.right - rect.width - baseLeft)),
    y: Math.max(bounds.top - baseTop, Math.min(y, bounds.bottom - rect.height - baseTop)),
  };
}

export function QuestionImages({ markup, className, editable, number, part, layouts, blankLayouts, onLayoutChange, onBlankLayoutChange }: QuestionImagesProps) {
  const html = useMemo(
    () => buildImageMarkup(markup, editable, number, part, layouts, blankLayouts),
    [markup, editable, number, part, layouts, blankLayouts],
  );
  const rootRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<Drag | null>(null);
  const resizeRef = useRef<{ element: HTMLElement; index: number } | null>(null);
  const readImage = (index: number): AnswerSheetInlineImageLayout => ({
    wrap: answerSheetImageWrap(layouts?.[index]?.wrap),
    x: layouts?.[index]?.x || 0,
    y: layouts?.[index]?.y || 0,
    caption: layouts?.[index]?.caption || "",
  });
  const readBlank = (index: number): AnswerSheetInlineBlankLayout => ({
    x: blankLayouts?.[index]?.x || 0,
    y: blankLayouts?.[index]?.y || 0,
    width: blankLayouts?.[index]?.width,
    height: blankLayouts?.[index]?.height,
  });

  const finishResize = () => {
    const resize = resizeRef.current;
    if (!resize || !editable || !onBlankLayoutChange) return;
    resizeRef.current = null;
    const rect = resize.element.getBoundingClientRect();
    const width = Math.round(rect.width);
    const height = Math.round(rect.height);
    if (width > 0 && height > 0) {
      onBlankLayoutChange(resize.index, { ...readBlank(resize.index), width, height });
    }
  };

  useEffect(() => {
    if (!editable) return undefined;
    window.addEventListener("pointerup", finishResize);
    window.addEventListener("pointercancel", finishResize);
    return () => {
      window.removeEventListener("pointerup", finishResize);
      window.removeEventListener("pointercancel", finishResize);
    };
  });

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!editable || event.button !== 0 || !(event.target instanceof Element)) return;
    const image = event.target instanceof HTMLImageElement ? event.target.closest<HTMLElement>("[data-image-index]") : null;
    const blank = event.target.closest<HTMLElement>("[data-answer-sheet-inline-blank]");
    const element = image || blank;
    if (!element || !rootRef.current?.contains(element)) return;
    const kind = image ? "image" : "blank";
    const index = Number(kind === "image" ? element.dataset.imageIndex : element.dataset.answerSheetInlineBlank);
    const rect = element.getBoundingClientRect();
    if (kind === "blank" && event.clientX >= rect.right - 18 && event.clientY >= rect.bottom - 18) {
      resizeRef.current = { element, index };
      return;
    }
    const layout = kind === "image" ? readImage(index) : readBlank(index);
    dragRef.current = { pointerId: event.pointerId, element, index, kind, x: layout.x, y: layout.y, startX: event.clientX, startY: event.clientY };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || event.pointerId !== drag.pointerId) return;
    const position = clampToPaper(drag, drag.x + event.clientX - drag.startX, drag.y + event.clientY - drag.startY);
    drag.element.style.transform = `translate(${position.x}px, ${position.y}px)`;
    drag.element.dataset.dragX = String(position.x);
    drag.element.dataset.dragY = String(position.y);
  };

  const finishDrag = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || event.pointerId !== drag.pointerId) return;
    dragRef.current = null;
    const position = event.type === "pointerup"
      ? clampToPaper(drag, drag.x + event.clientX - drag.startX, drag.y + event.clientY - drag.startY)
      : { x: drag.x, y: drag.y };
    if (event.type === "pointerup") {
      if (drag.kind === "image") onLayoutChange(drag.index, { ...readImage(drag.index), ...position });
      else onBlankLayoutChange?.(drag.index, { ...readBlank(drag.index), ...position });
    }
    drag.element.style.transform = `translate(${position.x}px, ${position.y}px)`;
    delete drag.element.dataset.dragX;
    delete drag.element.dataset.dragY;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const handleBlur = (event: FocusEvent<HTMLDivElement>) => {
    if (!editable || !(event.target instanceof HTMLInputElement) || !event.target.matches("[data-image-caption]")) return;
    const wrapper = event.target.closest<HTMLElement>("[data-image-index]");
    if (!wrapper || !rootRef.current?.contains(wrapper)) return;
    const index = Number(wrapper.dataset.imageIndex);
    const caption = event.target.value.trim();
    if (caption !== (layouts?.[index]?.caption || "")) onLayoutChange(index, { ...readImage(index), caption });
  };

  return (
    <div
      ref={rootRef}
      className={`question-rich-content break-words [&_img]:rounded-md [&_img]:border-0 ${className || ""}`}
      dangerouslySetInnerHTML={{ __html: html }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishDrag}
      onPointerCancel={finishDrag}
      onBlur={handleBlur}
    />
  );
}
