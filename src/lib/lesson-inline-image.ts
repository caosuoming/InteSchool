import type { LessonSlideImageElement } from "@/types";
import { serializeMathHtml } from "@/lib/math-html";

const MIN_SIZE = 6;

function clamp(value: number, min: number, max: number): number {
  return Math.round(Math.min(max, Math.max(min, value)) * 1000) / 1000;
}

export function detachLessonInlineImage(
  image: HTMLImageElement,
  contentRoot: HTMLElement,
  canvas: HTMLElement,
  id: string,
): { content: string; element: LessonSlideImageElement } | null {
  const src = image.getAttribute("src")?.trim();
  const imageIndex = Array.from(contentRoot.querySelectorAll("img")).indexOf(image);
  if (!src || imageIndex < 0 || !/^(?:https?:\/\/|data:image\/[a-z0-9.+-]+;base64,|\/)/i.test(src)) return null;

  const copied = contentRoot.cloneNode(true) as HTMLElement;
  const copiedImage = copied.querySelectorAll("img")[imageIndex];
  let parent = copiedImage.parentElement;
  copiedImage.remove();
  while (parent && parent !== copied
    && /^(P|DIV|SPAN|A)$/.test(parent.tagName)
    && !parent.textContent?.trim() && !parent.children.length) {
    const next = parent.parentElement;
    parent.remove();
    parent = next;
  }

  const canvasRect = canvas.getBoundingClientRect();
  const imageRect = image.getBoundingClientRect();
  const hasBounds = canvasRect.width > 0 && canvasRect.height > 0;
  const x = hasBounds ? clamp((imageRect.left - canvasRect.left) / canvasRect.width * 100, 0, 94) : 12;
  const y = hasBounds ? clamp((imageRect.top - canvasRect.top) / canvasRect.height * 100, 0, 94) : 8;
  const width = clamp(hasBounds && imageRect.width > 0 ? imageRect.width / canvasRect.width * 100 : 32, MIN_SIZE, 100 - x);
  const height = clamp(hasBounds && imageRect.height > 0 ? imageRect.height / canvasRect.height * 100 : 24, MIN_SIZE, 100 - y);

  return {
    content: serializeMathHtml(copied.innerHTML),
    element: {
      id,
      kind: "image",
      src,
      alt: image.getAttribute("alt") || "课件图片",
      x,
      y,
      width,
      height,
      animation: "none",
      enterAnimation: "none",
      actionAnimation: "none",
      exitAnimation: "none",
    },
  };
}
