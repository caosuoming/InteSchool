import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import {
  ArrowLeftRight,
  CalendarRange,
  Download,
  Move,
  Plus,
  Save,
  Trash2,
  Upload,
  WandSparkles,
  X,
} from "lucide-react";
import type {
  ExamArrangementContext,
  GradeCohort,
  TeachingScheduleConfig,
  TeachingScheduleSlotAssignment,
  TeachingScheduleSubjectRequirement,
} from "@/types";
import { examArrangementService } from "@/services/examArrangement";
import { toast } from "@/stores/ui";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";
import { Spinner } from "@/components/ui/Spinner";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/utils";
import {
  buildTeachingScheduleTeacherStats,
  canPlaceTeachingScheduleAssignment,
  generateTeachingSchedule,
  normalizeTeachingScheduleConfig,
  parseTeachingScheduleSlotKey,
  TEACHING_SCHEDULE_PERIODS,
  TEACHING_SCHEDULE_WEEKDAYS,
  teachingScheduleHalfDay,
  teachingScheduleRequirementKey,
  teachingScheduleSlotAllowedByRequirement,
  teachingScheduleSlotKey,
  teachingScheduleSubjectRequirement,
  teachingScheduleTeacherKey,
} from "@/lib/teaching-schedule";
import {
  downloadTeachingScheduleTemplate,
  readTeachingScheduleFile,
} from "@/lib/teaching-schedule-spreadsheet";

const WEEKDAY_LABELS = ["星期一", "星期二", "星期三", "星期四", "星期五"] as const;
const REQUIREMENT_SEQUENCE: TeachingScheduleSubjectRequirement[] = ["any", "required", "forbidden"];
const REQUIREMENT_LABELS: Record<TeachingScheduleSubjectRequirement, string> = {
  any: "-",
  required: "√",
  forbidden: "×",
};
const REQUIREMENT_TITLES: Record<TeachingScheduleSubjectRequirement, string> = {
  any: "随意",
  required: "必须排",
  forbidden: "不可以排",
};

function normalized(value: string): string {
  return value.trim().replace(/\s+/g, "").toLocaleLowerCase("zh-CN");
}

function assignmentMatchesSlot(
  config: TeachingScheduleConfig,
  classId: string,
  slot: TeachingScheduleSlotAssignment,
): boolean {
  return config.assignments.some((assignment) => (
    assignment.classId === classId
    && assignment.subject === slot.subject
    && (
      (assignment.teacherId && slot.teacherId && assignment.teacherId === slot.teacherId)
      || normalized(assignment.teacherName) === normalized(slot.teacherName)
    )
  ));
}

function nextRequirement(value: TeachingScheduleSubjectRequirement): TeachingScheduleSubjectRequirement {
  const index = REQUIREMENT_SEQUENCE.indexOf(value);
  return REQUIREMENT_SEQUENCE[(index + 1) % REQUIREMENT_SEQUENCE.length];
}

function teacherCellKey(classId: string, subject: string): string {
  return `${classId}\u0000${subject}`;
}

function countClassSubjectSlots(config: TeachingScheduleConfig, classId: string, subject: string): number {
  return Object.entries(config.slots).filter(([key, value]) => (
    parseTeachingScheduleSlotKey(key)?.classId === classId && value.subject === subject
  )).length;
}

interface TeachingScheduleSectionProps {
  schoolId: string;
  teacherId: string;
  cohorts: GradeCohort[];
  cohortKey: string;
  onCohortChange: (value: string) => void;
}

export function TeachingScheduleSection({
  schoolId,
  teacherId,
  cohorts,
  cohortKey,
  onCohortChange,
}: TeachingScheduleSectionProps) {
  const [context, setContext] = useState<ExamArrangementContext | null>(null);
  const [config, setConfig] = useState<TeachingScheduleConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [newSubject, setNewSubject] = useState("");
  const [selectedSlots, setSelectedSlots] = useState<string[]>([]);
  const [highlightedTeacher, setHighlightedTeacher] = useState<string | null>(null);
  const [tableVisible, setTableVisible] = useState(false);
  const [panelPosition, setPanelPosition] = useState<{ x: number; y: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const timetableRef = useRef<HTMLDivElement>(null);
  const teacherPanelRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ pointerId: number; dx: number; dy: number } | null>(null);

  useEffect(() => {
    if (!cohortKey) {
      setContext(null);
      setConfig(null);
      return;
    }
    let active = true;
    setLoading(true);
    Promise.all([
      examArrangementService.getContext(schoolId, cohortKey),
      examArrangementService.getTeachingScheduleProfile(schoolId, cohortKey),
    ])
      .then(([nextContext, profile]) => {
        if (!active) return;
        setContext(nextContext);
        setConfig(normalizeTeachingScheduleConfig(profile?.config || null, nextContext));
        setSelectedSlots([]);
        setHighlightedTeacher(null);
        setPanelPosition(null);
      })
      .catch((error) => {
        if (active) toast.error("加载排课配置失败", error instanceof Error ? error.message : undefined);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [cohortKey, schoolId]);

  useEffect(() => {
    const target = timetableRef.current;
    if (!target || typeof IntersectionObserver === "undefined") {
      setTableVisible(false);
      return;
    }
    const observer = new IntersectionObserver(([entry]) => setTableVisible(entry.isIntersecting), { threshold: 0.08 });
    observer.observe(target);
    return () => observer.disconnect();
  }, [loading, context]);

  const updateConfig = (mutate: (next: TeachingScheduleConfig) => void) => {
    setConfig((current) => {
      if (!current) return current;
      const next = structuredClone(current);
      mutate(next);
      return next;
    });
  };

  const classes = context?.classes || [];
  const subjects = config?.subjects || [];
  const assignmentMap = useMemo(() => new Map(
    (config?.assignments || []).map((assignment) => [teacherCellKey(assignment.classId, assignment.subject), assignment]),
  ), [config?.assignments]);

  const teacherStats = useMemo(() => {
    if (!config) return [];
    const byKey = new Map(buildTeachingScheduleTeacherStats(config).map((item) => [item.key, item]));
    for (const teacher of context?.teachers || []) {
      const key = teachingScheduleTeacherKey(teacher.id, teacher.name);
      if (!byKey.has(key)) {
        byKey.set(key, {
          key,
          teacherId: teacher.id,
          teacherName: teacher.name,
          subjects: teacher.subject ? [teacher.subject] : [],
          targetPeriods: 0,
          currentPeriods: 0,
        });
      }
    }
    return [...byKey.values()].sort((left, right) => left.teacherName.localeCompare(right.teacherName, "zh-CN"));
  }, [config, context?.teachers]);

  const selectedValues = selectedSlots.map((key) => config?.slots[key]).filter(Boolean);

  const handleSave = async () => {
    if (!config || !context) return;
    setSaving(true);
    try {
      const saved = await examArrangementService.saveTeachingScheduleProfile(schoolId, teacherId, cohortKey, config);
      setConfig(normalizeTeachingScheduleConfig(saved.config, context));
      toast.success("排课配置已保存", `${context.cohort.label}的教师分工、课时要求和课表已保存。`);
    } catch (error) {
      toast.error("保存排课配置失败", error instanceof Error ? error.message : undefined);
    } finally {
      setSaving(false);
    }
  };

  const handleAutoArrange = () => {
    if (!config) return;
    if (Object.keys(config.slots).length > 0 && !window.confirm("自动排课会替换当前表一中的人工调整，确定继续吗？")) return;
    try {
      const result = generateTeachingSchedule(config);
      updateConfig((next) => {
        next.slots = result.slots;
      });
      setSelectedSlots([]);
      if (result.unscheduled.length > 0) {
        const remaining = result.unscheduled.reduce((sum, item) => sum + item.remaining, 0);
        toast.error("自动排课未能完全排完", `还有 ${remaining} 节课因教师冲突或学科时段限制无法安排，请检查配置三后重试。`);
      } else {
        toast.success("已生成课表", `共安排 ${Object.keys(result.slots).length} 节课；可在表一中继续人工微调。`);
      }
    } catch (error) {
      toast.error("自动排课失败", error instanceof Error ? error.message : undefined);
    }
  };

  const handleDownloadTemplate = async () => {
    if (!context || !config) return;
    try {
      await downloadTeachingScheduleTemplate(context, config);
    } catch (error) {
      toast.error("下载教师分工表模板失败", error instanceof Error ? error.message : undefined);
    }
  };

  const handleImport = async (file: File | null) => {
    if (!file || !context || !config) return;
    setImporting(true);
    try {
      const imported = await readTeachingScheduleFile(file, context);
      updateConfig((next) => {
        next.assignments = imported.assignments;
        next.subjects = imported.subjects;
        next.subjectRequirements = Object.fromEntries(imported.subjects.map(({ subject }) => [
          subject,
          next.subjectRequirements[subject] || {},
        ]));
        next.slots = {};
      });
      toast.success("教师分工表已导入", `识别 ${imported.assignments.length} 条任课分工、${imported.subjects.length} 个学科；仍可在页面中手动修改。`);
    } catch (error) {
      toast.error("导入教师分工表失败", error instanceof Error ? error.message : undefined);
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const updateTeacherAssignment = (classId: string, subject: string, teacherName: string) => {
    if (!context) return;
    updateConfig((next) => {
      const index = next.assignments.findIndex((assignment) => assignment.classId === classId && assignment.subject === subject);
      const cleanName = teacherName.trim();
      if (!cleanName) {
        if (index >= 0) next.assignments.splice(index, 1);
        next.slots = Object.fromEntries(Object.entries(next.slots).filter(([key, slot]) => (
          !(parseTeachingScheduleSlotKey(key)?.classId === classId && slot.subject === subject)
        )));
        return;
      }
      const rosterMatch = (context.teachers || []).find((teacher) => (
        normalized(teacher.name) === normalized(cleanName) && teacher.subject === subject
      ));
      const assignment = {
        id: index >= 0 ? next.assignments[index].id : `manual:${classId}:${subject}`,
        classId,
        subject,
        teacherName: cleanName,
        ...(rosterMatch ? { teacherId: rosterMatch.id } : {}),
      };
      if (index >= 0) next.assignments[index] = assignment;
      else next.assignments.push(assignment);
      for (const [key, slot] of Object.entries(next.slots)) {
        if (parseTeachingScheduleSlotKey(key)?.classId === classId && slot.subject === subject) {
          next.slots[key] = {
            ...slot,
            teacherName: cleanName,
            ...(rosterMatch ? { teacherId: rosterMatch.id } : { teacherId: undefined }),
          };
        }
      }
    });
  };

  const addSubject = () => {
    const subject = newSubject.trim();
    if (!subject || !config) return;
    if (config.subjects.some((item) => normalized(item.subject) === normalized(subject))) {
      toast.error("学科已存在");
      return;
    }
    updateConfig((next) => {
      next.subjects.push({ subject, weeklyPeriods: 0 });
      next.subjectRequirements[subject] = {};
    });
    setNewSubject("");
  };

  const removeSubject = (subject: string) => {
    if (!window.confirm(`确定删除学科“${subject}”及其教师分工和已排课时吗？`)) return;
    updateConfig((next) => {
      next.subjects = next.subjects.filter((item) => item.subject !== subject);
      next.assignments = next.assignments.filter((item) => item.subject !== subject);
      delete next.subjectRequirements[subject];
      next.slots = Object.fromEntries(Object.entries(next.slots).filter(([, slot]) => slot.subject !== subject));
    });
  };

  const toggleSlot = (key: string) => {
    setSelectedSlots((current) => {
      if (current.includes(key)) return current.filter((item) => item !== key);
      return [...current, key].slice(-2);
    });
  };

  const assignTeacherToSelected = (teacherKey: string) => {
    if (!config || selectedSlots.length !== 1) {
      setHighlightedTeacher((current) => current === teacherKey ? null : teacherKey);
      return;
    }
    const key = selectedSlots[0];
    const parsed = parseTeachingScheduleSlotKey(key);
    if (!parsed) return;
    const candidates = config.assignments.filter((assignment) => (
      assignment.classId === parsed.classId
      && teachingScheduleTeacherKey(assignment.teacherId, assignment.teacherName) === teacherKey
    ));
    if (candidates.length === 0) {
      toast.error("无法安排该教师", "配置一中该教师没有任教当前班级。请先修改教师分工表。");
      return;
    }
    const assignment = [...candidates].sort((left, right) => {
      const leftTarget = config.subjects.find((item) => item.subject === left.subject)?.weeklyPeriods || 0;
      const rightTarget = config.subjects.find((item) => item.subject === right.subject)?.weeklyPeriods || 0;
      const leftRemaining = leftTarget - countClassSubjectSlots(config, parsed.classId, left.subject);
      const rightRemaining = rightTarget - countClassSubjectSlots(config, parsed.classId, right.subject);
      return rightRemaining - leftRemaining || left.subject.localeCompare(right.subject, "zh-CN");
    })[0];
    const halfDay = teachingScheduleHalfDay(parsed.period);
    if (!teachingScheduleSlotAllowedByRequirement(config, key, {
      subject: assignment.subject,
      teacherName: assignment.teacherName,
      ...(assignment.teacherId ? { teacherId: assignment.teacherId } : {}),
    })) {
      toast.error("该时段禁止安排此学科", `${assignment.subject}在${WEEKDAY_LABELS[parsed.day - 1]}${halfDay === "morning" ? "上午" : "下午"}配置为“×”。`);
      return;
    }
    const value: TeachingScheduleSlotAssignment = {
      subject: assignment.subject,
      teacherName: assignment.teacherName,
      ...(assignment.teacherId ? { teacherId: assignment.teacherId } : {}),
      source: "manual",
    };
    const withoutTarget = { ...config.slots };
    delete withoutTarget[key];
    if (!canPlaceTeachingScheduleAssignment(withoutTarget, key, value)) {
      toast.error("教师时间冲突", `${assignment.teacherName}已在同一时段给其他班上课。`);
      return;
    }
    updateConfig((next) => {
      next.slots[key] = value;
    });
    setHighlightedTeacher(teacherKey);
  };

  const clearSelected = () => {
    if (!config || selectedSlots.length === 0) return;
    updateConfig((next) => {
      for (const key of selectedSlots) delete next.slots[key];
    });
    setSelectedSlots([]);
  };

  const swapSelected = () => {
    if (!config || selectedSlots.length !== 2) return;
    const [leftKey, rightKey] = selectedSlots;
    const left = config.slots[leftKey];
    const right = config.slots[rightKey];
    const leftParsed = parseTeachingScheduleSlotKey(leftKey);
    const rightParsed = parseTeachingScheduleSlotKey(rightKey);
    if (!left || !right || !leftParsed || !rightParsed) {
      toast.error("请选择两个已有课程的单元格后交换");
      return;
    }
    if (!assignmentMatchesSlot(config, leftParsed.classId, right) || !assignmentMatchesSlot(config, rightParsed.classId, left)) {
      toast.error("不能交换到该班级", "交换后的学科和教师必须与配置一中的班级任课分工一致。");
      return;
    }
    const nextSlots = { ...config.slots };
    delete nextSlots[leftKey];
    delete nextSlots[rightKey];
    if (!teachingScheduleSlotAllowedByRequirement(config, leftKey, right)
      || !teachingScheduleSlotAllowedByRequirement(config, rightKey, left)) {
      toast.error("交换后违反学科时段要求", "配置三中标记为“×”的时段不能安排对应学科。");
      return;
    }
    if (!canPlaceTeachingScheduleAssignment(nextSlots, leftKey, right)) {
      toast.error("交换后存在教师时间冲突", `${right.teacherName}在目标时段已有课程。`);
      return;
    }
    nextSlots[leftKey] = { ...right, source: "manual" };
    if (!canPlaceTeachingScheduleAssignment(nextSlots, rightKey, left)) {
      toast.error("交换后存在教师时间冲突", `${left.teacherName}在目标时段已有课程。`);
      return;
    }
    nextSlots[rightKey] = { ...left, source: "manual" };
    updateConfig((next) => {
      next.slots = nextSlots;
    });
    setSelectedSlots([]);
  };

  const startPanelDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!teacherPanelRef.current) return;
    const rect = teacherPanelRef.current.getBoundingClientRect();
    dragRef.current = { pointerId: event.pointerId, dx: event.clientX - rect.left, dy: event.clientY - rect.top };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const movePanelDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !teacherPanelRef.current) return;
    const width = teacherPanelRef.current.offsetWidth;
    const height = teacherPanelRef.current.offsetHeight;
    setPanelPosition({
      x: Math.max(8, Math.min(window.innerWidth - width - 8, event.clientX - drag.dx)),
      y: Math.max(8, Math.min(window.innerHeight - Math.min(height, window.innerHeight - 16) - 8, event.clientY - drag.dy)),
    });
  };

  const endPanelDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  };

  if (loading || !context || !config) {
    return <div className="flex justify-center py-24"><Spinner size={32} /></div>;
  }

  const selectedClassNames = selectedSlots.map((key) => {
    const parsed = parseTeachingScheduleSlotKey(key);
    return classes.find((item) => item.id === parsed?.classId)?.name || "";
  }).filter(Boolean);

  return (
    <div className="space-y-5">
      <Card>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-[260px] flex-1">
            <Select
              label="所属年级"
              aria-label="选择排课年级"
              value={cohortKey}
              onChange={(event) => onCohortChange(event.target.value)}
              options={cohorts.map((item) => ({ value: item.key, label: `${item.label}（${item.studentCount} 人）` }))}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={handleAutoArrange}>
              <WandSparkles className="h-4 w-4" />自动排课
            </Button>
            <Button onClick={handleSave} loading={saving}>
              <Save className="h-4 w-4" />保存排课配置
            </Button>
          </div>
        </div>
      </Card>

      <Card>
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-ink-900">配置一、教师分工表</h2>
            <p className="mt-1 text-xs text-ink-500">先下载模板批量填写，也可以直接在表格里修改任课教师；姓名与学校教师清单匹配时会自动关联教师账号。</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={handleDownloadTemplate}>
              <Download className="h-3.5 w-3.5" />下载模板
            </Button>
            <Button variant="outline" size="sm" loading={importing} onClick={() => fileInputRef.current?.click()}>
              <Upload className="h-3.5 w-3.5" />上传 Excel
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xlsm"
              className="hidden"
              aria-label="上传教师分工表 Excel"
              onChange={(event) => void handleImport(event.target.files?.[0] || null)}
            />
          </div>
        </div>
        <div className="overflow-x-auto rounded-xl border border-ink-100">
          <table className="w-full min-w-[960px] text-sm">
            <thead>
              <tr className="bg-ink-50 text-xs text-ink-600">
                <th className="sticky left-0 z-10 min-w-28 border-b border-r border-ink-100 bg-ink-50 px-3 py-2 text-left">班级</th>
                {subjects.map((item) => <th key={item.subject} className="min-w-32 border-b border-r border-ink-100 px-3 py-2 text-center">{item.subject}</th>)}
              </tr>
            </thead>
            <tbody>
              {classes.map((classItem) => (
                <tr key={classItem.id} className="border-b border-ink-50 last:border-b-0">
                  <th className="sticky left-0 z-10 border-r border-ink-100 bg-paper px-3 py-2 text-left font-medium text-ink-800">{classItem.name}</th>
                  {subjects.map(({ subject }) => {
                    const assignment = assignmentMap.get(teacherCellKey(classItem.id, subject));
                    return (
                      <td key={subject} className="border-r border-ink-50 p-1.5">
                        <input
                          aria-label={`${classItem.name}${subject}任课教师`}
                          value={assignment?.teacherName || ""}
                          onChange={(event) => updateTeacherAssignment(classItem.id, subject, event.target.value)}
                          list={`schedule-teachers-${subject}`}
                          placeholder="教师姓名"
                          className="w-full rounded-md border border-transparent bg-transparent px-2 py-1.5 text-center text-sm text-ink-800 outline-none hover:border-ink-100 focus:border-gold-400 focus:bg-paper"
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
              {classes.length === 0 && <tr><td colSpan={subjects.length + 1} className="py-8 text-center text-xs text-ink-400">当前年级暂无班级</td></tr>}
            </tbody>
          </table>
        </div>
        {subjects.map(({ subject }) => (
          <datalist key={subject} id={`schedule-teachers-${subject}`}>
            {(context.teachers || []).filter((teacher) => teacher.subject === subject).map((teacher) => (
              <option key={teacher.id} value={teacher.name} />
            ))}
          </datalist>
        ))}
      </Card>

      <Card>
        <div className="mb-4">
          <h2 className="text-base font-semibold text-ink-900">配置二、年级学科课时</h2>
          <p className="mt-1 text-xs text-ink-500">设置每个班一周该学科的标准课时数；Excel 模板中的“标准”行也会写入这里。</p>
        </div>
        <div className="overflow-x-auto rounded-xl border border-ink-100">
          <table className="w-full min-w-[560px] text-sm">
            <thead><tr className="bg-ink-50 text-left text-xs text-ink-600"><th className="px-3 py-2">学科</th><th className="w-48 px-3 py-2">每周课时</th><th className="w-24 px-3 py-2 text-right">操作</th></tr></thead>
            <tbody>
              {subjects.map((item) => (
                <tr key={item.subject} className="border-t border-ink-50">
                  <td className="px-3 py-2 font-medium text-ink-800">{item.subject}</td>
                  <td className="px-3 py-2">
                    <Input
                      type="number"
                      min={0}
                      max={35}
                      aria-label={`${item.subject}每周课时`}
                      value={item.weeklyPeriods}
                      onChange={(event) => updateConfig((next) => {
                        const target = next.subjects.find((subject) => subject.subject === item.subject);
                        if (target) target.weeklyPeriods = Math.max(0, Math.min(35, Number(event.target.value) || 0));
                      })}
                      className="py-1.5"
                    />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Button variant="ghost" size="icon" aria-label={`删除学科 ${item.subject}`} onClick={() => removeSubject(item.subject)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex max-w-md gap-2">
          <Input
            aria-label="新增排课学科"
            placeholder="新增学科"
            value={newSubject}
            onChange={(event) => setNewSubject(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Enter") addSubject(); }}
          />
          <Button variant="outline" onClick={addSubject} disabled={!newSubject.trim()}><Plus className="h-4 w-4" />添加</Button>
        </div>
      </Card>

      <Card>
        <div className="mb-4">
          <h2 className="text-base font-semibold text-ink-900">配置三、学科配置要求</h2>
          <p className="mt-1 text-xs text-ink-500">点击单元格在“－ / √ / ×”之间切换：－表示随意，√表示该半天必须至少安排一节，×表示该半天不排该学科。</p>
        </div>
        <div className="overflow-x-auto rounded-xl border border-ink-100">
          <table className="w-full min-w-[980px] text-sm">
            <thead>
              <tr className="bg-ink-50 text-xs text-ink-600">
                <th rowSpan={2} className="min-w-24 border-b border-r border-ink-100 px-3 py-2 text-left">学科</th>
                {WEEKDAY_LABELS.map((day) => <th key={day} colSpan={2} className="border-b border-r border-ink-100 px-3 py-2 text-center">{day}</th>)}
              </tr>
              <tr className="bg-ink-50 text-xs text-ink-500">
                {WEEKDAY_LABELS.flatMap((day) => ["上午", "下午"].map((half) => <th key={`${day}-${half}`} className="border-b border-r border-ink-100 px-2 py-1.5 text-center">{half}</th>))}
              </tr>
            </thead>
            <tbody>
              {subjects.map(({ subject }) => (
                <tr key={subject} className="border-t border-ink-50">
                  <th className="border-r border-ink-100 px-3 py-2 text-left font-medium text-ink-800">{subject}</th>
                  {TEACHING_SCHEDULE_WEEKDAYS.flatMap((day) => (["morning", "afternoon"] as const).map((halfDay) => {
                    const value = teachingScheduleSubjectRequirement(config, subject, day, halfDay);
                    return (
                      <td key={`${day}-${halfDay}`} className="border-r border-ink-50 p-1.5 text-center">
                        <button
                          type="button"
                          aria-label={`${subject}${WEEKDAY_LABELS[day - 1]}${halfDay === "morning" ? "上午" : "下午"}排课要求：${REQUIREMENT_TITLES[value]}`}
                          title={REQUIREMENT_TITLES[value]}
                          onClick={() => updateConfig((next) => {
                            const key = teachingScheduleRequirementKey(day, halfDay);
                            next.subjectRequirements[subject] ||= {};
                            next.subjectRequirements[subject][key] = nextRequirement(value);
                          })}
                          className={cn(
                            "mx-auto flex h-8 w-12 items-center justify-center rounded-md border text-base font-semibold transition-colors",
                            value === "any" && "border-ink-100 bg-paper text-ink-400 hover:bg-ink-50",
                            value === "required" && "border-emerald-200 bg-emerald-50 text-emerald-700",
                            value === "forbidden" && "border-red-200 bg-red-50 text-red-700",
                          )}
                        >
                          {REQUIREMENT_LABELS[value]}
                        </button>
                      </td>
                    );
                  }))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div
        ref={teacherPanelRef}
        className={cn("relative", tableVisible && "fixed z-50 w-[min(52rem,calc(100vw-2rem))]")}
        style={tableVisible ? (panelPosition ? { left: panelPosition.x, top: panelPosition.y } : { right: 16, top: 88 }) : undefined}
      >
        {tableVisible && (
          <button
            type="button"
            aria-label="拖动教师要求面板"
            className="absolute right-3 top-3 z-20 inline-flex touch-none cursor-move items-center rounded-md border border-ink-200 bg-paper/95 p-1.5 text-ink-500 shadow-sm hover:bg-ink-50"
            onPointerDown={startPanelDrag}
            onPointerMove={movePanelDrag}
            onPointerUp={endPanelDrag}
            onPointerCancel={endPanelDrag}
          >
            <Move className="h-3.5 w-3.5" />
          </button>
        )}
        <Card className={cn(tableVisible && "max-h-[58vh] overflow-y-auto pr-10 shadow-2xl ring-1 ring-ink-200")}>
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-ink-900">配置四、教师要求</h2>
              <p className="mt-1 text-xs text-ink-500">目标课时来自配置一和配置二，当前课时按表一实时统计。选中一个课表单元格后点击教师姓名，可人工填入该教师在当前班级承担的课程。</p>
            </div>
            <Badge>{teacherStats.length} 名教师</Badge>
          </div>
          <div className="overflow-x-auto rounded-xl border border-ink-100">
            <table className="w-full min-w-[720px] text-sm">
              <thead><tr className="bg-ink-50 text-left text-xs text-ink-600"><th className="px-3 py-2">教师</th><th className="px-3 py-2">学科</th><th className="px-3 py-2 text-center">目标课时</th><th className="px-3 py-2 text-center">当前课时</th><th className="min-w-64 px-3 py-2">特殊要求 / 备注</th></tr></thead>
              <tbody>
                {teacherStats.map((stat) => (
                  <tr key={stat.key} className="border-t border-ink-50">
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        aria-label={`选择排课教师 ${stat.teacherName}`}
                        className={cn("font-medium text-ink-800 hover:text-gold-700", highlightedTeacher === stat.key && "rounded bg-[#fff86b] px-1")}
                        onClick={() => assignTeacherToSelected(stat.key)}
                      >
                        {stat.teacherName}
                      </button>
                    </td>
                    <td className="px-3 py-2 text-ink-600">{stat.subjects.join("、") || "—"}</td>
                    <td className="px-3 py-2 text-center tabular-nums text-ink-700">{stat.targetPeriods}</td>
                    <td className={cn("px-3 py-2 text-center font-semibold tabular-nums", stat.currentPeriods === stat.targetPeriods ? "text-ink-900" : "text-gold-700")}>{stat.currentPeriods}</td>
                    <td className="px-3 py-2">
                      <input
                        aria-label={`${stat.teacherName}排课特殊要求`}
                        value={config.teacherNotes[stat.key] || ""}
                        onChange={(event) => updateConfig((next) => {
                          const value = event.target.value;
                          if (value) next.teacherNotes[stat.key] = value;
                          else delete next.teacherNotes[stat.key];
                        })}
                        placeholder="如：周三下午教研、尽量不排第一节"
                        className="w-full rounded-md border border-ink-100 bg-paper px-2 py-1.5 text-xs text-ink-700 outline-none focus:border-gold-400"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <div ref={timetableRef}>
        <Card>
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-base font-semibold text-ink-900"><CalendarRange className="h-4 w-4" />表一、课表</h2>
              <p className="mt-1 text-xs text-ink-500">每格显示“学科 + 教师”。最多勾选两个单元格：选一个后可在配置四点击教师填入；选两个已有课程后可交换。</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge>{Object.keys(config.slots).length} 节已排</Badge>
              {selectedSlots.length > 0 && <span className="text-xs text-ink-500">已选 {selectedSlots.length} 格{selectedClassNames.length ? `（${selectedClassNames.join("、")}）` : ""}</span>}
              <Button variant="outline" size="sm" disabled={selectedSlots.length !== 2 || selectedValues.length !== 2} onClick={swapSelected}>
                <ArrowLeftRight className="h-3.5 w-3.5" />交换
              </Button>
              <Button variant="outline" size="sm" disabled={selectedSlots.length === 0} onClick={clearSelected}>
                <X className="h-3.5 w-3.5" />清空所选
              </Button>
            </div>
          </div>
          <div className="overflow-x-auto rounded-xl border border-[#b6c7cf]">
            <table className="min-w-[2520px] border-collapse text-xs">
              <thead>
                <tr className="bg-[#e8f0f2] text-ink-800">
                  <th rowSpan={3} className="sticky left-0 z-20 w-28 border-b border-r border-[#b6c7cf] bg-[#e8f0f2] px-2 py-2 text-center">班级</th>
                  {WEEKDAY_LABELS.map((day) => <th key={day} colSpan={7} className="border-b border-r border-[#b6c7cf] px-2 py-2 text-center font-semibold">{day}</th>)}
                </tr>
                <tr className="bg-[#edf4f5] text-ink-600">
                  {WEEKDAY_LABELS.flatMap((day) => [
                    <th key={`${day}-am`} colSpan={4} className="border-b border-r border-[#b6c7cf] px-2 py-1 text-center">上午</th>,
                    <th key={`${day}-pm`} colSpan={3} className="border-b border-r border-[#b6c7cf] px-2 py-1 text-center">下午</th>,
                  ])}
                </tr>
                <tr className="bg-[#f4f8f9] text-ink-500">
                  {TEACHING_SCHEDULE_WEEKDAYS.flatMap((day) => TEACHING_SCHEDULE_PERIODS.map((period) => (
                    <th key={`${day}-${period}`} className="w-[68px] border-b border-r border-[#b6c7cf] px-1 py-1 text-center">{period}</th>
                  )))}
                </tr>
              </thead>
              <tbody>
                {classes.map((classItem) => (
                  <tr key={classItem.id}>
                    <th className="sticky left-0 z-10 border-b border-r border-[#b6c7cf] bg-paper px-2 py-2 text-center font-medium text-ink-800">{classItem.name}</th>
                    {TEACHING_SCHEDULE_WEEKDAYS.flatMap((day) => TEACHING_SCHEDULE_PERIODS.map((period) => {
                      const key = teachingScheduleSlotKey(classItem.id, day, period);
                      const slot = config.slots[key];
                      const selected = selectedSlots.includes(key);
                      const teacherHighlighted = Boolean(slot && highlightedTeacher === teachingScheduleTeacherKey(slot.teacherId, slot.teacherName));
                      return (
                        <td key={key} className={cn("border-b border-r border-[#b6c7cf] p-0 align-middle", selected && "bg-[#fff4b8]", teacherHighlighted && !selected && "bg-[#fff86b]") }>
                          <label className="relative flex min-h-14 cursor-pointer items-center justify-center px-1 py-1 text-center">
                            <input
                              type="checkbox"
                              aria-label={`选择 ${classItem.name} ${WEEKDAY_LABELS[day - 1]} 第${period}节排课单元格`}
                              checked={selected}
                              onChange={() => toggleSlot(key)}
                              className="absolute left-1 top-1 h-3 w-3 rounded border-ink-300 text-gold-500"
                            />
                            {slot ? (
                              <span className="leading-tight text-ink-800">
                                <span className="block font-semibold">{slot.subject}</span>
                                <span className="mt-0.5 block text-[10px] text-ink-600">{slot.teacherName}</span>
                              </span>
                            ) : <span className="text-[10px] text-ink-300">—</span>}
                          </label>
                        </td>
                      );
                    }))}
                  </tr>
                ))}
                {classes.length === 0 && <tr><td colSpan={36} className="py-10 text-center text-xs text-ink-400">当前年级暂无班级</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}
