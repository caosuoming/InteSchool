import { useState, type ReactNode } from "react";
import {
  ChevronDown,
  ChevronUp,
  Edit3,
  GripVertical,
  ListOrdered,
  Sparkles,
  Trash2,
  Type,
} from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { MathHtml } from "@/components/ui/MathHtml";
import { cn, getOptionsGridCols } from "@/lib/utils";
import type { LectureSection, Question } from "@/types";

interface LectureSectionEditorRowProps {
  section: LectureSection;
  index: number;
  question?: Question;
  answered?: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onLabelChange: (label: string) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onEditSection: () => void;
  onReplaceQuestion?: () => void;
  onRemove: () => void;
  readOnly?: boolean;
  dragHandle?: ReactNode;
}

const sectionLabels: Record<LectureSection["type"], string> = {
  chapter: "栏目",
  knowledge: "知识块",
  question: "题目",
  text: "文本",
};

export function LectureSectionEditorRow({
  section,
  index,
  question,
  answered = false,
  canMoveUp,
  canMoveDown,
  onLabelChange,
  onMoveUp,
  onMoveDown,
  onEditSection,
  onReplaceQuestion,
  onRemove,
  readOnly = false,
  dragHandle,
}: LectureSectionEditorRowProps) {
  const [showAnswer, setShowAnswer] = useState(false);
  const Icon = section.type === "question"
    ? ListOrdered
    : section.type === "knowledge"
      ? Sparkles
      : Type;

  return (
    <article className="overflow-hidden rounded-lg border border-ink-100 bg-paper transition-colors hover:border-ink-200">
      <div className="flex flex-wrap items-center gap-2 border-b border-ink-100 bg-ink-50/60 px-3 py-2">
        {!readOnly && (dragHandle || <GripVertical className="h-4 w-4 flex-shrink-0 text-ink-300" aria-hidden="true" />)}
        <Badge variant={section.type === "question" ? "teal" : section.type === "knowledge" ? "gold" : "ink"}>
          {sectionLabels[section.type]}
        </Badge>

        {section.type === "question" && !readOnly && (
          <div className="flex w-36 items-center gap-1.5">
            <span className="flex-shrink-0 text-xs text-ink-500">题号</span>
            <Input
              aria-label={`题目编号：${section.title}`}
              value={section.customLabel || ""}
              onChange={(event) => onLabelChange(event.target.value)}
              placeholder={`${index + 1}.`}
              className="h-8 px-2 py-1 text-xs"
            />
          </div>
        )}

        {section.type !== "question" && (
          <div className="min-w-[10rem] flex-1 truncate text-sm font-medium text-ink-800">
            {section.title}
          </div>
        )}
        {answered && <span className="tag-gold text-[10px] py-0.5">已做过</span>}

        {!readOnly && <div className="ml-auto flex items-center gap-0.5">
          <button
            type="button"
            onClick={onMoveUp}
            disabled={!canMoveUp}
            className="rounded p-1 text-ink-400 hover:bg-gold-50 hover:text-gold-700 disabled:opacity-25"
            title="上移"
          >
            <ChevronUp className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onMoveDown}
            disabled={!canMoveDown}
            className="rounded p-1 text-ink-400 hover:bg-gold-50 hover:text-gold-700 disabled:opacity-25"
            title="下移"
          >
            <ChevronDown className="h-4 w-4" />
          </button>
          {section.type === "question" && question && onReplaceQuestion && (
            <button
              type="button"
              onClick={onReplaceQuestion}
              className="rounded px-2 py-1 text-xs text-teal-600 hover:bg-teal-50 hover:text-teal-700"
            >
              换题
            </button>
          )}
          {section.type !== "question" && (
            <button
              type="button"
              onClick={onEditSection}
              className="rounded p-1 text-ink-400 hover:bg-gold-50 hover:text-gold-700"
              title="编辑内容块"
            >
              <Edit3 className="h-4 w-4" />
            </button>
          )}
          <button
            type="button"
            onClick={onRemove}
            className="rounded p-1 text-ink-400 hover:bg-red-50 hover:text-red-600"
            title="删除内容块"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>}
      </div>

      <div className="px-4 py-3">
        {section.type === "question" ? (
          question ? (
            <div className="space-y-2">
              <MathHtml className="whitespace-pre-wrap text-sm leading-relaxed text-ink-900">
                {question.stem}
              </MathHtml>
              {section.displayMode !== "stem-only" && question.options && question.options.length > 0 && (
                <div className={cn("grid gap-2 text-xs text-ink-700", getOptionsGridCols(question.options.length))}>
                  {question.options.map((option, optionIndex) => (
                    <div key={optionIndex} className="flex min-w-0 items-start gap-1 rounded border border-ink-100 px-2 py-1.5">
                      <span className="font-mono font-semibold text-ink-500">
                        {String.fromCharCode(65 + optionIndex)}.
                      </span>
                      <MathHtml className="min-w-0 flex-1 break-all">{option}</MathHtml>
                    </div>
                  ))}
                </div>
              )}
              {section.displayMode !== "stem-only" && (
                <button
                  type="button"
                  onClick={() => setShowAnswer((previous) => !previous)}
                  className="text-xs text-teal-600 hover:text-teal-700"
                >
                  {showAnswer ? "收起答案与解析" : "查看答案与解析"}
                </button>
              )}
              {section.displayMode !== "stem-only" && showAnswer && (
                <div className="space-y-2">
                  <div className="rounded border border-emerald-200 bg-emerald-50/40 p-2 text-xs text-ink-800">
                    <span className="font-medium text-emerald-700">答案：</span>
                    <MathHtml className="question-answer-content mt-1">{question.answer}</MathHtml>
                  </div>
                  <div className="rounded border border-gold-200 bg-gold-50/30 p-2 text-xs text-ink-800">
                    <span className="font-medium text-gold-700">解析：</span>
                    <MathHtml className="mt-1">{question.analysis}</MathHtml>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-xs text-ink-400">题目加载中...</div>
          )
        ) : (
          <div className="whitespace-pre-wrap text-sm leading-relaxed text-ink-700">
            {section.content || <span className="text-ink-400">暂无内容</span>}
          </div>
        )}
      </div>
    </article>
  );
}
