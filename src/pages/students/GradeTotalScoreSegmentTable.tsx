import { useMemo, useState } from "react";
import { Download, RotateCcw, SlidersHorizontal, Table2 } from "lucide-react";
import type {
  GradeExam,
  GradeExamSettings,
  GradeImportContext,
  GradeStatisticsTemplate,
} from "@/types";
import {
  buildGradeTotalScoreSegmentReport,
  DEFAULT_TOTAL_SCORE_SEGMENT_MAX,
  DEFAULT_TOTAL_SCORE_SEGMENT_MIN,
  DEFAULT_TOTAL_SCORE_SEGMENT_SIZE,
} from "@/lib/grade-total-score-segment";
import { exportGradeTotalScoreSegmentReport } from "@/lib/grade-spreadsheet";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { EmptyState } from "@/components/ui/EmptyState";
import { toast } from "@/stores/ui";

interface GradeTotalScoreSegmentTableProps {
  exam: GradeExam;
  settings: GradeExamSettings;
  template: GradeStatisticsTemplate;
  classAverageTemplate?: GradeStatisticsTemplate;
  context: GradeImportContext;
  onChange: (settings: GradeExamSettings) => void;
}

export function GradeTotalScoreSegmentTable({
  exam,
  settings,
  template,
  classAverageTemplate,
  context,
  onChange,
}: GradeTotalScoreSegmentTableProps) {
  const [adjusting, setAdjusting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const effectiveTemplate = useMemo(
    () => settings.templates.find((item) => item.id === template.id) || template,
    [settings.templates, template],
  );
  const effectiveClassAverageTemplate = useMemo(() => (
    classAverageTemplate
      ? settings.templates.find((item) => item.id === classAverageTemplate.id) || classAverageTemplate
      : undefined
  ), [classAverageTemplate, settings.templates]);
  const report = useMemo(
    () => buildGradeTotalScoreSegmentReport(
      exam,
      effectiveTemplate,
      context,
      effectiveClassAverageTemplate,
    ),
    [context, effectiveClassAverageTemplate, effectiveTemplate, exam],
  );

  const updateTemplate = (patch: Partial<GradeStatisticsTemplate>) => {
    onChange({
      ...settings,
      templates: settings.templates.map((item) => item.id === effectiveTemplate.id
        ? { ...item, ...patch }
        : item),
    });
  };

  const reset = () => {
    updateTemplate({
      segmentMax: DEFAULT_TOTAL_SCORE_SEGMENT_MAX,
      segmentMin: DEFAULT_TOTAL_SCORE_SEGMENT_MIN,
      segmentSize: DEFAULT_TOTAL_SCORE_SEGMENT_SIZE,
    });
    toast.success("已恢复默认分数段");
  };

  const exportReport = async () => {
    setExporting(true);
    try {
      await exportGradeTotalScoreSegmentReport(report);
      toast.success("总分分数段汇总表已导出");
    } catch (error) {
      toast.error("导出失败", error instanceof Error ? error.message : undefined);
    } finally {
      setExporting(false);
    }
  };

  return (
    <Card className="overflow-hidden p-0">
      <div className="flex flex-col gap-3 border-b border-ink-100 px-5 py-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-emerald-50 p-2 text-emerald-700">
            <Table2 className="h-4 w-4" />
          </div>
          <div>
            <div className="font-medium text-ink-900">总分分数段汇总表</div>
            <div className="mt-0.5 text-xs text-ink-500">
              按班级横向汇总达到各总分阈值的累计人数；班级顺序、简称和隐藏状态与上方班级平均分表保持一致。
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setAdjusting((value) => !value)}>
            <SlidersHorizontal className="h-3.5 w-3.5" />
            {adjusting ? "收起调整" : "调整分数段"}
          </Button>
          <Button variant="outline" size="sm" onClick={exportReport} loading={exporting} disabled={report.classes.length === 0}>
            <Download className="h-3.5 w-3.5" />导出 Excel
          </Button>
        </div>
      </div>

      {adjusting && (
        <div className="border-b border-ink-100 bg-ink-50/40 p-5">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[12rem_12rem_12rem_auto] lg:items-end">
            <Input
              label="最高分值"
              type="number"
              min={0}
              max={2000}
              value={effectiveTemplate.segmentMax ?? DEFAULT_TOTAL_SCORE_SEGMENT_MAX}
              onChange={(event) => updateTemplate({ segmentMax: Number(event.target.value) })}
            />
            <Input
              label="最低分值"
              type="number"
              min={0}
              max={2000}
              value={effectiveTemplate.segmentMin ?? DEFAULT_TOTAL_SCORE_SEGMENT_MIN}
              onChange={(event) => updateTemplate({ segmentMin: Number(event.target.value) })}
            />
            <Input
              label="分数间隔"
              type="number"
              min={1}
              max={500}
              value={effectiveTemplate.segmentSize ?? DEFAULT_TOTAL_SCORE_SEGMENT_SIZE}
              onChange={(event) => updateTemplate({ segmentSize: Number(event.target.value) })}
            />
            <Button variant="ghost" size="sm" onClick={reset}>
              <RotateCcw className="h-3.5 w-3.5" />恢复默认
            </Button>
          </div>
          <div className="mt-2 text-xs text-ink-400">
            默认从 700 分递减到 400 分，每 10 分一档；每行统计总分大于等于该阈值的学生人数。
          </div>
        </div>
      )}

      {report.classes.length === 0 ? (
        <EmptyState
          icon={<Table2 className="h-8 w-8" />}
          title="当前考试没有可统计的班级成绩"
          description="请检查上传成绩中的班级匹配，或在上方班级平均分表中重新显示班级。"
        />
      ) : (
        <div className="overflow-x-auto p-5">
          <div className="mb-3 flex min-w-[640px] items-end justify-between gap-4 px-1">
            <h3 className="font-serif text-lg font-semibold text-ink-900">{report.title}</h3>
            <div className="shrink-0 text-sm font-medium text-ink-600">{report.reportDate.replace(/-/g, ".")}</div>
          </div>
          <table
            className="w-full border-collapse text-xs"
            style={{ minWidth: Math.max(640, 150 + report.classes.length * 88) }}
          >
            <thead>
              <tr className="bg-ink-50 text-ink-700">
                <th className="sticky left-0 z-10 border border-ink-300 bg-ink-50 px-3 py-2 text-center font-semibold">
                  总分分数段
                </th>
                {report.classes.map((classItem) => (
                  <th key={classItem.classId} className="border border-ink-300 px-3 py-2 text-center font-semibold">
                    {classItem.classLabel}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {report.rows.map((row) => (
                <tr key={row.threshold} className="bg-paper">
                  <th className="sticky left-0 z-[5] border border-ink-300 bg-paper px-3 py-2 text-center font-semibold text-ink-800">
                    {row.threshold}分以上
                  </th>
                  {report.classes.map((classItem) => (
                    <td
                      key={classItem.classId}
                      className="border border-ink-300 px-3 py-2 text-center font-semibold tabular-nums text-ink-900"
                    >
                      {row.counts[classItem.classId] || 0}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
