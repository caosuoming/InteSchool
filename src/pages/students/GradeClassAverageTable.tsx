import { useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Download,
  RotateCcw,
  SlidersHorizontal,
  Table2,
} from "lucide-react";
import type {
  GradeClassAverageOptions,
  GradeClassAverageSubjectScoreMode,
  GradeExam,
  GradeExamSettings,
  GradeImportContext,
  GradeStatisticsTemplate,
} from "@/types";
import {
  buildDefaultClassAverageOptions,
  buildGradeClassAverageReport,
  classAverageScoreCellValue,
  resolveClassAverageOptions,
} from "@/lib/grade-class-average";
import { exportGradeClassAverageReport } from "@/lib/grade-spreadsheet";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { EmptyState } from "@/components/ui/EmptyState";
import { toast } from "@/stores/ui";
import { cn } from "@/lib/utils";
import { isAssignableGradeSubject } from "@/lib/grade-subjects";

interface GradeClassAverageTableProps {
  exam: GradeExam;
  settings: GradeExamSettings;
  template: GradeStatisticsTemplate;
  context: GradeImportContext;
  onChange: (settings: GradeExamSettings) => void;
}

function displayScore(
  values: { raw: number | null; assigned: number | null },
  mode: GradeClassAverageSubjectScoreMode,
): string {
  const value = classAverageScoreCellValue(values, mode);
  return typeof value === "number" ? value.toFixed(2) : value || "—";
}

function classRangeLabel(labels: string[]): string {
  return labels.join("、");
}

export function GradeClassAverageTable({
  exam,
  settings,
  template,
  context,
  onChange,
}: GradeClassAverageTableProps) {
  const [adjusting, setAdjusting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const effectiveTemplate = useMemo(
    () => settings.templates.find((item) => item.id === template.id) || template,
    [settings.templates, template],
  );
  const resolvedOptions = useMemo(
    () => resolveClassAverageOptions(
      exam,
      context,
      effectiveTemplate.classAverageOptions,
      effectiveTemplate.scoreMode,
    ),
    [context, effectiveTemplate.classAverageOptions, effectiveTemplate.scoreMode, exam],
  );
  const report = useMemo(
    () => buildGradeClassAverageReport(exam, effectiveTemplate, context, settings),
    [context, effectiveTemplate, exam, settings],
  );

  const updateOptions = (patch: Partial<GradeClassAverageOptions>) => {
    const nextOptions: GradeClassAverageOptions = {
      ...resolvedOptions,
      ...patch,
      classCategories: {
        ...resolvedOptions.classCategories,
        ...patch.classCategories,
      },
      classLabels: {
        ...resolvedOptions.classLabels,
        ...patch.classLabels,
      },
      subjectScoreModes: {
        ...resolvedOptions.subjectScoreModes,
        ...Object.fromEntries(Object.entries(patch.subjectScoreModes || {}).map(([classId, modes]) => [
          classId,
          {
            ...resolvedOptions.subjectScoreModes?.[classId],
            ...modes,
          },
        ])),
      },
    };
    onChange({
      ...settings,
      templates: settings.templates.map((item) => item.id === effectiveTemplate.id
        ? { ...item, classAverageOptions: nextOptions }
        : item),
    });
  };

  const moveClass = (classId: string, delta: -1 | 1) => {
    const order = [...(resolvedOptions.classOrder || [])];
    const index = order.indexOf(classId);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= order.length) return;
    [order[index], order[target]] = [order[target], order[index]];
    updateOptions({ classOrder: order });
  };

  const toggleClass = (classId: string) => {
    const hidden = new Set(resolvedOptions.hiddenClassIds || []);
    if (hidden.has(classId)) hidden.delete(classId);
    else hidden.add(classId);
    updateOptions({ hiddenClassIds: [...hidden] });
  };

  const reset = () => {
    updateOptions(buildDefaultClassAverageOptions(exam, context, effectiveTemplate.scoreMode));
    toast.success("已恢复默认表格布局");
  };

  const toggleSubjectScoreMode = (
    classId: string,
    subject: string,
    scoreMode: "raw" | "assigned",
    checked: boolean,
  ) => {
    const current = resolvedOptions.subjectScoreModes?.[classId]?.[subject] || effectiveTemplate.scoreMode;
    let showRaw = current === "raw" || current === "both";
    let showAssigned = current === "assigned" || current === "both";
    if (scoreMode === "raw") showRaw = checked;
    else showAssigned = checked;
    if (!showRaw && !showAssigned) return;
    const nextMode: GradeClassAverageSubjectScoreMode = showRaw && showAssigned
      ? "both"
      : showRaw
        ? "raw"
        : "assigned";
    updateOptions({ subjectScoreModes: { [classId]: { [subject]: nextMode } } });
  };

  const exportReport = async () => {
    setExporting(true);
    try {
      await exportGradeClassAverageReport(report);
      toast.success("班级平均分表已导出");
    } catch (error) {
      toast.error("导出失败", error instanceof Error ? error.message : undefined);
    } finally {
      setExporting(false);
    }
  };

  const classRows = useMemo(() => {
    const byClass = new Map(report.groups.flatMap((group) => group.rows.map((row) => [row.classId, row])));
    return (resolvedOptions.classOrder || [])
      .map((classId) => byClass.get(classId) || {
        classId,
        className: context.classes.find((item) => item.id === classId)?.name || classId,
      })
      .filter(Boolean);
  }, [context.classes, report.groups, resolvedOptions.classOrder]);

  return (
    <Card className="overflow-hidden p-0">
      <div className="flex flex-col gap-3 border-b border-ink-100 px-5 py-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-blue-50 p-2 text-blue-700">
            <Table2 className="h-4 w-4" />
          </div>
          <div>
            <div className="font-medium text-ink-900">表一、班级平均分统计表</div>
            <div className="mt-0.5 text-xs text-ink-500">
              数据来自“{exam.name}”已上传成绩；平均分自动计算，表格布局可调整后随年级配置保存。
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setAdjusting((value) => !value)}>
            <SlidersHorizontal className="h-3.5 w-3.5" />
            {adjusting ? "收起调整" : "调整表格"}
          </Button>
          <Button variant="outline" size="sm" onClick={exportReport} loading={exporting}>
            <Download className="h-3.5 w-3.5" />导出 Excel
          </Button>
        </div>
      </div>

      {adjusting && (
        <div className="space-y-4 border-b border-ink-100 bg-ink-50/40 p-5">
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_13rem_auto] md:items-end">
            <Input
              label="表格标题"
              value={resolvedOptions.title || ""}
              onChange={(event) => updateOptions({ title: event.target.value })}
            />
            <Input
              label="统计日期"
              type="date"
              value={resolvedOptions.reportDate || ""}
              onChange={(event) => updateOptions({ reportDate: event.target.value })}
            />
            <Button variant="ghost" size="sm" onClick={reset}>
              <RotateCcw className="h-3.5 w-3.5" />恢复默认
            </Button>
          </div>

          <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-ink-600">
            {([
              ["showTeacherRows", "显示班主任和任课教师"],
              ["showGroupDifference", "显示同类班级分差"],
              ["showGroupAverage", "显示同类班级平均"],
              ["showOverallAverage", "显示全校平均"],
            ] as const).map(([key, label]) => (
              <label key={key} className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={Boolean(resolvedOptions[key])}
                  onChange={(event) => updateOptions({ [key]: event.target.checked })}
                  className="rounded border-ink-300 text-gold-600 focus:ring-gold-500"
                />
                {label}
              </label>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-ink-600">
            <span className="font-medium text-ink-700">总分平均</span>
            {([
              ["raw", "原始总分"],
              ["assigned", "赋分总分"],
            ] as const).map(([mode, label]) => (
              <label key={mode} className="inline-flex items-center gap-2">
                <input
                  type="radio"
                  name={`${effectiveTemplate.id}-class-average-total-mode`}
                  checked={resolvedOptions.totalScoreMode === mode}
                  onChange={() => updateOptions({ totalScoreMode: mode })}
                />
                {label}
              </label>
            ))}
          </div>

          <div className="overflow-x-auto rounded-lg border border-ink-200 bg-paper">
            <table className="min-w-[760px] w-full text-xs">
              <thead className="bg-ink-50 text-ink-500">
                <tr>
                  <th className="w-24 px-3 py-2 text-left font-medium">显示</th>
                  <th className="w-28 px-3 py-2 text-left font-medium">顺序</th>
                  <th className="px-3 py-2 text-left font-medium">实际班级</th>
                  <th className="w-40 px-3 py-2 text-left font-medium">表内简称</th>
                  <th className="w-48 px-3 py-2 text-left font-medium">类别</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {classRows.map((row, index) => {
                  const hidden = (resolvedOptions.hiddenClassIds || []).includes(row.classId);
                  return (
                    <tr key={row.classId} className={cn(hidden && "bg-ink-50/60 text-ink-400")}>
                      <td className="px-3 py-2">
                        <label className="inline-flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={!hidden}
                            onChange={() => toggleClass(row.classId)}
                            aria-label={`显示${row.className}`}
                          />
                          {hidden ? "隐藏" : "显示"}
                        </label>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex gap-1">
                          <button
                            type="button"
                            aria-label={`上移${row.className}`}
                            disabled={index === 0}
                            onClick={() => moveClass(row.classId, -1)}
                            className="rounded border border-ink-200 p-1 text-ink-500 hover:bg-ink-50 disabled:opacity-30"
                          >
                            <ChevronUp className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            aria-label={`下移${row.className}`}
                            disabled={index === classRows.length - 1}
                            onClick={() => moveClass(row.classId, 1)}
                            className="rounded border border-ink-200 p-1 text-ink-500 hover:bg-ink-50 disabled:opacity-30"
                          >
                            <ChevronDown className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                      <td className="px-3 py-2 font-medium text-ink-700">{row.className}</td>
                      <td className="px-3 py-2">
                        <input
                          aria-label={`${row.className}表内简称`}
                          value={resolvedOptions.classLabels?.[row.classId] || ""}
                          onChange={(event) => updateOptions({
                            classLabels: { [row.classId]: event.target.value },
                          })}
                          className="w-full rounded border border-ink-200 bg-paper px-2 py-1.5 text-ink-800 outline-none focus:border-gold-400"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          aria-label={`${row.className}类别`}
                          value={resolvedOptions.classCategories?.[row.classId] || ""}
                          onChange={(event) => updateOptions({
                            classCategories: { [row.classId]: event.target.value },
                          })}
                          className="w-full rounded border border-ink-200 bg-paper px-2 py-1.5 text-ink-800 outline-none focus:border-gold-400"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="space-y-2">
            <div>
              <div className="text-xs font-medium text-ink-700">学科分数显示</div>
              <div className="mt-0.5 text-xs text-ink-500">
                化学、生物、政治、地理可分别显示原始分、赋分或两者；其他学科固定显示原始分。
              </div>
            </div>
            <div className="overflow-x-auto rounded-lg border border-ink-200 bg-paper">
              <table className="min-w-[760px] w-full text-xs">
                <thead className="bg-ink-50 text-ink-500">
                  <tr>
                    <th className="sticky left-0 z-10 min-w-28 border-r border-ink-200 bg-ink-50 px-3 py-2 text-left font-medium">
                      班级
                    </th>
                    {report.subjects.map((subject) => (
                      <th key={subject} className="min-w-36 px-3 py-2 text-center font-medium">{subject}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {classRows.map((row) => {
                    const hidden = (resolvedOptions.hiddenClassIds || []).includes(row.classId);
                    return (
                      <tr key={row.classId} className={cn(hidden && "bg-ink-50/60 text-ink-400")}>
                        <td className="sticky left-0 z-10 border-r border-ink-100 bg-paper px-3 py-2 font-medium text-ink-700">
                          {row.className}
                        </td>
                        {report.subjects.map((subject) => {
                          const assignable = isAssignableGradeSubject(subject);
                          const mode = resolvedOptions.subjectScoreModes?.[row.classId]?.[subject]
                            || effectiveTemplate.scoreMode;
                          const showRaw = mode === "raw" || mode === "both";
                          const showAssigned = mode === "assigned" || mode === "both";
                          return (
                            <td key={subject} className="px-3 py-2">
                              {assignable ? (
                                <div className="flex items-center justify-center gap-3">
                                  <label className="inline-flex items-center gap-1.5 whitespace-nowrap">
                                    <input
                                      type="checkbox"
                                      aria-label={`${row.className}${subject}原始分`}
                                      checked={showRaw}
                                      onChange={(event) => toggleSubjectScoreMode(
                                        row.classId,
                                        subject,
                                        "raw",
                                        event.target.checked,
                                      )}
                                    />
                                    原始
                                  </label>
                                  <label className="inline-flex items-center gap-1.5 whitespace-nowrap">
                                    <input
                                      type="checkbox"
                                      aria-label={`${row.className}${subject}赋分`}
                                      checked={showAssigned}
                                      onChange={(event) => toggleSubjectScoreMode(
                                        row.classId,
                                        subject,
                                        "assigned",
                                        event.target.checked,
                                      )}
                                    />
                                    赋分
                                  </label>
                                </div>
                              ) : (
                                <div className="text-center text-ink-500">原始分</div>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {report.groups.length === 0 ? (
        <EmptyState
          icon={<Table2 className="h-8 w-8" />}
          title="当前考试没有可统计的班级成绩"
          description="请检查上传成绩中的班级匹配，或在“调整表格”中重新显示班级。"
        />
      ) : (
        <div className="overflow-x-auto p-5">
          <div className="mb-3 flex min-w-[780px] items-end justify-between gap-4 px-1">
            <h3 className="font-serif text-lg font-semibold text-ink-900">{report.title}</h3>
            <div className="shrink-0 text-sm font-medium text-ink-600">{report.reportDate.replace(/-/g, ".")}</div>
          </div>
          <table className="min-w-[780px] w-full border-collapse text-xs">
            <thead>
              <tr className="bg-ink-50 text-ink-700">
                <th className="border border-ink-300 px-3 py-2 text-center font-semibold">类别</th>
                <th className="border border-ink-300 px-3 py-2 text-center font-semibold">班级</th>
                <th className="border border-ink-300 px-3 py-2 text-center font-semibold">班主任 / 人数</th>
                {report.subjects.map((subject) => (
                  <th key={subject} className="border border-ink-300 px-3 py-2 text-center font-semibold">{subject}</th>
                ))}
                <th className="border border-ink-300 px-3 py-2 text-center font-semibold">总分平均</th>
              </tr>
            </thead>
            <tbody>
              {report.groups.map((group) => {
                const summaryRows = group.rows.length > 1
                  ? Number(report.options.showGroupDifference) + Number(report.options.showGroupAverage)
                  : 0;
                const rowSpan = group.rows.length * (report.options.showTeacherRows ? 2 : 1) + summaryRows;
                let categoryRendered = false;
                return [
                  ...group.rows.flatMap((row) => {
                    const categoryCell = !categoryRendered ? (
                      <td
                        rowSpan={rowSpan}
                        className="border border-ink-300 bg-ink-50/70 px-3 py-2 text-center align-middle font-medium text-ink-800"
                      >
                        {group.category}
                      </td>
                    ) : null;
                    categoryRendered = true;
                    const teacherRow = report.options.showTeacherRows ? (
                      <tr key={`${row.classId}-teachers`}>
                        {categoryCell}
                        <td rowSpan={2} className="border border-ink-300 px-3 py-2 text-center font-semibold text-ink-800">
                          {row.classLabel}
                        </td>
                        <td className="border border-ink-300 px-3 py-2 text-center text-ink-600">
                          {row.homeroomTeachers.join("、") || "—"}
                        </td>
                        {report.subjects.map((subject) => (
                          <td key={subject} className="border border-ink-300 px-3 py-2 text-center text-ink-600">
                            {row.subjectTeachers[subject]?.join("、") || "—"}
                          </td>
                        ))}
                        <td className="border border-ink-300 px-3 py-2" />
                      </tr>
                    ) : null;
                    const scoreRow = (
                      <tr key={`${row.classId}-scores`} className="bg-paper">
                        {!report.options.showTeacherRows && categoryCell}
                        {!report.options.showTeacherRows && (
                          <td className="border border-ink-300 px-3 py-2 text-center font-semibold text-ink-800">
                            {row.classLabel}
                          </td>
                        )}
                        <td className="border border-ink-300 px-3 py-2 text-center text-ink-500">{row.studentCount} 人</td>
                        {report.subjects.map((subject) => (
                          <td key={subject} className="border border-ink-300 px-3 py-2 text-right font-semibold tabular-nums text-ink-900">
                            {displayScore(row.subjectAverages[subject], row.subjectScoreModes[subject])}
                          </td>
                        ))}
                        <td className="border border-ink-300 px-3 py-2 text-right font-bold tabular-nums text-ink-900">
                          {displayScore(row.totalAverages, report.options.totalScoreMode || effectiveTemplate.scoreMode)}
                        </td>
                      </tr>
                    );
                    return teacherRow ? [teacherRow, scoreRow] : [scoreRow];
                  }),
                  ...(group.rows.length > 1 && report.options.showGroupDifference ? [(
                    <tr key={`${group.category}-difference`} className="bg-amber-50/40">
                      <td className="border border-ink-300 px-3 py-2 text-center font-medium">分差</td>
                      <td className="border border-ink-300 px-3 py-2" />
                      {report.subjects.map((subject) => (
                        <td key={subject} className="border border-ink-300 px-3 py-2 text-right tabular-nums">
                          {displayScore(group.difference.subjectValues[subject], group.subjectScoreModes[subject])}
                        </td>
                      ))}
                      <td className="border border-ink-300 px-3 py-2 text-right font-semibold tabular-nums">
                        {displayScore(group.difference.totalValues, report.options.totalScoreMode || effectiveTemplate.scoreMode)}
                      </td>
                    </tr>
                  )] : []),
                  ...(group.rows.length > 1 && report.options.showGroupAverage ? [(
                    <tr key={`${group.category}-average`} className="bg-blue-50/40">
                      <td className="border border-ink-300 px-3 py-2 text-center font-medium">
                        平均（{classRangeLabel(group.rows.map((row) => row.classLabel))}）
                      </td>
                      <td className="border border-ink-300 px-3 py-2" />
                      {report.subjects.map((subject) => (
                        <td key={subject} className="border border-ink-300 px-3 py-2 text-right font-semibold tabular-nums">
                          {displayScore(group.average.subjectValues[subject], group.subjectScoreModes[subject])}
                        </td>
                      ))}
                      <td className="border border-ink-300 px-3 py-2 text-right font-bold tabular-nums">
                        {displayScore(group.average.totalValues, report.options.totalScoreMode || effectiveTemplate.scoreMode)}
                      </td>
                    </tr>
                  )] : []),
                ];
              })}
              {report.options.showOverallAverage && (
                <tr className="bg-ink-100/70">
                  <td colSpan={3} className="border border-ink-300 px-3 py-2 text-center font-bold text-ink-900">全校平均</td>
                  {report.subjects.map((subject) => (
                    <td key={subject} className="border border-ink-300 px-3 py-2 text-right font-bold tabular-nums text-ink-900">
                      {displayScore(
                        report.overallAverage.subjectValues[subject],
                        report.overallSubjectScoreModes[subject],
                      )}
                    </td>
                  ))}
                  <td className="border border-ink-300 px-3 py-2 text-right font-bold tabular-nums text-ink-900">
                    {displayScore(
                      report.overallAverage.totalValues,
                      report.options.totalScoreMode || effectiveTemplate.scoreMode,
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <div className="mt-2 text-xs text-ink-400">
            均分按实际有分数的学生计算；分组平均和全校平均按学生人数加权，分差为同类别班级均分的最大值减最小值。
          </div>
        </div>
      )}
    </Card>
  );
}
