import type { LessonSlide } from "@/types";
import { cn } from "@/lib/utils";
import { MathHtml } from "@/components/ui/MathHtml";
import { QuestionSupplementaryDetails } from "@/components/question/QuestionSupplementaryDetails";
import {
  STEM_ONLY_QUESTION_VISIBILITY,
  type LessonQuestionContentVisibility,
} from "@/lib/lesson-slide-visibility";

interface LessonSlideContentProps {
  slide: LessonSlide;
  questionVisibility?: Partial<LessonQuestionContentVisibility>;
  className?: string;
}

export function LessonSlideContent({
  slide,
  questionVisibility,
  className,
}: LessonSlideContentProps) {
  const visibility = {
    ...STEM_ONLY_QUESTION_VISIBILITY,
    ...questionVisibility,
  };

  if (slide.type === "section") {
    return (
      <div className={cn("flex h-full flex-col items-center justify-start px-12 pt-[16%] text-center", className)}>
        <div className="mb-5 h-1 w-20 rounded-full bg-gold-400" />
        <h2 className="max-w-4xl font-serif text-4xl font-bold leading-tight text-ink-900">
          {slide.title}
        </h2>
        {slide.content && (
          <MathHtml className="mt-5 max-w-3xl text-lg text-ink-500">{slide.content}</MathHtml>
        )}
      </div>
    );
  }

  if (slide.type === "question" && slide.questionSnapshot) {
    const question = slide.questionSnapshot;
    return (
      <div className={cn("h-full overflow-hidden p-[5%]", className)}>
        <div className="w-full space-y-5">
          <MathHtml className="w-full text-2xl leading-relaxed text-ink-900">
            {question.stem}
          </MathHtml>

          {visibility.options && question.options && question.options.length > 0 && (
            <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2">
              {question.options.map((option, index) => (
                <div
                  key={`${slide.id}-option-${index}`}
                  className="flex items-start gap-3 rounded-lg border border-ink-100 bg-mist/40 p-3"
                >
                  <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-ink-900 font-mono text-sm text-paper">
                    {String.fromCharCode(65 + index)}
                  </span>
                  <MathHtml className="min-w-0 flex-1 text-base text-ink-800">{option}</MathHtml>
                </div>
              ))}
            </div>
          )}

          {visibility.supplementary && (
            <QuestionSupplementaryDetails
              links={question.links}
              explanationVideo={question.explanationVideo}
              compact
            />
          )}

          {(visibility.answer || visibility.analysis) && (
            <div className="grid w-full grid-cols-1 gap-4 border-t border-ink-100 pt-4 sm:grid-cols-2">
              {visibility.answer && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                  <div className="mb-1 text-xs font-medium text-emerald-700">参考答案</div>
                  <MathHtml className="text-sm font-medium text-emerald-900">
                    {question.answer || "暂无答案"}
                  </MathHtml>
                </div>
              )}
              {visibility.analysis && (
                <div className="rounded-lg border border-gold-200 bg-gold-50 p-3">
                  <div className="mb-1 text-xs font-medium text-gold-700">解析</div>
                  <MathHtml className="text-sm text-ink-800">
                    {question.analysis || "暂无解析"}
                  </MathHtml>
                </div>
              )}
            </div>
          )}

          {visibility.analysis && question.summary && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
              <div className="mb-1 text-xs font-medium text-amber-700">总结</div>
              <MathHtml className="text-sm text-ink-800">{question.summary}</MathHtml>
            </div>
          )}
          {visibility.analysis && (
            <QuestionSupplementaryDetails board={question.board} compact />
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={cn("h-full overflow-hidden p-10", className)}>
      <div className="mb-5 border-b border-ink-100 pb-4 font-serif text-2xl font-bold text-ink-900">
        {slide.title}
      </div>
      <MathHtml className="text-lg leading-relaxed text-ink-800">{slide.content || "暂无内容"}</MathHtml>
    </div>
  );
}

export default LessonSlideContent;
