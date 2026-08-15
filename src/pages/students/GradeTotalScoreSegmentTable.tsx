import { useMemo, useRef, useState } from "react";
import { Download, RotateCcw, SlidersHorizontal, Table2 } from "lucide-react";
import type {
  GradeAcademicTrack,
  GradeExam,
  GradeExamSettings,
  GradeImportContext,
  GradeStatisticsTemplate,
  GradeTotalScoreTargetKey,
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
import { useAuthStore } from "@/stores/auth";
import { quotaService } from "@/services/quota";

interface GradeTotalScoreSegmentTableProps {
  exam: GradeExam;
  settings: GradeExamSettings;
  template: GradeStatisticsTemplate;
  classAverageTemplate?: GradeStatisticsTemplate;
  context: GradeImportContext;
  onChange: (settings: GradeExamSettings) => void;
  onAutoSave?: (settings: GradeExamSettings) => Promise<void> | void;
}

const TOTAL_SCORE_STANDARD_LABELS: Array<[GradeTotalScoreTargetKey, string]> = [
  ["highScore1", "高分1"],
  ["highScore2", "高分2"],
  ["firstTier", "一本"],
  ["undergraduate", "二本"],
];

export function GradeTotalScoreSegmentTable({
  exam,
  settings,
  template,
  classAverageTemplate,
  context,
  onChange,
  onAutoSave,
}: GradeTotalScoreSegmentTableProps) {
  const [adjusting, setAdjusting] = useState(false);
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
    const nextSettings = {
      ...settings,
      templates: settings.templates.map((item) => item.id === effectiveTemplate.id
        ? { ...item, ...patch }
        : item),
    };
    latestSettings.current = nextSettings;
    onChange(nextSettings);
    return nextSettings;
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

  const optionalNumber = (value: string, max = 2000, integer = false): number | undefined => {
    if (value.trim() === "") return undefined;
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return undefined;
    const bounded = Math.max(0, Math.min(max, parsed));
    return integer ? Math.round(bounded) : bounded;
  };

  const updateSegmentOptions = (
    patch: Partial<NonNullable<GradeStatisticsTemplate["totalScoreSegmentOptions"]>>,
  ) => updateTemplate({
    totalScoreSegmentOptions: {
      ...effectiveTemplate.totalScoreSegmentOptions,
      ...patch,
    },
  });

  const updateTrackThreshold = (
    track: GradeAcademicTrack,
    targetKey: GradeTotalScoreTargetKey,
    value: string,
  ) => {
    const options = effectiveTemplate.totalScoreSegmentOptions || {};
    updateSegmentOptions({
      trackThresholds: {
        ...options.trackThresholds,
        [track]: {
          ...options.trackThresholds?.[track],
          [targetKey]: optionalNumber(value),
        },
      },
    });
  };

  const trackThresholdValue = (track: GradeAcademicTrack, targetKey: GradeTotalScoreTargetKey) => {
    const options = effectiveTemplate.totalScoreSegmentOptions || {};
    const legacy = {
      highScore1: options.highScore1Threshold,
      highScore2: options.highScore2Threshold,
      firstTier: options.firstTierThreshold,
      undergraduate: options.undergraduateThreshold,
    }[targetKey];
    return options.trackThresholds?.[track]?.[targetKey] ?? legacy ?? "";
  };

  const updateTarget = (
    classId: string,
    targetKey: GradeTotalScoreTargetKey,
    value: string,
  ) => {
    const options = effectiveTemplate.totalScoreSegmentOptions || {};
    updateSegmentOptions({
      classTargets: {
        ...options.classTargets,
        [classId]: {
          ...options.classTargets?.[classId],
          [targetKey]: optionalNumber(value, 10000, true),
        },
      },
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
      const teacherId = useAuthStore.getState().teacher?.id;
      if (!teacherId) throw new Error("请先登录");
      await quotaService.consumeExamUsage(teacherId, "gradeStatistics");
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
            <div className="font-medium text-ink-900">表二、总分分数段汇总表</div>
            <div className="mt-0.5 text-xs text-ink-500">
              按物理类、历史类分组汇总达到各总分阈值的累计人数，并自动生成理科小计、文科小计和总计。
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
        <div
          data-testid="total-score-settings"
          className="sticky top-0 z-30 border-b border-ink-200 bg-paper/95 px-5 py-3 shadow-sm backdrop-blur"
        >
          <div className="overflow-x-auto pb-1">
            <div data-testid="total-score-settings-row" className="flex min-w-max items-end gap-3">
              <div className="w-28">
                <Input
                  label="最高分值"
                  type="number"
                  min={0}
                  max={2000}
                  value={effectiveTemplate.segmentMax ?? DEFAULT_TOTAL_SCORE_SEGMENT_MAX}
                  onChange={(event) => updateTemplate({ segmentMax: Number(event.target.value) })}
                />
              </div>
              <div className="w-28">
                <Input
                  label="最低分值"
                  type="number"
                  min={0}
                  max={2000}
                  value={effectiveTemplate.segmentMin ?? DEFAULT_TOTAL_SCORE_SEGMENT_MIN}
                  onChange={(event) => updateTemplate({ segmentMin: Number(event.target.value) })}
                />
              </div>
              <div className="w-28">
                <Input
                  label="分数间隔"
                  type="number"
                  min={1}
                  max={500}
                  value={effectiveTemplate.segmentSize ?? DEFAULT_TOTAL_SCORE_SEGMENT_SIZE}
                  onChange={(event) => updateTemplate({ segmentSize: Number(event.target.value) })}
                />
              </div>
              <span className="mb-1 h-9 w-px bg-ink-200" aria-hidden="true" />
              {(["science", "arts"] as const).flatMap((track) => ([
                ["highScore1", "高分1"],
                ["highScore2", "高分2"],
                ["firstTier", "一本"],
                ["undergraduate", "二本"],
              ] as const).map(([targetKey, label]) => (
                <div key={`${track}-${targetKey}`} className="w-32">
                  <Input
                    label={`${track === "science" ? "理科" : "文科"}${label}标准`}
                    type="number"
                    min={0}
                    max={2000}
                    value={trackThresholdValue(track, targetKey)}
                    onChange={(event) => updateTrackThreshold(track, targetKey, event.target.value)}
                    onBlur={() => void autoSave()}
                  />
                </div>
              )))}
              <Button variant="ghost" size="sm" onClick={reset}>
                <RotateCcw className="h-3.5 w-3.5" />恢复默认
              </Button>
            </div>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 text-[11px] text-ink-400">
            <span>含物理的选科归入理科，含历史的选科归入文科；两类达线标准分别保存到当前届年级。</span>
            {autoSaving && <span className="text-emerald-700">正在自动保存…</span>}
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
          <div className="mb-3 flex min-w-max items-end justify-between gap-4 px-1">
            <h3 className="font-serif text-lg font-semibold text-ink-900">{report.title}</h3>
            <div className="shrink-0 text-sm font-medium text-ink-600">{report.reportDate.replace(/-/g, ".")}</div>
          </div>
          <table className="w-max min-w-full table-auto border-collapse text-[11px]">
            <thead>
              <tr className="bg-ink-50 text-ink-700">
                <th className="sticky left-0 z-10 whitespace-nowrap border border-ink-300 bg-ink-50 px-2 py-1.5 text-center font-semibold">
                  总分分数段
                </th>
                {report.columns.map((column) => (
                  <th key={column.key} className={`whitespace-nowrap border border-ink-300 px-2 py-1.5 text-center font-semibold ${column.kind === "class" ? "" : "bg-emerald-50 text-emerald-900"}`}>
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {report.rows.map((row) => (
                <tr key={row.threshold} className="bg-paper">
                  <th className="sticky left-0 z-[5] whitespace-nowrap border border-ink-300 bg-paper px-2 py-1.5 text-center font-semibold text-ink-800">
                    {row.threshold}分以上
                  </th>
                  {report.columns.map((column) => (
                    <td
                      key={column.key}
                      className={`whitespace-nowrap border border-ink-300 px-2 py-1.5 text-center font-semibold tabular-nums text-ink-900 ${column.kind === "class" ? "" : "bg-emerald-50/50"}`}
                    >
                      {row.counts[column.key] || 0}
                    </td>
                  ))}
                </tr>
              ))}
              <tr data-testid="track-standard-summary" className="bg-amber-50/40">
                <td
                  colSpan={report.columns.length + 1}
                  className="border border-ink-300 px-3 py-2 text-center text-[11px] text-ink-700"
                >
                  <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-1">
                    {(["science", "arts"] as const).map((track) => (
                      <span key={track} className="whitespace-nowrap">
                        <span className="font-semibold text-ink-900">
                          {track === "science" ? "理科标准" : "文科标准"}：
                        </span>
                        {TOTAL_SCORE_STANDARD_LABELS.map(([key, label], index) => (
                          <span key={key}>
                            {index > 0 && <span className="mx-1.5 text-ink-300">|</span>}
                            {label} {report.trackStandards[track][key] === null
                              ? "未设置"
                              : `${report.trackStandards[track][key]}分`}
                          </span>
                        ))}
                      </span>
                    ))}
                  </div>
                </td>
              </tr>
              {report.summaryRows.map((row) => (
                <tr key={row.key} className="bg-paper">
                  <th className="sticky left-0 z-[5] whitespace-nowrap border border-ink-300 bg-paper px-2 py-1.5 text-center font-semibold text-ink-800">
                    {row.label}
                  </th>
                  {report.columns.map((column) => {
                    const value = row.values[column.key];
                    if (row.kind === "target" && row.targetKey && column.kind === "class" && column.classId) {
                      return (
                        <td key={column.key} className="whitespace-nowrap border border-ink-300 px-1.5 py-1 text-center">
                          <input
                            type="number"
                            min={0}
                            max={10000}
                            step={1}
                            aria-label={`${column.label}${row.label}`}
                            value={typeof value === "number" ? value : ""}
                            onChange={(event) => updateTarget(column.classId!, row.targetKey!, event.target.value)}
                            onBlur={() => void autoSave()}
                            className="w-14 rounded border border-ink-200 bg-paper px-1.5 py-1 text-center font-semibold tabular-nums text-ink-900 outline-none focus:border-gold-400"
                          />
                        </td>
                      );
                    }
                    return (
                      <td
                        key={column.key}
                        className={`whitespace-nowrap border border-ink-300 px-2 py-1.5 text-center font-semibold tabular-nums text-ink-900 ${column.kind === "class" ? "" : "bg-emerald-50/50"}`}
                      >
                        {value ?? "—"}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-2 text-xs text-ink-400">
            本科人数和本科率分别按理科、文科的“二本标准”统计；目标人数修改后自动保存到当前届年级。
          </div>
        </div>
      )}
    </Card>
  );
}
