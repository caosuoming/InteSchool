import { useEffect, useRef } from "react";
import sanitizeHtml from "sanitize-html";

interface Props {
  value?: string;
  onChange: (value: string) => void;
  label: string;
}

function clean(html: string) {
  return sanitizeHtml(html.slice(0, 12000), {
    allowedTags: ["b", "strong", "i", "em", "u", "s", "p", "div", "br", "span", "ul", "ol", "li", "code"],
    allowedAttributes: { span: ["style"] },
    allowedStyles: { span: { color: [/^#[0-9a-fA-F]{3,8}$/], "font-size": [/^(?:[1-9]|[1-4][0-9])px$/] } },
  });
}

/** Contenteditable does not sync on every keystroke: React must not reset the caret. */
export function BoardRichTextField({ value, onChange, label }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current && document.activeElement !== ref.current) {
      ref.current.innerHTML = clean(value || "");
    }
  }, [value]);
  const commit = () => {
    if (!ref.current) return;
    const html = clean(ref.current.innerHTML);
    if (html !== (value || "")) onChange(html);
    if (ref.current.innerHTML !== html) ref.current.innerHTML = html;
  };
  const exec = (name: string, arg?: string) => {
    document.execCommand?.(name, false, arg);
    ref.current?.focus();
  };
  return <div className="space-y-1 text-xs text-ink-500">
    <span>{label}</span>
    <div className="flex items-center gap-1 rounded-t-md border border-ink-200 bg-mist p-1">
      {[["bold", "B"], ["italic", "I"], ["underline", "U"], ["insertUnorderedList", "•"]].map(([cmd, caption]) =>
        <button key={cmd} type="button" aria-label={`${label} ${cmd}`} title={cmd}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => exec(cmd)} className="rounded border border-ink-200 bg-white px-2 py-1 text-xs text-ink-700">{caption}</button>)}
      <input type="color" aria-label={`${label} 颜色`} defaultValue="#334155" title="文字颜色"
        onChange={(e) => exec("foreColor", e.target.value)} className="ml-auto h-7 w-7 cursor-pointer" />
    </div>
    <div ref={ref} role="textbox" aria-label={label} contentEditable suppressContentEditableWarning
      onBlur={commit} className="min-h-20 max-h-52 overflow-auto rounded-b-md border border-t-0 border-ink-200 bg-white p-2 text-sm text-ink-800 outline-none focus:border-amber-400" />
  </div>;
}
