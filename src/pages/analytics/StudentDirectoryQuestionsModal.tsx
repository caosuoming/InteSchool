import { useEffect, useState } from "react";
import {
  ArrowDownToLine,
  ArrowUpToLine,
  Calendar,
  FileText,
  Minus,
} from "lucide-react";
import { AddToBasketDropdown } from "@/components/basket/AddToBasketDropdown";
import { ExpandableQuestionContent } from "@/components/resource/ExpandableQuestionContent";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { Spinner } from "@/components/ui/Spinner";
import type { StudentAnswerDetail } from "@/services/analytics";
import type { AnswerScore, Question } from "@/types";
import { formatDate } from "@/lib/service-utils";
import { cn } from "@/lib/utils";
import type { LearningTreePlacement } from "./student-learning-tree";

export type StudentQuestionDirectory = {
  view: "chapter" | "knowledge";
  id: string;
  name: string;
};

type QuestionListMode = "answered" | "unanswered";

const questionTypeLabel: Record<string, string> = {
  single: "单选",
  multiple: "多选",
  judge: "判断",
  short: "填空",
  essay: "解答",
};

const scoreConfig: Record<AnswerScore, { label: string; bg: string }> = {
  correct: { label: "全对", bg: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  partial: { label: "半对", bg: "bg-amber-50 text-amber-700 border-amber-200" },
  wrong: { label: "做错", bg: "bg-red-50 text-red-700 border-red-200" },
  done: { label: "已做", bg: "bg-teal-50 text-teal-700 border-teal-200" },
};

const placementOptions: Array<{
  value: LearningTreePlacement;
  label: string;
  icon: typeof ArrowUpToLine;
}> = [
  { value: "top", label: "置顶", icon: ArrowUpToLine },
  { value: "normal", label: "正常", icon: Minus },
  { value: "bottom", label: "沉底", icon: ArrowDownToLine },
];

interface StudentDirectoryQuestionsModalProps {
  directory: StudentQuestionDirectory | null;
  placement: LearningTreePlacement;
  answeredDetails: StudentAnswerDetail[];
  unansweredQuestions: Question[];
  loadingQuestions: boolean;
  onPlacementChange: (placement: LearningTreePlacement) => void;
  onClose: () => void;
}

export function StudentDirectoryQuestionsModal({
  directory,
  placement,
  answeredDetails,
  unansweredQuestions,
  loadingQuestions,
  onPlacementChange,
  onClose,
}: StudentDirectoryQuestionsModalProps) {
  const [mode, setMode] = useState<QuestionListMode>("answered");
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  useEffect(() => {
    setMode("answered");
    setExpandedRows(new Set());
  }, [directory?.view, directory?.id]);

  const toggleExpanded = (rowKey: string) => {
    setExpandedRows((previous) => {
      const next = new Set(previous);
      if (next.has(rowKey)) next.delete(rowKey);
      else next.add(rowKey);
      return next;
    });
  };

  return (
    <Modal
      open={directory !== null}
      onClose={onClose}
      title={directory?.name ?? "目录题目"}
      description={directory?.view === "chapter" ? "章节课目录题目" : "知识点目录题目"}
      size="lg"
      className="max-h-[85vh]"
    >
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-2" aria-label="目录排序">
          {placementOptions.map((option) => {
            const Icon = option.icon;
            const active = placement === option.value;
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={active}
                onClick={() => onPlacementChange(option.value)}
                className={cn(
                  "inline-flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "border-gold-300 bg-gold-50 text-gold-700"
                    : "border-ink-200 bg-paper text-ink-600 hover:bg-mist",
                )}
              >
                <Icon className="h-4 w-4" />
                {option.label}
              </button>
            );
          })}
        </div>

        <div className="border-b border-ink-100" role="tablist" aria-label="目录题目状态">
          <div className="flex gap-5">
            <button
              type="button"
              role="tab"
              aria-selected={mode === "answered"}
              onClick={() => setMode("answered")}
              className={cn(
                "border-b-2 px-1 pb-2 text-sm font-medium transition-colors",
                mode === "answered"
                  ? "border-gold-400 text-gold-700"
                  : "border-transparent text-ink-500 hover:text-ink-700",
              )}
            >
              已做题（{answeredDetails.length}）
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "unanswered"}
              onClick={() => setMode("unanswered")}
              className={cn(
                "border-b-2 px-1 pb-2 text-sm font-medium transition-colors",
                mode === "unanswered"
                  ? "border-gold-400 text-gold-700"
                  : "border-transparent text-ink-500 hover:text-ink-700",
              )}
            >
              未做题（{unansweredQuestions.length}）
            </button>
          </div>
        </div>

        {mode === "answered" ? (
          answeredDetails.length === 0 ? (
            <div className="py-10 text-center text-sm text-ink-400">该目录下暂无已做题</div>
          ) : (
            <div className="space-y-2">
              {answeredDetails.map((detail) => {
                const { record, question, lectureTitle } = detail;
                const score = record.score || (record.isCorrect ? "correct" : "wrong");
                const scoreStyle = scoreConfig[score];
                const rowKey = `answered:${record.id}`;
                return (
                  <div
                    key={record.id}
                    className="rounded-lg border border-ink-100 p-3 transition-colors hover:bg-mist/30"
                  >
                    <div className="flex items-start gap-3">
                      <div className={cn("mt-0.5 flex-shrink-0 rounded border px-2 py-1 text-[10px] font-medium", scoreStyle.bg)}>
                        {scoreStyle.label}
                      </div>
                      <div className="min-w-0 flex-1">
                        {question ? (
                          <>
                            <div className="mb-1 flex items-center justify-between gap-3">
                              <div className="flex items-center gap-1.5">
                                <Badge variant="default">{questionTypeLabel[question.type] || question.type}</Badge>
                                <span className="text-[10px] text-ink-400">
                                  难度：{"★".repeat(question.difficulty)}
                                </span>
                              </div>
                              <AddToBasketDropdown
                                resourceType="question"
                                resourceId={question.id}
                                resourceTitle={question.stem}
                                variant="outline"
                                quickLabel="加入资源篮"
                              />
                            </div>
                            <ExpandableQuestionContent
                              question={question}
                              expanded={expandedRows.has(rowKey)}
                              onToggle={() => toggleExpanded(rowKey)}
                            />
                            <div className="flex flex-wrap items-center gap-3 text-xs text-ink-400">
                              {lectureTitle && (
                                <span className="flex items-center gap-1">
                                  <FileText className="h-3 w-3" />
                                  {lectureTitle}
                                </span>
                              )}
                              <span className="ml-auto flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                {formatDate(record.answeredAt, true)}
                              </span>
                            </div>
                          </>
                        ) : (
                          <div className="text-sm text-ink-500">题目已删除（ID: {record.questionId}）</div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        ) : loadingQuestions ? (
          <div className="flex justify-center py-10">
            <Spinner size={20} />
          </div>
        ) : unansweredQuestions.length === 0 ? (
          <div className="py-10 text-center text-sm text-ink-400">该目录下暂无未做题</div>
        ) : (
          <div className="space-y-2">
            {unansweredQuestions.map((question) => {
              const rowKey = `unanswered:${question.id}`;
              return (
                <div
                  key={question.id}
                  className="rounded-lg border border-ink-100 p-3 transition-colors hover:bg-mist/30"
                >
                  <div className="mb-1 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-1.5">
                      <Badge variant="default">{questionTypeLabel[question.type] || question.type}</Badge>
                      <span className="text-[10px] text-ink-400">
                        难度：{"★".repeat(question.difficulty)}
                      </span>
                    </div>
                    <AddToBasketDropdown
                      resourceType="question"
                      resourceId={question.id}
                      resourceTitle={question.stem}
                      variant="outline"
                      quickLabel="加入资源篮"
                    />
                  </div>
                  <ExpandableQuestionContent
                    question={question}
                    expanded={expandedRows.has(rowKey)}
                    onToggle={() => toggleExpanded(rowKey)}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Modal>
  );
}

export default StudentDirectoryQuestionsModal;
