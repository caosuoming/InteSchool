import { emphasizeGeographyLabels, renderGeographyChoiceGroups } from "@/lib/geography-question-markup";
import { useMemo } from "react";
import "katex/dist/katex.min.css";
import { renderMathHtml } from "@/lib/math-html";
import { cn } from "@/lib/utils";
import { emphasizeEnglishQuestionHtml } from "@/lib/english-question-format";

interface MathHtmlProps {
  children: string;
  className?: string;
  revealedAnswerStep?: number;
  emphasizeEnglishQuestions?: boolean;
  geographyLabels?: boolean;
  geographyChoiceGroup?: boolean;
}

/** Renders rich HTML that may also contain $...$ or $$...$$ LaTeX formulas. */
export function MathHtml({ children, className, revealedAnswerStep, emphasizeEnglishQuestions = false, geographyLabels = false, geographyChoiceGroup = false }: MathHtmlProps) {
  const html = useMemo(() => {
    const raw = geographyLabels
      ? renderGeographyChoiceGroups(children, renderMathHtml, geographyChoiceGroup)
      : renderMathHtml(children);
    const rendered = geographyLabels ? emphasizeGeographyLabels(raw)
      : emphasizeEnglishQuestions ? emphasizeEnglishQuestionHtml(raw) : raw;
    if (revealedAnswerStep === undefined || !rendered.includes("lesson-inline-answer")) return rendered;
    const template = document.createElement("template");
    template.innerHTML = rendered;
    template.content.querySelectorAll<HTMLElement>(".lesson-inline-answer[data-answer-step]")
      .forEach((element) => {
        if (Number(element.dataset.answerStep) > revealedAnswerStep) {
          element.textContent = "______";
        }
      });
    return template.innerHTML;
  }, [children, revealedAnswerStep, emphasizeEnglishQuestions, geographyLabels, geographyChoiceGroup]);

  return (
    <div
      className={cn(
        "question-rich-content break-words [&_img]:my-2 [&_img]:rounded-md [&_img]:border-0",
        className,
      )}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

export default MathHtml;
