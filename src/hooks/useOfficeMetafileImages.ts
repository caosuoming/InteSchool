import { useLayoutEffect, type RefObject } from "react";

type OfficeMetafileFormat = "wmf" | "emf";

export const officeMetafilePreviewClassName =
  "[&_.office-metafile-fallback]:my-1 [&_.office-metafile-fallback]:inline-flex [&_.office-metafile-fallback]:rounded-md [&_.office-metafile-fallback]:border [&_.office-metafile-fallback]:border-amber-200 [&_.office-metafile-fallback]:bg-amber-50 [&_.office-metafile-fallback]:px-2 [&_.office-metafile-fallback]:py-1 [&_.office-metafile-fallback]:text-xs [&_.office-metafile-fallback]:text-amber-800";

function metafilePlaceholder(image: HTMLImageElement, message: string): HTMLSpanElement {
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

    const [{ convertEmfToDataUrl, convertWmfToDataUrl }, data] = await Promise.all([
      import("emf-converter"),
      response.arrayBuffer(),
    ]);
    if (signal.aborted || !image.isConnected) return;

    const dataUrl = format === "wmf"
      ? await convertWmfToDataUrl(data, { maxWidth: 2400, maxHeight: 1600, dpiScale: 2 })
      : await convertEmfToDataUrl(data, { maxWidth: 2400, maxHeight: 1600, dpiScale: 2 });
    if (signal.aborted || !image.isConnected) return;
    if (!dataUrl) throw new Error("浏览器无法渲染该图元文件");

    image.src = dataUrl;
    image.hidden = false;
    image.removeAttribute("aria-busy");
    image.removeAttribute("data-office-metafile");
    image.removeAttribute("data-office-metafile-state");
  } catch (error) {
    if (signal.aborted || !image.isConnected) return;
    const detail = error instanceof Error ? error.message : "未知错误";
    image.replaceWith(metafilePlaceholder(image, `公式预览不可用：${detail}`));
  }
}

function convertMetafilesIn(root: ParentNode, signal: AbortSignal): void {
  const images = root.querySelectorAll<HTMLImageElement>("img[data-office-metafile]");
  for (const image of images) {
    if (image.dataset.officeMetafileState) continue;
    const format = image.dataset.officeMetafile;
    if (format === "wmf" || format === "emf") {
      void convertMetafileImage(image, format, signal);
    }
  }
}

export function useOfficeMetafileImages(rootRef: RefObject<HTMLElement | null>): void {
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const controller = new AbortController();
    convertMetafilesIn(root, controller.signal);
    const observer = new MutationObserver(() => convertMetafilesIn(root, controller.signal));
    observer.observe(root, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      controller.abort();
    };
  }, [rootRef]);
}
