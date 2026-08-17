import { useEffect, useMemo, useState } from "react";
import { ArrowRight, ClipboardCheck, Download, Plus, Save, Trash2, UsersRound, X } from "lucide-react";
import { Link } from "react-router";
import { examArrangementService } from "@/services/examArrangement";
import { quotaService } from "@/services/quota";
import { toast } from "@/stores/ui";
import type {
  ExamArrangement,
  ExamInvigilationConfig,
  ExamInvigilationPeriod,
  ExamInvigilationSlotOverride,
  ExamInvigilationTeacher,
  GradeCohort,
  GradeTeacherOption,
} from "@/types";
import { buildExamPrintRoomStatistics } from "@/lib/exam-print-room-statistics";
import {
  buildExamInvigilationTable,
  examInvigilationPeriodLabel,
  formatExamDateWithWeekday,
  formatExamTimeRange,
} from "@/lib/exam-invigilation";
import { downloadExamPrintRoomStatistics } from "@/lib/exam-arrangement-export";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { Spinner } from "@/components/ui/Spinner";

interface Props {
  schoolId: string;
  teacherId: string;
  cohorts: GradeCohort[];
  cohortKey: string;
  onCohortChange: (value: string) => void;
}

const LEADER_ROLES = new Set(["gradeLeader", "dean", "vicePrincipal", "principal"]);

function cloneConfig(config: ExamInvigilationConfig): ExamInvigilationConfig {
  return structuredClone(config);
}

function defaultConfig(arrangement: ExamArrangement, teacherOptions: GradeTeacherOption[]): ExamInvigilationConfig {
  const teachers = teacherOptions
    .filter((teacher) => (
      arrangement.subjects.includes(teacher.subject)
      || teacher.roles?.some((role) => LEADER_ROLES.has(role))
    ))
    .map((teacher) => ({
      id: teacher.id,
      name: teacher.name,
      subject: teacher.subject,
      isPrepLeader: teacher.roles?.includes("prepLeader") || false,
      isLeader: teacher.roles?.some((role) => LEADER_ROLES.has(role)) || false,
    }));
  return {
    teachers,
    subjectTimes: arrangement.subjects.map((subject) => ({
      subject,
      date: arrangement.examDate || "",
      period: "morning" as const,
      time: "",
      durationMinutes: 120,
    })),
    patrolTeacherIds: teachers.filter((teacher) => teacher.isLeader).map((teacher) => teacher.id),
    overrides: {},
  };
}

function configForArrangement(
  arrangement: ExamArrangement,
  teacherOptions: GradeTeacherOption[],
): ExamInvigilationConfig {
  const defaults = defaultConfig(arrangement, teacherOptions);
  if (!arrangement.invigilation) return defaults;

  const current = cloneConfig(arrangement.invigilation);
  const timesBySubject = new Map(current.subjectTimes.map((item) => [item.subject, item]));
  current.subjectTimes = defaults.subjectTimes.map((fallback) => (
    timesBySubject.get(fallback.subject) || fallback
  ));
  current.overrides ||= {};
  if (current.patrolTeacherIds === undefined) {
    current.patrolTeacherIds = [...new Set([
      ...current.teachers.filter((teacher) => teacher.isLeader).map((teacher) => teacher.id),
      ...Object.values(current.overrides).flatMap((override) => override.patrolTeacherId ? [override.patrolTeacherId] : []),
    ])];
  }
  Object.values(current.overrides).forEach((override) => { delete override.patrolTeacherId; });
  return current;
}

function newTeacherId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function parseBatchTeachers(value: string): ExamInvigilationTeacher[] {
  return value.split(/\r?\n/).flatMap((line, index) => {
    const text = line.trim();
    if (!text) return [];
    const parts = text.split(/[，,\t ]+/).map((item) => item.trim()).filter(Boolean);
    if (parts.length < 2) return [];
    const markers = parts.slice(2).join(" ");
    return [{
      id: newTeacherId(`batch-${index}`),
      subject: parts[0],
      name: parts[1],
      isPrepLeader: markers.includes("备课组长"),
      isLeader: markers.includes("领导"),
    }];
  });
}

function formatMinutes(minutes: number): string {
  if (minutes <= 0) return "0 分钟";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${rest} 分钟`;
  return rest ? `${hours} 小时 ${rest} 分钟` : `${hours} 小时`;
}

function cellOverrideValue(
  override: ExamInvigilationSlotOverride | undefined,
  kind: "room" | "outside",
  roomId?: string,
): string | null | undefined {
  if (!override) return undefined;
  if (kind === "room") {
    if (!roomId || !Object.prototype.hasOwnProperty.call(override.roomTeacherIds, roomId)) return undefined;
    return override.roomTeacherIds[roomId];
  }
  if (!Object.prototype.hasOwnProperty.call(override, "outsideTeacherId")) return undefined;
  return override.outsideTeacherId;
}

function TeacherSelect({
  computedTeacherId,
  overrideValue,
  teachers,
  disabled,
  highlighted,
  onChange,
  onTeacherSelect,
  ariaLabel,
}: {
  computedTeacherId: string | null;
  overrideValue: string | null | undefined;
  teachers: ExamInvigilationTeacher[];
  disabled?: boolean;
  highlighted?: boolean;
  onChange: (value: string) => void;
  onTeacherSelect: (teacherId: string) => void;
  ariaLabel: string;
}) {
  const teacherMap = new Map(teachers.map((teacher) => [teacher.id, teacher]));
  const autoLabel = computedTeacherId ? `自动：${teacherMap.get(computedTeacherId)?.name || "未知教师"}` : "自动：空缺";
  const value = overrideValue === undefined ? "__auto__" : overrideValue === null ? "__blank__" : overrideValue;
  return (
    <select
      aria-label={ariaLabel}
      className={cn(
        "min-w-28 rounded-md border px-2 py-1.5 text-xs text-ink-800 outline-none transition-colors focus:border-gold-400",
        highlighted ? "border-yellow-500 bg-[#fff88a]" : "border-ink-200 bg-paper",
      )}
      value={value}
      disabled={disabled}
      onFocus={() => { if (computedTeacherId) onTeacherSelect(computedTeacherId); }}
      onChange={(event) => {
        const next = event.target.value;
        onChange(next);
        if (next !== "__auto__" && next !== "__blank__") onTeacherSelect(next);
      }}
    >
      <option value="__auto__">{autoLabel}</option>
      <option value="__blank__">留空</option>
      {teachers.map((teacher) => (
        <option key={teacher.id} value={teacher.id}>{teacher.name} · {teacher.subject}</option>
      ))}
    </select>
  );
}

export function InvigilationTableSection({ schoolId, teacherId, cohorts, cohortKey, onCohortChange }: Props) {
  const [arrangements, setArrangements] = useState<ExamArrangement[]>([]);
  const [selectedArrangementId, setSelectedArrangementId] = useState("");
  const [teacherOptions, setTeacherOptions] = useState<GradeTeacherOption[]>([]);
  const [config, setConfig] = useState<ExamInvigilationConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [batchText, setBatchText] = useState("");
  const [statsSort, setStatsSort] = useState<"minutes" | "subject" | "name">("minutes");
  const [selectedTeacherId, setSelectedTeacherId] = useState<string | null>(null);

  useEffect(() => {
    if (!cohortKey) {
      setArrangements([]);
      setTeacherOptions([]);
      setSelectedArrangementId("");
      return;
    }
    let active = true;
    setLoading(true);
    Promise.all([
      examArrangementService.listArrangements(schoolId, cohortKey),
      examArrangementService.getContext(schoolId, cohortKey),
    ]).then(([items, context]) => {
      if (!active) return;
      setArrangements(items);
      setTeacherOptions(context.teachers || []);
      setSelectedArrangementId((current) => items.some((item) => item.id === current) ? current : items[0]?.id || "");
    }).catch((error) => {
      if (!active) return;
      setArrangements([]);
      setTeacherOptions([]);
      setSelectedArrangementId("");
      toast.error("加载考试方案失败", error instanceof Error ? error.message : undefined);
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [cohortKey, schoolId]);

  const selectedArrangement = useMemo(
    () => arrangements.find((item) => item.id === selectedArrangementId) || arrangements[0] || null,
    [arrangements, selectedArrangementId],
  );

  useEffect(() => {
    if (!selectedArrangement) {
      setConfig(null);
      return;
    }
    setConfig(configForArrangement(selectedArrangement, teacherOptions));
  }, [selectedArrangement, teacherOptions]);

  const statistics = useMemo(
    () => selectedArrangement ? buildExamPrintRoomStatistics(selectedArrangement) : null,
    [selectedArrangement],
  );
  const invigilation = useMemo(
    () => selectedArrangement && config ? buildExamInvigilationTable(selectedArrangement, config) : null,
    [selectedArrangement, config],
  );
  const teacherMap = useMemo(() => new Map((config?.teachers || []).map((teacher) => [teacher.id, teacher])), [config]);
  const sortedTeacherStats = useMemo(() => {
    if (!invigilation) return [];
    return [...invigilation.teacherStats].sort((left, right) => {
      if (statsSort === "minutes") return right.minutes - left.minutes || left.name.localeCompare(right.name, "zh-CN");
      if (statsSort === "subject") return left.subject.localeCompare(right.subject, "zh-CN") || left.name.localeCompare(right.name, "zh-CN");
      return left.name.localeCompare(right.name, "zh-CN");
    });
  }, [invigilation, statsSort]);

  const updateConfig = (mutate: (current: ExamInvigilationConfig) => void) => {
    setConfig((current) => {
      if (!current) return current;
      const next = cloneConfig(current);
      mutate(next);
      return next;
    });
  };

  const saveConfig = async () => {
    if (!selectedArrangement || !config) return;
    const invalidRow = buildExamInvigilationTable(selectedArrangement, config).rows.find((row) => row.duplicateTeacherIds.length > 0);
    if (invalidRow) {
      const names = invalidRow.duplicateTeacherIds.map((id) => teacherMap.get(id)?.name || "未知教师").join("、");
      toast.error("同一场监考不能安排同一位老师", `${formatExamDateWithWeekday(invalidRow.date)} ${examInvigilationPeriodLabel(invalidRow.period)}：${names}`);
      return;
    }
    setSaving(true);
    try {
      const saved = await examArrangementService.saveInvigilationConfig(schoolId, selectedArrangement.id, config);
      setArrangements((current) => current.map((item) => item.id === saved.id ? saved : item));
      setConfig(saved.invigilation ? cloneConfig(saved.invigilation) : config);
      toast.success("监考配置已保存");
    } catch (error) {
      toast.error("保存监考配置失败", error instanceof Error ? error.message : undefined);
    } finally {
      setSaving(false);
    }
  };

  const download = async () => {
    if (!selectedArrangement || !config) return;
    const invalidRow = buildExamInvigilationTable(selectedArrangement, config).rows.find((row) => row.duplicateTeacherIds.length > 0);
    if (invalidRow) {
      const names = invalidRow.duplicateTeacherIds.map((id) => teacherMap.get(id)?.name || "未知教师").join("、");
      toast.error("同一场监考不能安排同一位老师", `${formatExamDateWithWeekday(invalidRow.date)} ${examInvigilationPeriodLabel(invalidRow.period)}：${names}`);
      return;
    }
    setDownloading(true);
    try {
      await quotaService.consumeExamUsage(teacherId, "invigilation");
      await downloadExamPrintRoomStatistics({ ...selectedArrangement, invigilation: config || undefined });
    } catch (error) {
      toast.error("下载监考表失败", error instanceof Error ? error.message : undefined);
    } finally {
      setDownloading(false);
    }
  };

  const setCellTeacher = (
    rowKey: string,
    kind: "room" | "outside",
    value: string,
    roomId?: string,
  ) => {
    if (!selectedArrangement || !config) return;
    const next = cloneConfig(config);
    next.overrides ||= {};
    const override = next.overrides[rowKey] ||= { roomTeacherIds: {} };
    const normalized = value === "__auto__" ? undefined : value === "__blank__" ? null : value;

    if (kind === "room" && roomId) {
      if (normalized === undefined) delete override.roomTeacherIds[roomId];
      else override.roomTeacherIds[roomId] = normalized;
    } else if (kind === "outside") {
      if (normalized === undefined) delete override.outsideTeacherId;
      else override.outsideTeacherId = normalized;
    }

    if (typeof normalized === "string") {
      const row = buildExamInvigilationTable(selectedArrangement, next).rows.find((item) => item.key === rowKey);
      if (row?.duplicateTeacherIds.includes(normalized)) {
        toast.error("同一场监考不能安排同一位老师", `${teacherMap.get(normalized)?.name || "该教师"} 已在本场考试中承担其他监考任务。`);
        return;
      }
      setSelectedTeacherId(normalized);
    }
    setConfig(next);
  };

  const addPatrolTeacher = (teacherId: string) => {
    if (!selectedArrangement || !config || !teacherId || config.patrolTeacherIds?.includes(teacherId)) return;
    const next = cloneConfig(config);
    next.patrolTeacherIds = [...(next.patrolTeacherIds || []), teacherId];
    const conflict = buildExamInvigilationTable(selectedArrangement, next).rows.find((row) => row.duplicateTeacherIds.includes(teacherId));
    if (conflict) {
      toast.error("无法加入巡回", `${teacherMap.get(teacherId)?.name || "该教师"} 已在至少一场考试中被人工指定为监考教师。`);
      return;
    }
    setConfig(next);
    setSelectedTeacherId(teacherId);
  };

  const removePatrolTeacher = (teacherId: string) => {
    updateConfig((next) => {
      next.patrolTeacherIds = (next.patrolTeacherIds || []).filter((id) => id !== teacherId);
    });
    if (selectedTeacherId === teacherId) setSelectedTeacherId(null);
  };

  const setTeacherLeader = (index: number, checked: boolean) => {
    if (!selectedArrangement || !config) return;
    const teacher = config.teachers[index];
    if (!teacher) return;
    const next = cloneConfig(config);
    next.teachers[index].isLeader = checked;
    const patrolIds = new Set(next.patrolTeacherIds || []);
    if (checked) patrolIds.add(teacher.id);
    else patrolIds.delete(teacher.id);
    next.patrolTeacherIds = [...patrolIds];

    if (checked) {
      const conflict = buildExamInvigilationTable(selectedArrangement, next).rows.find((row) => row.duplicateTeacherIds.includes(teacher.id));
      if (conflict) {
        toast.error("无法加入巡回", `${teacher.name || "该教师"} 已在至少一场考试中被人工指定为监考教师。`);
        return;
      }
    }
    setConfig(next);
  };

  const addBatchTeachers = () => {
    const parsed = parseBatchTeachers(batchText);
    if (!parsed.length) {
      toast.error("未识别到教师", "每行请填写：学科 姓名，可选添加“备课组长”或“领导”标记");
      return;
    }
    updateConfig((next) => {
      next.teachers.push(...parsed);
      next.patrolTeacherIds = [...new Set([
        ...(next.patrolTeacherIds || []),
        ...parsed.filter((teacher) => teacher.isLeader).map((teacher) => teacher.id),
      ])];
    });
    setBatchText("");
  };

  const controls = (
    <Card className="mb-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
        <div className="grid flex-1 gap-4 sm:grid-cols-2">
          <Select
            label="选择年级"
            aria-label="选择监考表年级"
            value={cohortKey}
            onChange={(event) => onCohortChange(event.target.value)}
            options={cohorts.map((cohort) => ({ value: cohort.key, label: cohort.label }))}
          />
          <Select
            label="选择考试"
            aria-label="选择文印室统计表考试"
            value={selectedArrangementId}
            onChange={(event) => setSelectedArrangementId(event.target.value)}
            options={arrangements.map((arrangement) => ({
              value: arrangement.id,
              label: `${arrangement.name}${arrangement.examDate ? ` · ${arrangement.examDate}` : ""}`,
            }))}
            placeholder={loading ? "正在加载考试方案…" : "请选择考试方案"}
            disabled={loading || arrangements.length === 0}
          />
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => void saveConfig()} disabled={!config || saving}>
            {saving ? <Spinner size={16} /> : <Save className="h-4 w-4" />}保存监考配置
          </Button>
          <Button variant="gold" onClick={() => void download()} disabled={!selectedArrangement || downloading || !statistics?.rooms.length}>
            {downloading ? <Spinner size={16} /> : <Download className="h-4 w-4" />}下载 Excel
          </Button>
        </div>
      </div>
    </Card>
  );

  if (loading && arrangements.length === 0) {
    return <>{controls}<Card><div className="flex justify-center py-20"><Spinner size={28} /></div></Card></>;
  }

  if (!selectedArrangement || !statistics?.rooms.length || !config) {
    return (
      <>
        {controls}
        <Card>
          <EmptyState
            icon={<ClipboardCheck className="h-8 w-8" />}
            title="暂无监考表"
            description="请先完成考场布置并生成考场方案，再配置任课教师和考试时间。"
            action={<Link to="/my-exams/rooms"><Button variant="outline">前往考场布置<ArrowRight className="h-4 w-4" /></Button></Link>}
          />
        </Card>
      </>
    );
  }

  return (
    <>
      {controls}
      <Card className="mb-4">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-ink-900">文印室统计表</h2>
            <p className="mt-1 text-sm text-ink-500">{selectedArrangement.name} · 按考场统计各科试卷份数，空白格表示该考场无需该科试卷。</p>
          </div>
          <Badge>{statistics.rooms.length} 个考场</Badge>
        </div>
        <div className="overflow-x-auto rounded-xl border border-ink-100">
          <table className="min-w-max border-collapse text-sm">
            <tbody>
              <tr className="bg-ink-50 font-medium text-ink-800">
                <th className="sticky left-0 z-10 min-w-28 border-b border-r border-ink-100 bg-ink-50 px-4 py-3 text-left">考场号</th>
                {statistics.rooms.map((room) => <th key={room.roomId} className="min-w-28 border-b border-r border-ink-100 px-4 py-3 text-center last:border-r-0">{room.roomNumber}</th>)}
                <th className="min-w-24 border-b border-ink-100 px-4 py-3 text-center">合计</th>
              </tr>
              <tr>
                <th className="sticky left-0 z-10 border-b border-r border-ink-100 bg-paper px-4 py-3 text-left font-medium text-ink-700">考试地点</th>
                {statistics.rooms.map((room) => <td key={room.roomId} className="border-b border-r border-ink-100 px-4 py-3 text-center text-ink-700 last:border-r-0">{room.roomLocation}</td>)}
                <td className="border-b border-ink-100 px-4 py-3" />
              </tr>
              <tr>
                <th className="sticky left-0 z-10 border-b border-r border-ink-100 bg-paper px-4 py-3 text-left font-medium text-ink-700">组合</th>
                {statistics.rooms.map((room) => <td key={room.roomId} className="border-b border-r border-ink-100 px-4 py-3 text-center font-medium text-ink-800 last:border-r-0">{room.selectionLabel}</td>)}
                <td className="border-b border-ink-100 px-4 py-3" />
              </tr>
              {statistics.rows.map((row) => (
                <tr key={row.label}>
                  <th className="sticky left-0 z-10 border-b border-r border-ink-100 bg-paper px-4 py-3 text-left font-medium text-ink-800">{row.label}</th>
                  {row.counts.map((count, index) => <td key={statistics.rooms[index].roomId} className={cn("border-b border-r border-ink-100 px-4 py-3 text-center tabular-nums text-ink-800", count === 0 && "bg-amber-100/70")}>{count || ""}</td>)}
                  <td className="border-b border-ink-100 px-4 py-3 text-center font-semibold tabular-nums text-ink-900">{row.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="mb-4 grid gap-4 xl:grid-cols-2">
        <Card>
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-ink-900">任课教师名单</h2>
              <p className="mt-1 text-xs text-ink-500">可批量添加，也可逐条修改；备课组长用于场外监考，领导用于巡回。</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => updateConfig((next) => next.teachers.push({ id: newTeacherId("teacher"), name: "", subject: selectedArrangement.subjects[0] || "" }))}>
              <Plus className="h-4 w-4" />添加教师
            </Button>
          </div>
          <div className="max-h-96 space-y-2 overflow-y-auto pr-1">
            {config.teachers.map((teacher, index) => (
              <div key={teacher.id} className="grid grid-cols-[minmax(90px,0.8fr)_minmax(100px,1fr)_auto_auto_auto] items-center gap-2 rounded-lg border border-ink-100 p-2">
                <select className="input-base py-1.5 text-sm" value={teacher.subject} onChange={(event) => updateConfig((next) => { next.teachers[index].subject = event.target.value; })}>
                  {selectedArrangement.subjects.map((subject) => <option key={subject}>{subject}</option>)}
                </select>
                <input aria-label={`教师姓名 ${index + 1}`} className="input-base py-1.5 text-sm" value={teacher.name} onChange={(event) => updateConfig((next) => { next.teachers[index].name = event.target.value; })} placeholder="姓名" />
                <label className="flex items-center gap-1 text-xs text-ink-600"><input type="checkbox" checked={Boolean(teacher.isPrepLeader)} onChange={(event) => updateConfig((next) => { next.teachers[index].isPrepLeader = event.target.checked; })} />备课组长</label>
                <label className="flex items-center gap-1 text-xs text-ink-600"><input type="checkbox" checked={Boolean(teacher.isLeader)} onChange={(event) => setTeacherLeader(index, event.target.checked)} />领导</label>
                <button aria-label={`删除教师 ${teacher.name || index + 1}`} className="rounded p-1.5 text-ink-400 hover:bg-red-50 hover:text-red-600" onClick={() => updateConfig((next) => {
                  next.teachers.splice(index, 1);
                  next.patrolTeacherIds = (next.patrolTeacherIds || []).filter((id) => id !== teacher.id);
                  Object.values(next.overrides || {}).forEach((override) => {
                    for (const [roomId, assignedId] of Object.entries(override.roomTeacherIds)) {
                      if (assignedId === teacher.id) delete override.roomTeacherIds[roomId];
                    }
                    if (override.outsideTeacherId === teacher.id) delete override.outsideTeacherId;
                  });
                })}><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
            <Textarea label="批量添加" value={batchText} onChange={(event) => setBatchText(event.target.value)} placeholder={"每行：学科 姓名 [备课组长] [领导]\n例如：数学 张老师 备课组长"} className="min-h-20" />
            <Button variant="outline" onClick={addBatchTeachers}><UsersRound className="h-4 w-4" />批量加入</Button>
          </div>
        </Card>

        <Card>
          <div className="mb-4">
            <h2 className="text-base font-semibold text-ink-900">考试时间配置</h2>
            <p className="mt-1 text-xs text-ink-500">日期、时段和具体时刻相同的学科会自动视为同时考试；支持上午、下午和晚上，时长用于监考统计。</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-sm">
              <thead><tr className="border-b border-ink-100 text-left text-xs text-ink-500"><th className="px-2 py-2">学科</th><th className="px-2 py-2">日期</th><th className="px-2 py-2">时段</th><th className="px-2 py-2">时刻</th><th className="px-2 py-2">时长（分钟）</th></tr></thead>
              <tbody>
                {config.subjectTimes.map((item, index) => (
                  <tr key={item.subject} className="border-b border-ink-50 last:border-0">
                    <td className="px-2 py-2 font-medium text-ink-800">{item.subject}</td>
                    <td className="px-2 py-2"><Input aria-label={`${item.subject}考试日期`} type="date" value={item.date} onChange={(event) => updateConfig((next) => { next.subjectTimes[index].date = event.target.value; })} className="py-1.5" /></td>
                    <td className="px-2 py-2"><Select aria-label={`${item.subject}考试时段`} value={item.period} onChange={(event) => updateConfig((next) => { next.subjectTimes[index].period = event.target.value as ExamInvigilationPeriod; })} options={[{ value: "morning", label: "上午" }, { value: "afternoon", label: "下午" }, { value: "evening", label: "晚上" }]} className="py-1.5" /></td>
                    <td className="px-2 py-2"><Input aria-label={`${item.subject}考试时刻`} type="time" value={item.time} onChange={(event) => updateConfig((next) => { next.subjectTimes[index].time = event.target.value; })} className="py-1.5" /></td>
                    <td className="px-2 py-2"><Input aria-label={`${item.subject}考试时长`} type="number" min={1} value={item.durationMinutes} onChange={(event) => updateConfig((next) => { next.subjectTimes[index].durationMinutes = Math.max(1, Number(event.target.value) || 1); })} className="py-1.5" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
        <Card className="min-w-0">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-ink-900">监考表</h2>
              <p className="mt-1 text-xs text-ink-500">同一地址的考场会合并表头；选择表内教师可高亮全部同名安排，同一场重复安排会立即提示。</p>
            </div>
            <div className="flex items-center gap-2">
              {selectedTeacherId && teacherMap.get(selectedTeacherId) && (
                <button type="button" className="rounded-full bg-[#fff86b] px-2.5 py-1 text-xs font-medium text-ink-800" onClick={() => setSelectedTeacherId(null)}>
                  高亮：{teacherMap.get(selectedTeacherId)?.name} · 清除
                </button>
              )}
              <Badge>{invigilation?.rows.length || 0} 个场次</Badge>
            </div>
          </div>
          {invigilation?.rows.some((row) => row.duplicateTeacherIds.length > 0) && (
            <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              当前表中存在同一场重复安排的教师，请调整后再保存。
            </div>
          )}
          {!invigilation?.rows.length ? (
            <div className="rounded-xl border border-dashed border-ink-200 py-12 text-center text-sm text-ink-400">请先为至少一门学科填写完整考试日期和时刻。</div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-ink-100">
              <table className="min-w-max border-collapse text-sm">
                <tbody>
                  <tr className="bg-[#dcecef] text-xs font-medium text-ink-800">
                    <th colSpan={4} className="border-b border-r border-[#b6c7cf] px-3 py-2 text-center">考试安排</th>
                    {invigilation.roomLocationGroups.map((group) => (
                      <th key={group.roomLocation} colSpan={group.roomIds.length} className="min-w-36 border-b border-r border-[#b6c7cf] px-3 py-2 text-center">
                        {group.roomLocation}
                      </th>
                    ))}
                    <th rowSpan={3} className="min-w-36 border-b border-r border-[#b6c7cf] px-3 py-2 text-center align-middle">场外监考</th>
                    <th rowSpan={3} className="min-w-44 border-b border-[#b6c7cf] px-3 py-2 text-center align-middle">巡回</th>
                  </tr>
                  <tr className="bg-[#e5f0f2] text-xs text-ink-700">
                    <th className="min-w-36 border-b border-r border-[#b6c7cf] px-3 py-2 text-center">时间</th>
                    <th className="min-w-20 border-b border-r border-[#b6c7cf] px-3 py-2 text-center">时段</th>
                    <th className="min-w-32 border-b border-r border-[#b6c7cf] px-3 py-2 text-center">考试时间</th>
                    <th className="min-w-28 border-b border-r border-[#b6c7cf] px-3 py-2 text-center">学科</th>
                    {invigilation.rooms.map((room) => <th key={room.roomId} className="min-w-36 border-b border-r border-[#b6c7cf] px-3 py-2 text-center font-medium">{room.roomNumber}</th>)}
                  </tr>
                  <tr className="bg-[#eef4f4] text-xs text-ink-700">
                    <th colSpan={4} className="border-b border-r border-[#b6c7cf] px-3 py-2 text-center">试场人数</th>
                    {invigilation.rooms.map((room) => <td key={room.roomId} className="border-b border-r border-[#b6c7cf] px-3 py-2 text-center">{room.studentCount}</td>)}
                  </tr>
                  {invigilation.rows.map((row, rowIndex) => {
                    const override = config.overrides?.[row.key];
                    return (
                      <tr key={row.key}>
                        <td className="border-b border-r border-[#b6c7cf] bg-[#e5f0f2] px-3 py-2 text-center text-xs font-medium text-ink-800">{formatExamDateWithWeekday(row.date)}</td>
                        <td className="border-b border-r border-[#b6c7cf] bg-[#e5f0f2] px-3 py-2 text-center text-xs text-ink-800">{examInvigilationPeriodLabel(row.period)}</td>
                        <td className="border-b border-r border-[#b6c7cf] bg-[#e5f0f2] px-3 py-2 text-center text-xs tabular-nums text-ink-800">{formatExamTimeRange(row.time, row.durationMinutes)}</td>
                        <td className="border-b border-r border-[#b6c7cf] bg-[#e5f0f2] px-3 py-2 text-center font-medium text-ink-900">{row.subjectLabel}</td>
                        {invigilation.rooms.map((room) => {
                          const count = row.roomStudentCounts[room.roomId] || 0;
                          const assignedTeacherId = row.roomTeacherIds[room.roomId];
                          const highlighted = Boolean(selectedTeacherId && assignedTeacherId === selectedTeacherId);
                          const duplicate = Boolean(assignedTeacherId && row.duplicateTeacherIds.includes(assignedTeacherId));
                          return (
                            <td key={room.roomId} className={cn(
                              "border-b border-r border-[#b6c7cf] px-2 py-2 text-center transition-colors",
                              !count && "bg-ink-50/60",
                              highlighted && "bg-[#fff86b]",
                              duplicate && "ring-2 ring-inset ring-red-400",
                            )}>
                              {count ? (
                                <div>
                                  <TeacherSelect
                                    ariaLabel={`${row.subjectLabel} ${room.roomNumber}监考教师`}
                                    computedTeacherId={assignedTeacherId}
                                    overrideValue={cellOverrideValue(override, "room", room.roomId)}
                                    teachers={config.teachers}
                                    highlighted={highlighted}
                                    onTeacherSelect={setSelectedTeacherId}
                                    onChange={(value) => setCellTeacher(row.key, "room", value, room.roomId)}
                                  />
                                  <div className="mt-1 text-[10px] text-ink-400">{count} 人</div>
                                </div>
                              ) : <span className="text-xs text-ink-300">无学生</span>}
                            </td>
                          );
                        })}
                        <td className={cn(
                          "border-b border-r border-[#b6c7cf] px-2 py-2 text-center transition-colors",
                          selectedTeacherId === row.outsideTeacherId && "bg-[#fff86b]",
                          row.outsideTeacherId && row.duplicateTeacherIds.includes(row.outsideTeacherId) && "ring-2 ring-inset ring-red-400",
                        )}>
                          <TeacherSelect
                            ariaLabel={`${row.subjectLabel}场外监考`}
                            computedTeacherId={row.outsideTeacherId}
                            overrideValue={cellOverrideValue(override, "outside")}
                            teachers={config.teachers}
                            highlighted={Boolean(selectedTeacherId && selectedTeacherId === row.outsideTeacherId)}
                            onTeacherSelect={setSelectedTeacherId}
                            onChange={(value) => setCellTeacher(row.key, "outside", value)}
                          />
                        </td>
                        {rowIndex === 0 && (
                          <td
                            rowSpan={invigilation.rows.length}
                            className={cn(
                              "border-b border-[#b6c7cf] bg-[#eef4f4] px-3 py-3 align-middle transition-colors",
                              selectedTeacherId && invigilation.patrolTeacherIds.includes(selectedTeacherId) && "bg-[#fff86b]",
                            )}
                          >
                            <div className="flex min-w-36 flex-col gap-2">
                              <div className="flex flex-wrap justify-center gap-1.5">
                                {invigilation.patrolTeacherIds.map((id) => {
                                  const teacher = teacherMap.get(id);
                                  if (!teacher) return null;
                                  return (
                                    <span key={id} className={cn(
                                      "inline-flex items-center rounded-full border border-[#b6c7cf] bg-paper text-xs text-ink-800",
                                      selectedTeacherId === id && "border-yellow-500 bg-[#fff86b]",
                                    )}>
                                      <button type="button" className="px-2 py-1" onClick={() => setSelectedTeacherId(id)}>{teacher.name}</button>
                                      <button type="button" aria-label={`移除巡回教师 ${teacher.name}`} className="border-l border-[#d5dfe2] px-1.5 py-1 text-ink-400 hover:text-red-600" onClick={() => removePatrolTeacher(id)}>
                                        <X className="h-3 w-3" />
                                      </button>
                                    </span>
                                  );
                                })}
                                {!invigilation.patrolTeacherIds.length && <span className="text-xs text-ink-400">暂无巡回教师</span>}
                              </div>
                              <select
                                aria-label="添加巡回教师"
                                className="rounded-md border border-[#b6c7cf] bg-paper px-2 py-1.5 text-xs text-ink-700 outline-none focus:border-gold-400"
                                value=""
                                onChange={(event) => addPatrolTeacher(event.target.value)}
                              >
                                <option value="">+ 添加巡回教师</option>
                                {config.teachers.filter((teacher) => !invigilation.patrolTeacherIds.includes(teacher.id)).map((teacher) => (
                                  <option key={teacher.id} value={teacher.id}>{teacher.name} · {teacher.subject}</option>
                                ))}
                              </select>
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card>
          <div className="mb-4 flex items-end justify-between gap-2">
            <div><h2 className="text-base font-semibold text-ink-900">监考时长</h2><p className="mt-1 text-xs text-ink-500">实时统计全部监考、场外和巡回安排。</p></div>
            <Select aria-label="监考时长排序" value={statsSort} onChange={(event) => setStatsSort(event.target.value as typeof statsSort)} options={[{ value: "minutes", label: "按时长" }, { value: "subject", label: "按学科" }, { value: "name", label: "按姓名" }]} className="min-w-24 py-1.5 text-xs" />
          </div>
          <div className="max-h-[620px] space-y-2 overflow-y-auto pr-1">
            {sortedTeacherStats.map((stat) => (
              <div key={stat.teacherId} className="flex items-center justify-between gap-3 rounded-lg border border-ink-100 px-3 py-2">
                <div className="min-w-0"><div className="truncate text-sm font-medium text-ink-800">{stat.name}</div><div className="text-[11px] text-ink-400">{stat.subject} · {stat.sessions} 场</div></div>
                <div className="whitespace-nowrap text-xs font-semibold tabular-nums text-ink-700">{formatMinutes(stat.minutes)}</div>
              </div>
            ))}
            {!sortedTeacherStats.length && <div className="py-10 text-center text-xs text-ink-400">暂无教师</div>}
          </div>
        </Card>
      </div>
    </>
  );
}
