import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  LayoutGrid,
  Plus,
  Printer,
  RotateCcw,
  Save,
  Trash2,
  Users,
} from "lucide-react";
import { useAuthStore } from "@/stores/auth";
import { toast } from "@/stores/ui";
import { examArrangementService } from "@/services/examArrangement";
import type {
  ExamArrangement,
  ExamArrangementContext,
  ExamArrangementInput,
  ExamClassRoomRule,
  ExamRoomConfig,
  GradeCohort,
} from "@/types";
import { PageHeader } from "@/components/layout/PageHeader";
import { StudentSectionTabs } from "./StudentSectionTabs";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input, Select } from "@/components/ui/Input";
import { Spinner } from "@/components/ui/Spinner";
import { cn } from "@/lib/utils";

const DEFAULT_SUBJECTS = ["语文", "数学", "英语", "物理", "化学", "生物", "政治", "历史", "地理"];

type ViewMode = "settings" | "result";

function uniqueSubjects(value: string): string[] {
  return [...new Set(value.split(/[、,，;；\s]+/).map((item) => item.trim()).filter(Boolean))];
}

function createDefaultDraft(context: ExamArrangementContext): ExamArrangementInput {
  const roomCount = Math.max(1, Math.ceil(context.students.length / 30));
  const rooms: ExamRoomConfig[] = Array.from({ length: roomCount }, (_, index) => ({
    id: `room-${index + 1}`,
    name: `第 ${String(index + 1).padStart(2, "0")} 考场`,
    capacity: 30,
  }));
  const roomIds = rooms.map((room) => room.id);
  const classRules: ExamClassRoomRule[] = context.classes.map((classItem) => ({
    classId: classItem.id,
    defaultSubjects: [...DEFAULT_SUBJECTS],
    subjectRoomIds: Object.fromEntries(DEFAULT_SUBJECTS.map((subject) => [subject, [...roomIds]])),
  }));
  return {
    cohortKey: context.cohort.key,
    name: `${context.cohort.label}考试`,
    examDate: new Date().toISOString().slice(0, 10),
    mode: "combination",
    subjects: [...DEFAULT_SUBJECTS],
    rooms,
    classRules,
    studentSubjects: context.students.map((student) => ({
      studentId: student.id,
      subjects: [...DEFAULT_SUBJECTS],
    })),
  };
}

function withSubjects(
  current: ExamArrangementInput,
  context: ExamArrangementContext,
  subjects: string[],
): ExamArrangementInput {
  const roomIds = current.rooms.map((room) => room.id);
  const classRules = current.classRules.map((rule) => {
    const defaultSubjects = rule.defaultSubjects.filter((subject) => subjects.includes(subject));
    return {
      ...rule,
      defaultSubjects: defaultSubjects.length > 0 ? defaultSubjects : [...subjects],
      subjectRoomIds: Object.fromEntries(subjects.map((subject) => [
        subject,
        (rule.subjectRoomIds[subject] || roomIds).filter((roomId) => roomIds.includes(roomId)),
      ])),
    };
  });
  return {
    ...current,
    subjects,
    classRules,
    studentSubjects: current.studentSubjects.map((selection) => {
      const selected = selection.subjects.filter((subject) => subjects.includes(subject));
      const student = context.students.find((item) => item.id === selection.studentId);
      const defaults = classRules.find((rule) => rule.classId === student?.classId)?.defaultSubjects || subjects;
      return {
        ...selection,
        subjects: selected.length > 0 ? selected : defaults.filter((subject) => subjects.includes(subject)),
      };
    }),
  };
}

function CheckboxPill({ checked, label, onClick, disabled = false }: {
  checked: boolean;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        checked
          ? "border-gold-300 bg-gold-50 text-gold-800"
          : "border-ink-200 bg-paper text-ink-500 hover:border-ink-300",
      )}
    >
      <span className={cn(
        "flex h-3.5 w-3.5 items-center justify-center rounded border",
        checked ? "border-gold-500 bg-gold-500 text-white" : "border-ink-300",
      )}>
        {checked && <Check className="h-2.5 w-2.5" />}
      </span>
      {label}
    </button>
  );
}

function cloneDraft(arrangement: ExamArrangement): ExamArrangementInput {
  return {
    id: arrangement.id,
    cohortKey: arrangement.cohortKey,
    name: arrangement.name,
    examDate: arrangement.examDate,
    mode: arrangement.mode,
    subjects: structuredClone(arrangement.subjects),
    rooms: structuredClone(arrangement.rooms),
    classRules: structuredClone(arrangement.classRules),
    studentSubjects: structuredClone(arrangement.studentSubjects),
  };
}

export default function ExamRoomArrangementPage({ embedded = false }: { embedded?: boolean }) {
  const { teacher, getCurrentAffiliation } = useAuthStore();
  const schoolId = getCurrentAffiliation()?.schoolId || null;
  const [cohorts, setCohorts] = useState<GradeCohort[]>([]);
  const [cohortKey, setCohortKey] = useState("");
  const [context, setContext] = useState<ExamArrangementContext | null>(null);
  const [arrangements, setArrangements] = useState<ExamArrangement[]>([]);
  const [selectedArrangementId, setSelectedArrangementId] = useState("");
  const [draft, setDraft] = useState<ExamArrangementInput | null>(null);
  const [subjectText, setSubjectText] = useState(DEFAULT_SUBJECTS.join("、"));
  const [view, setView] = useState<ViewMode>("settings");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [studentKeyword, setStudentKeyword] = useState("");
  const [studentClassFilter, setStudentClassFilter] = useState("");

  const selectedArrangement = arrangements.find((item) => item.id === selectedArrangementId) || null;
  const assignments = useMemo(
    () => selectedArrangement && selectedArrangement.id === draft?.id
      ? selectedArrangement.assignments
      : [],
    [draft?.id, selectedArrangement],
  );

  useEffect(() => {
    if (!schoolId) {
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    examArrangementService.listCohorts(schoolId)
      .then((next) => {
        if (!active) return;
        setCohorts(next);
        setCohortKey((current) => {
          if (next.some((item) => item.key === current)) return current;
          return next.find((item) => item.studentCount > 0)?.key || next[0]?.key || "";
        });
      })
      .catch((error) => toast.error("加载年级失败", error instanceof Error ? error.message : undefined))
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [schoolId]);

  const loadCohort = useCallback(async (key: string, preferredId?: string) => {
    if (!schoolId || !key) return;
    setLoading(true);
    try {
      const [nextContext, nextArrangements] = await Promise.all([
        examArrangementService.getContext(schoolId, key),
        examArrangementService.listArrangements(schoolId, key),
      ]);
      setContext(nextContext);
      setArrangements(nextArrangements);
      const selected = nextArrangements.find((item) => item.id === preferredId) || nextArrangements[0] || null;
      if (selected) {
        setSelectedArrangementId(selected.id);
        setDraft(cloneDraft(selected));
        setSubjectText(selected.subjects.join("、"));
        setView("result");
      } else {
        const nextDraft = createDefaultDraft(nextContext);
        setSelectedArrangementId("");
        setDraft(nextDraft);
        setSubjectText(nextDraft.subjects.join("、"));
        setView("settings");
      }
    } catch (error) {
      toast.error("加载考场安排失败", error instanceof Error ? error.message : undefined);
    } finally {
      setLoading(false);
    }
  }, [schoolId]);

  useEffect(() => {
    void loadCohort(cohortKey);
  }, [cohortKey, loadCohort]);

  const updateDraft = (updater: (current: ExamArrangementInput) => ExamArrangementInput) => {
    setDraft((current) => current ? updater(current) : current);
  };

  const applySubjects = () => {
    const subjects = uniqueSubjects(subjectText);
    if (subjects.length === 0 || !draft || !context) return;
    updateDraft((current) => withSubjects(current, context, subjects));
  };

  const handleNew = () => {
    if (!context) return;
    const next = createDefaultDraft(context);
    setSelectedArrangementId("");
    setDraft(next);
    setSubjectText(next.subjects.join("、"));
    setView("settings");
  };

  const handleSelectArrangement = (id: string) => {
    setSelectedArrangementId(id);
    const arrangement = arrangements.find((item) => item.id === id);
    if (!arrangement) {
      handleNew();
      return;
    }
    setDraft(cloneDraft(arrangement));
    setSubjectText(arrangement.subjects.join("、"));
    setView("result");
  };

  const handleSave = async () => {
    if (!draft || !context || !schoolId || !teacher) return;
    const subjects = uniqueSubjects(subjectText);
    const preparedDraft = subjects.length > 0
      ? withSubjects(draft, context, subjects)
      : { ...draft, subjects };
    setSaving(true);
    try {
      const saved = await examArrangementService.saveArrangement(schoolId, teacher.id, preparedDraft);
      setArrangements((current) => [saved, ...current.filter((item) => item.id !== saved.id)]);
      setSelectedArrangementId(saved.id);
      setDraft(cloneDraft(saved));
      setSubjectText(saved.subjects.join("、"));
      setView("result");
      toast.success("考场安排已生成", `共生成 ${saved.assignments.length} 张桌贴`);
    } catch (error) {
      toast.error("生成考场安排失败", error instanceof Error ? error.message : undefined);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedArrangement || !window.confirm(`确定删除「${selectedArrangement.name}」吗？`)) return;
    try {
      await examArrangementService.deleteArrangement(selectedArrangement.id);
      toast.success("考场安排已删除");
      await loadCohort(cohortKey);
    } catch (error) {
      toast.error("删除失败", error instanceof Error ? error.message : undefined);
    }
  };

  const addRoom = () => {
    updateDraft((current) => {
      const id = `room-${Date.now()}`;
      return {
        ...current,
        rooms: [...current.rooms, { id, name: `第 ${String(current.rooms.length + 1).padStart(2, "0")} 考场`, capacity: 30 }],
        classRules: current.classRules.map((rule) => ({
          ...rule,
          subjectRoomIds: Object.fromEntries(current.subjects.map((subject) => [
            subject,
            [...(rule.subjectRoomIds[subject] || []), id],
          ])),
        })),
      };
    });
  };

  const removeRoom = (roomId: string) => {
    updateDraft((current) => {
      if (current.rooms.length <= 1) return current;
      const remaining = current.rooms.filter((room) => room.id !== roomId);
      const remainingIds = remaining.map((room) => room.id);
      return {
        ...current,
        rooms: remaining,
        classRules: current.classRules.map((rule) => ({
          ...rule,
          subjectRoomIds: Object.fromEntries(current.subjects.map((subject) => {
            const roomIds = (rule.subjectRoomIds[subject] || []).filter((id) => id !== roomId);
            return [subject, roomIds.length > 0 ? roomIds : [...remainingIds]];
          })),
        })),
      };
    });
  };

  const toggleClassSubject = (classId: string, subject: string) => {
    if (!context) return;
    updateDraft((current) => {
      const classStudentIds = new Set(context.students.filter((student) => student.classId === classId).map((student) => student.id));
      const currentRule = current.classRules.find((rule) => rule.classId === classId);
      const enabled = currentRule?.defaultSubjects.includes(subject) || false;
      return {
        ...current,
        classRules: current.classRules.map((rule) => rule.classId === classId
          ? { ...rule, defaultSubjects: enabled ? rule.defaultSubjects.filter((item) => item !== subject) : [...rule.defaultSubjects, subject] }
          : rule),
        studentSubjects: current.studentSubjects.map((selection) => classStudentIds.has(selection.studentId)
          ? {
            ...selection,
            subjects: enabled
              ? selection.subjects.filter((item) => item !== subject)
              : [...new Set([...selection.subjects, subject])],
          }
          : selection),
      };
    });
  };

  const toggleRuleRoom = (classId: string, subject: string, roomId: string) => {
    updateDraft((current) => ({
      ...current,
      classRules: current.classRules.map((rule) => {
        if (rule.classId !== classId) return rule;
        const selected = rule.subjectRoomIds[subject] || [];
        if (selected.includes(roomId) && selected.length === 1) return rule;
        return {
          ...rule,
          subjectRoomIds: {
            ...rule.subjectRoomIds,
            [subject]: selected.includes(roomId)
              ? selected.filter((id) => id !== roomId)
              : [...selected, roomId],
          },
        };
      }),
    }));
  };

  const toggleStudentSubject = (studentId: string, subject: string) => {
    updateDraft((current) => ({
      ...current,
      studentSubjects: current.studentSubjects.map((selection) => selection.studentId === studentId
        ? {
          ...selection,
          subjects: selection.subjects.includes(subject)
            ? selection.subjects.filter((item) => item !== subject)
            : [...selection.subjects, subject],
        }
        : selection),
    }));
  };

  const filteredStudents = useMemo(() => {
    if (!context) return [];
    const keyword = studentKeyword.trim().toLowerCase();
    return context.students.filter((student) => {
      if (studentClassFilter && student.classId !== studentClassFilter) return false;
      return !keyword || student.name.toLowerCase().includes(keyword) || student.studentNo.toLowerCase().includes(keyword);
    });
  }, [context, studentClassFilter, studentKeyword]);

  const assignmentGroups = useMemo(() => {
    const groups = new Map<string, Map<string, typeof assignments>>();
    assignments.forEach((assignment) => {
      const sessions = groups.get(assignment.sessionKey) || new Map<string, typeof assignments>();
      const roomAssignments = sessions.get(assignment.roomName) || [];
      roomAssignments.push(assignment);
      sessions.set(assignment.roomName, roomAssignments);
      groups.set(assignment.sessionKey, sessions);
    });
    return groups;
  }, [assignments]);

  const pageActions = draft ? (
    <>
      <Button variant="outline" onClick={handleNew}><RotateCcw className="h-4 w-4" />新建方案</Button>
      <Button variant="gold" onClick={handleSave} loading={saving}><Save className="h-4 w-4" />生成并保存</Button>
      <Button variant="outline" disabled={assignments.length === 0} onClick={() => window.print()}>
        <Printer className="h-4 w-4" />打印桌贴
      </Button>
    </>
  ) : undefined;

  return (
    <div>
      {embedded ? (
        pageActions && <div className="no-print mb-5 flex flex-wrap justify-end gap-2">{pageActions}</div>
      ) : (
        <div className="no-print">
          <PageHeader
            title="考场安排"
            description="按年级配置考场容量、班级与科目限制，自动生成座位表和高考式桌贴"
            icon={<LayoutGrid className="h-5 w-5" />}
            action={pageActions}
          />
          <StudentSectionTabs />
        </div>
      )}

      {!schoolId ? (
        <Card className="no-print"><EmptyState icon={<Users className="h-8 w-8" />} title="个人身份暂不支持考场安排" description="请切换到已认证学校身份后使用。" /></Card>
      ) : loading ? (
        <div className="flex justify-center py-24"><Spinner size={32} /></div>
      ) : !draft || !context ? (
        <Card className="no-print"><EmptyState icon={<Users className="h-8 w-8" />} title="暂无可安排的年级" description="请先在班级管理中建立班级和学生档案。" /></Card>
      ) : (
        <>
          <div className="no-print mb-5 grid gap-3 rounded-xl border border-ink-100 bg-paper p-4 shadow-sm lg:grid-cols-[1fr_1fr_auto] lg:items-end">
            <Select label="所属年级" value={cohortKey} onChange={(event) => setCohortKey(event.target.value)} options={cohorts.map((item) => ({ value: item.key, label: `${item.label} · ${item.studentCount} 人` }))} />
            <Select label="已保存方案" value={selectedArrangementId} onChange={(event) => handleSelectArrangement(event.target.value)} placeholder="新建方案" options={arrangements.map((item) => ({ value: item.id, label: `${item.name} · ${item.assignments.length} 张桌贴` }))} />
            <div className="flex gap-2">
              <Button variant={view === "settings" ? "ink" : "outline"} onClick={() => setView("settings")}>配置</Button>
              <Button variant={view === "result" ? "ink" : "outline"} onClick={() => setView("result")} disabled={assignments.length === 0}>安排结果</Button>
            </div>
          </div>

          {view === "settings" ? (
            <div className="no-print space-y-5">
              <Card>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <Input label="考试名称" value={draft.name} onChange={(event) => updateDraft((current) => ({ ...current, name: event.target.value }))} />
                  <Input label="考试日期" type="date" value={draft.examDate || ""} onChange={(event) => updateDraft((current) => ({ ...current, examDate: event.target.value }))} />
                  <Select label="编排方式" value={draft.mode} onChange={(event) => updateDraft((current) => ({ ...current, mode: event.target.value as ExamArrangementInput["mode"] }))} options={[
                    { value: "combination", label: "按学生选科组合编排" },
                    { value: "subject", label: "按单科分别编排" },
                  ]} />
                  <Input label="考试科目" value={subjectText} onChange={(event) => setSubjectText(event.target.value)} onBlur={applySubjects} hint="使用顿号、逗号或空格分隔" />
                </div>
                <div className="mt-4 rounded-lg bg-ink-50 px-4 py-3 text-xs text-ink-500">
                  {draft.mode === "combination"
                    ? "每名学生只安排一个座位；可用考场取其全部选考科目允许考场的交集。"
                    : "每个科目独立安排座位和考场容量；同一学生会按参加科目生成多张桌贴。"}
                </div>
              </Card>

              <Card className="p-0 overflow-hidden">
                <div className="flex items-center justify-between border-b border-ink-100 px-5 py-4">
                  <div><div className="font-medium text-ink-900">考场与容量</div><div className="mt-0.5 text-xs text-ink-500">座位号在每个考场内从 1 开始连续生成。</div></div>
                  <Button variant="outline" size="sm" onClick={addRoom}><Plus className="h-4 w-4" />增加考场</Button>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-[620px] w-full text-sm">
                    <thead className="bg-ink-50 text-xs text-ink-500"><tr><th className="px-5 py-2.5 text-left font-medium">考场名称</th><th className="px-5 py-2.5 text-left font-medium">最多人数</th><th className="px-5 py-2.5 text-right font-medium">操作</th></tr></thead>
                    <tbody className="divide-y divide-ink-100">
                      {draft.rooms.map((room) => (
                        <tr key={room.id}>
                          <td className="px-5 py-3"><Input aria-label="考场名称" value={room.name} onChange={(event) => updateDraft((current) => ({ ...current, rooms: current.rooms.map((item) => item.id === room.id ? { ...item, name: event.target.value } : item) }))} /></td>
                          <td className="px-5 py-3"><Input aria-label="考场容量" type="number" min={1} max={1000} value={room.capacity} onChange={(event) => updateDraft((current) => ({ ...current, rooms: current.rooms.map((item) => item.id === room.id ? { ...item, capacity: Number(event.target.value) } : item) }))} /></td>
                          <td className="px-5 py-3 text-right"><Button variant="ghost" size="icon" aria-label={`删除${room.name}`} disabled={draft.rooms.length === 1} onClick={() => removeRoom(room.id)}><Trash2 className="h-4 w-4 text-red-500" /></Button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>

              <Card className="p-0 overflow-hidden">
                <div className="border-b border-ink-100 px-5 py-4"><div className="font-medium text-ink-900">班级、科目与可用考场</div><div className="mt-0.5 text-xs text-ink-500">班级科目开关会同步到本班全部学生；每个科目至少保留一个可用考场。</div></div>
                <div className="divide-y divide-ink-100">
                  {context.classes.map((classItem) => {
                    const rule = draft.classRules.find((item) => item.classId === classItem.id);
                    if (!rule) return null;
                    return (
                      <div key={classItem.id} className="space-y-4 px-5 py-4">
                        <div className="flex flex-wrap items-center gap-2"><span className="font-medium text-ink-900">{classItem.name}</span><Badge>{context.students.filter((student) => student.classId === classItem.id).length} 人</Badge></div>
                        <div><div className="mb-2 text-xs font-medium text-ink-500">参加科目</div><div className="flex flex-wrap gap-1.5">{draft.subjects.map((subject) => <CheckboxPill key={subject} checked={rule.defaultSubjects.includes(subject)} label={subject} onClick={() => toggleClassSubject(classItem.id, subject)} />)}</div></div>
                        <div className="overflow-x-auto">
                          <table className="min-w-[680px] w-full text-xs">
                            <tbody className="divide-y divide-ink-100 rounded-lg border border-ink-100">
                              {draft.subjects.filter((subject) => rule.defaultSubjects.includes(subject)).map((subject) => (
                                <tr key={subject}><td className="w-24 px-3 py-2 font-medium text-ink-700">{subject}</td><td className="px-3 py-2"><div className="flex flex-wrap gap-1.5">{draft.rooms.map((room) => <CheckboxPill key={room.id} checked={(rule.subjectRoomIds[subject] || []).includes(room.id)} label={room.name} onClick={() => toggleRuleRoom(classItem.id, subject, room.id)} />)}</div></td></tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>

              <Card className="p-0 overflow-hidden">
                <div className="border-b border-ink-100 px-5 py-4"><div className="font-medium text-ink-900">学生选科</div><div className="mt-0.5 text-xs text-ink-500">班级默认设置后，可继续修改个别学生的实际考试科目。</div></div>
                <div className="grid gap-3 border-b border-ink-100 p-4 md:grid-cols-2">
                  <Input value={studentKeyword} onChange={(event) => setStudentKeyword(event.target.value)} placeholder="搜索姓名或学号" aria-label="搜索学生" />
                  <Select value={studentClassFilter} onChange={(event) => setStudentClassFilter(event.target.value)} placeholder="全部班级" options={context.classes.map((item) => ({ value: item.id, label: item.name }))} />
                </div>
                <div className="max-h-[520px] overflow-auto divide-y divide-ink-100">
                  {filteredStudents.map((student) => {
                    const selection = draft.studentSubjects.find((item) => item.studentId === student.id);
                    const className = context.classes.find((item) => item.id === student.classId)?.name || "未分班";
                    return (
                      <div key={student.id} className="grid gap-3 px-5 py-3 lg:grid-cols-[12rem_1fr] lg:items-center">
                        <div><div className="text-sm font-medium text-ink-900">{student.name} <span className="font-normal text-ink-400">{student.studentNo}</span></div><div className="text-xs text-ink-400">{className}</div></div>
                        <div className="flex flex-wrap gap-1.5">{draft.subjects.map((subject) => <CheckboxPill key={subject} checked={selection?.subjects.includes(subject) || false} label={subject} onClick={() => toggleStudentSubject(student.id, subject)} />)}</div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            </div>
          ) : assignments.length === 0 ? (
            <Card className="no-print"><EmptyState icon={<LayoutGrid className="h-8 w-8" />} title="尚未生成安排" description="完成配置后点击“生成并保存”。" /></Card>
          ) : (
            <div className="no-print space-y-5">
              <div className="grid gap-4 sm:grid-cols-3">
                <Card><div className="text-xs text-ink-400">桌贴数量</div><div className="mt-1 text-2xl font-semibold text-ink-900">{assignments.length}</div></Card>
                <Card><div className="text-xs text-ink-400">考试场次</div><div className="mt-1 text-2xl font-semibold text-ink-900">{assignmentGroups.size}</div></Card>
                <Card><div className="text-xs text-ink-400">实际使用考场</div><div className="mt-1 text-2xl font-semibold text-ink-900">{new Set(assignments.map((item) => `${item.sessionKey}:${item.roomId}`)).size}</div></Card>
              </div>
              {[...assignmentGroups.entries()].map(([sessionKey, rooms]) => (
                <Card key={sessionKey} className="p-0 overflow-hidden">
                  <div className="border-b border-ink-100 px-5 py-4"><div className="font-medium text-ink-900">{sessionKey === "combination" ? "选科组合统一编排" : sessionKey.replace("subject:", "")}</div><div className="mt-0.5 text-xs text-ink-500">{[...rooms.values()].reduce((sum, items) => sum + items.length, 0)} 个座位</div></div>
                  {[...rooms.entries()].map(([roomName, items]) => (
                    <div key={roomName} className="border-b border-ink-100 last:border-0">
                      <div className="flex items-center justify-between bg-ink-50 px-5 py-2.5 text-xs"><span className="font-medium text-ink-700">{roomName}</span><span className="text-ink-400">{items.length} 人</span></div>
                      <div className="overflow-x-auto"><table className="min-w-[760px] w-full text-xs"><thead className="text-ink-400"><tr><th className="px-4 py-2 text-left font-medium">座位</th><th className="px-4 py-2 text-left font-medium">准考证号</th><th className="px-4 py-2 text-left font-medium">班级</th><th className="px-4 py-2 text-left font-medium">姓名</th><th className="px-4 py-2 text-left font-medium">学号</th><th className="px-4 py-2 text-left font-medium">科目/组合</th></tr></thead><tbody className="divide-y divide-ink-100">{items.sort((left, right) => left.seatNo - right.seatNo).map((item) => <tr key={item.id}><td className="px-4 py-2.5 font-medium">{item.seatNo}</td><td className="px-4 py-2.5 font-mono">{item.admissionNo}</td><td className="px-4 py-2.5">{item.className}</td><td className="px-4 py-2.5 font-medium text-ink-900">{item.studentName}</td><td className="px-4 py-2.5">{item.studentNo}</td><td className="px-4 py-2.5">{item.subjectLabel}</td></tr>)}</tbody></table></div>
                    </div>
                  ))}
                </Card>
              ))}
              {selectedArrangement && <Button variant="ghost" onClick={handleDelete}><Trash2 className="h-4 w-4 text-red-500" />删除当前方案</Button>}
            </div>
          )}

          {assignments.length > 0 && selectedArrangement && (
            <div className="print-only exam-desk-label-sheet">
              {assignments
                .slice()
                .sort((left, right) => left.sessionKey.localeCompare(right.sessionKey, "zh-CN") || left.roomName.localeCompare(right.roomName, "zh-CN") || left.seatNo - right.seatNo)
                .map((assignment) => (
                  <section key={assignment.id} className="exam-desk-label">
                    <div className="exam-desk-label-title">{selectedArrangement.name}</div>
                    <div className="exam-desk-label-meta"><span>{selectedArrangement.examDate || "考试日期待定"}</span><span>{assignment.subjectLabel}</span></div>
                    <div className="exam-desk-label-seat"><span>{assignment.roomName}</span><strong>{assignment.seatNo} 号</strong></div>
                    <div className="exam-desk-label-name">{assignment.studentName}</div>
                    <div className="exam-desk-label-row"><span>班级：{assignment.className}</span><span>学号：{assignment.studentNo}</span></div>
                    <div className="exam-desk-label-admission">准考证号 {assignment.admissionNo}</div>
                  </section>
                ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
