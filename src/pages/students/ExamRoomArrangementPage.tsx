import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  Copy,
  Download,
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
  ExamSeatOrder,
  ExamSubjectSetupMode,
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
import { Modal } from "@/components/ui/Modal";
import { cn } from "@/lib/utils";
import {
  downloadClassArrangements,
  downloadDeskLabels,
  groupDeskLabels,
  groupDeskLabelsByRoom,
  groupStudentArrangements,
} from "@/lib/exam-arrangement-export";
import { summarizeExamGroups, type ExamGroupSummary } from "@/lib/exam-arrangement";

const DEFAULT_SUBJECTS = ["语文", "数学", "英语", "物理", "化学", "生物", "政治", "历史", "地理"];
const CORE_SUBJECTS = ["语文", "数学", "英语"];

type ViewMode = "settings" | "result";
type PreviewMode = "class" | "desk";

function uniqueSubjects(values: string[]): string[] {
  const selected = new Set(values.map((item) => item.trim()).filter(Boolean));
  return [
    ...DEFAULT_SUBJECTS.filter((subject) => selected.has(subject)),
    ...[...selected].filter((subject) => !DEFAULT_SUBJECTS.includes(subject)),
  ];
}

function subjectSelectionNames(context: ExamArrangementContext): string[] {
  return [...new Set(context.students.map((student) => student.subjectSelection?.trim()).filter((value): value is string => Boolean(value)))]
    .sort((left, right) => left.localeCompare(right, "zh-CN"));
}

function inferSelectionSubjects(name: string): string[] {
  const aliases: Array<[string, string]> = [
    ["物", "物理"],
    ["化", "化学"],
    ["生", "生物"],
    ["政", "政治"],
    ["史", "历史"],
    ["地", "地理"],
  ];
  return uniqueSubjects([
    ...CORE_SUBJECTS,
    ...aliases.filter(([alias, subject]) => name.includes(alias) || name.includes(subject)).map(([, subject]) => subject),
  ]);
}

function createRules(context: ExamArrangementContext, subjects: string[], rooms: ExamRoomConfig[]): ExamClassRoomRule[] {
  const roomIds = rooms.map((room) => room.id);
  return context.classes.map((classItem) => ({
    classId: classItem.id,
    defaultSubjects: [...subjects],
    subjectRoomIds: Object.fromEntries(subjects.map((subject) => [subject, [...roomIds]])),
  }));
}

function classNumber(name: string, fallback: number): string {
  const matches = [...name.matchAll(/\d+/g)];
  return matches.at(-1)?.[0] || String(fallback);
}

function defaultRoomIdsForGroup(group: ExamGroupSummary, rooms: ExamRoomConfig[]): string[] {
  const roomIds = rooms
    .filter((room) => !room.classroomClassId || group.classIds.includes(room.classroomClassId))
    .map((room) => room.id);
  return roomIds.length > 0 ? roomIds : rooms.map((room) => room.id);
}

function normalizeGroupRoomIds(
  draft: ExamArrangementInput,
  context: ExamArrangementContext,
): Record<string, string[]> {
  const validRoomIds = new Set(draft.rooms.map((room) => room.id));
  return Object.fromEntries(summarizeExamGroups(draft, context).map((group) => {
    const configured = [...new Set((draft.groupRoomIds?.[group.key] || []).filter((roomId) => validRoomIds.has(roomId)))];
    return [group.key, configured.length > 0 ? configured : defaultRoomIdsForGroup(group, draft.rooms)];
  }));
}

function createDefaultRooms(context: ExamArrangementContext): ExamRoomConfig[] {
  if (context.classes.length === 0) {
    return [{ id: "room-1", name: "1考场", number: "1考场", location: "待填写", capacity: 30 }];
  }
  return context.classes.map((classItem, index) => {
    const number = classNumber(classItem.name, index + 1);
    const studentCount = context.students.filter((student) => student.classId === classItem.id).length;
    return {
      id: `room-${classItem.id}`,
      name: `${number}考场`,
      number: `${number}考场`,
      location: `${classItem.grade || context.cohort.grade}${number}班教室`,
      classroomClassId: classItem.id,
      capacity: Math.max(1, studentCount),
    };
  });
}

function createDefaultDraft(context: ExamArrangementContext): ExamArrangementInput {
  const rooms = createDefaultRooms(context);
  const selectionNames = subjectSelectionNames(context);
  const selectionSubjects = Object.fromEntries(selectionNames.map((name) => [name, inferSelectionSubjects(name)]));
  const subjectSetupMode: ExamSubjectSetupMode = selectionNames.length > 0 ? "selection" : "all";
  const studentSubjects = context.students.map((student) => ({
    studentId: student.id,
    subjects: subjectSetupMode === "selection" && student.subjectSelection
      ? [...(selectionSubjects[student.subjectSelection] || DEFAULT_SUBJECTS)]
      : [...DEFAULT_SUBJECTS],
    absent: false,
  }));
  const draft: ExamArrangementInput = {
    cohortKey: context.cohort.key,
    name: `${context.cohort.label}考试`,
    examDate: new Date().toISOString().slice(0, 10),
    mode: "combination",
    subjectSetupMode,
    subjects: [...DEFAULT_SUBJECTS],
    selectionSubjects,
    separateSubjects: [],
    seatOrder: "random",
    rooms,
    groupRoomIds: {},
    classRules: createRules(context, DEFAULT_SUBJECTS, rooms),
    studentSubjects,
  };
  return { ...draft, groupRoomIds: normalizeGroupRoomIds(draft, context) };
}

function normalizeDraft(current: ExamArrangementInput, context: ExamArrangementContext): ExamArrangementInput {
  const subjects = uniqueSubjects(current.subjects);
  const rooms = current.rooms.map((room) => ({
    ...room,
    name: room.number || room.name,
    number: room.number || room.name,
    location: room.location || room.name,
    classroomClassId: room.classroomClassId
      || context.classes.find((classItem) => room.id === `room-${classItem.id}`)?.id,
  }));
  const selectionSubjects = Object.fromEntries(Object.entries(current.selectionSubjects || {}).map(([name, items]) => [
    name,
    uniqueSubjects(items).filter((subject) => subjects.includes(subject)),
  ]));
  const normalized: ExamArrangementInput = {
    ...current,
    mode: current.mode || "combination",
    subjectSetupMode: current.subjectSetupMode || "all",
    subjects,
    selectionSubjects,
    separateSubjects: uniqueSubjects(current.separateSubjects || []).filter((subject) => subjects.includes(subject)),
    seatOrder: current.seatOrder || "random",
    rooms,
    classRules: createRules(context, subjects, rooms),
    studentSubjects: context.students.map((student) => {
      const existing = current.studentSubjects.find((item) => item.studentId === student.id);
      const defaults = current.subjectSetupMode === "selection" && student.subjectSelection
        ? selectionSubjects[student.subjectSelection] || subjects
        : subjects;
      const selected = uniqueSubjects(existing?.subjects || defaults).filter((subject) => subjects.includes(subject));
      return {
        studentId: student.id,
        subjects: selected.length > 0 || existing?.absent ? selected : [...defaults],
        absent: Boolean(existing?.absent),
      };
    }),
  };
  return { ...normalized, groupRoomIds: normalizeGroupRoomIds(normalized, context) };
}

function cloneDraft(arrangement: ExamArrangement, context: ExamArrangementContext): ExamArrangementInput {
  return normalizeDraft({
    id: arrangement.id,
    cohortKey: arrangement.cohortKey,
    name: arrangement.name,
    examDate: arrangement.examDate,
    mode: arrangement.mode,
    subjectSetupMode: arrangement.subjectSetupMode,
    subjects: structuredClone(arrangement.subjects),
    selectionSubjects: structuredClone(arrangement.selectionSubjects || {}),
    separateSubjects: structuredClone(arrangement.separateSubjects || []),
    seatOrder: arrangement.seatOrder,
    rooms: structuredClone(arrangement.rooms),
    groupRoomIds: structuredClone(arrangement.groupRoomIds || {}),
    classRules: structuredClone(arrangement.classRules),
    studentSubjects: structuredClone(arrangement.studentSubjects),
  }, context);
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
        "inline-flex min-h-9 items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        checked
          ? "border-gold-300 bg-gold-50 text-gold-800 shadow-sm"
          : "border-ink-200 bg-paper text-ink-600 hover:border-ink-300 hover:bg-ink-50/60",
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

function ChoiceCard({ checked, title, description, onClick }: {
  checked: boolean;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      onClick={onClick}
      className={cn(
        "rounded-lg border p-3 text-left transition-colors",
        checked ? "border-gold-400 bg-gold-50" : "border-ink-200 bg-paper hover:border-ink-300",
      )}
    >
      <div className="flex items-center gap-2 text-sm font-medium text-ink-900">
        <span className={cn("flex h-4 w-4 items-center justify-center rounded-full border", checked ? "border-gold-500" : "border-ink-300")}>
          {checked && <span className="h-2 w-2 rounded-full bg-gold-500" />}
        </span>
        {title}
      </div>
      <div className="mt-1 pl-6 text-xs text-ink-500">{description}</div>
    </button>
  );
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
  const [view, setView] = useState<ViewMode>("settings");
  const [previewMode, setPreviewMode] = useState<PreviewMode>("class");
  const [selectedClassIds, setSelectedClassIds] = useState<Set<string>>(new Set());
  const [selectedRoomIds, setSelectedRoomIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [studentKeyword, setStudentKeyword] = useState("");
  const [studentClassFilter, setStudentClassFilter] = useState("");
  const [bulkCapacity, setBulkCapacity] = useState(30);
  const [newPlanOpen, setNewPlanOpen] = useState(false);
  const [newPlanName, setNewPlanName] = useState("");

  const selectedArrangement = arrangements.find((item) => item.id === selectedArrangementId) || null;
  const assignments = useMemo(() => (
    selectedArrangement && selectedArrangement.id === draft?.id
      ? selectedArrangement.assignments
      : []
  ), [draft?.id, selectedArrangement]);
  const deskLabels = useMemo(() => groupDeskLabels(assignments), [assignments]);
  const deskRoomGroups = useMemo(() => groupDeskLabelsByRoom(assignments), [assignments]);
  const selectedDeskLabels = useMemo(
    () => deskLabels.filter((label) => selectedRoomIds.has(label.roomId)),
    [deskLabels, selectedRoomIds],
  );
  const examGroups = useMemo(() => (
    draft && context ? summarizeExamGroups(draft, context) : []
  ), [context, draft]);

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
        setCohortKey((current) => next.some((item) => item.key === current)
          ? current
          : next.find((item) => item.studentCount > 0)?.key || next[0]?.key || "");
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
      const selected = preferredId ? nextArrangements.find((item) => item.id === preferredId) || null : null;
      if (selected) {
        setSelectedArrangementId(selected.id);
        setDraft(cloneDraft(selected, nextContext));
        setView("result");
      } else {
        setSelectedArrangementId("");
        setDraft(createDefaultDraft(nextContext));
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
    setDraft((current) => current && context ? normalizeDraft(updater(current), context) : current);
  };

  const handleNew = () => {
    if (!context) return;
    setNewPlanName(createDefaultDraft(context).name);
    setNewPlanOpen(true);
  };

  const createNewPlan = () => {
    if (!context) return;
    const name = newPlanName.trim();
    if (!name) return;
    setSelectedArrangementId("");
    setDraft({ ...createDefaultDraft(context), name });
    setView("settings");
    setNewPlanOpen(false);
  };

  const handleSelectArrangement = (id: string) => {
    if (id === "new") {
      handleNew();
      return;
    }
    if (!context) return;
    const arrangement = arrangements.find((item) => item.id === id);
    if (!arrangement) return;
    setSelectedArrangementId(id);
    setDraft(cloneDraft(arrangement, context));
    setView("result");
  };

  const handleReuse = () => {
    if (!selectedArrangement || !context) return;
    const next = cloneDraft(selectedArrangement, context);
    delete next.id;
    next.name = `${selectedArrangement.name}（复用）`;
    setSelectedArrangementId("");
    setDraft(next);
    setView("settings");
    toast.success("已复用考场安排", "修改考试名称和时间后即可重新生成");
  };

  const handleSave = async () => {
    if (!draft || !context || !schoolId || !teacher) return;
    const preparedDraft = normalizeDraft({
      ...draft,
      mode: draft.separateSubjects?.length === draft.subjects.length ? "subject" : "combination",
    }, context);
    setSaving(true);
    try {
      const saved = await examArrangementService.saveArrangement(schoolId, teacher.id, preparedDraft);
      setArrangements((current) => [saved, ...current.filter((item) => item.id !== saved.id)]);
      setSelectedArrangementId(saved.id);
      setDraft(cloneDraft(saved, context));
      setView("result");
      toast.success("考场安排已生成", `共安排 ${saved.assignments.length} 个考试座位，生成 ${groupDeskLabels(saved.assignments).length} 张桌贴`);
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

  const setSubjectSetupMode = (mode: ExamSubjectSetupMode) => {
    if (!context) return;
    updateDraft((current) => ({
      ...current,
      subjectSetupMode: mode,
      studentSubjects: context.students.map((student) => {
        const existing = current.studentSubjects.find((item) => item.studentId === student.id);
        const subjects = mode === "selection" && student.subjectSelection
          ? current.selectionSubjects?.[student.subjectSelection] || current.subjects
          : current.subjects;
        return { studentId: student.id, subjects: [...subjects], absent: Boolean(existing?.absent) };
      }),
    }));
  };

  const toggleSubject = (subject: string) => {
    updateDraft((current) => {
      const enabled = current.subjects.includes(subject);
      const subjects = enabled
        ? current.subjects.filter((item) => item !== subject)
        : uniqueSubjects([...current.subjects, subject]);
      return {
        ...current,
        subjects,
        separateSubjects: current.separateSubjects?.filter((item) => item !== subject),
        selectionSubjects: Object.fromEntries(Object.entries(current.selectionSubjects || {}).map(([name, items]) => [
          name,
          enabled ? items.filter((item) => item !== subject) : items,
        ])),
        studentSubjects: current.studentSubjects.map((selection) => ({
          ...selection,
          subjects: enabled
            ? selection.subjects.filter((item) => item !== subject)
            : selection.subjects,
        })),
      };
    });
  };

  const toggleSelectionSubject = (selectionName: string, subject: string) => {
    if (!context) return;
    updateDraft((current) => {
      const currentSubjects = current.selectionSubjects?.[selectionName] || [];
      const enabled = currentSubjects.includes(subject);
      const nextSubjects = enabled
        ? currentSubjects.filter((item) => item !== subject)
        : uniqueSubjects([...currentSubjects, subject]);
      const matchingStudentIds = new Set(context.students
        .filter((student) => student.subjectSelection === selectionName)
        .map((student) => student.id));
      return {
        ...current,
        selectionSubjects: { ...current.selectionSubjects, [selectionName]: nextSubjects },
        studentSubjects: current.studentSubjects.map((selection) => matchingStudentIds.has(selection.studentId)
          ? { ...selection, subjects: [...nextSubjects] }
          : selection),
      };
    });
  };

  const toggleSeparateSubject = (subject: string) => {
    updateDraft((current) => {
      const selected = current.separateSubjects || [];
      return {
        ...current,
        separateSubjects: selected.includes(subject)
          ? selected.filter((item) => item !== subject)
          : uniqueSubjects([...selected, subject]),
      };
    });
  };

  const addRoom = () => {
    updateDraft((current) => {
      const index = current.rooms.length + 1;
      const roomId = `room-${Date.now()}`;
      return {
        ...current,
        rooms: [...current.rooms, {
          id: roomId,
          name: `${index}考场`,
          number: `${index}考场`,
          location: "待填写",
          capacity: 30,
        }],
        groupRoomIds: Object.fromEntries(Object.entries(current.groupRoomIds || {}).map(([key, roomIds]) => [
          key,
          [...new Set([...roomIds, roomId])],
        ])),
      };
    });
  };

  const removeRoom = (roomId: string) => {
    updateDraft((current) => current.rooms.length <= 1
      ? current
      : { ...current, rooms: current.rooms.filter((room) => room.id !== roomId) });
  };

  const applyBulkCapacity = () => {
    const capacity = Math.floor(Number(bulkCapacity));
    if (!Number.isFinite(capacity) || capacity < 1 || capacity > 1000) {
      toast.error("考场容量应为 1 至 1000 人");
      return;
    }
    updateDraft((current) => ({
      ...current,
      rooms: current.rooms.map((room) => ({ ...room, capacity })),
    }));
    toast.success("已批量修改考场容量", `全部考场均设为 ${capacity} 人`);
  };

  const toggleGroupRoom = (groupKey: string, roomId: string) => {
    updateDraft((current) => {
      const selected = current.groupRoomIds?.[groupKey] || [];
      if (selected.includes(roomId) && selected.length === 1) {
        toast.error("每个考试组合至少需要一个考场");
        return current;
      }
      return {
        ...current,
        groupRoomIds: {
          ...current.groupRoomIds,
          [groupKey]: selected.includes(roomId)
            ? selected.filter((item) => item !== roomId)
            : [...selected, roomId],
        },
      };
    });
  };

  const resetGroupRooms = (group: ExamGroupSummary) => {
    updateDraft((current) => ({
      ...current,
      groupRoomIds: {
        ...current.groupRoomIds,
        [group.key]: defaultRoomIdsForGroup(group, current.rooms),
      },
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
            : uniqueSubjects([...selection.subjects, subject]),
        }
        : selection),
    }));
  };

  const toggleStudentAbsent = (studentId: string) => {
    updateDraft((current) => ({
      ...current,
      studentSubjects: current.studentSubjects.map((selection) => selection.studentId === studentId
        ? { ...selection, absent: !selection.absent }
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

  const classAssignmentGroups = useMemo(() => {
    if (!context) return [];
    return context.classes.map((classItem) => ({
      classItem,
      students: groupStudentArrangements(assignments.filter((item) => item.classId === classItem.id)),
    })).filter((group) => group.students.length > 0);
  }, [assignments, context]);

  useEffect(() => {
    if (view !== "result") return;
    setPreviewMode("class");
    setSelectedClassIds(new Set(classAssignmentGroups.map(({ classItem }) => classItem.id)));
    setSelectedRoomIds(new Set(deskRoomGroups.map((group) => group.roomId)));
  }, [classAssignmentGroups, deskRoomGroups, selectedArrangementId, view]);

  const toggleClassSelection = (classId: string) => {
    setSelectedClassIds((current) => {
      const next = new Set(current);
      if (next.has(classId)) next.delete(classId);
      else next.add(classId);
      return next;
    });
  };

  const toggleRoomSelection = (roomId: string) => {
    setSelectedRoomIds((current) => {
      const next = new Set(current);
      if (next.has(roomId)) next.delete(roomId);
      else next.add(roomId);
      return next;
    });
  };

  const downloadSelectedClasses = async () => {
    if (!selectedArrangement) return;
    try {
      await downloadClassArrangements(
        selectedArrangement,
        classAssignmentGroups
          .filter(({ classItem }) => selectedClassIds.has(classItem.id))
          .map(({ classItem }) => ({ id: classItem.id, name: classItem.name })),
      );
    } catch (error) {
      toast.error("下载班级安排失败", error instanceof Error ? error.message : undefined);
    }
  };

  const downloadSelectedLabels = async () => {
    if (!selectedArrangement) return;
    try {
      await downloadDeskLabels(selectedArrangement, selectedRoomIds);
    } catch (error) {
      toast.error("下载桌贴失败", error instanceof Error ? error.message : undefined);
    }
  };

  const pageActions = draft ? (
    <Button variant="outline" onClick={handleNew}><RotateCcw className="h-4 w-4" />新建方案</Button>
  ) : undefined;

  return (
    <div>
      {embedded ? (
        pageActions && <div className="no-print mb-5 flex flex-wrap justify-end gap-2">{pageActions}</div>
      ) : (
        <div className="no-print">
          <PageHeader
            title="考场布置"
            description="新建或复用考试方案，配置科目、考场、弃考学生和座位规则，再按班级预览与下载"
            icon={<LayoutGrid className="h-5 w-5" />}
            action={pageActions}
          />
          <StudentSectionTabs />
        </div>
      )}

      {!schoolId ? (
        <Card className="no-print"><EmptyState icon={<Users className="h-8 w-8" />} title="个人身份暂不支持考场布置" description="请切换到已认证学校身份后使用。" /></Card>
      ) : loading ? (
        <div className="flex justify-center py-24"><Spinner size={32} /></div>
      ) : !draft || !context ? (
        <Card className="no-print"><EmptyState icon={<Users className="h-8 w-8" />} title="暂无可安排的年级" description="请先在班级管理中建立班级和学生档案。" /></Card>
      ) : (
        <>
          <div className="no-print mb-5 grid gap-3 rounded-xl border border-ink-100 bg-paper p-4 shadow-sm lg:grid-cols-2 lg:items-end">
            <Select label="所属年级" value={cohortKey} onChange={(event) => setCohortKey(event.target.value)} options={cohorts.map((item) => ({ value: item.key, label: `${item.label} · ${item.studentCount} 人` }))} />
            <Select
              label="选择考场安排"
              value={selectedArrangementId || "new"}
              onChange={(event) => handleSelectArrangement(event.target.value)}
              options={[
                { value: "new", label: "新建考场安排" },
                ...arrangements.map((item) => ({ value: item.id, label: `${item.name} · ${item.examDate || "日期待定"}` })),
              ]}
            />
          </div>

          {selectedArrangement && (
            <Card className="no-print mb-5 border-gold-200 bg-gold-50/50">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="font-medium text-ink-900">{selectedArrangement.name}</div>
                    <Badge>{selectedArrangement.examDate || "日期待定"}</Badge>
                    <Badge>{selectedArrangement.seatOrder === "previousRank" ? "按上次名次排" : "随机排"}</Badge>
                  </div>
                  <div className="mt-2 text-sm text-ink-600">学生考试科目：{selectedArrangement.subjects.join("、")}</div>
                  <div className="mt-1 text-xs text-ink-500">
                    单独排考：{selectedArrangement.separateSubjects?.join("、") || "无"}；弃考 {selectedArrangement.studentSubjects.filter((item) => item.absent).length} 人；{selectedArrangement.rooms.length} 个考场
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="gold" onClick={handleReuse}><Copy className="h-4 w-4" />复用此考场安排</Button>
                </div>
              </div>
            </Card>
          )}

          {view === "settings" ? (
            <div className="no-print space-y-5">
              <Card>
                <div className="grid gap-4 md:grid-cols-3">
                  <Input label="考试名称" value={draft.name} onChange={(event) => updateDraft((current) => ({ ...current, name: event.target.value }))} />
                  <Input label="考试时间" type="date" value={draft.examDate || ""} onChange={(event) => updateDraft((current) => ({ ...current, examDate: event.target.value }))} />
                  <Select
                    label="座位排列规则"
                    value={draft.seatOrder || "random"}
                    onChange={(event) => updateDraft((current) => ({ ...current, seatOrder: event.target.value as ExamSeatOrder }))}
                    options={[
                      { value: "random", label: "随机排" },
                      { value: "previousRank", label: "按上次名次排" },
                    ]}
                  />
                </div>
                {draft.seatOrder === "previousRank" && !context.previousGradeRanks && (
                  <div className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">该年级暂无历史成绩名次，将按班级和学号稳定排列。</div>
                )}
              </Card>

              <div className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(420px,0.85fr)]">
                <Card>
                  <div className="font-medium text-ink-900">考试科目</div>
                  <div className="mt-1 text-xs text-ink-500">选择全部学科，或按“语数外 + 选科”配置各选科组合。</div>
                  <div className="mt-4 grid gap-3 md:grid-cols-2" role="radiogroup" aria-label="考试科目配置方式">
                    <ChoiceCard checked={draft.subjectSetupMode === "all"} title="所有学科" description="所有学生默认参加勾选的学科。" onClick={() => setSubjectSetupMode("all")} />
                    <ChoiceCard checked={draft.subjectSetupMode === "selection"} title="语数外 + 选科" description="根据学生档案中的选科名称分配考试科目。" onClick={() => setSubjectSetupMode("selection")} />
                  </div>
                  <div className="mt-4">
                    <div className="mb-2 text-xs font-medium text-ink-500">勾选本次考试包含的学科</div>
                    <div className="flex flex-wrap gap-2">{DEFAULT_SUBJECTS.map((subject) => (
                      <CheckboxPill key={subject} checked={draft.subjects.includes(subject)} label={subject} onClick={() => toggleSubject(subject)} />
                    ))}</div>
                  </div>
                  {draft.subjectSetupMode === "selection" && (
                    <div className="mt-5 space-y-3 border-t border-ink-100 pt-4">
                      <div>
                        <div className="text-sm font-medium text-ink-800">各选科对应的考试科目确认</div>
                        <div className="mt-0.5 text-xs text-ink-500">修改后会同步到该选科下的学生，之后仍可逐个学生调整。</div>
                      </div>
                      {subjectSelectionNames(context).length === 0 ? (
                        <div className="rounded-lg bg-ink-50 px-3 py-2 text-xs text-ink-500">学生档案中暂无选科名称，暂按全部勾选科目处理。</div>
                      ) : subjectSelectionNames(context).map((selectionName) => (
                        <div key={selectionName} className="rounded-xl border border-ink-200 bg-ink-50/30 p-4">
                          <div className="mb-2 text-sm font-medium text-ink-800">{selectionName}</div>
                          <div className="flex flex-wrap gap-1.5">{draft.subjects.map((subject) => (
                            <CheckboxPill
                              key={subject}
                              checked={(draft.selectionSubjects?.[selectionName] || []).includes(subject)}
                              label={subject}
                              onClick={() => toggleSelectionSubject(selectionName, subject)}
                            />
                          ))}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>

                <Card className="p-0 overflow-hidden">
                  <div className="flex flex-col gap-3 border-b border-ink-100 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
                    <div><div className="font-medium text-ink-900">可用考场</div><div className="mt-0.5 text-xs text-ink-500">班级教室默认生成“1考场”“2考场”等，可继续增加教室外考场。</div></div>
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="w-28">
                        <Input aria-label="批量考场容量" type="number" min={1} max={1000} value={bulkCapacity} onChange={(event) => setBulkCapacity(Number(event.target.value))} />
                      </div>
                      <Button variant="outline" size="sm" onClick={applyBulkCapacity}>批量设置容量</Button>
                      <Button variant="outline" size="sm" onClick={addRoom}><Plus className="h-4 w-4" />增加考场</Button>
                    </div>
                  </div>
                  <div className="grid gap-3 p-4 md:grid-cols-2 2xl:grid-cols-3" role="list" aria-label="可用考场列表">
                    {draft.rooms.map((room) => (
                      <article key={room.id} data-testid="room-card" className="rounded-xl border border-ink-200 bg-ink-50/30 p-4 shadow-sm" role="listitem">
                        <div className="mb-4 flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium text-ink-900">{room.number || room.name}</div>
                            <div className="mt-0.5 truncate text-xs text-ink-500">{room.location || "位置待填写"}</div>
                          </div>
                          <Button variant="ghost" size="icon" aria-label={`删除${room.number || room.name}`} disabled={draft.rooms.length === 1} onClick={() => removeRoom(room.id)}><Trash2 className="h-4 w-4 text-red-500" /></Button>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <Input label="考场号" aria-label="考场号" value={room.number || room.name} onChange={(event) => updateDraft((current) => ({ ...current, rooms: current.rooms.map((item) => item.id === room.id ? { ...item, name: event.target.value, number: event.target.value } : item) }))} />
                          <Input label="可安排人数" aria-label="考场可安排人数" type="number" min={1} max={1000} value={room.capacity} onChange={(event) => updateDraft((current) => ({ ...current, rooms: current.rooms.map((item) => item.id === room.id ? { ...item, capacity: Number(event.target.value) } : item) }))} />
                          <div className="sm:col-span-2">
                            <Input label="考场位置" aria-label="考场位置" value={room.location || ""} onChange={(event) => updateDraft((current) => ({ ...current, rooms: current.rooms.map((item) => item.id === room.id ? { ...item, location: event.target.value } : item) }))} />
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                </Card>
              </div>

              <Card>
                <div className="font-medium text-ink-900">排考场规则</div>
                <div className="mt-1 text-xs text-ink-500">勾选的科目每个学科单独排考场；未勾选的科目合并安排，同一学生只占一个座位。</div>
                <div className="mt-4 flex flex-wrap gap-2">{draft.subjects.map((subject) => (
                  <CheckboxPill key={subject} checked={(draft.separateSubjects || []).includes(subject)} label={`${subject}单独排`} onClick={() => toggleSeparateSubject(subject)} />
                ))}</div>
                <div className="mt-3 rounded-lg bg-ink-50 px-3 py-2 text-xs text-ink-500">
                  合并安排：{draft.subjects.filter((subject) => !(draft.separateSubjects || []).includes(subject)).join("、") || "无"}
                </div>
                <div className="mt-5 border-t border-ink-100 pt-5">
                  <div className="text-sm font-medium text-ink-800">实际考试组合人数与对应考场</div>
                  <div className="mt-1 text-xs text-ink-500">人数根据当前科目、选科和弃考设置实时计算；考场由系统自动生成，可逐项微调。</div>
                  <div className="mt-4 grid gap-3 xl:grid-cols-2">
                  {examGroups.map((group) => (
                    <article key={group.key} data-testid="exam-group-card" className="rounded-xl border border-ink-200 bg-ink-50/30 p-4 shadow-sm">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-medium text-ink-900">{group.subjectLabel.split(" / ").join("、")}</div>
                          <div className="mt-0.5 text-xs text-ink-500">{group.sessionKey === "combined" ? "合并场次" : "单独场次"} · {group.classIds.length} 个班级</div>
                        </div>
                        <Badge>{group.studentCount} 人</Badge>
                      </div>
                      <div className="mt-4 flex items-center justify-between gap-3 border-t border-ink-100 pt-3">
                        <div className="text-xs font-medium text-ink-500">可用考场</div>
                        <Button variant="ghost" size="sm" onClick={() => resetGroupRooms(group)}><RotateCcw className="h-3.5 w-3.5" />恢复自动分配</Button>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {draft.rooms.map((room) => (
                          <CheckboxPill
                            key={room.id}
                            checked={(draft.groupRoomIds?.[group.key] || []).includes(room.id)}
                            label={`${room.number || room.name} · ${room.location || "位置待填写"}`}
                            onClick={() => toggleGroupRoom(group.key, room.id)}
                          />
                        ))}
                      </div>
                    </article>
                  ))}
                  </div>
                </div>
              </Card>

              <Card className="p-0 overflow-hidden">
                <div className="border-b border-ink-100 px-5 py-4"><div className="font-medium text-ink-900">学生考试科目</div><div className="mt-0.5 text-xs text-ink-500">按班级列出学生，可再次修改科目，并对个别学生标记弃考。</div></div>
                <div className="grid gap-3 border-b border-ink-100 p-4 md:grid-cols-2">
                  <Input value={studentKeyword} onChange={(event) => setStudentKeyword(event.target.value)} placeholder="搜索姓名或学号" aria-label="搜索学生" />
                  <Select value={studentClassFilter} onChange={(event) => setStudentClassFilter(event.target.value)} placeholder="全部班级" options={context.classes.map((item) => ({ value: item.id, label: item.name }))} />
                </div>
                <div className="grid max-h-[640px] gap-3 overflow-auto p-4 lg:grid-cols-2" role="list" aria-label="学生考试科目列表">
                  {filteredStudents.map((student) => {
                    const selection = draft.studentSubjects.find((item) => item.studentId === student.id);
                    const className = context.classes.find((item) => item.id === student.classId)?.name || "未分班";
                    return (
                      <article key={student.id} data-testid="student-subject-card" role="listitem" className={cn("rounded-xl border border-ink-200 bg-ink-50/30 p-4 shadow-sm", selection?.absent && "border-red-200 bg-red-50/60")}>
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div><div className="text-sm font-medium text-ink-900">{student.name} <span className="font-normal text-ink-400">{student.studentNo}</span></div><div className="mt-0.5 text-xs text-ink-400">{className}{student.subjectSelection ? ` · ${student.subjectSelection}` : ""}</div></div>
                          <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-red-700">
                          <input aria-label={`${student.name}弃考`} type="checkbox" checked={Boolean(selection?.absent)} onChange={() => toggleStudentAbsent(student.id)} />
                          弃考
                          </label>
                        </div>
                        <div className="mt-4 flex flex-wrap gap-2">{draft.subjects.map((subject) => <CheckboxPill key={subject} checked={selection?.subjects.includes(subject) || false} label={subject} disabled={selection?.absent} onClick={() => toggleStudentSubject(student.id, subject)} />)}</div>
                      </article>
                    );
                  })}
                </div>
              </Card>

              <div className="flex justify-end">
                <Button variant="gold" onClick={handleSave} loading={saving}><Save className="h-4 w-4" />预览</Button>
              </div>
            </div>
          ) : assignments.length === 0 ? (
            <Card className="no-print"><EmptyState icon={<LayoutGrid className="h-8 w-8" />} title="尚未生成安排" description="完成配置后点击页面底部的“预览”。" /></Card>
          ) : (
            <div className="no-print space-y-5">
              <div className="grid gap-4 sm:grid-cols-3">
                <Card><div className="text-xs text-ink-400">考试座位记录</div><div className="mt-1 text-2xl font-semibold text-ink-900">{assignments.length}</div></Card>
                <Card><div className="text-xs text-ink-400">实际桌贴</div><div className="mt-1 text-2xl font-semibold text-ink-900">{deskLabels.length}</div></Card>
                <Card><div className="text-xs text-ink-400">弃考学生</div><div className="mt-1 text-2xl font-semibold text-ink-900">{draft.studentSubjects.filter((item) => item.absent).length}</div></Card>
              </div>

              <Card className="p-0 overflow-hidden">
                <div className="flex flex-col gap-3 border-b border-ink-100 px-5 py-4 xl:flex-row xl:items-center xl:justify-between">
                  <div className="flex flex-wrap gap-2" role="tablist" aria-label="考场安排预览方式">
                    <Button
                      role="tab"
                      aria-selected={previewMode === "class"}
                      variant={previewMode === "class" ? "ink" : "ghost"}
                      onClick={() => setPreviewMode("class")}
                    >
                      班级考场安排预览
                    </Button>
                    <Button
                      role="tab"
                      aria-selected={previewMode === "desk"}
                      variant={previewMode === "desk" ? "ink" : "ghost"}
                      onClick={() => setPreviewMode("desk")}
                    >
                      桌贴预览
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" onClick={() => setView("settings")}><RotateCcw className="h-4 w-4" />重新排考场</Button>
                    {previewMode === "class" ? (
                      <Button variant="gold" disabled={selectedClassIds.size === 0} onClick={() => void downloadSelectedClasses()}>
                        <Download className="h-4 w-4" />下载已选班级
                      </Button>
                    ) : (
                      <>
                        <Button variant="outline" disabled={selectedDeskLabels.length === 0} onClick={() => window.print()}>
                          <Printer className="h-4 w-4" />打印已选桌贴
                        </Button>
                        <Button variant="gold" disabled={selectedDeskLabels.length === 0} onClick={() => void downloadSelectedLabels()}>
                          <Download className="h-4 w-4" />下载已选桌贴
                        </Button>
                      </>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 bg-ink-50 px-5 py-3 text-sm text-ink-600">
                  {previewMode === "class" ? (
                    <label className="inline-flex cursor-pointer items-center gap-2">
                      <input
                        type="checkbox"
                        aria-label="选择全部班级"
                        checked={classAssignmentGroups.length > 0 && selectedClassIds.size === classAssignmentGroups.length}
                        onChange={(event) => setSelectedClassIds(event.target.checked
                          ? new Set(classAssignmentGroups.map(({ classItem }) => classItem.id))
                          : new Set())}
                      />
                      全选班级
                    </label>
                  ) : (
                    <label className="inline-flex cursor-pointer items-center gap-2">
                      <input
                        type="checkbox"
                        aria-label="选择全部考场"
                        checked={deskRoomGroups.length > 0 && selectedRoomIds.size === deskRoomGroups.length}
                        onChange={(event) => setSelectedRoomIds(event.target.checked
                          ? new Set(deskRoomGroups.map((group) => group.roomId))
                          : new Set())}
                      />
                      全选考场
                    </label>
                  )}
                  <span>
                    {previewMode === "class"
                      ? `已选择 ${selectedClassIds.size} / ${classAssignmentGroups.length} 个班级`
                      : `已选择 ${selectedRoomIds.size} / ${deskRoomGroups.length} 个考场，共 ${selectedDeskLabels.length} 张桌贴`}
                  </span>
                </div>
              </Card>

              {previewMode === "class" ? classAssignmentGroups.map(({ classItem, students }) => (
                <Card key={classItem.id} className="p-0 overflow-hidden">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-100 px-5 py-4">
                    <label className="inline-flex cursor-pointer items-start gap-3">
                      <input
                        className="mt-1"
                        type="checkbox"
                        aria-label={`选择${classItem.name}`}
                        checked={selectedClassIds.has(classItem.id)}
                        onChange={() => toggleClassSelection(classItem.id)}
                      />
                      <span>
                        <span className="block font-medium text-ink-900">{classItem.name}</span>
                        <span className="mt-0.5 block text-xs text-ink-500">每名学生只显示一条记录，所有考试科目、考场号和位置集中列出。</span>
                      </span>
                    </label>
                    <Badge>{students.length} 名学生</Badge>
                  </div>
                  <div className="grid gap-4 p-4 lg:grid-cols-2" role="list" aria-label={`${classItem.name}学生考场安排`}>
                    {students.map((student) => (
                      <article key={student.key} data-testid="student-arrangement-card" role="listitem" className="rounded-xl border border-ink-200 bg-ink-50/30 p-4 shadow-sm">
                        <div className="flex items-start justify-between gap-3">
                          <div className="font-medium text-ink-900">{student.studentName}</div>
                          <div className="font-mono text-xs text-ink-500">{student.studentNo}</div>
                        </div>
                        <div className="mt-3 space-y-2">{student.assignments.map((item) => (
                          <div key={item.id} className="rounded-lg border border-ink-100 bg-paper p-3">
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <div className="font-medium text-ink-900">{item.subjectLabel.split(" / ").join("、")}</div>
                              <Badge>{item.seatNo} 号</Badge>
                            </div>
                            <div className="mt-2 text-sm text-ink-700">{item.roomNumber || item.roomName} · {item.roomLocation || item.roomName}</div>
                            <div className="mt-1 font-mono text-xs text-ink-400">准考证号：{item.admissionNo}</div>
                          </div>
                        ))}</div>
                      </article>
                    ))}
                  </div>
                </Card>
              )) : deskRoomGroups.map((roomGroup) => (
                <Card key={roomGroup.roomId} className="p-0 overflow-hidden">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-100 px-5 py-4">
                    <label className="inline-flex cursor-pointer items-start gap-3">
                      <input
                        className="mt-1"
                        type="checkbox"
                        aria-label={`选择${roomGroup.roomNumber}`}
                        checked={selectedRoomIds.has(roomGroup.roomId)}
                        onChange={() => toggleRoomSelection(roomGroup.roomId)}
                      />
                      <span>
                        <span className="block font-medium text-ink-900">{roomGroup.roomNumber}</span>
                        <span className="mt-0.5 block text-xs text-ink-500">{roomGroup.roomLocation}</span>
                      </span>
                    </label>
                    <Badge>{roomGroup.labels.length} 张桌贴</Badge>
                  </div>
                  <div className="grid gap-4 p-4 md:grid-cols-2 2xl:grid-cols-3">
                    {roomGroup.labels.map((label) => (
                      <article key={label.key} data-testid="desk-label-card" className="rounded-2xl border-2 border-ink-300 bg-paper p-5 shadow-sm">
                        <div className="text-center font-serif text-base font-semibold text-ink-900">{selectedArrangement?.name}</div>
                        <div className="mt-2 flex items-center justify-between gap-3 text-xs text-ink-500">
                          <span>{selectedArrangement?.examDate || "考试日期待定"}</span>
                          <span>{label.roomLocation}</span>
                        </div>
                        <div className="mt-3 flex items-end justify-between border-y border-ink-200 py-2 text-ink-900">
                          <span className="font-medium">{label.roomNumber}</span>
                          <strong className="text-xl">{label.seatNo} 号</strong>
                        </div>
                        <div className="divide-y divide-ink-100">{label.assignments.map((assignment) => (
                          <div key={assignment.id} className="py-3">
                            <div className="flex items-start justify-between gap-3">
                              <div className="font-medium text-ink-900">{assignment.studentName}</div>
                              <div className="text-xs font-medium text-ink-600">{assignment.subjectLabel.split(" / ").join("、")}</div>
                            </div>
                            <div className="mt-1 grid gap-1 text-xs text-ink-500 sm:grid-cols-2">
                              <span>班级：{assignment.className}</span>
                              <span>学号：{assignment.studentNo}</span>
                            </div>
                            <div className="mt-1 font-mono text-xs text-ink-400">准考证号：{assignment.admissionNo}</div>
                          </div>
                        ))}</div>
                      </article>
                    ))}
                  </div>
                </Card>
              ))}

              {selectedArrangement && <Button variant="ghost" onClick={handleDelete}><Trash2 className="h-4 w-4 text-red-500" />删除当前方案</Button>}
            </div>
          )}

          {selectedDeskLabels.length > 0 && selectedArrangement && (
            <div className="print-only exam-desk-label-sheet">
              {selectedDeskLabels.map((group) => (
                <section key={group.key} className="exam-desk-label">
                  <div className="exam-desk-label-title">{selectedArrangement.name}</div>
                  <div className="exam-desk-label-meta"><span>{selectedArrangement.examDate || "考试日期待定"}</span><span>{group.roomLocation}</span></div>
                  <div className="exam-desk-label-seat"><span>{group.roomNumber}</span><strong>{group.seatNo} 号</strong></div>
                  {group.assignments.map((assignment) => (
                    <div key={assignment.id} className="mt-2 border-t border-black/20 pt-2 first:mt-0 first:border-0 first:pt-0">
                      <div className="exam-desk-label-name">{assignment.studentName}</div>
                      <div className="text-center text-sm font-medium">{assignment.subjectLabel}</div>
                      <div className="exam-desk-label-row"><span>班级：{assignment.className}</span><span>学号：{assignment.studentNo}</span></div>
                      <div className="exam-desk-label-admission">准考证号 {assignment.admissionNo}</div>
                    </div>
                  ))}
                </section>
              ))}
            </div>
          )}
        </>
      )}

      <Modal
        open={newPlanOpen}
        onClose={() => setNewPlanOpen(false)}
        title="新建考场安排"
        description="输入考试名称后进入配置。"
        size="sm"
        footer={(
          <>
            <Button variant="ghost" onClick={() => setNewPlanOpen(false)}>取消</Button>
            <Button variant="gold" type="submit" form="new-exam-plan-form" disabled={!newPlanName.trim()}>创建方案</Button>
          </>
        )}
      >
        <form id="new-exam-plan-form" onSubmit={(event) => { event.preventDefault(); createNewPlan(); }}>
          <Input autoFocus label="考试名称" value={newPlanName} onChange={(event) => setNewPlanName(event.target.value)} placeholder="例如：高三第一次模拟考试" />
        </form>
      </Modal>
    </div>
  );
}
