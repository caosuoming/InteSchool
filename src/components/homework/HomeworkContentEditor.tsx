import { useEffect, useRef, type ClipboardEvent } from "react";
import { toast } from "@/stores/ui";
import {
  encodeHomeworkMarkup, HOMEWORK_TEXT_LIMIT, homeworkMarkup, homeworkPlainText,
} from "@/lib/homework-rich-text";

function escapeText(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/\n/g, "<br>");
}

export function HomeworkContentEditor({ value, onChange, onPasteImage }: {
  value: string;
  onChange: (value: string) => void;
  onPasteImage: (file: File) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current || document.activeElement === ref.current) return;
    const html = homeworkMarkup(value) ?? escapeText(value);
    if (ref.current.innerHTML !== html) ref.current.innerHTML = html;
  }, [value]);

  const commit = () => {
    if (!ref.current) return;
    try {
      const next = encodeHomeworkMarkup(ref.current.innerHTML);
      if (homeworkPlainText(next).length <= HOMEWORK_TEXT_LIMIT) onChange(next);
    } catch (error) {
      toast.warning(error instanceof Error ? error.message : "作业内容格式过长");
    }
  };

  const command = (name: string, value?: string) => {
    ref.current?.focus();
    document.execCommand?.(name, false, value);
    commit();
  };

  const paste = (event: ClipboardEvent<HTMLDivElement>) => {
    const image = Array.from(event.clipboardData.files).find((file) => file.type.startsWith("image/"))
      || Array.from(event.clipboardData.items || []).find((item) => item.type.startsWith("image/"))?.getAsFile();
    if (image) {
      event.preventDefault();
      onPasteImage(image);
      return;
    }
    // Strip untrusted clipboard HTML while preserving newlines.
    event.preventDefault();
    const text = event.clipboardData.getData("text/plain");
    if (text) command("insertText", text);
  };

  return (
    <div className="space-y-1">
      <label id="homework-content-label" className="block text-sm font-medium text-ink-800">作业内容</label>
      <div className="flex flex-wrap items-center gap-1 rounded-t-lg border border-ink-200 bg-mist/50 p-1.5">
        {([ ["bold", "加粗", "B"], ["underline", "下划线", "U"], ["hiliteColor", "重点突出", "重点"],
          ["fontSize", "加大字体", "大字"], ["removeFormat", "清除格式", "清除"] ] as const).map(([name, title, caption]) => (
          <button key={name} type="button" aria-label={title} title={title}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => command(name, name === "hiliteColor" ? "#fff3a6" : name === "fontSize" ? "5" : undefined)}
            className="rounded border border-ink-200 bg-white px-2.5 py-1 text-xs text-ink-700 hover:border-gold-400">
            {caption}
          </button>
        ))}
        <label className="ml-auto flex items-center gap-1 text-xs text-ink-600">文字颜色
          <input type="color" aria-label="作业文字颜色" defaultValue="#1f2937"
            onChange={(event) => command("foreColor", event.target.value)} className="h-7 w-8 cursor-pointer" />
        </label>
      </div>
      <div ref={ref} role="textbox" aria-labelledby="homework-content-label" contentEditable
        suppressContentEditableWarning onInput={commit} onBlur={commit} onPaste={paste}
        data-placeholder="例如：完成课本第 42 页第 1—6 题，订正今日课堂练习。"
        className="min-h-28 rounded-b-lg border border-t-0 border-ink-200 bg-white px-3 py-2 text-sm leading-6 text-ink-800 outline-none focus:border-gold-400 empty:before:pointer-events-none empty:before:text-ink-400 empty:before:content-[attr(data-placeholder)]" />
      <div className="text-xs text-ink-400">支持选中文字设置格式、Ctrl+V 粘贴图片（图片作为作业附件上传），最多 4000 字。</div>
    </div>
  );
}
