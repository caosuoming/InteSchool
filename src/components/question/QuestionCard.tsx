import { type Question } from "@/types";
import { cn } from "@/lib/utils";
import { Eye, Plus, FileText, MessageSquare } from "lucide-react";

interface QuestionCardProps {
  question: Question;
  onAddToBasket?: (q: Question) => void;
  onView?: (q: Question) => void;
  selected?: boolean;
  onSelect?: (q: Question) => void;
  className?: string;
  showActions?: boolean;
}

const typeLabel: Record<Question["type"], string> = {
  single: "单选",
  multiple: "多选",
  judge: "判断",
  short: "填空",
  essay: "解答",
};

const difficultyLabel = ["", "简单", "较易", "中等", "较难", "困难"];

export function QuestionCard({
  question,
  onAddToBasket,
  onView,
  selected = false,
  onSelect,
  className,
  showActions = true,
}: QuestionCardProps) {
  const hasRemarks = (question.remarks && question.remarks.length > 0) || !!question.remark;
  const remarkCount = question.remarks?.length || (question.remark ? 1 : 0);

  return (
    <div
      className={cn(
        "card-base p-4 cursor-pointer transition-all group",
        selected && "border-gold-300 bg-gold-50/30 shadow-gold",
        className,
      )}
      onClick={() => onSelect?.(question)}
    >
      <div className="flex items-start gap-2 mb-2">
        <div className="flex flex-wrap gap-1.5 flex-1">
          <span className="tag-ink">{typeLabel[question.type]}</span>
          <span
            className={cn(
              "tag-base",
              question.difficulty <= 2
                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                : question.difficulty <= 3
                  ? "bg-amber-50 text-amber-700 border border-amber-200"
                  : "bg-red-50 text-red-700 border border-red-200",
            )}
          >
            {difficultyLabel[question.difficulty]}
          </span>
          {question.isShared && <span className="tag-teal">共享</span>}
          {question.recommendation >= 4 && <span className="tag-gold">推荐</span>}
          {hasRemarks && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-gold-50 text-gold-700 border border-gold-200">
              <MessageSquare className="w-3 h-3" />
              {remarkCount}
            </span>
          )}
        </div>
        {showActions && (
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {onView && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onView(question);
                }}
                className="p-1.5 rounded text-ink-400 hover:bg-mist hover:text-ink-700"
                title="查看详情"
              >
                <Eye className="w-3.5 h-3.5" />
              </button>
            )}
            {onAddToBasket && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onAddToBasket(question);
                }}
                className="p-1.5 rounded text-ink-400 hover:bg-gold-100 hover:text-gold-700"
                title="加入试题篮"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}
      </div>

      <div className="text-sm text-ink-900 line-clamp-2 mb-2 leading-relaxed">{question.stem}</div>

      {question.options && question.options.length > 0 && (
        <div className="text-xs text-ink-600 space-y-0.5 mb-2">
          {question.options.slice(0, 2).map((opt, i) => (
            <div key={i} className="truncate">
              {String.fromCharCode(65 + i)}. {opt}
            </div>
          ))}
          {question.options.length > 2 && (
            <div className="text-ink-400">... 共 {question.options.length} 个选项</div>
          )}
        </div>
      )}

      <div className="flex items-center justify-between pt-2 border-t border-ink-100 text-xs text-ink-400">
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1">
            <FileText className="w-3 h-3" />
            使用 {question.usageCount} 次
          </span>
        </div>
        <span>答案：{question.answer.slice(0, 20)}</span>
      </div>
    </div>
  );
}

export default QuestionCard;
