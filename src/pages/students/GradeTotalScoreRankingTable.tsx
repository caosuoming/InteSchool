import { useMemo, useRef, useState } from "react";
import { Download, Trophy } from "lucide-react";
import type {
  GradeExam,
  GradeExamSettings,
  GradeImportContext,
  GradeStatisticsTemplate,
} from "@/types";
import {
  buildGradeTotalScoreRankingReport,
  DEFAULT_TOTAL_SCORE_TOP_N,
} from "@/lib/grade-total-score-ranking";
import { exportGradeTotalScoreRankingReport } from "@/lib/grade-spreadsheet";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { EmptyState } from "@/components/ui/EmptyState";
import { toast } from "@/stores/ui";
import { useAuthStore } from "@/stores/auth";
import { quotaService } from "@/services/quota";

interface GradeTotalScoreRankingTableProps {
  exam: GradeExam;
  settings: GradeExamSettings;
  template: GradeStatisticsTemplate;
  classAverageTemplate?: GradeStatisticsTemplate;
  context: GradeImportContext;
  onChange: (settings: GradeExamSettings) => void;
  onAutoSave?: (settings: GradeExamSettings) => Promise<void> | void;
}

export function GradeTotalScoreRankingTable({
  exam,
  settings,
  template,
  classAverageTemplate,
  context,
  onChange,
  onAutoSave,
}: GradeTotalScoreRankingTableProps) {
  const [exporting, setExporting] = useState(false);
  const [autoSaving, setAutoSaving] = useState(false);
  const latestSettings = useRef(settings);
  latestSettings.current = settings;
  const effectiveTemplate = useMemo(
    () => settings.templates.find((item) => item.id === template.id) || template,
    [settings.templates, template],
  );
  const effectiveClassAverageTemplate = useMemo(() => (
    classAverageTemplate
      ? settings.templates.find((item) => item.id === classAverageTemplate.id) || classAverageTemplate
      : undefined
  ), [classAverageTemplate, settings.templates]);
  const report = useMemo(() => buildGradeTotalScoreRankingReport(
    exam,
    effectiveTemplate,
    context,
    effectiveClassAverageTemplate,
  ), [context, effectiveClassAverageTemplate, effectiveTemplate, exam]);

  const updateTopN = (value: string) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return;
    const topN = Math.max(1, Math.min(1000, Math.round(parsed)));
    const options = effectiveTemplate.totalScoreSegmentOptions || {};
    const nextSettings: GradeExamSettings = {
      ...settings,
      templates: settings.templates.map((item) => item.id === effectiveTemplate.id
        ? {
            ...item,
            totalScoreSegmentOptions: {
              ...options,
              totalScoreTopN: topN,
            },
          }
        : item),
    };
    latestSettings.current = nextSettings;
    onChange(nextSettings);
  };

  const autoSave = async () => {
    if (!onAutoSave) return;
    setAutoSaving(true);
    try {
      await onAutoSave(latestSettings.current);
    } finally {
      setAutoSaving(false);
    }
  };

  const exportReport = async () => {
    setExporting(true);
    try {
      const teacherId = useAuthStore.getState().teacher?.id;
      if (!teacherId) throw new Error("请先登录");
      await quotaService.consumeExamUsage(teacherId, "gradeStatistics");
      await exportGradeTotalScoreRankingReport(report);
      toast.success("总分前 N 名已导出");
    } catch (error) {
      toast.error("导出失败", error instanceof Error ? error.message : undefined);
    } finally {
      setExporting(false);
    }
  };

  const hasRows = report.tables.some((table) => table.rows.length > 0);

  return (
    <Card className="overflow-hidden p-0">
      <div className="flex flex-col gap-3 border-b border-ink-100 px-5 py-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-amber-50 p-2 text-amber-700">
            <Trophy className="h-4 w-4" />
          </div>
          <div>
            <div className="font-medium text-ink-900">表五、总分前{report.topN}名（{report.scoreModeLabel}）</div>
            <div className="mt-0.5 text-xs text-ink-500">
              文理科均存在且所有学生都能识别科类时分别排名，否则按全年级统一排名；总分类型与表二保持一致。
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="w-28">
            <Input
              label="前多少名"
              aria-label="表五前多少名"
              type="number"
              min={1}
              max={1000}
              defaultValue={effectiveTemplate.totalScoreSegmentOptions?.totalScoreTopN ?? DEFAULT_TOTAL_SCORE_TOP_N}
              onBlur={(event) => {
                updateTopN(event.target.value);
                void autoSave();
              }}
            />
          </div>
          <Button variant="outline" size="sm" onClick={exportReport} loading={exporting} disabled={!hasRows}>
            <Download className="h-3.5 w-3.5" />导出 Excel
          </Button>
        </div>
      </div>

      {!hasRows ? (
        <EmptyState
          icon={<Trophy className="h-8 w-8" />}
          title="当前考试没有可排名的成绩"
          description="请先导入学生成绩。"
        />
      ) : (
        <div className="space-y-8 p-5">
          {report.tables.map((rankingTable) => (
            <section key={rankingTable.key} className="overflow-x-auto">
              <div className="mb-3 flex min-w-max items-end justify-between gap-4 px-1">
                <h3 className="font-serif text-lg font-semibold text-ink-900">{rankingTable.title}</h3>
                <div className="shrink-0 text-sm font-medium text-ink-600">{report.reportDate.replace(/-/g, ".")}</div>
              </div>
              <table className="w-max min-w-full table-auto border-collapse text-[11px]">
                <thead>
                  <tr className="bg-ink-50 text-ink-700">
                    <th className="whitespace-nowrap border border-ink-300 px-3 py-1.5 text-center font-semibold">名次</th>
                    <th className="whitespace-nowrap border border-ink-300 px-3 py-1.5 text-center font-semibold">学号</th>
                    <th className="whitespace-nowrap border border-ink-300 px-3 py-1.5 text-center font-semibold">姓名</th>
                    <th className="whitespace-nowrap border border-ink-300 px-3 py-1.5 text-center font-semibold">班级</th>
                    <th className="whitespace-nowrap border border-ink-300 px-3 py-1.5 text-center font-semibold">总分（{report.scoreModeLabel}）</th>
                  </tr>
                </thead>
                <tbody>
                  {rankingTable.rows.map((row) => (
                    <tr key={`${rankingTable.key}-${row.studentId}`} className="bg-paper">
                      <td className="border border-ink-300 px-3 py-1.5 text-center font-semibold tabular-nums">{row.rank}</td>
                      <td className="border border-ink-300 px-3 py-1.5 text-center tabular-nums">{row.studentNo || "—"}</td>
                      <td className="border border-ink-300 px-3 py-1.5 text-center font-medium text-ink-800">{row.studentName}</td>
                      <td className="border border-ink-300 px-3 py-1.5 text-center">{row.classLabel}</td>
                      <td className="border border-ink-300 px-3 py-1.5 text-center font-semibold tabular-nums">{row.score}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ))}
          {autoSaving && <div className="text-xs text-emerald-700">正在自动保存表五名次数…</div>}
        </div>
      )}
    </Card>
  );
}
