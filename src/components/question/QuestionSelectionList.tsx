import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

import { MathHtml } from "@/components/ui/MathHtml";
import { cn } from "@/lib/utils";
import type { Question } from "@/types";

interface QuestionSelectionListProps {
  questions: Question[];
  selectedIds: string[];
  onSelect: (ids: string[]) => void;
  singleSelect?: boolean;
  answeredQuestionIds?: Set<string>;
  emptyText?: string;
}

const questionTypeLabel: Record<string, string> = {
  single: "单选",
  multiple: "多选",
  judge: "判断",
  short: "填空",
  essay: "解答",
  conceptFill: "概念填空",
};

export function QuestionSelectionList({
  questions,
  selectedIds,
  onSelect,
  singleSelect = false,
  answeredQuestionIds,
  emptyText = "暂无题目",
}: QuestionSelectionListProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const toggleSelected = (questionId: string, checked: boolean) => {
    if (singleSelect) {
      onSelect(checked ? [questionId] : []);
      return;
    }
    onSelect(
      checked
        ? Array.from(new Set([...selectedIds, questionId]))
        : selectedIds.filter((id) => id !== questionId),
    );
  };

  const toggleExpanded = (questionId: string) => {
    setExpandedIds((previous) => {
      const next = new Set(previous);
      if (next.has(questionId)) next.delete(questionId);
      else next.add(questionId);
      return next;
    });
  };

  if (questions.length === 0) {
    return <div className="py-10 text-center text-sm text-ink-400">{emptyText}</div>;
  }

  return (
    <div className="max-h-96 space-y-2 overflow-y-auto pr-1">
      {questions.map((question, index) => {
        const checked = selectedIds.includes(question.id);
        const expanded = expandedIds.has(question.id);
        const answered = answeredQuestionIds?.has(question.id) ?? false;

        return (
          <div
            key={question.id}
            className={cn(
              "rounded-lg border transition-colors",
              checked ? "border-gold-300 bg-gold-50/30" : "border-ink-100 bg-paper hover:border-ink-200",
            )}
          >
            <div className="flex items-start gap-3 p-3">
              <input
                type="checkbox"
                checked={checked}
                onChange={(event) => toggleSelected(question.id, event.target.checked)}
                className="mt-1 h-4 w-4 flex-shrink-0 rounded border-ink-300 text-gold-500"
                aria-label={`选择第 ${index + 1} 道题`}
              />

              <div className="min-w-0 flex-1">
                <div className="mb-1.5 flex flex-wrap items-center gap-1.5 text-[10px] text-ink-500">
                  <span className="rounded bg-ink-100 px-1.5 py-0.5">{questionTypeLabel[question.type] || question.type}</span>
                  <span className="rounded bg-ink-50 px-1.5 py-0.5">难度 {question.difficulty}</span>
                  {answered && <span className="tag-gold py-0.5">已做过</span>}
                </div>

                <button
                  type="button"
                  onClick={() => toggleExpanded(question.id)}
                  className="flex w-full items-start gap-1.5 text-left text-sm leading-6 text-ink-900 hover:text-gold-700"
                  aria-expanded={expanded}
                >
                  {expanded
                    ? <ChevronDown className="mt-1 h-4 w-4 flex-shrink-0 text-ink-400" />
                    : <ChevronRight className="mt-1 h-4 w-4 flex-shrink-0 text-ink-400" />}
                  <MathHtml className="min-w-0 flex-1 whitespace-pre-wrap">{question.stem}</MathHtml>
                </button>

                {question.options && question.options.length > 0 && (
                  <div className="mt-2 space-y-1 pl-5 text-xs text-ink-600">
                    {question.options.map((option, optionIndex) => (
                      <div key={optionIndex} className="flex items-start gap-1.5">
                        <span className="font-mono font-semibold text-ink-500">
                          {String.fromCharCode(65 + optionIndex)}.
                        </span>
                        <MathHtml className="min-w-0 flex-1">{option}</MathHtml>
                      </div>
                    ))}
                  </div>
                )}

                {expanded && (
                  <div className="mt-3 space-y-2 pl-5">
                    <div className="rounded-md border border-emerald-200 bg-emerald-50/40 p-2.5 text-sm text-emerald-900">
                      <span className="font-semibold">答案：</span>
                      <MathHtml className="inline whitespace-pre-wrap">{question.answer}</MathHtml>
                    </div>
                    {question.analysis && (
                      <div className="rounded-md border border-gold-200 bg-gold-50/30 p-2.5 text-xs leading-5 text-ink-700">
                        <span className="font-semibold text-gold-700">解析：</span>
                        <MathHtml className="inline whitespace-pre-wrap">{question.analysis}</MathHtml>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
