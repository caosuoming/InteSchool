import { MathHtml } from "@/components/ui/MathHtml";
import { cn } from "@/lib/utils";
import type { Question } from "@/types";
import { QuestionSupplementaryDetails } from "@/components/question/QuestionSupplementaryDetails";

type QuestionExpandedDetailsProps = {
  question: Pick<Question, "id" | "answer" | "analysis" | "summary" | "board" | "boardImages" | "links" | "explanationVideo">;
  wideLayout?: boolean;
};

export function QuestionExpandedDetails({
  question,
  wideLayout = false,
}: QuestionExpandedDetailsProps) {
  const contentClassName = wideLayout ? "text-base" : "text-sm";

  return (
    <div className="space-y-3 mb-3 animate-fade-in">
      <div className="flex items-center gap-2 text-xs text-ink-500">
        <span className="font-medium">题目唯一 ID</span>
        <code className="rounded bg-mist px-2 py-1 font-mono text-ink-700">{question.id}</code>
      </div>
      <div>
        <div className="text-xs font-medium text-ink-500 mb-1">答案</div>
        <div
          className={cn(
            "p-2.5 rounded-md bg-emerald-50/40 border border-emerald-200 text-emerald-900 font-medium whitespace-pre-wrap",
            contentClassName,
          )}
        >
          <MathHtml className="question-answer-content">{question.answer}</MathHtml>
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
          <MathHtml>{question.analysis}</MathHtml>
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
            <MathHtml>{question.summary}</MathHtml>
          </div>
        </div>
      )}

      <QuestionSupplementaryDetails
        board={question.board}
        boardImages={question.boardImages}
        links={question.links}
        explanationVideo={question.explanationVideo}
      />
    </div>
  );
}
