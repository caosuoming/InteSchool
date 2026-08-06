import { ChevronDown, ChevronRight } from "lucide-react";
import { MathHtml } from "@/components/ui/MathHtml";
import { QuestionExpandedDetails } from "@/components/question/QuestionExpandedDetails";
import { getQuestionOptionGridColumns } from "@/lib/question-option-layout";
import { cn } from "@/lib/utils";
import type { Question } from "@/types";

export interface ExpandableQuestionContentProps {
  question: Question;
  expanded: boolean;
  onToggle: () => void;
  optionsTestId?: string;
}

export function ExpandableQuestionContent({
  question,
  expanded,
  onToggle,
  optionsTestId,
}: ExpandableQuestionContentProps) {
  return (
    <div className="mb-2">
      <div
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onToggle();
          }
        }}
        aria-expanded={expanded}
        aria-label={expanded ? "收起题目详情" : "展开题目详情"}
        className="group/stem flex w-full cursor-pointer items-start gap-1.5 rounded-md text-left text-sm text-ink-900 leading-relaxed hover:bg-mist/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-400/50"
      >
        <span className="mt-0.5 flex-shrink-0 text-ink-400 group-hover/stem:text-ink-600">
          {expanded
            ? <ChevronDown className="h-4 w-4" />
            : <ChevronRight className="h-4 w-4" />}
        </span>
        <MathHtml className="min-w-0 flex-1 whitespace-pre-wrap">{question.stem}</MathHtml>
      </div>

      {question.options && question.options.length > 0 && (
        <div
          data-testid={optionsTestId}
          className={cn(
            "ml-5 mt-2 grid gap-x-4 gap-y-1.5 text-xs text-ink-700",
            getQuestionOptionGridColumns(question.options),
          )}
        >
          {question.options.map((option, index) => (
            <div key={index} className="flex items-start gap-1.5">
              <span className="flex-shrink-0 font-mono font-semibold">
                {String.fromCharCode(65 + index)}.
              </span>
              <MathHtml className="min-w-0 flex-1 break-all whitespace-pre-wrap">{option}</MathHtml>
            </div>
          ))}
        </div>
      )}

      {expanded && (
        <div className="ml-5 mt-3">
          <QuestionExpandedDetails question={question} />
        </div>
      )}
    </div>
  );
}

export default ExpandableQuestionContent;
