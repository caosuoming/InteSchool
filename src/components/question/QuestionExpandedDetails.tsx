import { MathText } from "@/components/ui/MathText";
import { cn } from "@/lib/utils";
import type { Question } from "@/types";

type QuestionExpandedDetailsProps = {
  question: Pick<Question, "answer" | "analysis" | "summary">;
  wideLayout?: boolean;
};

export function QuestionExpandedDetails({
  question,
  wideLayout = false,
}: QuestionExpandedDetailsProps) {
  const contentClassName = wideLayout ? "text-base" : "text-sm";

  return (
    <div className="space-y-3 mb-3 animate-fade-in">
      <div>
        <div className="text-xs font-medium text-ink-500 mb-1">答案</div>
        <div
          className={cn(
            "p-2.5 rounded-md bg-emerald-50/40 border border-emerald-200 text-emerald-900 font-medium whitespace-pre-wrap",
            contentClassName,
          )}
        >
          <MathText>{question.answer}</MathText>
        </div>
      </div>

      <div>
        <div className="text-xs font-medium text-ink-500 mb-1">解析</div>
        <div
          className={cn(
            "p-2.5 rounded-md bg-gold-50/30 border border-gold-200 text-ink-900 leading-relaxed whitespace-pre-wrap",
            contentClassName,
          )}
        >
          <MathText>{question.analysis}</MathText>
        </div>
      </div>

      {question.summary && (
        <div>
          <div className="text-xs font-medium text-ink-500 mb-1">总结</div>
          <div
            className={cn(
              "p-2.5 rounded-md bg-amber-50/40 border border-amber-200 text-amber-900 leading-relaxed whitespace-pre-wrap",
              contentClassName,
            )}
          >
            <MathText>{question.summary}</MathText>
          </div>
        </div>
      )}
    </div>
  );
}
