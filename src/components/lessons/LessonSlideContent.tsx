import type { MouseEvent } from "react";
import type { LessonSlide, LessonSlideTextRegion } from "@/types";
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
  editable?: boolean;
  selectedTextRegion?: LessonSlideTextRegion | null;
  onSelectTextRegion?: (region: LessonSlideTextRegion) => void;
  className?: string;
}

export function LessonSlideContent({
  slide,
  questionVisibility,
  editable = false,
  selectedTextRegion,
  onSelectTextRegion,
  className,
}: LessonSlideContentProps) {
  const visibility = {
    ...STEM_ONLY_QUESTION_VISIBILITY,
    ...questionVisibility,
  };

  const textRegionProps = (region: LessonSlideTextRegion) => ({
    onClick: editable ? (event: MouseEvent) => {
      event.stopPropagation();
      onSelectTextRegion?.(region);
    } : undefined,
    className: cn(
      editable && "cursor-text select-text rounded outline-none transition-shadow",
      editable && selectedTextRegion === region && "ring-2 ring-gold-400 ring-offset-2",
    ),
    style: slide.textStyles?.[region]?.fontSize
      ? { fontSize: `${slide.textStyles[region]?.fontSize}px` }
      : undefined,
  });

  if (slide.type === "section") {
    return (
      <div className={cn("flex h-full flex-col items-center justify-start px-12 pt-[4%] text-center", className)}>
        <div className="mb-5 h-1 w-20 rounded-full bg-gold-400" />
        <h2
          {...textRegionProps("title")}
          className={cn(
            "max-w-4xl font-serif text-4xl font-bold leading-tight text-ink-900",
            textRegionProps("title").className,
          )}
        >
          <MathHtml>{slide.title}</MathHtml>
        </h2>
        {slide.content && (
          <div
            {...textRegionProps("content")}
            className={cn("mt-5 max-w-3xl text-lg text-ink-500", textRegionProps("content").className)}
          >
            <MathHtml>{slide.content}</MathHtml>
          </div>
        )}
      </div>
    );
  }

  if (slide.type === "question" && slide.questionSnapshot) {
    const question = slide.questionSnapshot;
    return (
      <div className={cn("h-full overflow-hidden px-[4%] pb-[4%] pt-[2.5%]", className)}>
        <div className="w-full space-y-5">
          <div
            {...textRegionProps("stem")}
            className={cn("w-full text-2xl leading-relaxed text-ink-900", textRegionProps("stem").className)}
          >
            <MathHtml>{question.stem}</MathHtml>
          </div>

          {visibility.options && question.options && question.options.length > 0 && (
            <div
              {...textRegionProps("options")}
              className={cn("grid w-full grid-cols-1 gap-2 sm:grid-cols-2", textRegionProps("options").className)}
            >
              {question.options.map((option, index) => (
                <div
                  key={`${slide.id}-option-${index}`}
                  className="flex items-start gap-3 rounded-lg border border-ink-100 bg-mist/40 p-3"
                >
                  <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-ink-900 font-mono text-sm text-paper">
                    {String.fromCharCode(65 + index)}
                  </span>
                  <MathHtml className="min-w-0 flex-1 text-ink-800">
                    {option}
                  </MathHtml>
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
    <div className={cn("h-full overflow-hidden px-10 pb-10 pt-4", className)}>
      <div
        {...textRegionProps("title")}
        className={cn(
          "mb-5 border-b border-ink-100 pb-4 font-serif text-2xl font-bold text-ink-900",
          textRegionProps("title").className,
        )}
      >
        <MathHtml>{slide.title}</MathHtml>
      </div>
      <div
        {...textRegionProps("content")}
        className={cn("text-lg leading-relaxed text-ink-800", textRegionProps("content").className)}
      >
        <MathHtml>{slide.content || "暂无内容"}</MathHtml>
      </div>
    </div>
  );
}

export default LessonSlideContent;
