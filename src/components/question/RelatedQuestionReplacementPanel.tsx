import { useEffect, useMemo, useState } from "react";

import { MathHtml } from "@/components/ui/MathHtml";
import { Spinner } from "@/components/ui/Spinner";
import { groupRelatedQuestions, type RelatedQuestionGroupKey } from "@/lib/related-question-groups";
import { cn } from "@/lib/utils";
import { questionService } from "@/services/question";
import type { Question } from "@/types";

interface RelatedQuestionReplacementPanelProps {
  question: Question;
  schoolId: string;
  excludedQuestionIds?: ReadonlySet<string>;
  onReplace: (question: Question) => void;
  disabled?: boolean;
  className?: string;
}

const groupMeta: Array<{
  key: RelatedQuestionGroupKey;
  label: string;
  description: string;
}> = [
  {
    key: "foundation",
    label: "基础题",
    description: "候选题的全部知识点都包含在原题知识点中",
  },
  {
    key: "same",
    label: "同类题",
    description: "候选题与原题的知识点完全一致",
  },
  {
    key: "extension",
    label: "拓展题",
    description: "候选题包含原题的全部知识点，并增加其它知识点",
  },
];

export function RelatedQuestionReplacementPanel({
  question,
  schoolId,
  excludedQuestionIds = new Set(),
  onReplace,
  disabled = false,
  className,
}: RelatedQuestionReplacementPanelProps) {
  const [activeGroup, setActiveGroup] = useState<RelatedQuestionGroupKey>("same");
  const [expandedGroups, setExpandedGroups] = useState<Set<RelatedQuestionGroupKey>>(new Set());
  const [candidates, setCandidates] = useState<Question[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setActiveGroup("same");
    setExpandedGroups(new Set());
    setCandidates([]);
    setLoadError("");

    if (question.knowledgePointIds.length === 0) return () => { cancelled = true; };

    setLoading(true);
    questionService.listQuestions({
      schoolId,
      knowledgePointIds: question.knowledgePointIds,
    }).then((items) => {
      if (!cancelled) setCandidates(items);
    }).catch((error) => {
      if (!cancelled) {
        setLoadError(error instanceof Error ? error.message : "请稍后重试");
      }
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });

    return () => { cancelled = true; };
  }, [question.id, question.knowledgePointIds, schoolId]);

  const groups = useMemo(
    () => groupRelatedQuestions(question, candidates, excludedQuestionIds),
    [candidates, excludedQuestionIds, question],
  );
  const activeQuestions = groups[activeGroup];
  const activeMeta = groupMeta.find((item) => item.key === activeGroup)!;
  const expanded = expandedGroups.has(activeGroup);
  const visibleQuestions = expanded ? activeQuestions : activeQuestions.slice(0, 2);

  return (
    <div className={cn("space-y-3", className)} data-testid="related-question-replacement-panel">
      <div>
        <div className="font-serif text-sm font-semibold text-ink-900">相关题</div>
        <div className="mt-2 grid grid-cols-3 gap-1 rounded-lg bg-ink-50 p-1" role="tablist" aria-label="相关题分类">
          {groupMeta.map((item) => (
            <button
              key={item.key}
              type="button"
              role="tab"
              aria-selected={activeGroup === item.key}
              onClick={() => setActiveGroup(item.key)}
              className={cn(
                "rounded-md px-2 py-1.5 text-xs font-medium transition-colors",
                activeGroup === item.key
                  ? "bg-paper text-teal-700 shadow-sm"
                  : "text-ink-500 hover:text-ink-800",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="mt-2 text-[11px] leading-5 text-ink-400">{activeMeta.description}</div>
      </div>

      {question.knowledgePointIds.length === 0 ? (
        <div className="rounded-md bg-ink-50 px-2 py-4 text-center text-xs text-ink-400">
          当前题目暂无知识点，无法匹配相关题
        </div>
      ) : loading ? (
        <div className="flex justify-center py-5"><Spinner size={16} /></div>
      ) : loadError ? (
        <div className="rounded-md bg-red-50 px-2 py-3 text-center text-xs text-red-600">
          相关题加载失败：{loadError}
        </div>
      ) : activeQuestions.length === 0 ? (
        <div className="rounded-md bg-ink-50 px-2 py-4 text-center text-xs text-ink-400">
          暂无{activeMeta.label}
        </div>
      ) : (
        <div className="space-y-2">
          {visibleQuestions.map((candidate) => (
            <div key={candidate.id} className="rounded-md border border-ink-100 bg-paper p-2.5">
              <MathHtml className="line-clamp-3 text-xs leading-5 text-ink-800">
                {candidate.stem}
              </MathHtml>
              <div className="mt-2 flex items-center justify-between gap-2">
                <span className="text-[10px] text-ink-400">
                  {candidate.knowledgePointIds.length} 个知识点
                </span>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onReplace(candidate)}
                  className="rounded-md border border-teal-200 px-2 py-1 text-[11px] font-medium text-teal-700 hover:bg-teal-50 disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label={"替换为：" + candidate.stem}
                >
                  替换原题
                </button>
              </div>
            </div>
          ))}
          {activeQuestions.length > 2 && !expanded && (
            <button
              type="button"
              onClick={() => setExpandedGroups((current) => new Set(current).add(activeGroup))}
              className="w-full rounded-md py-1.5 text-xs font-medium text-teal-700 hover:bg-teal-50"
            >
              更多
            </button>
          )}
        </div>
      )}
    </div>
  );
}
