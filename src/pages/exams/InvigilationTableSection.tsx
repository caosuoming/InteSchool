import { useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { ArrowRight, ChevronDown, ChevronUp, ClipboardCheck, Copy, Download, Move, Plus, RotateCcw, Save, Trash2, Upload, X } from "lucide-react";
import { Link } from "react-router";
import { examArrangementService } from "@/services/examArrangement";
import { quotaService } from "@/services/quota";
import { toast } from "@/stores/ui";
import type {
  ExamArrangement,
  ExamInvigilationConfig,
  ExamInvigilationPeriod,
  ExamInvigilationSameDayRequirement,
  GradeCohort,
  GradeTeacherOption,
} from "@/types";
import { buildExamPrintRoomStatistics } from "@/lib/exam-print-room-statistics";
import {
  buildExamInvigilationTable,
  examInvigilationPeriodLabel,
  formatExamDateWithWeekday,
  formatExamWeekday,
  formatExamTimeRange,
  wrapInvigilationHeaderLabel,
} from "@/lib/exam-invigilation";
import { downloadExamPrintRoomStatistics } from "@/lib/exam-arrangement-export";
import {
  downloadInvigilationTeacherTemplate,
  readInvigilationTeacherFile,
  replaceInvigilationTeachers,
} from "@/lib/exam-invigilation-teacher-spreadsheet";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input, Select } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Spinner } from "@/components/ui/Spinner";

interface Props {
  schoolId: string;
  teacherId: string;
  cohorts: GradeCohort[];
  cohortKey: string;
  onCohortChange: (value: string) => void;
  isSchoolAdmin?: boolean;
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
  const current = arrangement.invigilation ? cloneConfig(arrangement.invigilation) : defaults;
  const timesBySubject = new Map(current.subjectTimes.map((item) => [item.subject, item]));
  current.subjectTimes = defaults.subjectTimes.map((fallback) => (
    timesBySubject.get(fallback.subject) || fallback
  ));
  current.overrides ||= {};
  current.autoArrangePriority ||= "duration";
  if (current.patrolTeacherIds === undefined) {
    current.patrolTeacherIds = [...new Set([
      ...current.teachers.filter((teacher) => teacher.isLeader).map((teacher) => teacher.id),
      ...Object.values(current.overrides).flatMap((override) => override.patrolTeacherId ? [override.patrolTeacherId] : []),
    ])];
  }
  Object.values(current.overrides).forEach((override) => { delete override.patrolTeacherId; });

  return current;
}

const PERIOD_ORDER: Record<ExamInvigilationPeriod, number> = {
  morning: 0,
  afternoon: 1,
  evening: 2,
};

function sortSubjectTimes(config: ExamInvigilationConfig) {
  config.subjectTimes.sort((left, right) => (
    left.date.localeCompare(right.date)
    || left.time.localeCompare(right.time)
    || PERIOD_ORDER[left.period] - PERIOD_ORDER[right.period]
    || left.subject.localeCompare(right.subject, "zh-CN")
  ));
}

function newTeacherId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function formatMinutes(minutes: number): string {
  if (minutes <= 0) return "0 分钟";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${rest} 分钟`;
  return rest ? `${hours} 小时 ${rest} 分钟` : `${hours} 小时`;
}

const SUBJECT_SHORT_NAMES: Record<string, string> = {
  语文: "语",
  数学: "数",
  英语: "英",
  物理: "物",
  化学: "化",
  生物: "生",
  政治: "政",
  思想政治: "政",
  历史: "历",
  地理: "地",
  信息技术: "信",
  通用技术: "通",
  技术: "技",
};

function subjectShortName(subject: string): string {
  return SUBJECT_SHORT_NAMES[subject] || Array.from(subject.trim())[0] || subject;
}

function mutateTeacherRequirement(
  config: ExamInvigilationConfig,
  teacherId: string,
  mutate: (requirement: NonNullable<ExamInvigilationConfig["teacherRequirements"]>[string]) => void,
) {
  const requirement = { ...(config.teacherRequirements?.[teacherId] || {}) };
  mutate(requirement);
  config.teacherRequirements ||= {};
  if (Object.keys(requirement).length) config.teacherRequirements[teacherId] = requirement;
  else delete config.teacherRequirements[teacherId];
  if (Object.keys(config.teacherRequirements).length === 0) delete config.teacherRequirements;
}

function arrangementDateKey(arrangement: ExamArrangement): string {
  return arrangement.examDate || arrangement.createdAt;
}

type InvigilationCellKind = "room" | "outside";

interface InvigilationCellTarget {
  rowKey: string;
  kind: InvigilationCellKind;
  roomId?: string;
  roomIds?: string[];
}

function cellTargetKey(target: InvigilationCellTarget): string {
  return `${target.rowKey}\u0000${target.kind}\u0000${target.roomId || ""}`;
}

function writeCellOverride(
  config: ExamInvigilationConfig,
  target: InvigilationCellTarget,
  teacherId: string | null | undefined,
) {
  config.overrides ||= {};
  const override = config.overrides[target.rowKey] ||= { roomTeacherIds: {} };
  if (target.kind === "room" && target.roomId) {
    (target.roomIds || [target.roomId]).forEach((roomId) => { delete override.roomTeacherIds[roomId]; });
    if (teacherId === undefined) delete override.roomTeacherIds[target.roomId];
    else override.roomTeacherIds[target.roomId] = teacherId;
    return;
  }
  if (teacherId === undefined) delete override.outsideTeacherId;
  else override.outsideTeacherId = teacherId;
}

function consecutiveRowSpan<T>(items: T[], index: number, keyFor: (item: T) => string): number {
  const key = keyFor(items[index]);
  if (index > 0 && keyFor(items[index - 1]) === key) return 0;
  let span = 1;
  while (index + span < items.length && keyFor(items[index + span]) === key) span += 1;
  return span;
}

export function InvigilationTableSection({
  schoolId,
  teacherId,
  cohorts,
  cohortKey,
  onCohortChange,
  isSchoolAdmin = false,
}: Props) {
  const [arrangements, setArrangements] = useState<ExamArrangement[]>([]);
  const [recycleBin, setRecycleBin] = useState<ExamArrangement[]>([]);
  const [selectedArrangementId, setSelectedArrangementId] = useState("");
  const [teacherOptions, setTeacherOptions] = useState<GradeTeacherOption[]>([]);
  const [config, setConfig] = useState<ExamInvigilationConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [importingTeachers, setImportingTeachers] = useState(false);
  const [statsSort, setStatsSort] = useState<"minutes" | "subject" | "name">("minutes");
  const [selectedTeacherId, setSelectedTeacherId] = useState<string | null>(null);
  const [selectedCells, setSelectedCells] = useState<InvigilationCellTarget[]>([]);
  const teacherFileInputRef = useRef<HTMLInputElement>(null);
  const tableTwoRef = useRef<HTMLDivElement>(null);
  const floatingDurationRef = useRef<HTMLDivElement>(null);
  const durationDragRef = useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number } | null>(null);
  const [historyArrangementIds, setHistoryArrangementIds] = useState<string[]>([]);
  const [reuseTeacherOpen, setReuseTeacherOpen] = useState(false);
  const [reuseTimeOpen, setReuseTimeOpen] = useState(false);
  const [addTeacherOpen, setAddTeacherOpen] = useState(false);
  const [manualTeacherName, setManualTeacherName] = useState("");
  const [manualTeacherSubject, setManualTeacherSubject] = useState("");
  const [tableTwoVisible, setTableTwoVisible] = useState(false);
  const [durationListCollapsed, setDurationListCollapsed] = useState(false);
  const [floatingDurationPosition, setFloatingDurationPosition] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!cohortKey) {
      setArrangements([]);
      setRecycleBin([]);
      setTeacherOptions([]);
      setSelectedArrangementId("");
      return;
    }
    let active = true;
    setLoading(true);
    Promise.all([
      examArrangementService.listArrangements(schoolId, cohortKey),
      examArrangementService.getContext(schoolId, cohortKey),
      isSchoolAdmin ? examArrangementService.listInvigilationRecycleBin(schoolId) : Promise.resolve([]),
    ]).then(([items, context, deletedItems]) => {
      if (!active) return;
      const activeItems = items.filter((item) => !item.invigilationDeletedAt);
      setArrangements(activeItems);
      setRecycleBin(deletedItems.filter((item) => item.cohortKey === cohortKey));
      setTeacherOptions(context.teachers || []);
      setSelectedArrangementId((current) => activeItems.some((item) => item.id === current) ? current : activeItems[0]?.id || "");
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
  }, [cohortKey, isSchoolAdmin, schoolId]);

  const selectedArrangement = useMemo(
    () => arrangements.find((item) => item.id === selectedArrangementId) || arrangements[0] || null,
    [arrangements, selectedArrangementId],
  );
  const canEditSelected = Boolean(
    selectedArrangement && (selectedArrangement.teacherId === teacherId || isSchoolAdmin),
  );
  const readOnly = Boolean(selectedArrangement && !canEditSelected);

  useEffect(() => {
    if (!selectedArrangement) {
      setConfig(null);
      setSelectedCells([]);
      return;
    }
    setConfig(configForArrangement(selectedArrangement, teacherOptions));
    setSelectedCells([]);
  }, [selectedArrangement, teacherOptions]);

  useEffect(() => {
    setHistoryArrangementIds([]);
  }, [selectedArrangement?.id]);

  const statistics = useMemo(
    () => selectedArrangement ? buildExamPrintRoomStatistics(selectedArrangement) : null,
    [selectedArrangement],
  );
  const cohortLabel = useMemo(
    () => cohorts.find((cohort) => cohort.key === cohortKey)?.label || selectedArrangement?.cohortLabel || "",
    [cohortKey, cohorts, selectedArrangement?.cohortLabel],
  );
  const teacherMap = useMemo(() => new Map((config?.teachers || []).map((teacher) => [teacher.id, teacher])), [config]);
  const historicalArrangements = useMemo(() => {
    if (!selectedArrangement) return [];
    const currentDate = arrangementDateKey(selectedArrangement);
    return arrangements
      .filter((item) => (
        item.id !== selectedArrangement.id
        && Boolean(item.invigilation)
        && arrangementDateKey(item) < currentDate
      ))
      .sort((left, right) => arrangementDateKey(right).localeCompare(arrangementDateKey(left)));
  }, [arrangements, selectedArrangement]);
  const reusableArrangements = useMemo(() => {
    if (!selectedArrangement) return [];
    return arrangements
      .filter((item) => item.id !== selectedArrangement.id && Boolean(item.invigilation))
      .sort((left, right) => arrangementDateKey(right).localeCompare(arrangementDateKey(left)));
  }, [arrangements, selectedArrangement]);

  const teacherSummary = useMemo(() => {
    if (!config) return { total: 0, subjects: [] as Array<[string, number]> };
    const counts = new Map<string, number>();
    config.teachers.forEach((teacher) => counts.set(teacher.subject, (counts.get(teacher.subject) || 0) + 1));
    return {
      total: config.teachers.length,
      subjects: [...counts.entries()].sort(([left], [right]) => left.localeCompare(right, "zh-CN")),
    };
  }, [config]);

  const historicalTeacherMinutes = useMemo(() => {
    if (!config) return {} as Record<string, number>;
    const selectedHistory = new Set(historyArrangementIds);
    const historicalTables = historicalArrangements
      .filter((arrangement) => selectedHistory.has(arrangement.id) && arrangement.invigilation)
      .map((arrangement) => buildExamInvigilationTable(arrangement, arrangement.invigilation!));
    return Object.fromEntries(config.teachers.map((teacher) => {
      let minutes = 0;
      for (const table of historicalTables) {
        const matched = table.teacherStats.find((item) => (
          item.teacherId === teacher.id
          || (item.name === teacher.name && item.subject === teacher.subject)
        ));
        minutes += matched?.minutes || 0;
      }
      return [teacher.id, minutes];
    }));
  }, [config, historicalArrangements, historyArrangementIds]);

  const invigilation = useMemo(
    () => selectedArrangement && config
      ? buildExamInvigilationTable(selectedArrangement, config, { baselineTeacherMinutes: historicalTeacherMinutes })
      : null,
    [config, historicalTeacherMinutes, selectedArrangement],
  );

  const cumulativeTeacherStats = useMemo(() => (invigilation?.teacherStats || []).map((stat) => ({
    ...stat,
    cumulativeMinutes: stat.minutes + (historicalTeacherMinutes[stat.teacherId] || 0),
  })), [historicalTeacherMinutes, invigilation]);

  const sortedTeacherStats = useMemo(() => {
    return [...cumulativeTeacherStats].sort((left, right) => {
      if (statsSort === "minutes") return left.cumulativeMinutes - right.cumulativeMinutes || left.name.localeCompare(right.name, "zh-CN");
      if (statsSort === "subject") return left.subject.localeCompare(right.subject, "zh-CN") || left.name.localeCompare(right.name, "zh-CN");
      return left.name.localeCompare(right.name, "zh-CN");
    });
  }, [cumulativeTeacherStats, statsSort]);
  const hasRenderedInvigilationTable = Boolean(selectedArrangement && statistics?.rooms.length && config);

  useEffect(() => {
    if (!hasRenderedInvigilationTable) {
      setTableTwoVisible(false);
      return;
    }
    const node = tableTwoRef.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => {
      setTableTwoVisible(entry.isIntersecting);
    }, { threshold: 0.08 });
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasRenderedInvigilationTable, selectedArrangement?.id]);

  useEffect(() => {
    if (!tableTwoVisible || floatingDurationPosition || typeof window === "undefined") return;
    const width = Math.min(576, Math.max(280, window.innerWidth - 32));
    setFloatingDurationPosition({
      x: Math.max(16, window.innerWidth - width - 24),
      y: 88,
    });
  }, [floatingDurationPosition, tableTwoVisible]);

  const updateConfig = (mutate: (current: ExamInvigilationConfig) => void) => {
    setConfig((current) => {
      if (!current) return current;
      const next = cloneConfig(current);
      mutate(next);
      return next;
    });
  };

  const startDurationDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!tableTwoVisible || event.button !== 0) return;
    const rect = floatingDurationRef.current?.getBoundingClientRect();
    durationDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: floatingDurationPosition?.x ?? rect?.left ?? 16,
      originY: floatingDurationPosition?.y ?? rect?.top ?? 88,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveDurationDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = durationDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId || typeof window === "undefined") return;
    const rect = floatingDurationRef.current?.getBoundingClientRect();
    const width = rect?.width || Math.min(576, window.innerWidth - 32);
    const height = rect?.height || 320;
    const maxX = Math.max(8, window.innerWidth - width - 8);
    const maxY = Math.max(8, window.innerHeight - Math.min(height, window.innerHeight - 16) - 8);
    setFloatingDurationPosition({
      x: Math.min(maxX, Math.max(8, drag.originX + event.clientX - drag.startX)),
      y: Math.min(maxY, Math.max(8, drag.originY + event.clientY - drag.startY)),
    });
  };

  const endDurationDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (durationDragRef.current?.pointerId !== event.pointerId) return;
    durationDragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const isCellSelected = (target: InvigilationCellTarget) => {
    const key = cellTargetKey(target);
    return selectedCells.some((item) => cellTargetKey(item) === key);
  };

  const toggleCellSelection = (target: InvigilationCellTarget) => {
    const key = cellTargetKey(target);
    setSelectedCells((current) => {
      if (current.some((item) => cellTargetKey(item) === key)) {
        return current.filter((item) => cellTargetKey(item) !== key);
      }
      if (current.length >= 2) return [target];
      return [...current, target];
    });
  };

  const getCellTeacherId = (target: InvigilationCellTarget): string | null => {
    const row = invigilation?.rows.find((item) => item.key === target.rowKey);
    if (!row) return null;
    if (target.kind === "room") return target.roomId ? row.roomTeacherIds[target.roomId] || null : null;
    return row.outsideTeacherId;
  };

  const selectedCellTeacherIds = selectedCells.map(getCellTeacherId);
  const canSwapSelectedCells = selectedCells.length === 2 && selectedCellTeacherIds.every(Boolean);
  const selectedCellUnavailableTeacherIds = useMemo(() => {
    if (!invigilation || selectedCells.length !== 1) return new Set<string>();
    const target = selectedCells[0];
    const row = invigilation.rows.find((item) => item.key === target.rowKey);
    if (!row) return new Set<string>();
    const currentTeacherId = target.kind === "room"
      ? (target.roomId ? row.roomTeacherIds[target.roomId] || null : null)
      : row.outsideTeacherId;
    const unavailable = new Set<string>([
      ...Object.values(row.roomTeacherIds),
      ...row.outsideTeacherIds,
      ...invigilation.patrolTeacherIds,
    ].filter((id): id is string => Boolean(id)));
    if (target.kind === "outside") row.outsideTeacherIds.forEach((id) => unavailable.delete(id));
    else if (currentTeacherId) unavailable.delete(currentTeacherId);
    return unavailable;
  }, [invigilation, selectedCells]);

  const saveConfig = async () => {
    if (!selectedArrangement || !config) return;
    if (!canEditSelected) {
      toast.error("当前监考表为只读", "仅创建者或学校管理员可以修改。");
      return;
    }
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
      toast.success("监考配置已保存", "当前考试的监考名单、时间和排表已保存。");
    } catch (error) {
      toast.error("保存监考配置失败", error instanceof Error ? error.message : undefined);
    } finally {
      setSaving(false);
    }
  };

  const deleteConfig = async () => {
    if (!selectedArrangement?.invigilation || !canEditSelected) return;
    if (!window.confirm(`确定将「${selectedArrangement.name}」的监考表移入回收站吗？`)) return;
    try {
      await examArrangementService.deleteInvigilationConfig(selectedArrangement.id);
      toast.success("监考表已移入回收站");
      const items = await examArrangementService.listArrangements(schoolId, cohortKey);
      const activeItems = items.filter((item) => !item.invigilationDeletedAt);
      setArrangements(activeItems);
      setSelectedArrangementId(activeItems[0]?.id || "");
      if (isSchoolAdmin) {
        const deleted = await examArrangementService.listInvigilationRecycleBin(schoolId);
        setRecycleBin(deleted.filter((item) => item.cohortKey === cohortKey));
      }
    } catch (error) {
      toast.error("删除失败", error instanceof Error ? error.message : undefined);
    }
  };

  const restoreConfig = async (arrangementId: string) => {
    if (!isSchoolAdmin) return;
    try {
      const restored = await examArrangementService.restoreInvigilationConfig(arrangementId);
      toast.success("监考表已恢复");
      setRecycleBin((current) => current.filter((item) => item.id !== arrangementId));
      setArrangements((current) => [restored, ...current.filter((item) => item.id !== restored.id)]);
      setSelectedArrangementId(restored.id);
    } catch (error) {
      toast.error("恢复失败", error instanceof Error ? error.message : undefined);
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

  const setCellTeacher = (target: InvigilationCellTarget, value: string) => {
    if (!selectedArrangement || !config) return false;
    const next = cloneConfig(config);
    const normalized = value === "__auto__" ? undefined : value === "__blank__" ? null : value;
    writeCellOverride(next, target, normalized);

    if (typeof normalized === "string") {
      const row = buildExamInvigilationTable(selectedArrangement, next).rows.find((item) => item.key === target.rowKey);
      if (row?.duplicateTeacherIds.includes(normalized)) {
        toast.error("同一场监考不能安排同一位老师", `${teacherMap.get(normalized)?.name || "该教师"} 已在本场考试中承担其他监考任务。`);
        return false;
      }
      setSelectedTeacherId(normalized);
    }
    setConfig(next);
    return true;
  };
  const addPatrolTeacher = (teacherId: string) => {
    if (!selectedArrangement || !config || !teacherId || config.patrolTeacherIds?.includes(teacherId)) return;
    const next = cloneConfig(config);
    next.patrolTeacherIds = [...(next.patrolTeacherIds || []), teacherId];
    const conflict = buildExamInvigilationTable(selectedArrangement, next).rows.find((row) => row.duplicateTeacherIds.includes(teacherId));
    if (conflict) {
      toast.error("无法加入巡考", `${teacherMap.get(teacherId)?.name || "该教师"} 已在至少一场考试中被人工指定为监考教师。`);
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
        toast.error("无法加入巡考", `${teacher.name || "该教师"} 已在至少一场考试中被人工指定为监考教师。`);
        return;
      }
    }
    setConfig(next);
  };

  const assignSelectedTeacher = (teacherId: string) => {
    setSelectedTeacherId(teacherId);
    if (selectedCells.length !== 1) return;
    if (setCellTeacher(selectedCells[0], teacherId)) setSelectedCells([]);
  };

  const autoArrangeInvigilation = (priority: "subject" | "duration") => {
    updateConfig((next) => {
      next.autoArrangePriority = priority;
      next.overrides = {};
    });
    setSelectedCells([]);
    toast.success(
      "已重新排监考",
      priority === "subject"
        ? "已优先安排老师监考本学科场次，再均衡累计时长；请确认后保存。"
        : "已优先均衡老师累计时长，再优先安排本学科场次；请确认后保存。",
    );
  };

  const setSelectedCellMode = (value: "__auto__" | "__blank__") => {
    if (selectedCells.length !== 1) return;
    if (setCellTeacher(selectedCells[0], value)) setSelectedCells([]);
  };

  const swapSelectedCells = () => {
    if (!canSwapSelectedCells) return;
    const [first, second] = selectedCells;
    const [firstTeacherId, secondTeacherId] = selectedCellTeacherIds as [string, string];
    updateConfig((next) => {
      writeCellOverride(next, first, secondTeacherId);
      writeCellOverride(next, second, firstTeacherId);
    });
    setSelectedCells([]);
  };

  const downloadTeacherTemplate = async () => {
    if (!selectedArrangement || !config || !cohortLabel) return;
    try {
      await downloadInvigilationTeacherTemplate(cohortLabel, selectedArrangement.subjects, config.teachers);
    } catch (error) {
      toast.error("下载监考教师模板失败", error instanceof Error ? error.message : undefined);
    }
  };

  const importTeacherFile = async (file: File) => {
    if (!selectedArrangement || !cohortLabel || !config) return;
    setImportingTeachers(true);
    try {
      const rows = await readInvigilationTeacherFile(file, cohortLabel, selectedArrangement.subjects);
      const result = replaceInvigilationTeachers(config.teachers, rows, () => newTeacherId("excel"));
      const teacherIds = new Set(result.teachers.map((teacher) => teacher.id));
      updateConfig((next) => {
        next.teachers = result.teachers;
        next.patrolTeacherIds = result.teachers.filter((teacher) => teacher.isLeader).map((teacher) => teacher.id);
        if (next.teacherNotes) {
          next.teacherNotes = Object.fromEntries(Object.entries(next.teacherNotes).filter(([id]) => teacherIds.has(id)));
          if (Object.keys(next.teacherNotes).length === 0) delete next.teacherNotes;
        }
        if (next.teacherRequirements) {
          next.teacherRequirements = Object.fromEntries(Object.entries(next.teacherRequirements).filter(([id]) => teacherIds.has(id)));
          if (Object.keys(next.teacherRequirements).length === 0) delete next.teacherRequirements;
        }
        next.overrides = Object.fromEntries(Object.entries(next.overrides || {}).map(([key, override]) => [
          key,
          {
            roomTeacherIds: Object.fromEntries(Object.entries(override.roomTeacherIds || {}).filter(([, id]) => id === null || teacherIds.has(id))),
            ...(override.outsideTeacherId === null || (override.outsideTeacherId && teacherIds.has(override.outsideTeacherId))
              ? { outsideTeacherId: override.outsideTeacherId }
              : {}),
          },
        ]));
      });
      const details = [
        `当前名单 ${result.teachers.length} 位`,
        result.addedCount ? `新增 ${result.addedCount} 位` : "",
        result.removedCount ? `移除旧名单 ${result.removedCount} 位` : "",
      ].filter(Boolean).join("，");
      toast.success("监考教师名单已完全替换", `${details}；保存监考配置后仅应用于当前考试。`);
    } catch (error) {
      toast.error("导入监考教师失败", error instanceof Error ? error.message : undefined);
    } finally {
      setImportingTeachers(false);
    }
  };

  const reuseTeachersFrom = (source: ExamArrangement) => {
    if (!source.invigilation) return;
    const sourceConfig = source.invigilation;
    updateConfig((next) => {
      next.teachers = structuredClone(sourceConfig.teachers);
      next.patrolTeacherIds = [...(sourceConfig.patrolTeacherIds ?? sourceConfig.teachers
        .filter((teacher) => teacher.isLeader)
        .map((teacher) => teacher.id))];
      if (sourceConfig.teacherNotes && Object.keys(sourceConfig.teacherNotes).length) {
        next.teacherNotes = structuredClone(sourceConfig.teacherNotes);
      } else {
        delete next.teacherNotes;
      }
      if (sourceConfig.teacherRequirements && Object.keys(sourceConfig.teacherRequirements).length) {
        next.teacherRequirements = structuredClone(sourceConfig.teacherRequirements);
      } else {
        delete next.teacherRequirements;
      }
      next.overrides = {};
    });
    setSelectedCells([]);
    setSelectedTeacherId(null);
    setReuseTeacherOpen(false);
    toast.success("已复用监考老师名单", `已从「${source.name}」复制配置一；原人工排表已清空，请确认后保存。`);
  };

  const openAddTeacher = () => {
    setManualTeacherName("");
    setManualTeacherSubject(selectedArrangement?.subjects[0] || "");
    setAddTeacherOpen(true);
  };

  const addManualTeacher = () => {
    if (!config) return;
    const name = manualTeacherName.trim();
    const subject = manualTeacherSubject.trim();
    if (!name || !subject) {
      toast.error("请填写老师姓名和任教学科");
      return;
    }
    const duplicate = config.teachers.some((teacher) => (
      teacher.name.trim().localeCompare(name, "zh-CN", { sensitivity: "base" }) === 0
      && teacher.subject.trim().localeCompare(subject, "zh-CN", { sensitivity: "base" }) === 0
    ));
    if (duplicate) {
      toast.error("老师已在名单中", `${name} · ${subject}`);
      return;
    }
    updateConfig((next) => {
      next.teachers.push({ id: newTeacherId("manual"), name, subject });
    });
    setAddTeacherOpen(false);
    setManualTeacherName("");
    setManualTeacherSubject("");
  };

  const reuseTimesFrom = (source: ExamArrangement) => {
    if (!source.invigilation) return;
    const sourceTimes = new Map(source.invigilation.subjectTimes.map((item) => [item.subject, item]));
    updateConfig((next) => {
      next.subjectTimes = next.subjectTimes.map((item) => {
        const reused = sourceTimes.get(item.subject);
        return reused ? structuredClone(reused) : item;
      });
      sortSubjectTimes(next);
      next.overrides = {};
    });
    setSelectedCells([]);
    setSelectedTeacherId(null);
    setReuseTimeOpen(false);
    toast.success("已复用考试时间配置", `已从「${source.name}」复制匹配学科的时间；原人工排表已清空，请确认后保存。`);
  };

  const updateSubjectTime = (
    subject: string,
    mutate: (item: ExamInvigilationConfig["subjectTimes"][number]) => void,
  ) => {
    updateConfig((next) => {
      const item = next.subjectTimes.find((candidate) => candidate.subject === subject);
      if (!item) return;
      mutate(item);
      sortSubjectTimes(next);
      next.overrides = {};
    });
    setSelectedCells([]);
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
          <Button variant="outline" onClick={() => void saveConfig()} disabled={!config || saving || readOnly}>
            {saving ? <Spinner size={16} /> : <Save className="h-4 w-4" />}保存监考配置
          </Button>
          {selectedArrangement?.invigilation && canEditSelected && (
            <Button variant="ghost" onClick={() => void deleteConfig()}>
              <Trash2 className="h-4 w-4 text-red-500" />移入回收站
            </Button>
          )}
          <Button variant="gold" onClick={() => void download()} disabled={!selectedArrangement || downloading || !statistics?.rooms.length}>
            {downloading ? <Spinner size={16} /> : <Download className="h-4 w-4" />}下载 Excel
          </Button>
        </div>
      </div>
    </Card>
  );

  const recycleBinCard = isSchoolAdmin ? (
    <Card className="mb-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="font-medium text-ink-900">监考表回收站</div>
          <div className="mt-1 text-xs text-ink-500">仅学校管理员可查看和恢复当前年级已删除的监考表。</div>
        </div>
        <Badge variant="ink">{recycleBin.length} 个</Badge>
      </div>
      {recycleBin.length > 0 && (
        <div className="mt-4 divide-y divide-ink-100 rounded-lg border border-ink-100">
          {recycleBin.map((item) => (
            <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div>
                <div className="text-sm font-medium text-ink-800">{item.name}</div>
                <div className="mt-0.5 text-xs text-ink-400">{item.examDate || "日期待定"} · 删除于 {item.invigilationDeletedAt ? new Date(item.invigilationDeletedAt).toLocaleString("zh-CN") : "—"}</div>
              </div>
              <Button variant="outline" size="sm" onClick={() => void restoreConfig(item.id)}>
                <RotateCcw className="h-3.5 w-3.5" />恢复
              </Button>
            </div>
          ))}
        </div>
      )}
    </Card>
  ) : null;

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
            description="请先完成考场布置并生成考场方案，再配置监考老师和考试时间。"
            action={<Link to="/my-exams/rooms" target="_blank" rel="noreferrer"><Button variant="outline">前往考场布置<ArrowRight className="h-4 w-4" /></Button></Link>}
          />
        </Card>
        {recycleBinCard}
      </>
    );
  }

  return (
    <>
      {controls}
      {readOnly && (
        <Card className="mb-4 border-amber-200 bg-amber-50/60 p-4 text-sm text-amber-800">
          当前监考表为只读；仅创建者或学校管理员可以修改或删除。
        </Card>
      )}
      <Card className="mb-4">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-ink-900">表一、文印室统计表</h2>
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

      <div className={cn(readOnly && "pointer-events-none opacity-75")} aria-disabled={readOnly}>
      <div className="mb-4 grid gap-4 xl:grid-cols-2">
        <Card>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-ink-900">配置一、监考老师名单</h2>
              <p className="mt-1 text-xs text-ink-500">当前考试单独保存名单；可上传 Excel 或复用其他监考安排，“场外”可同一学科勾选多人，“巡考”用于巡考安排。</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => void downloadTeacherTemplate()}>
                <Download className="h-4 w-4" />下载导入模板
              </Button>
              <Button variant="outline" size="sm" disabled={importingTeachers} onClick={() => teacherFileInputRef.current?.click()}>
                {importingTeachers ? <Spinner size={16} /> : <Upload className="h-4 w-4" />}上传 Excel
              </Button>
              <Button variant="outline" size="sm" disabled={!reusableArrangements.length} onClick={() => setReuseTeacherOpen(true)}>
                <Copy className="h-4 w-4" />复用名单
              </Button>
              <Button variant="outline" size="sm" onClick={openAddTeacher}>
                <Plus className="h-4 w-4" />增加老师
              </Button>
              <input
                ref={teacherFileInputRef}
                type="file"
                className="hidden"
                accept=".xlsx,.xlsm"
                aria-label="上传监考教师 Excel"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (file) void importTeacherFile(file);
                }}
              />
            </div>
          </div>

          <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-600" aria-label="监考老师人数统计">
            <span className="font-medium text-ink-800">共有老师 {teacherSummary.total} 名</span>
            {teacherSummary.subjects.map(([subject, count]) => <span key={subject}>{subject} {count} 人</span>)}
          </div>

          <div className="mb-4 rounded-xl border border-ink-100 bg-ink-50/50 p-3">
            <div className="mb-2 text-xs font-medium text-ink-700">累计范围（勾选往期监考表）</div>
            {historicalArrangements.length ? (
              <div className="flex flex-wrap gap-x-5 gap-y-2">
                {historicalArrangements.map((arrangement) => (
                  <label key={arrangement.id} className="flex items-center gap-2 text-xs text-ink-600">
                    <input
                      type="checkbox"
                      aria-label={`累计 ${arrangement.name}`}
                      checked={historyArrangementIds.includes(arrangement.id)}
                      onChange={(event) => setHistoryArrangementIds((current) => (
                        event.target.checked
                          ? [...current, arrangement.id]
                          : current.filter((id) => id !== arrangement.id)
                      ))}
                    />
                    <span>{arrangement.name}{arrangement.examDate ? ` · ${arrangement.examDate}` : ""}</span>
                  </label>
                ))}
              </div>
            ) : (
              <div className="text-xs text-ink-400">暂无更早且已保存监考配置的考试。</div>
            )}
          </div>

          <div className="max-h-96 overflow-auto rounded-xl border border-ink-100">
            <table className="w-max text-xs">
              <thead className="sticky top-0 z-10 bg-ink-50">
                <tr className="border-b border-ink-100 text-left text-xs text-ink-500">
                  <th className="whitespace-nowrap px-1.5 py-1.5">学科</th>
                  <th className="whitespace-nowrap px-1.5 py-1.5">姓名</th>
                  <th className="whitespace-nowrap px-1.5 py-1.5">往期累计</th>
                  <th className="whitespace-nowrap px-1.5 py-1.5">是否在同一天</th>
                  <th className="whitespace-nowrap px-1.5 py-1.5 text-center">是否请假</th>
                  <th className="whitespace-nowrap px-1.5 py-1.5">备注</th>
                  <th className="whitespace-nowrap px-1.5 py-1.5 text-center">场外</th>
                  <th className="whitespace-nowrap px-1.5 py-1.5 text-center">巡考</th>
                </tr>
              </thead>
              <tbody>
                {config.teachers.map((teacher, index) => (
                  <tr key={teacher.id} className="border-b border-ink-50 last:border-0">
                    <td className="whitespace-nowrap px-1.5 py-1.5 font-medium text-ink-700">{teacher.subject}</td>
                    <td className="whitespace-nowrap px-1.5 py-1.5 font-medium text-ink-900">{teacher.name}</td>
                    <td className="whitespace-nowrap px-1.5 py-1.5 tabular-nums text-ink-600">{formatMinutes(historicalTeacherMinutes[teacher.id] || 0)}</td>
                    <td className="px-1.5 py-1">
                      <Select
                        aria-label={`${teacher.name || `教师 ${index + 1}`}是否在同一天`}
                        value={config.teacherRequirements?.[teacher.id]?.sameDay || "any"}
                        onChange={(event) => updateConfig((next) => mutateTeacherRequirement(next, teacher.id, (requirement) => {
                          const value = event.target.value as ExamInvigilationSameDayRequirement;
                          if (value === "any") delete requirement.sameDay;
                          else requirement.sameDay = value;
                        }))}
                        options={[
                          { value: "yes", label: "是" },
                          { value: "no", label: "否" },
                          { value: "any", label: "随意" },
                        ]}
                        className="w-20 py-1 text-xs"
                      />
                    </td>
                    <td className="px-1.5 py-1 text-center">
                      <input
                        type="checkbox"
                        aria-label={`${teacher.name || `教师 ${index + 1}`}是否请假`}
                        checked={Boolean(config.teacherRequirements?.[teacher.id]?.isOnLeave)}
                        onChange={(event) => updateConfig((next) => mutateTeacherRequirement(next, teacher.id, (requirement) => {
                          if (event.target.checked) requirement.isOnLeave = true;
                          else delete requirement.isOnLeave;
                        }))}
                      />
                    </td>
                    <td className="px-1.5 py-1">
                      <Input
                        aria-label={`${teacher.name || `教师 ${index + 1}`}监考备注`}
                        value={config.teacherNotes?.[teacher.id] || ""}
                        onChange={(event) => updateConfig((next) => {
                          next.teacherNotes ||= {};
                          if (event.target.value) next.teacherNotes[teacher.id] = event.target.value;
                          else delete next.teacherNotes[teacher.id];
                          if (Object.keys(next.teacherNotes).length === 0) delete next.teacherNotes;
                        })}
                        placeholder="备注"
                        className="w-36 py-1 text-xs"
                      />
                    </td>
                    <td className="px-1.5 py-1 text-center"><input aria-label={`${teacher.name || `教师 ${index + 1}`}场外`} type="checkbox" checked={Boolean(teacher.isPrepLeader)} onChange={(event) => updateConfig((next) => { next.teachers[index].isPrepLeader = event.target.checked; })} /></td>
                    <td className="px-1.5 py-1 text-center"><input aria-label={`${teacher.name || `教师 ${index + 1}`}巡考`} type="checkbox" checked={Boolean(teacher.isLeader)} onChange={(event) => setTeacherLeader(index, event.target.checked)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>

          </div>
        </Card>

        <Card>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-ink-900">配置二、考试时间配置</h2>
              <p className="mt-1 text-xs text-ink-500">可复用其他监考安排的时间；修改后按日期和时刻自动排序，时长用于监考统计。</p>
            </div>
            <Button variant="outline" size="sm" disabled={!reusableArrangements.length} onClick={() => setReuseTimeOpen(true)}>
              <Copy className="h-4 w-4" />复用时间配置
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-max text-xs">
              <thead><tr className="border-b border-ink-100 text-left text-xs text-ink-500"><th className="whitespace-nowrap px-1.5 py-1.5">学科</th><th className="whitespace-nowrap px-1.5 py-1.5">日期</th><th className="whitespace-nowrap px-1.5 py-1.5">时段</th><th className="whitespace-nowrap px-1.5 py-1.5">时刻</th><th className="whitespace-nowrap px-1.5 py-1.5">时长（分钟）</th></tr></thead>
              <tbody>
                {config.subjectTimes.map((item) => (
                  <tr key={item.subject} className="border-b border-ink-50 last:border-0">
                    <td className="whitespace-nowrap px-1.5 py-1.5 font-medium text-ink-800">{item.subject}</td>
                    <td className="px-1.5 py-1"><Input aria-label={`${item.subject}考试日期`} type="date" value={item.date} onChange={(event) => updateSubjectTime(item.subject, (time) => { time.date = event.target.value; })} className="w-[9.25rem] py-1 text-xs" /></td>
                    <td className="px-1.5 py-1"><Select aria-label={`${item.subject}考试时段`} value={item.period} onChange={(event) => updateSubjectTime(item.subject, (time) => { time.period = event.target.value as ExamInvigilationPeriod; })} options={[{ value: "morning", label: "上午" }, { value: "afternoon", label: "下午" }, { value: "evening", label: "晚上" }]} className="w-20 py-1 text-xs" /></td>
                    <td className="px-1.5 py-1"><Input aria-label={`${item.subject}考试时刻`} type="time" value={item.time} onChange={(event) => updateSubjectTime(item.subject, (time) => { time.time = event.target.value; })} className="w-[7.25rem] py-1 text-xs" /></td>
                    <td className="px-1.5 py-1"><Input aria-label={`${item.subject}考试时长`} type="number" min={1} value={item.durationMinutes} onChange={(event) => updateSubjectTime(item.subject, (time) => { time.durationMinutes = Math.max(1, Number(event.target.value) || 1); })} className="w-20 py-1 text-xs [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <div className="mb-4 space-y-4">
        <div ref={tableTwoRef}>
        <Card className="min-w-0">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-ink-900">表二、监考表</h2>
              <p className="mt-1 text-xs text-ink-500">勾选一个考场或场外监考单元格后，可在“监考时长”中点击老师姓名填入；勾选两个已有安排的单元格可交换。</p>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button variant="gold" size="sm" onClick={() => autoArrangeInvigilation("subject")}>本学科优先</Button>
              <Button variant="gold" size="sm" onClick={() => autoArrangeInvigilation("duration")}>时长优先</Button>
              {selectedCells.length === 1 && (
                <>
                  <Button variant="outline" size="sm" onClick={() => setSelectedCellMode("__auto__")}>恢复自动</Button>
                  <Button variant="outline" size="sm" onClick={() => setSelectedCellMode("__blank__")}>留空</Button>
                </>
              )}
              {canSwapSelectedCells && <Button variant="gold" size="sm" onClick={swapSelectedCells}>是否交换</Button>}
              {selectedCells.length > 0 && <Button variant="outline" size="sm" onClick={() => setSelectedCells([])}>取消选择</Button>}
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
              <table className="min-w-max table-auto border-collapse text-xs">
                <tbody>
                  <tr className="bg-[#dcecef] text-xs font-medium text-ink-800">
                    <th colSpan={4} className="border-b border-r border-[#b6c7cf] px-2 py-1.5 text-center">考试安排</th>
                    {invigilation.roomLocationGroups.map((group) => (
                      <th
                        key={group.roomLocation}
                        aria-label={group.roomLocation}
                        className="max-w-28 border-b border-r border-[#b6c7cf] px-2 py-1.5 text-center leading-tight"
                      >
                        {wrapInvigilationHeaderLabel(group.roomLocation).map((line, index) => <div key={`${line}-${index}`}>{line}</div>)}
                      </th>
                    ))}
                    <th rowSpan={3} className="whitespace-nowrap border-b border-r border-[#b6c7cf] px-2 py-1.5 text-center align-middle">场外监考</th>
                    <th rowSpan={3} className="whitespace-nowrap border-b border-[#b6c7cf] px-2 py-1.5 text-center align-middle">巡考</th>
                  </tr>
                  <tr className="bg-[#e5f0f2] text-xs text-ink-700">
                    <th className="whitespace-nowrap border-b border-r border-[#b6c7cf] px-2 py-1.5 text-center">时间</th>
                    <th className="whitespace-nowrap border-b border-r border-[#b6c7cf] px-2 py-1.5 text-center">时段</th>
                    <th className="whitespace-nowrap border-b border-r border-[#b6c7cf] px-2 py-1.5 text-center">考试时间</th>
                    <th className="whitespace-nowrap border-b border-r border-[#b6c7cf] px-2 py-1.5 text-center">学科</th>
                    {invigilation.roomLocationGroups.map((group) => (
                      <th
                        key={group.roomLocation}
                        aria-label={group.roomNumbers.join("、")}
                        className="whitespace-nowrap border-b border-r border-[#b6c7cf] px-1 py-1 text-center font-medium"
                      >
                        {group.roomNumbers.map((roomNumber) => <div key={roomNumber}>{roomNumber}</div>)}
                      </th>
                    ))}
                  </tr>
                  <tr className="bg-[#eef4f4] text-xs text-ink-700">
                    <th colSpan={4} className="border-b border-r border-[#b6c7cf] px-2 py-1.5 text-center">试场人数</th>
                    {invigilation.roomLocationGroups.map((group) => (
                      <td key={group.roomLocation} className="border-b border-r border-[#b6c7cf] px-2 py-1.5 text-center">{group.studentCount}</td>
                    ))}
                  </tr>
                  {invigilation.rows.map((row, rowIndex) => {
                    const dateRowSpan = consecutiveRowSpan(invigilation.rows, rowIndex, (item) => item.date);
                    const periodRowSpan = consecutiveRowSpan(invigilation.rows, rowIndex, (item) => `${item.date}\u0000${item.period}`);
                    return (
                      <tr key={row.key}>
                        {dateRowSpan > 0 && (
                          <td rowSpan={dateRowSpan} className="whitespace-nowrap border-b border-r border-[#b6c7cf] bg-[#e5f0f2] px-2 py-1.5 text-center font-medium leading-tight text-ink-800">
                            <div>{row.date}</div>
                            {formatExamWeekday(row.date) && <div className="mt-0.5 font-normal text-ink-600">{formatExamWeekday(row.date)}</div>}
                          </td>
                        )}
                        {periodRowSpan > 0 && (
                          <td rowSpan={periodRowSpan} className="whitespace-nowrap border-b border-r border-[#b6c7cf] bg-[#e5f0f2] px-2 py-1.5 text-center text-ink-800">
                            {examInvigilationPeriodLabel(row.period)}
                          </td>
                        )}
                        <td className="whitespace-nowrap border-b border-r border-[#b6c7cf] bg-[#e5f0f2] px-2 py-1.5 text-center tabular-nums text-ink-800">{formatExamTimeRange(row.time, row.durationMinutes)}</td>
                        <td className="whitespace-nowrap border-b border-r border-[#b6c7cf] bg-[#e5f0f2] px-2 py-1.5 text-center font-medium text-ink-900">{row.subjectLabel}</td>
                        {invigilation.roomLocationGroups.map((group) => {
                          const activeRoomIds = group.roomIds.filter((roomId) => (row.roomStudentCounts[roomId] || 0) > 0);
                          const count = activeRoomIds.reduce((sum, roomId) => sum + (row.roomStudentCounts[roomId] || 0), 0);
                          const roomDetails = activeRoomIds.map((activeRoomId) => {
                            const room = invigilation.rooms.find((item) => item.roomId === activeRoomId);
                            const subjectCounts = row.roomSubjectStudentCounts[activeRoomId] || {};
                            const countLabel = Object.entries(subjectCounts)
                              .filter(([, subjectCount]) => subjectCount > 0)
                              .map(([subject, subjectCount]) => `${subjectShortName(subject)}${subjectCount}人`)
                              .join(" / ") || `${row.roomStudentCounts[activeRoomId] || 0}人`;
                            return { roomId: activeRoomId, roomNumber: room?.roomNumber || activeRoomId, countLabel };
                          });
                          const roomId = activeRoomIds[0];
                          const assignedTeacherId = roomId ? row.roomTeacherIds[roomId] : null;
                          const target: InvigilationCellTarget | null = roomId ? {
                            rowKey: row.key,
                            kind: "room",
                            roomId,
                            roomIds: group.roomIds,
                          } : null;
                          const selected = target ? isCellSelected(target) : false;
                          const highlighted = Boolean(selectedTeacherId && assignedTeacherId === selectedTeacherId);
                          const duplicate = Boolean(assignedTeacherId && row.duplicateTeacherIds.includes(assignedTeacherId));
                          return (
                            <td
                              key={group.roomLocation}
                              className={cn(
                                "border-b border-r border-[#b6c7cf] px-1 py-0.5 text-center transition-colors",
                                !count && "bg-ink-50/60",
                                count && "cursor-pointer hover:bg-gold-50/60",
                                highlighted && "bg-[#fff86b]",
                                selected && "bg-gold-50 ring-2 ring-inset ring-gold-400",
                                duplicate && "ring-2 ring-inset ring-red-400",
                              )}
                              onClick={target ? () => toggleCellSelection(target) : undefined}
                            >
                              {target ? (
                                <div className="relative min-h-8 px-2.5 py-0.5">
                                  <input
                                    type="checkbox"
                                    aria-label={`选择 ${row.subjectLabel} ${group.roomLocation}监考单元格`}
                                    className="absolute left-0 top-0 h-3 w-3 accent-gold-500"
                                    checked={selected}
                                    onClick={(event) => event.stopPropagation()}
                                    onChange={() => toggleCellSelection(target)}
                                  />
                                  <button
                                    type="button"
                                    className="whitespace-nowrap pt-0.5 text-xs font-medium text-ink-800 hover:text-gold-700"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      if (assignedTeacherId) setSelectedTeacherId(assignedTeacherId);
                                    }}
                                  >
                                    {teacherMap.get(assignedTeacherId || "")?.name || "空缺"}
                                  </button>
                                  <div className="mt-0.5 space-y-0.5 text-[10px] leading-tight text-ink-400">
                                    {roomDetails.map((detail) => (
                                      <div key={detail.roomId} className="whitespace-nowrap">
                                        {roomDetails.length > 1 && <span>{detail.roomNumber}：</span>}
                                        {detail.countLabel}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ) : <span className="text-xs text-ink-300">无学生</span>}
                            </td>
                          );
                        })}
                        {(() => {
                          const target: InvigilationCellTarget = { rowKey: row.key, kind: "outside" };
                          const selected = isCellSelected(target);
                          const highlighted = Boolean(selectedTeacherId && row.outsideTeacherIds.includes(selectedTeacherId));
                          const duplicate = row.outsideTeacherIds.some((id) => row.duplicateTeacherIds.includes(id));
                          return (
                            <td
                              className={cn(
                                "cursor-pointer border-b border-r border-[#b6c7cf] px-1 py-0.5 text-center transition-colors hover:bg-gold-50/60",
                                highlighted && "bg-[#fff86b]",
                                selected && "bg-gold-50 ring-2 ring-inset ring-gold-400",
                                duplicate && "ring-2 ring-inset ring-red-400",
                              )}
                              onClick={() => toggleCellSelection(target)}
                            >
                              <div className="relative min-h-8 px-3 py-0.5">
                                <input
                                  type="checkbox"
                                  aria-label={`选择 ${row.subjectLabel}场外监考单元格`}
                                  className="absolute left-0 top-0 h-3 w-3 accent-gold-500"
                                  checked={selected}
                                  onClick={(event) => event.stopPropagation()}
                                  onChange={() => toggleCellSelection(target)}
                                />
                                <div className="flex min-h-7 flex-col items-center justify-center gap-0.5">
                                  {row.outsideTeacherIds.length ? row.outsideTeacherIds.map((teacherId) => (
                                    <button
                                      key={teacherId}
                                      type="button"
                                      className="whitespace-nowrap text-xs font-medium text-ink-800 hover:text-gold-700"
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        setSelectedTeacherId(teacherId);
                                      }}
                                    >
                                      {teacherMap.get(teacherId)?.name || "未知教师"}
                                    </button>
                                  )) : <span className="text-xs font-medium text-ink-800">空缺</span>}
                                </div>
                              </div>
                            </td>
                          );
                        })()}
                        {rowIndex === 0 && (
                          <td
                            rowSpan={invigilation.rows.length}
                            className={cn(
                              "border-b border-[#b6c7cf] bg-[#eef4f4] px-2 py-2 align-middle transition-colors",
                              selectedTeacherId && invigilation.patrolTeacherIds.includes(selectedTeacherId) && "bg-[#fff86b]",
                            )}
                          >
                            <div className="flex flex-col gap-1.5">
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
                                      <button type="button" aria-label={`移除巡考教师 ${teacher.name}`} className="border-l border-[#d5dfe2] px-1.5 py-1 text-ink-400 hover:text-red-600" onClick={() => removePatrolTeacher(id)}>
                                        <X className="h-3 w-3" />
                                      </button>
                                    </span>
                                  );
                                })}
                                {!invigilation.patrolTeacherIds.length && <span className="text-xs text-ink-400">暂无巡考教师</span>}
                              </div>
                              <select
                                aria-label="添加巡考教师"
                                className="rounded-md border border-[#b6c7cf] bg-paper px-2 py-1.5 text-xs text-ink-700 outline-none focus:border-gold-400"
                                value=""
                                onChange={(event) => addPatrolTeacher(event.target.value)}
                              >
                                <option value="">+ 添加巡考教师</option>
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
                  <tr>
                    <td colSpan={invigilation.roomLocationGroups.length + 6} className="border-t border-[#b6c7cf] bg-[#f8fbfb] p-2">
                      <textarea
                        aria-label="监考表年级说明"
                        value={config.footerNote || ""}
                        onChange={(event) => updateConfig((next) => {
                          if (event.target.value) next.footerNote = event.target.value;
                          else delete next.footerNote;
                        })}
                        rows={2}
                        placeholder="填写同一年级所有监考表共用的说明，可换行"
                        className="w-full resize-y rounded-md border border-[#b6c7cf] bg-paper px-3 py-2 text-xs leading-relaxed text-ink-800 outline-none focus:border-gold-400"
                      />
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </Card>
        </div>

        <div
          ref={floatingDurationRef}
          className={cn("relative", tableTwoVisible && "fixed z-50 w-[min(36rem,calc(100vw-2rem))]")}
          style={tableTwoVisible ? {
            ...(floatingDurationPosition
              ? { left: floatingDurationPosition.x, top: floatingDurationPosition.y }
              : { right: 16, top: 88 }),
          } : undefined}
        >
        {tableTwoVisible && (
          <>
            <button
              type="button"
              aria-label="从左上角拖动监考时长面板"
              className="absolute left-2 top-2 z-20 inline-flex touch-none cursor-move items-center rounded-md border border-ink-200 bg-paper/95 p-1.5 text-ink-500 shadow-sm hover:bg-ink-50"
              onPointerDown={startDurationDrag}
              onPointerMove={moveDurationDrag}
              onPointerUp={endDurationDrag}
              onPointerCancel={endDurationDrag}
            >
              <Move className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              aria-label="从右上角拖动监考时长面板"
              className="absolute right-2 top-2 z-20 inline-flex touch-none cursor-move items-center rounded-md border border-ink-200 bg-paper/95 p-1.5 text-ink-500 shadow-sm hover:bg-ink-50"
              onPointerDown={startDurationDrag}
              onPointerMove={moveDurationDrag}
              onPointerUp={endDurationDrag}
              onPointerCancel={endDurationDrag}
            >
              <Move className="h-3.5 w-3.5" />
            </button>
          </>
        )}
        <Card className={cn(tableTwoVisible && "max-h-[calc(100vh-2rem)] overflow-y-auto pt-10 shadow-2xl ring-1 ring-ink-200")}>
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-ink-900">监考时长</h2>
              <p className="mt-1 text-xs text-ink-500">自动排表先应用基本要求，再通过表二勾选或交换微调；默认按累计时长最短优先。</p>
            </div>
            <div className="flex items-center gap-2">
              {!durationListCollapsed && (
                <Select aria-label="监考时长排序" value={statsSort} onChange={(event) => setStatsSort(event.target.value as typeof statsSort)} options={[{ value: "minutes", label: "累计最短" }, { value: "subject", label: "按学科" }, { value: "name", label: "按姓名" }]} className="min-w-24 py-1.5 text-xs" />
              )}
              <Button
                variant="outline"
                size="sm"
                aria-expanded={!durationListCollapsed}
                aria-controls="invigilation-duration-list"
                onClick={() => setDurationListCollapsed((collapsed) => !collapsed)}
              >
                {durationListCollapsed ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
                {durationListCollapsed ? "展开名单" : "收起名单"}
              </Button>
            </div>
          </div>

          <div hidden={durationListCollapsed} className="mb-3 rounded-lg border border-ink-100 bg-ink-50 px-3 py-2 text-[11px] text-ink-500">
            {selectedCells.length === 0 && "点击老师姓名可高亮表二中的全部安排；勾选一个单元格后再点击姓名可直接填入。"}
            {selectedCells.length === 1 && "已选 1 个单元格，点击下方老师姓名即可填入。"}
            {selectedCells.length === 2 && (canSwapSelectedCells ? "已选 2 个已有安排，可点击“是否交换”。" : "已选 2 个单元格；只有两个单元格均已有老师时才能交换。")}
          </div>


          <div id="invigilation-duration-list" hidden={durationListCollapsed} className="overflow-x-auto rounded-xl border border-ink-100">
            <table className="w-full min-w-[680px] text-sm">
              <thead>
                <tr className="border-b border-ink-100 bg-ink-50 text-left text-xs text-ink-500">
                  <th className="px-3 py-2.5">姓名</th>
                  <th className="px-3 py-2.5">学科</th>
                  <th className="px-3 py-2.5 text-center">本次场次</th>
                  <th className="px-3 py-2.5 text-right">本次时长</th>
                  <th className="px-3 py-2.5 text-right">累计时长</th>
                  <th className="min-w-48 px-3 py-2.5">备注</th>
                </tr>
              </thead>
              <tbody>
                {sortedTeacherStats.map((stat) => (
                  <tr key={stat.teacherId} className="border-b border-ink-50 last:border-0">
                    <td className="px-3 py-2.5 font-medium text-ink-800">
                      <button
                        type="button"
                        aria-label={`选择监考教师 ${stat.name}`}
                        className={cn(
                          "text-left font-medium text-ink-800 hover:text-gold-700",
                          selectedTeacherId === stat.teacherId && "rounded bg-[#fff86b] px-1",
                        )}
                        title={selectedCells.length === 1 && selectedCellUnavailableTeacherIds.has(stat.teacherId) ? "该老师已在本场考试中承担其他监考任务" : undefined}
                        onClick={() => assignSelectedTeacher(stat.teacherId)}
                      >
                        {stat.name}
                      </button>
                    </td>
                    <td className="px-3 py-2.5 text-ink-600">{stat.subject}</td>
                    <td className="px-3 py-2.5 text-center tabular-nums text-ink-600">{stat.sessions}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-ink-700">{formatMinutes(stat.minutes)}</td>
                    <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-ink-900">{formatMinutes(stat.cumulativeMinutes)}</td>
                    <td className="px-3 py-2.5 text-xs text-ink-600">{config.teacherNotes?.[stat.teacherId] || "—"}</td>
                  </tr>
                ))}
                {!sortedTeacherStats.length && (
                  <tr><td colSpan={6} className="py-10 text-center text-xs text-ink-400">暂无教师</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
        </div>
      </div>
      </div>

      {recycleBinCard}

      <Modal
        open={addTeacherOpen}
        onClose={() => setAddTeacherOpen(false)}
        title="增加老师"
        description="手动增加一位监考老师；任教学科用于自动排表时优先匹配考试学科。"
        size="sm"
      >
        <div className="space-y-4">
          <Input
            label="老师姓名"
            aria-label="老师姓名"
            value={manualTeacherName}
            onChange={(event) => setManualTeacherName(event.target.value)}
            placeholder="请输入姓名"
          />
          <Input
            label="任教学科"
            aria-label="任教学科"
            value={manualTeacherSubject}
            onChange={(event) => setManualTeacherSubject(event.target.value)}
            placeholder="例如：数学"
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setAddTeacherOpen(false)}>取消</Button>
            <Button onClick={addManualTeacher}>确认增加</Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={reuseTeacherOpen}
        onClose={() => setReuseTeacherOpen(false)}
        title="复用监考老师名单"
        description="选择一个已保存监考配置的考试，复制其配置一名单和教师要求到当前考试。"
        size="sm"
      >
        <div className="space-y-2">
          {reusableArrangements.map((arrangement) => (
            <button
              key={arrangement.id}
              type="button"
              className="flex w-full items-center justify-between gap-3 rounded-lg border border-ink-100 px-3 py-2 text-left text-sm hover:border-gold-300 hover:bg-gold-50/40"
              onClick={() => reuseTeachersFrom(arrangement)}
            >
              <span className="font-medium text-ink-800">{arrangement.name}</span>
              <span className="whitespace-nowrap text-xs text-ink-500">{arrangement.examDate || "未设置日期"}</span>
            </button>
          ))}
        </div>
      </Modal>

      <Modal
        open={reuseTimeOpen}
        onClose={() => setReuseTimeOpen(false)}
        title="复用考试时间配置"
        description="选择一个已保存监考配置的考试；只复制当前考试中同名学科的日期、时段、时刻和时长。"
        size="sm"
      >
        <div className="space-y-2">
          {reusableArrangements.map((arrangement) => (
            <button
              key={arrangement.id}
              type="button"
              className="flex w-full items-center justify-between gap-3 rounded-lg border border-ink-100 px-3 py-2 text-left text-sm hover:border-gold-300 hover:bg-gold-50/40"
              onClick={() => reuseTimesFrom(arrangement)}
            >
              <span className="font-medium text-ink-800">{arrangement.name}</span>
              <span className="whitespace-nowrap text-xs text-ink-500">{arrangement.examDate || "未设置日期"}</span>
            </button>
          ))}
        </div>
      </Modal>





    </>
  );
}
