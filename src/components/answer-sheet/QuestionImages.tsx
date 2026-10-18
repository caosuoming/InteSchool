import { useMemo, useRef, type ChangeEvent, type FormEvent, type FocusEvent, type PointerEvent } from "react";
import "katex/dist/katex.min.css";
import { renderMathHtml } from "@/lib/math-html";
import type { AnswerSheetInlineImageLayout } from "@/lib/answer-sheet";

interface QuestionImagesProps {
  markup: string;
  className?: string;
  editable: boolean;
  number: number | string;
  part: string;
  layouts?: AnswerSheetInlineImageLayout[];
  onLayoutChange: (index: number, layout: AnswerSheetInlineImageLayout) => void;
}

function buildImageMarkup(markup: string, editable: boolean, number: number | string, part: string, layouts: AnswerSheetInlineImageLayout[] = []) {
  const template = document.createElement("template");
  template.innerHTML = renderMathHtml(markup);
  template.content.querySelectorAll<HTMLElement>(".answer-sheet-inline-blank").forEach((blank, index) => {
    blank.dataset.answerSheetInlineBlank = String(index);
    blank.dataset.answerSheetEditable = editable ? "true" : "false";
    blank.title = editable ? "拖动右下角可调整填空区域的长度和高度" : "";
    blank.style.resize = editable ? "both" : "none";
  });
  const partLabel = part === "stem" ? "题干" : `选项${String.fromCharCode(65 + Number(part.split("-")[1]))}`;
  Array.from(template.content.querySelectorAll("img")).forEach((image, index) => {
    const layout = layouts[index];
    const wrapper = document.createElement("span");
    wrapper.className = "answer-sheet-inline-image";
    wrapper.dataset.imageIndex = String(index);
    wrapper.dataset.wrap = layout?.wrap || "left";
    wrapper.style.left = `${layout?.x || 0}px`;
    wrapper.style.top = `${layout?.y || 0}px`;

    image.classList.add("answer-sheet-floating-image");
    image.draggable = false;
    image.title = editable ? "拖动图片调整位置" : "";
    image.parentNode?.insertBefore(wrapper, image);
    wrapper.appendChild(image);

    if (editable) {
      const controls = document.createElement("span");
      controls.className = "answer-sheet-image-controls no-print";
      const select = document.createElement("select");
      select.dataset.imageWrap = "";
      select.setAttribute("aria-label", `第${number}题${partLabel}第${index + 1}张图片环绕模式`);
      for (const [value, label] of [["left", "左侧环绕"], ["right", "右侧环绕"], ["none", "不环绕"]]) {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = label;
        select.appendChild(option);
      }
      select.value = wrapper.dataset.wrap;
      controls.appendChild(select);
      wrapper.appendChild(controls);

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

export function QuestionImages({ markup, className, editable, number, part, layouts, onLayoutChange }: QuestionImagesProps) {
  const html = useMemo(() => buildImageMarkup(markup, editable, number, part, layouts), [markup, editable, number, part, layouts]);
  const rootRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    pointerId: number;
    wrapper: HTMLElement;
    index: number;
    x: number;
    y: number;
    startX: number;
    startY: number;
  } | null>(null);

  const readLayout = (index: number): AnswerSheetInlineImageLayout => ({
    wrap: layouts?.[index]?.wrap || "left",
    x: layouts?.[index]?.x || 0,
    y: layouts?.[index]?.y || 0,
    caption: layouts?.[index]?.caption || "",
  });

  const imageTarget = (target: EventTarget): { wrapper: HTMLElement; index: number } | null => {
    if (!(target instanceof Element)) return null;
    const wrapper = target.closest<HTMLElement>("[data-image-index]");
    if (!wrapper || !rootRef.current?.contains(wrapper)) return null;
    return { wrapper, index: Number(wrapper.dataset.imageIndex) };
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!editable || event.button !== 0 || !(event.target instanceof HTMLImageElement)) return;
    const target = imageTarget(event.target);
    if (!target) return;
    const layout = readLayout(target.index);
    dragRef.current = {
      pointerId: event.pointerId,
      ...target,
      x: layout.x,
      y: layout.y,
      startX: event.clientX,
      startY: event.clientY,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || event.pointerId !== drag.pointerId) return;
    const x = Math.round(drag.x + event.clientX - drag.startX);
    const y = Math.round(drag.y + event.clientY - drag.startY);
    drag.wrapper.style.left = `${x}px`;
    drag.wrapper.style.top = `${y}px`;
  };

  const finishDrag = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || event.pointerId !== drag.pointerId) return;
    dragRef.current = null;
    if (event.type === "pointerup") {
      onLayoutChange(drag.index, {
        ...readLayout(drag.index),
        x: Math.round(drag.x + event.clientX - drag.startX),
        y: Math.round(drag.y + event.clientY - drag.startY),
      });
    } else {
      drag.wrapper.style.left = `${drag.x}px`;
      drag.wrapper.style.top = `${drag.y}px`;
    }
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handleChange = (event: ChangeEvent<HTMLDivElement> | FormEvent<HTMLDivElement>) => {
    if (!editable || !(event.target instanceof HTMLSelectElement) || !event.target.matches("[data-image-wrap]")) return;
    const target = imageTarget(event.target);
    if (!target) return;
    onLayoutChange(target.index, { ...readLayout(target.index), wrap: event.target.value as AnswerSheetInlineImageLayout["wrap"] });
  };

  const handleBlur = (event: FocusEvent<HTMLDivElement>) => {
    if (!editable || !(event.target instanceof HTMLInputElement) || !event.target.matches("[data-image-caption]")) return;
    const target = imageTarget(event.target);
    if (!target) return;
    const caption = event.target.value.trim();
    if (caption !== (layouts?.[target.index]?.caption || "")) {
      onLayoutChange(target.index, { ...readLayout(target.index), caption });
    }
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
      onInput={handleChange}
      onChange={handleChange}
      onBlur={handleBlur}
    />
  );
}
