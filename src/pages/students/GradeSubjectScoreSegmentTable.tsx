import { useMemo, useRef, useState } from "react";
import { Download, SlidersHorizontal, TableProperties } from "lucide-react";
import type {
  GradeExam,
  GradeExamSettings,
  GradeImportContext,
  GradeStatisticsTemplate,
} from "@/types";
import {
  buildGradeSubjectScoreSegmentReport,
  GRADE_SUBJECT_SCORE_SEGMENT_SUBJECTS,
  resolveGradeSubjectScoreThresholds,
} from "@/lib/grade-subject-score-segment";
import { exportGradeSubjectScoreSegmentReport } from "@/lib/grade-spreadsheet";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { EmptyState } from "@/components/ui/EmptyState";
import { toast } from "@/stores/ui";
import { useAuthStore } from "@/stores/auth";
import { quotaService } from "@/services/quota";

interface GradeSubjectScoreSegmentTableProps {
  exam: GradeExam;
  settings: GradeExamSettings;
  template: GradeStatisticsTemplate;
  classAverageTemplate?: GradeStatisticsTemplate;
  context: GradeImportContext;
  onChange: (settings: GradeExamSettings) => void;
  onAutoSave?: (settings: GradeExamSettings) => Promise<void> | void;
}

function parseThresholds(value: string): number[] {
  return [...new Set(value
    .split(/[\s,，、;；]+/)
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isFinite(item))
    .map((item) => Math.max(0, Math.min(1000, Math.round(item)))))]
    .sort((left, right) => right - left)
    .slice(0, 40);
}

export function GradeSubjectScoreSegmentTable({
  exam,
  settings,
  template,
  classAverageTemplate,
  context,
  onChange,
  onAutoSave,
}: GradeSubjectScoreSegmentTableProps) {
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
  const report = useMemo(() => buildGradeSubjectScoreSegmentReport(
    exam,
    effectiveTemplate,
    context,
    settings,
    effectiveClassAverageTemplate,
  ), [context, effectiveClassAverageTemplate, effectiveTemplate, exam, settings]);

  const updateThresholds = (subject: string, value: string) => {
    const thresholds = parseThresholds(value);
    if (thresholds.length === 0) return;
    const options = effectiveTemplate.totalScoreSegmentOptions || {};
    const nextSettings: GradeExamSettings = {
      ...settings,
      templates: settings.templates.map((item) => item.id === effectiveTemplate.id
        ? {
            ...item,
            totalScoreSegmentOptions: {
              ...options,
              subjectScoreSegmentThresholds: {
                ...options.subjectScoreSegmentThresholds,
                [subject]: thresholds,
              },
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
      await exportGradeSubjectScoreSegmentReport(report, exam.name);
      toast.success("各单科分数段已导出");
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
          <div className="rounded-lg bg-purple-50 p-2 text-purple-700">
            <TableProperties className="h-4 w-4" />
          </div>
          <div>
            <div className="font-medium text-ink-900">表三、各单科分数段</div>
            <div className="mt-0.5 text-xs text-ink-500">
              分别统计语文、数学、英语、物理、历史的实考人数和累计达分人数；任课教师来自当前年级配置。
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setAdjusting((value) => !value)}>
            <SlidersHorizontal className="h-3.5 w-3.5" />
            {adjusting ? "收起调整" : "调整分数段"}
          </Button>
          <Button variant="outline" size="sm" onClick={exportReport} loading={exporting} disabled={report.subjects.length === 0}>
            <Download className="h-3.5 w-3.5" />导出 Excel
          </Button>
        </div>
      </div>

      {adjusting && (
        <div className="border-b border-ink-200 bg-ink-50/60 px-5 py-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            {GRADE_SUBJECT_SCORE_SEGMENT_SUBJECTS.map((subject) => (
              <Input
                key={subject}
                label={`${subject}分数段`}
                defaultValue={resolveGradeSubjectScoreThresholds(effectiveTemplate, subject).join("，")}
                onBlur={(event) => {
                  updateThresholds(subject, event.target.value);
                  void autoSave();
                }}
                placeholder="例如 140，130，120"
              />
            ))}
          </div>
          <div className="mt-2 text-[11px] text-ink-400">
            以逗号或空格分隔多个阈值，系统按从高到低累计统计；{autoSaving ? "正在自动保存…" : "失焦后自动保存到当前届年级。"}
          </div>
        </div>
      )}

      {report.subjects.length === 0 ? (
        <EmptyState
          icon={<TableProperties className="h-8 w-8" />}
          title="当前考试没有表三所需学科成绩"
          description="请先导入语文、数学、英语、物理或历史成绩。"
        />
      ) : (
        <div className="space-y-8 p-5">
          {report.subjects.map((subjectReport) => (
            <section key={subjectReport.subject} className="overflow-x-auto">
              <div className="mb-3 flex min-w-max items-end justify-between gap-4 px-1">
                <h3 className="font-serif text-lg font-semibold text-ink-900">{subjectReport.title}</h3>
                <div className="shrink-0 text-sm font-medium text-ink-600">{report.reportDate.replace(/-/g, ".")}</div>
              </div>
              <table className="w-max min-w-full table-auto border-collapse text-[11px]">
                <thead>
                  <tr className="bg-ink-50 text-ink-700">
                    <th className="whitespace-nowrap border border-ink-300 px-2 py-1.5 text-center font-semibold">班级</th>
                    <th className="whitespace-nowrap border border-ink-300 px-2 py-1.5 text-center font-semibold">{subjectReport.subject}</th>
                    <th className="whitespace-nowrap border border-ink-300 px-2 py-1.5 text-center font-semibold">实考人数</th>
                    {subjectReport.thresholds.map((threshold) => (
                      <th key={threshold} className="whitespace-nowrap border border-ink-300 px-2 py-1.5 text-center font-semibold">
                        {threshold}分以上
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {subjectReport.rows.map((row) => (
                    <tr key={row.classId} className="bg-paper">
                      <th className="whitespace-nowrap border border-ink-300 px-2 py-1.5 text-center font-semibold text-ink-800">{row.classLabel}</th>
                      <td className="whitespace-nowrap border border-ink-300 px-2 py-1.5 text-center text-ink-700">{row.teacherNames.join("、") || "—"}</td>
                      <td className="whitespace-nowrap border border-ink-300 px-2 py-1.5 text-center font-semibold tabular-nums">{row.candidateCount || ""}</td>
                      {subjectReport.thresholds.map((threshold) => (
                        <td key={threshold} className="whitespace-nowrap border border-ink-300 px-2 py-1.5 text-center font-semibold tabular-nums">
                          {row.counts[threshold] || ""}
                        </td>
                      ))}
                    </tr>
                  ))}
                  <tr className="bg-ink-50/70 font-semibold">
                    <th colSpan={2} className="border border-ink-300 px-2 py-1.5 text-center">累计</th>
                    <td className="border border-ink-300 px-2 py-1.5 text-center tabular-nums">{subjectReport.totalCandidateCount || ""}</td>
                    {subjectReport.thresholds.map((threshold) => (
                      <td key={threshold} className="border border-ink-300 px-2 py-1.5 text-center tabular-nums">{subjectReport.totalCounts[threshold] || ""}</td>
                    ))}
                  </tr>
                  <tr className="bg-ink-50/70 font-semibold">
                    <th colSpan={3} className="border border-ink-300 px-2 py-1.5 text-center">所占比例</th>
                    {subjectReport.thresholds.map((threshold) => (
                      <td key={threshold} className="border border-ink-300 px-2 py-1.5 text-center tabular-nums">
                        {subjectReport.totalCandidateCount > 0 ? subjectReport.totalRates[threshold] : ""}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </section>
          ))}
        </div>
      )}
    </Card>
  );
}
