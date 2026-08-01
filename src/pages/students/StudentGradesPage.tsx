import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  Download,
  FileSpreadsheet,
  Import,
  Save,
  Search,
  Settings2,
  Trash2,
  Users,
} from "lucide-react";
import { useAuthStore } from "@/stores/auth";
import { toast } from "@/stores/ui";
import { gradeService } from "@/services/grade";
import type {
  GradeCohort,
  GradeExam,
  GradeExamSettings,
  GradeImportContext,
  GradeStatisticsTemplate,
} from "@/types";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Select } from "@/components/ui/Input";
import { Spinner } from "@/components/ui/Spinner";
import { cn } from "@/lib/utils";
import { exportGradeExam } from "@/lib/grade-spreadsheet";
import {
  averageGradeValues,
  buildElectiveGradeDistribution,
  buildGradeClassAverages,
  buildGradeReportTable,
  buildGradeScoreSegments,
  gradeTemplateTotal,
} from "@/lib/grade-reports";
import { StudentSectionTabs } from "./StudentSectionTabs";
import { GradeImportWizard } from "./GradeImportWizard";
import { GradeSettingsEditor } from "./GradeSettingsEditor";

type PageMode = "query" | "settings";
type QueryView = "ranking" | "average" | "templates";

function formatNumber(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.00$/, "");
}

function SummaryCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint: string;
}) {
  return (
    <Card className="p-4">
      <div className="text-xs text-ink-400">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-ink-900">{value}</div>
      <div className="mt-1 text-xs text-ink-500">{hint}</div>
    </Card>
  );
}

function TemplateReport({ exam, template }: { exam: GradeExam; template: GradeStatisticsTemplate }) {
  if (template.kind === "customTable") {
    const table = buildGradeReportTable(exam, template);
    if (table.headers.length === 0) {
      return <div className="p-8 text-center text-sm text-ink-400">该公式表尚未配置输出列。</div>;
    }
    return (
      <div className="overflow-x-auto">
        <table className="min-w-[760px] w-full text-xs">
          <thead className="bg-ink-50 text-ink-500">
            <tr>
              {table.headers.map((header, index) => (
                <th
                  key={`${header}-${index}`}
                  className="px-3 py-2 text-left font-medium"
                  style={{ minWidth: `${table.widths?.[index] || 12}ch` }}
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {table.rows.slice(0, 100).map((row, rowIndex) => (
              <tr key={`${template.id}-${rowIndex}`}>
                {row.map((value, cellIndex) => (
                  <td
                    key={`${rowIndex}-${cellIndex}`}
                    className={cn(
                      "px-3 py-2.5 text-ink-700",
                      typeof value === "number" && "text-right tabular-nums",
                      typeof value === "string" && value.startsWith("#错误:") && "text-red-600",
                    )}
                  >
                    {value ?? "—"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {table.rows.length > 100 && (
          <div className="border-t border-ink-100 px-4 py-2 text-center text-xs text-ink-400">
            在线预览显示前 100 行，导出文件包含全部 {table.rows.length} 行。
          </div>
        )}
      </div>
    );
  }

  if (template.kind === "studentRanking") {
    const records = [...exam.records].sort((left, right) => left.gradeRank - right.gradeRank).slice(0, 20);
    return (
      <div className="overflow-x-auto">
        <table className="min-w-[680px] w-full text-xs">
          <thead className="bg-ink-50 text-ink-500">
            <tr>
              <th className="px-3 py-2 text-left font-medium">名次</th>
              <th className="px-3 py-2 text-left font-medium">班级</th>
              <th className="px-3 py-2 text-left font-medium">姓名</th>
              <th className="px-3 py-2 text-right font-medium">模板总分</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {records.map((record) => (
              <tr key={record.id}>
                <td className="px-3 py-2.5 text-ink-500">{record.gradeRank}</td>
                <td className="px-3 py-2.5 text-ink-600">{record.className}</td>
                <td className="px-3 py-2.5 font-medium text-ink-900">{record.studentName}</td>
                <td className="px-3 py-2.5 text-right font-medium text-ink-900">{gradeTemplateTotal(record, template)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (template.kind === "classAverage") {
    const averages = buildGradeClassAverages(exam);
    return (
      <div className="overflow-x-auto">
        <table className="min-w-[680px] w-full text-xs">
          <thead className="bg-ink-50 text-ink-500">
            <tr>
              <th className="px-3 py-2 text-left font-medium">班级</th>
              <th className="px-3 py-2 text-right font-medium">人数</th>
              {template.subjects.map((subject) => <th key={subject} className="px-3 py-2 text-right font-medium">{subject}</th>)}
              <th className="px-3 py-2 text-right font-medium">总分平均</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {averages.map((item) => (
              <tr key={item.classId}>
                <td className="px-3 py-2.5 font-medium text-ink-900">{item.className}</td>
                <td className="px-3 py-2.5 text-right text-ink-600">{item.studentCount}</td>
                {template.subjects.map((subject) => (
                  <td key={subject} className="px-3 py-2.5 text-right text-ink-700">{formatNumber(item.subjectAverages[subject])}</td>
                ))}
                <td className="px-3 py-2.5 text-right font-medium text-ink-900">
                  {formatNumber(template.scoreMode === "raw" ? item.rawTotalAverage : item.assignedTotalAverage)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (template.kind === "electiveGradeSegment") {
    const distribution = buildElectiveGradeDistribution(exam, template);
    const labels = [...new Set(distribution.flatMap((item) => Object.keys(item.counts)))];
    return distribution.length === 0 ? (
      <div className="p-8 text-center text-sm text-ink-400">该模板选择的科目尚未配置赋分规则。</div>
    ) : (
      <div className="overflow-x-auto">
        <table className="min-w-[560px] w-full text-xs">
          <thead className="bg-ink-50 text-ink-500">
            <tr>
              <th className="px-3 py-2 text-left font-medium">科目</th>
              {labels.map((label) => <th key={label} className="px-3 py-2 text-right font-medium">{label}档人数</th>)}
              <th className="px-3 py-2 text-right font-medium">参考人数</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {distribution.map((item) => (
              <tr key={item.subject}>
                <td className="px-3 py-2.5 font-medium text-ink-900">{item.subject}</td>
                {labels.map((label) => <td key={label} className="px-3 py-2.5 text-right">{item.counts[label] || 0}</td>)}
                <td className="px-3 py-2.5 text-right text-ink-500">{item.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  const values = exam.records.map((record) => gradeTemplateTotal(record, template));
  const segments = buildGradeScoreSegments(values, template.segmentSize || 10);
  return (
    <div className="overflow-x-auto">
      <table className="min-w-[520px] w-full text-xs">
        <thead className="bg-ink-50 text-ink-500">
          <tr>
            <th className="px-3 py-2 text-left font-medium">分数段</th>
            <th className="px-3 py-2 text-right font-medium">人数</th>
            <th className="px-3 py-2 text-right font-medium">比例</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-100">
          {segments.map((segment) => (
            <tr key={segment.label}>
              <td className="px-3 py-2.5 font-medium text-ink-900">{segment.label}</td>
              <td className="px-3 py-2.5 text-right text-ink-700">{segment.count}</td>
              <td className="px-3 py-2.5 text-right text-ink-500">{(segment.rate * 100).toFixed(1)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function StudentGradesPage() {
  const { teacher, getCurrentAffiliation } = useAuthStore();
  const currentAffiliation = getCurrentAffiliation();
  const schoolId = currentAffiliation?.schoolId || null;
  const canPublishCohortTemplates = Boolean(
    currentAffiliation
    && (
      ["school_admin", "platform_admin"].includes(currentAffiliation.role)
      || currentAffiliation.roles.some((role) => ["gradeLeader", "dean", "principal"].includes(role))
    ),
  );
  const [cohorts, setCohorts] = useState<GradeCohort[]>([]);
  const [exams, setExams] = useState<GradeExam[]>([]);
  const [selectedExamId, setSelectedExamId] = useState("");
  const [mode, setMode] = useState<PageMode>("query");
  const [queryView, setQueryView] = useState<QueryView>("ranking");
  const [loading, setLoading] = useState(true);
  const [importOpen, setImportOpen] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [classFilter, setClassFilter] = useState("");
  const [settingsContext, setSettingsContext] = useState<GradeImportContext | null>(null);
  const [settingsDraft, setSettingsDraft] = useState<GradeExamSettings | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);
  const [publishingTemplates, setPublishingTemplates] = useState(false);
  const [exporting, setExporting] = useState(false);

  const selectedExam = exams.find((item) => item.id === selectedExamId) || null;

  const load = useCallback(async (preferredExamId?: string) => {
    if (!schoolId) {
      setLoading(false);
      setCohorts([]);
      setExams([]);
      return;
    }
    setLoading(true);
    try {
      const [nextCohorts, nextExams] = await Promise.all([
        gradeService.listCohorts(schoolId),
        gradeService.listExams(schoolId),
      ]);
      setCohorts(nextCohorts);
      setExams(nextExams);
      setSelectedExamId((current) => {
        if (preferredExamId && nextExams.some((item) => item.id === preferredExamId)) return preferredExamId;
        if (current && nextExams.some((item) => item.id === current)) return current;
        return nextExams[0]?.id || "";
      });
    } catch (error) {
      toast.error("加载成绩数据失败", error instanceof Error ? error.message : undefined);
    } finally {
      setLoading(false);
    }
  }, [schoolId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (mode !== "settings" || !selectedExam || !schoolId) return;
    let active = true;
    setSettingsDraft(structuredClone(selectedExam.settings));
    gradeService.getImportContext(schoolId, selectedExam.cohortKey)
      .then((context) => {
        if (active) setSettingsContext(context);
      })
      .catch((error) => {
        if (active) toast.error("加载成绩设置失败", error instanceof Error ? error.message : undefined);
      });
    return () => {
      active = false;
    };
  }, [mode, schoolId, selectedExam]);

  const classNames = useMemo(() => selectedExam
    ? [...new Set(selectedExam.records.map((record) => record.className))].sort((a, b) => a.localeCompare(b, "zh-CN"))
    : [], [selectedExam]);

  const filteredRecords = useMemo(() => {
    if (!selectedExam) return [];
    const normalized = keyword.trim().toLowerCase();
    return selectedExam.records.filter((record) => {
      if (classFilter && record.className !== classFilter) return false;
      if (!normalized) return true;
      return record.studentName.toLowerCase().includes(normalized)
        || record.studentNo.toLowerCase().includes(normalized)
        || record.className.toLowerCase().includes(normalized);
    });
  }, [classFilter, keyword, selectedExam]);

  const classAverages = useMemo(() => selectedExam ? buildGradeClassAverages(selectedExam) : [], [selectedExam]);
  const enabledTemplates = selectedExam?.settings.templates.filter((item) => item.enabled) || [];
  const averageTotal = selectedExam
    ? averageGradeValues(selectedExam.records.map((record) => record.assignedTotal))
    : null;

  const handleExport = async () => {
    if (!selectedExam) return;
    setExporting(true);
    try {
      await exportGradeExam(selectedExam);
      toast.success("成绩表已导出");
    } catch (error) {
      toast.error("导出失败", error instanceof Error ? error.message : undefined);
    } finally {
      setExporting(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedExam || !window.confirm(`确定删除「${selectedExam.name}」吗？该操作不会删除学生档案。`)) return;
    try {
      await gradeService.deleteExam(selectedExam.id);
      toast.success("成绩记录已删除");
      await load();
    } catch (error) {
      toast.error("删除失败", error instanceof Error ? error.message : undefined);
    }
  };

  const handleSaveSettings = async () => {
    if (!selectedExam || !settingsDraft) return;
    setSavingSettings(true);
    try {
      const updated = await gradeService.updateExamSettings(selectedExam.id, settingsDraft);
      setExams((current) => current.map((item) => item.id === updated.id ? updated : item));
      setSettingsDraft(structuredClone(updated.settings));
      toast.success("统计设置已保存", "成绩、赋分和名次已重新计算");
    } catch (error) {
      toast.error("保存设置失败", error instanceof Error ? error.message : undefined);
    } finally {
      setSavingSettings(false);
    }
  };

  const handlePublishTemplates = async () => {
    if (!schoolId || !teacher || !selectedExam || !settingsDraft) return;
    setPublishingTemplates(true);
    try {
      const profile = await gradeService.saveCohortTemplateProfile(
        schoolId,
        selectedExam.cohortKey,
        teacher.id,
        selectedExam.subjects,
        settingsDraft.templates,
      );
      setSettingsContext((current) => current ? { ...current, templateProfile: profile } : current);
      toast.success("年级成绩模板已发布", `后续导入 ${selectedExam.cohortLabel} 成绩时将自动继承`);
    } catch (error) {
      toast.error("发布年级模板失败", error instanceof Error ? error.message : undefined);
    } finally {
      setPublishingTemplates(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="学生成绩"
        description="导入考试成绩，核对学生名单，统一配置赋分和统计模板"
        icon={<BarChart3 className="h-5 w-5" />}
        action={schoolId && teacher ? (
          <>
            <Button variant="outline" onClick={() => setImportOpen(true)}>
              <Import className="h-4 w-4" />
              导入成绩
            </Button>
            <Button variant="gold" onClick={handleExport} disabled={!selectedExam} loading={exporting}>
              <Download className="h-4 w-4" />
              导出成绩
            </Button>
          </>
        ) : undefined}
      />
      <StudentSectionTabs />

      {!schoolId ? (
        <Card>
          <EmptyState
            icon={<Users className="h-8 w-8" />}
            title="个人身份暂不支持校级成绩管理"
            description="请切换到已认证学校身份后导入和查询学生成绩。"
          />
        </Card>
      ) : loading ? (
        <div className="flex justify-center py-24"><Spinner size={32} /></div>
      ) : (
        <>
          <div className="mb-5 flex flex-col gap-3 rounded-xl border border-ink-100 bg-paper p-4 shadow-sm lg:flex-row lg:items-end lg:justify-between">
            <div className="grid flex-1 gap-3 sm:grid-cols-2 lg:max-w-3xl">
              <Select
                label="考试记录"
                value={selectedExamId}
                onChange={(event) => setSelectedExamId(event.target.value)}
                placeholder="选择考试"
                options={exams.map((item) => ({
                  value: item.id,
                  label: `${item.cohortLabel} · ${item.name}`,
                }))}
              />
              {selectedExam && (
                <div className="flex items-end gap-2 pb-0.5 text-xs text-ink-500">
                  <Badge variant="gold">{selectedExam.cohortLabel}</Badge>
                  <span>{selectedExam.records.length} 人</span>
                  <span>{selectedExam.subjects.length} 科</span>
                  <span>{selectedExam.examDate || new Date(selectedExam.createdAt).toLocaleDateString("zh-CN")}</span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-1 rounded-lg bg-ink-100 p-1">
              <button
                type="button"
                onClick={() => setMode("query")}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                  mode === "query" ? "bg-paper text-ink-900 shadow-sm" : "text-ink-500",
                )}
              >
                成绩查询
              </button>
              <button
                type="button"
                onClick={() => setMode("settings")}
                disabled={!selectedExam}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-40",
                  mode === "settings" ? "bg-paper text-ink-900 shadow-sm" : "text-ink-500",
                )}
              >
                统计设置
              </button>
            </div>
          </div>

          {exams.length === 0 || !selectedExam ? (
            <Card>
              <EmptyState
                icon={<FileSpreadsheet className="h-8 w-8" />}
                title="尚未导入学生成绩"
                description="选择学生年级和 Excel 成绩表，完成字段识别、学生匹配、赋分与统计模板设置。"
                action={<Button variant="gold" onClick={() => setImportOpen(true)}><Import className="h-4 w-4" />导入第一份成绩</Button>}
              />
            </Card>
          ) : mode === "settings" ? (
            settingsContext && settingsDraft ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
                  <div>
                    <div className="text-sm font-medium text-amber-900">修改后会重新计算赋分、总分和名次</div>
                    <div className="mt-0.5 text-xs text-amber-700">原始导入成绩保持不变。</div>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={handleDelete} className="text-red-600 hover:border-red-300">
                      <Trash2 className="h-4 w-4" />删除记录
                    </Button>
                    {canPublishCohortTemplates && (
                      <Button variant="outline" onClick={handlePublishTemplates} loading={publishingTemplates}>
                        <Save className="h-4 w-4" />发布为年级模板
                      </Button>
                    )}
                    <Button variant="gold" onClick={handleSaveSettings} loading={savingSettings}>
                      <Settings2 className="h-4 w-4" />保存并重算
                    </Button>
                  </div>
                </div>
                <GradeSettingsEditor
                  settings={settingsDraft}
                  subjects={selectedExam.subjects}
                  context={settingsContext}
                  onChange={setSettingsDraft}
                />
              </div>
            ) : <div className="flex justify-center py-20"><Spinner size={28} /></div>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <SummaryCard label="参考学生" value={selectedExam.records.length} hint={`${classNames.length} 个班级`} />
                <SummaryCard label="考试科目" value={selectedExam.subjects.length} hint={selectedExam.subjects.join("、")} />
                <SummaryCard label="赋分科目" value={Object.keys(selectedExam.settings.assignmentRules).length} hint={Object.keys(selectedExam.settings.assignmentRules).join("、") || "全部使用原始分"} />
                <SummaryCard label="赋分总分平均" value={formatNumber(averageTotal)} hint="按各班统计科目计算" />
              </div>

              <Card className="p-0 overflow-hidden">
                <div className="flex flex-col gap-3 border-b border-ink-100 p-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex flex-wrap gap-1 rounded-lg bg-ink-100 p-1">
                    {([
                      ["ranking", "学生名次"],
                      ["average", "班级平均分"],
                      ["templates", "统计模板"],
                    ] as const).map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setQueryView(value)}
                        className={cn(
                          "rounded-md px-3 py-1.5 text-xs font-medium",
                          queryView === value ? "bg-paper text-ink-900 shadow-sm" : "text-ink-500",
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  {queryView === "ranking" && (
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Select
                        aria-label="筛选班级"
                        className="min-w-40"
                        value={classFilter}
                        onChange={(event) => setClassFilter(event.target.value)}
                        placeholder="全部班级"
                        options={classNames.map((name) => ({ value: name, label: name }))}
                      />
                      <div className="relative min-w-56">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
                        <input
                          value={keyword}
                          onChange={(event) => setKeyword(event.target.value)}
                          placeholder="搜索姓名、学号或班级"
                          className="input-base pl-9"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {queryView === "ranking" && (
                  <div className="overflow-x-auto">
                    <table className="min-w-[1100px] w-full text-xs">
                      <thead className="bg-ink-50 text-ink-500">
                        <tr>
                          <th className="sticky left-0 z-10 bg-ink-50 px-3 py-2.5 text-left font-medium">年级名次</th>
                          <th className="px-3 py-2.5 text-left font-medium">班级名次</th>
                          <th className="px-3 py-2.5 text-left font-medium">班级</th>
                          <th className="px-3 py-2.5 text-left font-medium">姓名</th>
                          <th className="px-3 py-2.5 text-left font-medium">学号</th>
                          {selectedExam.subjects.map((subject) => <th key={subject} className="px-3 py-2.5 text-right font-medium">{subject}</th>)}
                          <th className="px-3 py-2.5 text-right font-medium">原始总分</th>
                          <th className="px-3 py-2.5 text-right font-medium">赋分总分</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-ink-100">
                        {filteredRecords.map((record) => (
                          <tr key={record.id} className="hover:bg-gold-50/30">
                            <td className="sticky left-0 z-10 bg-paper px-3 py-3 font-semibold text-gold-700">{record.gradeRank}</td>
                            <td className="px-3 py-3 text-ink-600">{record.classRank}</td>
                            <td className="px-3 py-3 text-ink-600">{record.className}</td>
                            <td className="px-3 py-3 font-medium text-ink-900">{record.studentName}</td>
                            <td className="px-3 py-3 text-ink-500">{record.studentNo}</td>
                            {selectedExam.subjects.map((subject) => {
                              const raw = record.scores[subject];
                              const assigned = record.assignedScores[subject];
                              const changed = typeof raw === "number" && typeof assigned === "number" && raw !== assigned;
                              return (
                                <td key={subject} className="px-3 py-3 text-right">
                                  <div className="font-medium text-ink-800">{formatNumber(changed ? assigned : raw)}</div>
                                  {changed && <div className="text-[10px] text-ink-400">原始 {formatNumber(raw)}</div>}
                                </td>
                              );
                            })}
                            <td className="px-3 py-3 text-right text-ink-600">{formatNumber(record.rawTotal)}</td>
                            <td className="px-3 py-3 text-right font-semibold text-ink-900">{formatNumber(record.assignedTotal)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {filteredRecords.length === 0 && <div className="py-12 text-center text-sm text-ink-400">没有符合条件的学生</div>}
                  </div>
                )}

                {queryView === "average" && (
                  <div className="overflow-x-auto">
                    <table className="min-w-[800px] w-full text-xs">
                      <thead className="bg-ink-50 text-ink-500">
                        <tr>
                          <th className="px-3 py-2.5 text-left font-medium">班级</th>
                          <th className="px-3 py-2.5 text-right font-medium">人数</th>
                          {selectedExam.subjects.map((subject) => <th key={subject} className="px-3 py-2.5 text-right font-medium">{subject}均分</th>)}
                          <th className="px-3 py-2.5 text-right font-medium">原始总分均分</th>
                          <th className="px-3 py-2.5 text-right font-medium">赋分总分均分</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-ink-100">
                        {classAverages.map((item, index) => (
                          <tr key={item.classId}>
                            <td className="px-3 py-3 font-medium text-ink-900"><span className="mr-2 text-gold-600">{index + 1}</span>{item.className}</td>
                            <td className="px-3 py-3 text-right text-ink-600">{item.studentCount}</td>
                            {selectedExam.subjects.map((subject) => <td key={subject} className="px-3 py-3 text-right">{formatNumber(item.subjectAverages[subject])}</td>)}
                            <td className="px-3 py-3 text-right text-ink-600">{formatNumber(item.rawTotalAverage)}</td>
                            <td className="px-3 py-3 text-right font-semibold text-ink-900">{formatNumber(item.assignedTotalAverage)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {queryView === "templates" && (
                  <div className="space-y-4 p-4">
                    {enabledTemplates.length === 0 ? (
                      <EmptyState title="没有启用的统计模板" description="在“统计设置”中启用或调整在线表格模板。" />
                    ) : enabledTemplates.map((template) => (
                      <div key={template.id} className="overflow-hidden rounded-lg border border-ink-200">
                        <div className="flex flex-col gap-2 border-b border-ink-100 bg-mist/50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <div className="font-medium text-sm text-ink-900">{template.name}</div>
                            <div className="mt-0.5 text-xs text-ink-400">
                              {template.scoreMode === "assigned" ? "赋分口径" : "原始分口径"} · {template.subjects.join("、") || "未选择科目"}
                            </div>
                          </div>
                          <Badge variant="teal">在线表格</Badge>
                        </div>
                        <TemplateReport exam={selectedExam} template={template} />
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>
          )}
        </>
      )}

      {schoolId && teacher && (
        <GradeImportWizard
          open={importOpen}
          schoolId={schoolId}
          teacherId={teacher.id}
          cohorts={cohorts}
          onClose={() => setImportOpen(false)}
          onImported={(exam) => {
            setImportOpen(false);
            setMode("query");
            void load(exam.id);
          }}
        />
      )}
    </div>
  );
}
