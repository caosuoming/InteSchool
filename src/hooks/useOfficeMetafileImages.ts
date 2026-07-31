import { useLayoutEffect, type RefObject } from "react";
import {
  parseOfficeMetafileDisplaySize,
  type OfficeMetafileDisplaySize,
  type OfficeMetafileFormat,
} from "@/lib/office-metafile";

const MAX_RENDER_WIDTH = 2_400;
const MAX_RENDER_HEIGHT = 1_600;
const MIN_RENDER_DIMENSION = 64;
const RENDER_SCALE = 2;

export const officeMetafilePreviewClassName =
  "[&_.office-metafile-fallback]:my-1 [&_.office-metafile-fallback]:inline-flex [&_.office-metafile-fallback]:rounded-md [&_.office-metafile-fallback]:border [&_.office-metafile-fallback]:border-amber-200 [&_.office-metafile-fallback]:bg-amber-50 [&_.office-metafile-fallback]:px-2 [&_.office-metafile-fallback]:py-1 [&_.office-metafile-fallback]:text-xs [&_.office-metafile-fallback]:text-amber-800";

function readDisplaySize(image: HTMLImageElement): OfficeMetafileDisplaySize | null {
  return parseOfficeMetafileDisplaySize(
    image.dataset.officeWidth,
    image.dataset.officeHeight,
  );
}

function applyDisplaySize(
  image: HTMLImageElement,
  displaySize: OfficeMetafileDisplaySize | null,
): void {
  image.style.maxWidth = "100%";
  image.style.objectFit = "contain";
  image.style.verticalAlign = "middle";
  if (displaySize) {
    image.style.width = `${displaySize.width}px`;
    image.style.height = "auto";
    image.style.aspectRatio = `${displaySize.width} / ${displaySize.height}`;
    image.style.maxHeight = "none";
    return;
  }
  image.style.width = "auto";
  image.style.height = "auto";
  image.style.maxHeight = "12rem";
}

function converterOptions(displaySize: OfficeMetafileDisplaySize | null): {
  maxWidth: number;
  maxHeight: number;
  dpiScale: number;
} {
  if (!displaySize) {
    return { maxWidth: 1_200, maxHeight: 800, dpiScale: RENDER_SCALE };
  }
  return {
    maxWidth: Math.min(
      MAX_RENDER_WIDTH,
      Math.max(
        MIN_RENDER_DIMENSION,
        Math.ceil(displaySize.width * RENDER_SCALE),
      ),
    ),
    maxHeight: Math.min(
      MAX_RENDER_HEIGHT,
      Math.max(
        MIN_RENDER_DIMENSION,
        Math.ceil(displaySize.height * RENDER_SCALE),
      ),
    ),
    dpiScale: RENDER_SCALE,
  };
}

function metafilePlaceholder(
  image: HTMLImageElement,
  message: string,
): HTMLSpanElement {
  const placeholder = document.createElement("span");
  placeholder.className = "office-metafile-fallback";
  placeholder.setAttribute("role", "img");
  placeholder.setAttribute("aria-label", image.alt || "公式预览不可用");
  placeholder.textContent = message;
  return placeholder;
}

async function convertMetafileImage(
  image: HTMLImageElement,
  format: OfficeMetafileFormat,
  signal: AbortSignal,
): Promise<void> {
  const displaySize = readDisplaySize(image);
  applyDisplaySize(image, displaySize);
  image.dataset.officeMetafileState = "loading";
  image.hidden = true;
  image.setAttribute("aria-busy", "true");

  try {
    const response = await fetch(image.currentSrc || image.src, {
      credentials: "same-origin",
      cache: "force-cache",
      signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const [{ convertEmfToDataUrl, convertWmfToDataUrl }, data] =
      await Promise.all([import("emf-converter"), response.arrayBuffer()]);
    if (signal.aborted || !image.isConnected) return;

    const options = converterOptions(displaySize);
    const dataUrl =
      format === "wmf"
        ? await convertWmfToDataUrl(data, options)
        : await convertEmfToDataUrl(data, options);
    if (signal.aborted || !image.isConnected) return;
    if (!dataUrl) throw new Error("浏览器无法渲染该图元文件");

    image.src = dataUrl;
    image.hidden = false;
    image.removeAttribute("aria-busy");
    image.removeAttribute("data-office-metafile");
    image.removeAttribute("data-office-metafile-state");
    image.removeAttribute("data-office-width");
    image.removeAttribute("data-office-height");
  } catch (error) {
    if (signal.aborted || !image.isConnected) return;
    const detail = error instanceof Error ? error.message : "未知错误";
    image.replaceWith(metafilePlaceholder(image, `公式预览不可用：${detail}`));
  }
}

function convertMetafilesIn(root: ParentNode, signal: AbortSignal): void {
  const images = root.querySelectorAll<HTMLImageElement>(
    "img[data-office-metafile]",
  );
  for (const image of images) {
    if (image.dataset.officeMetafileState) continue;
    const format = image.dataset.officeMetafile;
    if (format === "wmf" || format === "emf") {
      void convertMetafileImage(image, format, signal);
    }
  }
}

export function useOfficeMetafileImages(
  rootRef: RefObject<HTMLElement | null>,
): void {
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const controller = new AbortController();
    convertMetafilesIn(root, controller.signal);
    const observer = new MutationObserver(() =>
      convertMetafilesIn(root, controller.signal),
    );
    observer.observe(root, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      controller.abort();
    };
  }, [rootRef]);
}
