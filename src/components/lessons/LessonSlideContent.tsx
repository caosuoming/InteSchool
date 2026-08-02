import type { LessonSlide } from "@/types";
import { cn } from "@/lib/utils";
import { MathHtml } from "@/components/ui/MathHtml";

interface LessonSlideContentProps {
  slide: LessonSlide;
  showAnswer?: boolean;
  className?: string;
}

const questionTypeLabel: Record<string, string> = {
  single: "单选",
  multiple: "多选",
  judge: "判断",
  short: "填空",
  essay: "解答",
};

export function LessonSlideContent({ slide, showAnswer = true, className }: LessonSlideContentProps) {
  const hasFloatingImages = slide.elements?.some((element) => element.kind === "image") || false;

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
    return (
      <div className={cn("h-full overflow-auto p-8", className)}>
        <div className={cn("space-y-5", hasFloatingImages && "max-w-[60%]") }>
          <div className="flex items-center gap-2 border-b border-ink-100 pb-3">
            <span className="rounded bg-gold-100 px-2 py-0.5 text-xs font-medium text-gold-800">
              {questionTypeLabel[slide.questionSnapshot.type] || "题目"}
            </span>
            <span className="font-serif text-xl font-semibold text-ink-900">{slide.title}</span>
          </div>
          <MathHtml className="text-lg leading-relaxed text-ink-900">
            {slide.questionSnapshot.stem}
          </MathHtml>
          {slide.questionSnapshot.options && slide.questionSnapshot.options.length > 0 && (
            <div className="space-y-2">
              {slide.questionSnapshot.options.map((option, index) => (
                <div key={`${slide.id}-option-${index}`} className="flex items-start gap-3 rounded-lg border border-ink-100 bg-mist/40 p-3">
                  <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-ink-900 font-mono text-sm text-paper">
                    {String.fromCharCode(65 + index)}
                  </span>
                  <MathHtml className="flex-1 text-base text-ink-800">{option}</MathHtml>
                </div>
              ))}
            </div>
          )}
          {showAnswer && (
            <div className="grid grid-cols-2 gap-4 border-t border-ink-100 pt-4">
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                <div className="mb-1 text-xs font-medium text-emerald-700">参考答案</div>
                <MathHtml className="text-sm font-medium text-emerald-900">
                  {slide.questionSnapshot.answer || "暂无答案"}
                </MathHtml>
              </div>
              <div className="rounded-lg border border-gold-200 bg-gold-50 p-3">
                <div className="mb-1 text-xs font-medium text-gold-700">解析</div>
                <MathHtml className="text-sm text-ink-800">
                  {slide.questionSnapshot.analysis || "暂无解析"}
                </MathHtml>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={cn("h-full overflow-auto p-10", className)}>
      <div className="mb-5 border-b border-ink-100 pb-4 font-serif text-2xl font-bold text-ink-900">
        {slide.title}
      </div>
      <MathHtml className="text-lg leading-relaxed text-ink-800">{slide.content || "暂无内容"}</MathHtml>
    </div>
  );
}

export default LessonSlideContent;
