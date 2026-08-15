import { AlertCircle, BookOpen, CheckCircle2, Circle, XCircle } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/Card";
import { cn } from "@/lib/utils";
import type { ChapterMastery } from "./student-learning-chapters";

const masteryConfig: Record<
  ChapterMastery["masteryLevel"],
  { label: string; color: string; bg: string; icon: typeof CheckCircle2 }
> = {
  mastered: { label: "已掌握", color: "text-emerald-600", bg: "bg-emerald-50 border-emerald-200", icon: CheckCircle2 },
  basic: { label: "基本掌握", color: "text-amber-600", bg: "bg-amber-50 border-amber-200", icon: AlertCircle },
  weak: { label: "薄弱", color: "text-red-600", bg: "bg-red-50 border-red-200", icon: XCircle },
  untrained: { label: "未训练", color: "text-ink-400", bg: "bg-mist border-ink-200", icon: Circle },
};

export function ChapterMasteryCard({ mastery }: { mastery: ChapterMastery[] }) {
  const trainedCount = mastery.filter((item) => item.totalAttempts > 0).length;

  return (
    <Card>
      <CardHeader
        title="章节课训练与掌握情况"
        subtitle={`共 ${mastery.length} 个章节课，已训练 ${trainedCount} 个`}
        action={<BookOpen className="w-4 h-4 text-gold-600" />}
      />
      {mastery.length === 0 ? (
        <div className="text-center py-8 text-sm text-ink-400">暂无章节课数据</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink-100 text-xs text-ink-500">
                <th className="text-left py-2 px-3 font-medium">章节课</th>
                <th className="text-center py-2 px-3 font-medium">训练次数</th>
                <th className="text-center py-2 px-3 font-medium">全对</th>
                <th className="text-center py-2 px-3 font-medium">半对</th>
                <th className="text-center py-2 px-3 font-medium">做错</th>
                <th className="text-center py-2 px-3 font-medium">正确率</th>
                <th className="text-center py-2 px-3 font-medium">掌握状态</th>
              </tr>
            </thead>
            <tbody>
              {mastery.map((item) => {
                const cfg = masteryConfig[item.masteryLevel];
                const MasteryIcon = cfg.icon;
                const parentPath = item.chapterPath.slice(0, -1).join(" \\ ");
                return (
                  <tr key={item.chapterId} className="border-b border-ink-50 hover:bg-mist/50 transition-colors">
                    <td className="py-2.5 px-3 text-ink-900 font-medium">
                      <div className="min-w-[180px]" style={{ paddingLeft: `${Math.max(item.level, 0) * 16}px` }}>
                        <div className="whitespace-nowrap">{item.chapterName}</div>
                        {parentPath && (
                          <div className="mt-0.5 text-[10px] font-normal text-ink-400">{parentPath}</div>
                        )}
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-center font-mono text-ink-700">{item.totalAttempts}</td>
                    <td className="py-2.5 px-3 text-center">
                      {item.correctCount > 0 ? <span className="text-emerald-600 font-mono">{item.correctCount}</span> : <span className="text-ink-300">—</span>}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      {item.partialCount > 0 ? <span className="text-amber-600 font-mono">{item.partialCount}</span> : <span className="text-ink-300">—</span>}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      {item.wrongCount > 0 ? <span className="text-red-600 font-mono">{item.wrongCount}</span> : <span className="text-ink-300">—</span>}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      {item.totalAttempts > 0 ? (
                        <div className="flex items-center justify-center gap-1.5">
                          <div className="w-12 h-1.5 bg-ink-100 rounded-full overflow-hidden">
                            <div
                              className={cn(
                                "h-full rounded-full",
                                item.correctRate >= 0.8 ? "bg-emerald-400" : item.correctRate >= 0.6 ? "bg-amber-400" : "bg-red-400",
                              )}
                              style={{ width: `${item.correctRate * 100}%` }}
                            />
                          </div>
                          <span className="font-mono text-xs text-ink-600">{Math.round(item.correctRate * 100)}%</span>
                        </div>
                      ) : (
                        <span className="text-ink-300 text-xs">—</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] border", cfg.bg, cfg.color)}>
                        <MasteryIcon className="w-3 h-3" />
                        {cfg.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
