import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { MathHtml } from "@/components/ui/MathHtml";
import { cn } from "@/lib/utils";
import { getQuestionOptionGridColumns } from "@/lib/question-option-layout";

interface ExtractedQuestionContentProps {
  number?: number;
  stem: string;
  options?: string[];
  answer: string;
  analysis: string;
  compact?: boolean;
  optionVariant?: "boxed" | "plain";
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
}

export function ExtractedQuestionContent({
  number,
  stem,
  options,
  answer,
  analysis,
  compact = false,
  optionVariant = "boxed",
  expanded: controlledExpanded,
  onExpandedChange,
}: ExtractedQuestionContentProps) {
  const [localExpanded, setLocalExpanded] = useState(false);
  const expanded = controlledExpanded ?? localExpanded;
  const toggleExpanded = () => {
    const nextExpanded = !expanded;
    if (onExpandedChange) onExpandedChange(nextExpanded);
    else setLocalExpanded(nextExpanded);
  };

  return (
    <div className="min-w-0 flex-1">
      <div
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        aria-label={number ? `第 ${number} 题，点击展开答案和解析` : "点击展开答案和解析"}
        onClick={toggleExpanded}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            toggleExpanded();
          }
        }}
        className="group flex cursor-pointer items-start gap-2 rounded-sm text-left outline-none transition-colors hover:text-gold-700 focus-visible:ring-2 focus-visible:ring-gold-400"
      >
        {number !== undefined && (
          <span className="flex-shrink-0 font-mono font-bold text-ink-400">{number}.</span>
        )}
        <MathHtml
          className={cn(
            "min-w-0 flex-1 whitespace-pre-wrap text-ink-900",
            compact ? "text-sm leading-relaxed" : "text-sm leading-7",
          )}
        >
          {stem}
        </MathHtml>
        {expanded
          ? <ChevronDown className="mt-1 h-4 w-4 flex-shrink-0 text-gold-600" />
          : <ChevronRight className="mt-1 h-4 w-4 flex-shrink-0 text-ink-300 group-hover:text-gold-600" />}
      </div>

      {options && options.length > 0 && (
        <div className={cn(
          "mt-2 grid gap-2",
          number !== undefined && "pl-6",
          getQuestionOptionGridColumns(options),
        )}>
          {options.map((option, index) => {
            const optionLabel = String.fromCharCode(65 + index);
            const isAnswer = expanded && answer.includes(optionLabel);
            return (
              <div
                key={`${optionLabel}-${option}`}
                className={cn(
                  "flex min-w-0 items-start gap-1.5 py-1.5 text-sm",
                  optionVariant === "boxed" && "rounded border px-2",
                  optionVariant === "boxed" && (isAnswer
                    ? "border-emerald-200 bg-emerald-50/50"
                    : "border-ink-100"),
                )}
              >
                <span className={cn(
                  "flex-shrink-0 font-mono font-semibold",
                  isAnswer ? "text-emerald-900" : "text-ink-600",
                )}>
                  {optionLabel}.
                </span>
                <MathHtml className={cn(
                  "min-w-0 flex-1",
                  isAnswer ? "text-emerald-900" : "text-ink-800",
                )}>{option}</MathHtml>
              </div>
            );
          })}
        </div>
      )}

      {expanded && (
        <div className={cn("mt-2 space-y-2 animate-fade-in", number !== undefined && "pl-6")}>
          <div className="rounded border border-emerald-200 bg-emerald-50/40 p-2 text-sm text-emerald-900">
            <span className="font-bold">答案：</span>
            {answer ? <MathHtml className="question-answer-content inline text-emerald-900">{answer}</MathHtml> : <span className="text-ink-400">暂无答案</span>}
          </div>
          <div className="rounded border border-gold-200 bg-gold-50/30 p-2 text-sm text-ink-800">
            <span className="font-bold text-gold-700">解析：</span>
            {analysis ? <MathHtml className="inline text-ink-800">{analysis}</MathHtml> : <span className="text-ink-400">暂无解析</span>}
          </div>
        </div>
      )}
    </div>
  );
}

export default ExtractedQuestionContent;
