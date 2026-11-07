import type { QuestionAnnotationSummary as QuestionAnnotationSummaryData } from "@/types";

export function QuestionAnnotationSummary({ summary }: { summary?: QuestionAnnotationSummaryData }) {
  if (!summary) return null;
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-500" aria-label="题目属性缺失统计">
      <span>缺章节课 <span className={summary.missingChapterCount ? "font-medium text-amber-700" : "text-ink-500"}>{summary.missingChapterCount}</span> 题</span>
      <span>缺知识点 <span className={summary.missingKnowledgePointCount ? "font-medium text-amber-700" : "text-ink-500"}>{summary.missingKnowledgePointCount}</span> 题</span>
    </div>
  );
}
