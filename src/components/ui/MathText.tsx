import { useMemo } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";

interface MathTextProps {
  /** 可能包含 $...$（行内公式）或 $$...$$（块级公式）的文本 */
  children: string;
  className?: string;
}

/**
 * 渲染包含 LaTeX 公式的文本。
 * - $$...$$ 渲染为块级公式（居中独占一行）
 * - $...$ 渲染为行内公式
 * - 普通文本正常显示
 * 支持转义的 \$ 符号（不作为公式标记）
 */
export function MathText({ children, className }: MathTextProps) {
  const segments = useMemo(() => parseMathText(children), [children]);

  return (
    <span className={className}>
      {segments.map((seg, i) => {
        if (seg.type === "block") {
          try {
            const html = katex.renderToString(seg.latex, {
              throwOnError: false,
              displayMode: true,
              output: "html",
            });
            return (
              <span
                key={i}
                className="block my-1 text-center overflow-x-auto"
                dangerouslySetInnerHTML={{ __html: html }}
              />
            );
          } catch {
            return <span key={i} className="font-mono text-sm">{seg.latex}</span>;
          }
        }
        if (seg.type === "inline") {
          try {
            const html = katex.renderToString(seg.latex, {
              throwOnError: false,
              displayMode: false,
              output: "html",
            });
            return <span key={i} dangerouslySetInnerHTML={{ __html: html }} />;
          } catch {
            return <span key={i} className="font-mono text-sm">{seg.latex}</span>;
          }
        }
        return <span key={i}>{seg.text}</span>;
      })}
    </span>
  );
}

type Segment =
  | { type: "text"; text: string }
  | { type: "inline"; latex: string }
  | { type: "block"; latex: string };

/**
 * 解析文本中的 LaTeX 公式标记。
 * 先处理 $$...$$（块级），再处理 $...$（行内）。
 * \$ 为转义符号，不作为公式标记。
 */
function parseMathText(text: string): Segment[] {
  if (!text) return [{ type: "text", text: "" }];

  const segments: Segment[] = [];
  let remaining = text.normalize("NFC");

  // 先把转义的 \$ 替换为占位符，避免干扰公式解析
  const ESCAPED_DOLLAR = "\u0000DOLLAR\u0000";
  remaining = remaining.replace(/\\\$/g, ESCAPED_DOLLAR);

  // 匹配 $$...$$ 或 $...$
  const regex = /\${1,2}([\s\S]+?)\${1,2}/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(remaining)) !== null) {
    // 公式前的普通文本
    if (match.index > lastIndex) {
      const before = remaining.slice(lastIndex, match.index);
      if (before) {
        segments.push({ type: "text", text: restoreDollar(before) });
      }
    }

    const fullMatch = match[0];
    const content = match[1];
    const isBlock = fullMatch.startsWith("$$");

    if (isBlock) {
      segments.push({ type: "block", latex: content.trim() });
    } else {
      segments.push({ type: "inline", latex: content.trim() });
    }

    lastIndex = regex.lastIndex;
  }

  // 剩余的普通文本
  if (lastIndex < remaining.length) {
    const after = remaining.slice(lastIndex);
    if (after) {
      segments.push({ type: "text", text: restoreDollar(after) });
    }
  }

  // 如果没有匹配到任何公式，返回整段文本
  if (segments.length === 0) {
    segments.push({ type: "text", text: restoreDollar(remaining) });
  }

  return segments;
}

function restoreDollar(text: string): string {
  return text.split("\u0000DOLLAR\u0000").join("$");
}
