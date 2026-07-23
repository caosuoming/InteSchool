import { useEffect, useState } from "react";
import { X, ShoppingBasket } from "lucide-react";
import { questionService } from "@/services/question";
import { Spinner } from "@/components/ui/Spinner";
import { Badge } from "@/components/ui/Badge";
import type { Question } from "@/types";

const typeLabel: Record<Question["type"], string> = {
  single: "单选",
  multiple: "多选",
  judge: "判断",
  short: "填空",
  essay: "解答",
};

const difficultyLabel = ["", "简单", "较易", "中等", "较难", "困难"];

interface RelatedQuestionsModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  filterType: "chapter" | "knowledge" | "keyword";
  filterValue: string;
  schoolId: string;
  onSelect: (question: Question) => void;
  currentQuestionId?: string;
}

export function RelatedQuestionsModal({
  open,
  onClose,
  title,
  description,
  filterType,
  filterValue,
  schoolId,
  onSelect,
  currentQuestionId,
}: RelatedQuestionsModalProps) {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    const load = async () => {
      const filter: any = { schoolId };
      if (filterType === "chapter") {
        filter.chapterIds = [filterValue];
      } else if (filterType === "knowledge") {
        filter.knowledgePointIds = [filterValue];
      } else if (filterType === "keyword") {
        filter.keyword = filterValue;
      }
      const data = await questionService.listQuestions(filter);
      setQuestions(data.filter((q) => q.id !== currentQuestionId));
      setLoading(false);
    };
    load();
  }, [open, filterType, filterValue, schoolId, currentQuestionId]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink-950/40" onClick={onClose} />
      <div className="relative bg-paper rounded-xl shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-ink-100">
          <div>
            <h3 className="font-serif font-semibold text-ink-900">{title}</h3>
            {description && <p className="text-sm text-ink-500 mt-0.5">{description}</p>}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-mist text-ink-400">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Spinner size={24} />
            </div>
          ) : questions.length === 0 ? (
            <div className="text-center py-12 text-sm text-ink-400">暂无相关题目</div>
          ) : (
            <div className="space-y-2">
              {questions.map((q) => (
                <div
                  key={q.id}
                  className="p-3 rounded-lg border border-ink-100 hover:border-gold-200 hover:bg-gold-50/30 transition-all"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                        <Badge variant="ink" className="text-xs">{typeLabel[q.type]}</Badge>
                        <Badge variant={q.difficulty <= 2 ? "green" : q.difficulty <= 3 ? "amber" : "red"} className="text-xs">
                          {difficultyLabel[q.difficulty]}
                        </Badge>
                        <span className="text-xs text-ink-400">使用 {q.usageCount} 次</span>
                      </div>
                      <div className="text-sm text-ink-900 line-clamp-2">{q.stem}</div>
                    </div>
                    <button
                      onClick={() => {
                        onSelect(q);
                        onClose();
                      }}
                      className="flex-shrink-0 px-3 py-1.5 rounded-md bg-gold-400 text-ink-900 text-xs font-medium hover:bg-gold-500 transition-colors flex items-center gap-1"
                    >
                      <ShoppingBasket className="w-3 h-3" />
                      添加到资源篮
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-ink-100 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-ink-200 text-sm font-medium text-ink-600 hover:bg-mist transition-colors"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}

export default RelatedQuestionsModal;