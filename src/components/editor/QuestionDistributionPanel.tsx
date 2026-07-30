import { BarChart3, Brain } from "lucide-react";
import { Card } from "@/components/ui/Card";
import type { Question, TreeNode } from "@/types";
import { cn } from "@/lib/utils";

const difficultyLabels = ["", "简单", "较易", "中等", "较难", "困难"];

function collectNodeNames(root: TreeNode | null): Map<string, string> {
  const result = new Map<string, string>();
  if (!root) return result;

  const visit = (node: TreeNode) => {
    result.set(node.id, node.name);
    node.children.forEach(visit);
  };
  visit(root);
  return result;
}

interface QuestionDistributionPanelProps {
  questions: Array<Pick<Question, "difficulty" | "knowledgePointIds">>;
  knowledgeTree?: TreeNode | null;
  className?: string;
}

export function QuestionDistributionPanel({
  questions,
  knowledgeTree = null,
  className,
}: QuestionDistributionPanelProps) {
  const difficultyCounts = [0, 0, 0, 0, 0, 0];
  const knowledgeCounts = new Map<string, number>();
  const knowledgeNames = collectNodeNames(knowledgeTree);

  questions.forEach((question) => {
    difficultyCounts[question.difficulty] += 1;
    question.knowledgePointIds.forEach((pointId) => {
      knowledgeCounts.set(pointId, (knowledgeCounts.get(pointId) || 0) + 1);
    });
  });

  const topKnowledgePoints = Array.from(knowledgeCounts.entries())
    .map(([id, count]) => ({ id, count, name: knowledgeNames.get(id) || "未命名知识点" }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "zh-CN"))
    .slice(0, 6);
  const maxKnowledgeCount = Math.max(1, ...topKnowledgePoints.map((item) => item.count));

  return (
    <Card className={cn("p-4 space-y-4", className)}>
      <div className="flex items-center gap-2">
        <BarChart3 className="w-4 h-4 text-gold-600" />
        <h3 className="font-serif font-semibold text-ink-900 text-sm">题目分布</h3>
        <span className="text-xs text-ink-400">{questions.length} 题</span>
      </div>

      <div>
        <div className="text-xs font-medium text-ink-600 mb-2">难易分布</div>
        <div className="space-y-1.5">
          {[1, 2, 3, 4, 5].map((difficulty) => {
            const count = difficultyCounts[difficulty];
            const percentage = questions.length > 0 ? (count / questions.length) * 100 : 0;
            return (
              <div key={difficulty} className="grid grid-cols-[44px_1fr_24px] items-center gap-2 text-[11px]">
                <span className="text-ink-500">{difficultyLabels[difficulty]}</span>
                <div className="h-1.5 rounded-full bg-ink-100 overflow-hidden">
                  <div
                    className={cn(
                      "h-full rounded-full",
                      difficulty <= 2 ? "bg-emerald-400" : difficulty === 3 ? "bg-amber-400" : "bg-red-400",
                    )}
                    style={{ width: `${percentage}%` }}
                  />
                </div>
                <span className="font-mono text-right text-ink-600">{count}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="pt-3 border-t border-ink-100">
        <div className="flex items-center gap-1.5 text-xs font-medium text-ink-600 mb-2">
          <Brain className="w-3.5 h-3.5 text-teal-500" />
          知识点分布
        </div>
        {topKnowledgePoints.length === 0 ? (
          <div className="text-xs text-ink-400 py-2">题目尚未关联知识点</div>
        ) : (
          <div className="space-y-2">
            {topKnowledgePoints.map((item) => (
              <div key={item.id}>
                <div className="flex items-center justify-between gap-2 text-[11px] mb-1">
                  <span className="text-ink-600 truncate" title={item.name}>{item.name}</span>
                  <span className="font-mono text-ink-500 flex-shrink-0">{item.count}</span>
                </div>
                <div className="h-1 rounded-full bg-ink-100 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-teal-400"
                    style={{ width: `${(item.count / maxKnowledgeCount) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}
