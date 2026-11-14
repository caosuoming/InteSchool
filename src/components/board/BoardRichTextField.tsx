import { useEffect, useRef, type ClipboardEvent } from "react";
import { toast } from "@/stores/ui";
import { BOARD_IMAGE_MAX_BYTES, BOARD_RICH_TEXT_MAX_LENGTH, cleanBoardRichText } from "@/lib/board-rich-text";

interface Props {
  value?: string;
  onChange: (value: string) => void;
  label: string;
  expanded?: boolean;
}

/** Editing uses the same HTML allowlist as the server. React never resets the active caret. */
export function BoardRichTextField({ value, onChange, label, expanded = false }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current && document.activeElement !== ref.current) {
      ref.current.innerHTML = cleanBoardRichText(value || "");
    }
  }, [value]);

  const commit = () => {
    if (!ref.current) return;
    try {
      const html = cleanBoardRichText(ref.current.innerHTML);
      if (html !== (value || "")) onChange(html);
      // Only restore HTML on blur, so edits keep their insertion point.
      if (ref.current.innerHTML !== html) ref.current.innerHTML = html;
    } catch (error) {
      toast.error("节点文本内容过大", error instanceof Error ? error.message : undefined);
      ref.current.innerHTML = cleanBoardRichText(value || "");
    }
  };
  const exec = (name: string, arg?: string) => {
    ref.current?.focus();
    document.execCommand?.(name, false, arg);
    // execCommand edits may not fire an input event in every browser.
  };
  const paste = (event: ClipboardEvent<HTMLDivElement>) => {
    const file = Array.from(event.clipboardData.files).find((entry) => entry.type.startsWith("image/"));
    if (!file) return;
    event.preventDefault();
    if (!/^(image\/(png|jpeg|gif|webp))$/.test(file.type) || file.size > BOARD_IMAGE_MAX_BYTES) {
      toast.error("粘贴图片须为 280KB 以内的 PNG、JPEG、GIF 或 WebP");
      return;
    }
    const target = ref.current;
    if (!target) return;
    const selection = window.getSelection();
    const range = selection?.rangeCount && target.contains(selection.anchorNode)
      ? selection.getRangeAt(0).cloneRange() : null;
    const reader = new FileReader();
    reader.onload = () => {
      if (!target.isConnected || typeof reader.result !== "string") return;
      const img = document.createElement("img");
      img.src = reader.result;
      img.alt = "粘贴图片";
      const insertAt = range || document.createRange();
      if (!range) insertAt.selectNodeContents(target);
      if (!range) insertAt.collapse(false);
      insertAt.deleteContents();
      insertAt.insertNode(img);
      if (target.innerHTML.length > BOARD_RICH_TEXT_MAX_LENGTH) {
        img.remove();
        toast.error("节点文本内容超过大小限制");
        return;
      }
      insertAt.setStartAfter(img);
      insertAt.collapse(true);
      const current = window.getSelection();
      current?.removeAllRanges();
      current?.addRange(insertAt);
      commit();
    };
    reader.readAsDataURL(file);
  };

  return <div className="space-y-1 text-xs text-ink-500">
    <span>{label}</span>
    <div className="flex flex-wrap items-center gap-1 rounded-t-md border border-ink-200 bg-mist p-1">
      {[["bold", "B"], ["italic", "I"], ["underline", "U"], ["insertUnorderedList", "•"], ["insertOrderedList", "1."], ["removeFormat", "清除格式"]].map(([cmd, caption]) =>
        <button key={cmd} type="button" aria-label={`${label} ${cmd}`} title={cmd}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => exec(cmd)} className="rounded border border-ink-200 bg-white px-2 py-1 text-xs text-ink-700">{caption}</button>)}
      <input type="color" aria-label={`${label} 颜色`} defaultValue="#334155" title="文字颜色"
        onChange={(e) => exec("foreColor", e.target.value)} className="ml-auto h-7 w-7 cursor-pointer" />
    </div>
    <div ref={ref} role="textbox" aria-label={label} contentEditable suppressContentEditableWarning
      onPaste={paste} onBlur={commit}
      className={`overflow-auto rounded-b-md border border-t-0 border-ink-200 bg-white p-2 text-sm text-ink-800 outline-none focus:border-amber-400 [&_img]:max-h-64 [&_img]:max-w-full [&_img]:object-contain ${expanded ? "min-h-72 max-h-[60vh]" : "min-h-20 max-h-52"}`} />
    <span className="block text-[11px] text-ink-400">支持富文本排版和 Ctrl+V 粘贴图片（单张不超过 280KB）</span>
  </div>;
}
