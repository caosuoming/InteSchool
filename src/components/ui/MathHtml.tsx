import { useMemo } from "react";
import "katex/dist/katex.min.css";
import { renderMathHtml } from "@/lib/math-html";
import { cn } from "@/lib/utils";

interface MathHtmlProps {
  children: string;
  className?: string;
}

/** Renders rich HTML that may also contain $...$ or $$...$$ LaTeX formulas. */
export function MathHtml({ children, className }: MathHtmlProps) {
  const html = useMemo(() => renderMathHtml(children), [children]);

  return (
    <div
      className={cn(
        "break-words [&_img]:my-2 [&_img]:h-auto [&_img]:max-w-full [&_img]:rounded-md [&_img]:border [&_img]:border-ink-100 [&_img]:object-contain",
        className,
      )}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

export default MathHtml;
