import { useMemo } from "react";
import "katex/dist/katex.min.css";
import { renderMathHtml } from "@/lib/math-html";

interface MathHtmlProps {
  children: string;
  className?: string;
}

/** Renders rich HTML that may also contain $...$ or $$...$$ LaTeX formulas. */
export function MathHtml({ children, className }: MathHtmlProps) {
  const html = useMemo(() => renderMathHtml(children), [children]);

  return (
    <div
      className={className}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

export default MathHtml;
