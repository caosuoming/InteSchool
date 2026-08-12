import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  ExamStudentSeatPreference,
  ExamStudentSubjectSelection,
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
  downloadExamPreviewPdf,
  groupDeskLabels,
  groupDeskLabelsByRoom,
  groupStudentArrangements,
} from "@/lib/exam-arrangement-export";
import { summarizeExamGroups, type ExamGroupSummary } from "@/lib/exam-arrangement";

const DEFAULT_SUBJECTS = ["语文", "数学", "英语", "物理", "化学", "生物", "政治", "历史", "地理"];
const CORE_SUBJECTS = ["语文", "数学", "英语"];
const ACADEMIC_TEST_SUBJECTS = ["物理", "化学", "生物", "政治", "历史", "地理"];

type ViewMode = "settings" | "result";
type PreviewMode = "class" | "desk";

function getDeskLabelPrintLayout(labelCount: number, maxAssignments: number): {
  columns: number;
  rows: number;
  density: "normal" | "compact";
  rowHeight: number;
  pageCapacity: number;
} {
  const count = Math.max(1, labelCount);
  const columns = 5;
  const assignmentCount = Math.max(1, maxAssignments);
  const density = assignmentCount <= 2 ? "normal" : "compact";
  const contentHeight = density === "normal"
    ? 23 + assignmentCount * 9.5
    : 20 + assignmentCount * 8.2;
  const gap = density === "normal" ? 1.4 : 1;
  const availableHeight = 356;
  const maxRows = Math.max(1, Math.floor((availableHeight + gap) / (contentHeight + gap)));
  const pageCapacity = columns * maxRows;
  const rows = Math.min(maxRows, Math.ceil(count / columns));
  const pageFitHeight = (availableHeight - Math.max(0, rows - 1) * gap) / rows;

  return {
    columns,
    rows,
    rowHeight: Math.min(contentHeight, pageFitHeight),
    density,
    pageCapacity,
  };
}

function getClassPrintLayout(studentCount: number, maxAssignments: number): {
  columns: 3;
  rows: number;
  density: "normal" | "compact";
  rowHeight: number;
  pageCapacity: number;
} {
  const count = Math.max(1, studentCount);
  const columns = 3;
  const assignmentCount = Math.max(1, maxAssignments);
  const requiredRowsForTwoPages = Math.max(1, Math.ceil(count / (columns * 2)));
  const density = assignmentCount <= 4 && requiredRowsForTwoPages <= 10 ? "normal" : "compact";
  const contentHeight = density === "normal"
    ? 8 + assignmentCount * 3.25
    : 7.2 + assignmentCount * 2.8;
  const gap = density === "normal" ? 1.8 : 1.4;
  const availableHeight = 277;
  const readableRows = Math.max(1, Math.min(10, Math.floor((availableHeight + gap) / (contentHeight + gap))));
  const maxRows = Math.max(readableRows, requiredRowsForTwoPages);
  const pageCapacity = columns * maxRows;
  const rows = Math.min(maxRows, Math.ceil(count / columns));
  const pageFitHeight = (availableHeight - Math.max(0, rows - 1) * gap) / rows;
  return {
    columns,
    rows,
    density,
    rowHeight: Math.max(8, Math.min(contentHeight + (density === "normal" ? 4 : 3), pageFitHeight)),
    pageCapacity,
  };
}

function chunkForPrint<T>(items: T[], pageCapacity: number): T[][] {
  const capacity = Math.max(1, pageCapacity);
  const pages: T[][] = [];
  for (let index = 0; index < items.length; index += capacity) {
    pages.push(items.slice(index, index + capacity));
  }
  return pages;
}

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

function classSubjectSelectionLabel(classId: string, context: ExamArrangementContext): string {
  const counts = new Map<string, number>();
  for (const student of context.students) {
    if (student.classId !== classId) continue;
    const selection = student.subjectSelection?.trim();
    if (!selection) continue;
    counts.set(selection, (counts.get(selection) || 0) + 1);
  }
  const ordered = [...counts.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], "zh-CN"));
  if (ordered.length === 0) return "";
  if (ordered.length === 1) return ordered[0][0];
  return ordered.length === 2 ? ordered.map(([name]) => name).join("/") : `${ordered[0][0]}等${ordered.length}种`;
}

function roomChoiceLabel(room: ExamRoomConfig, context: ExamArrangementContext): string {
  const selection = room.classroomClassId ? classSubjectSelectionLabel(room.classroomClassId, context) : "";
  const roomName = `${room.number || room.name}${selection ? `（${selection}）` : ""}`;
  return `${roomName} · ${room.location || "位置待填写"}`;
}

function roomCapacityTotal(rooms: ExamRoomConfig[], roomIds?: Iterable<string>): number {
  const selected = roomIds ? new Set(roomIds) : null;
  return rooms.reduce((total, room) => (
    !selected || selected.has(room.id)
      ? total + (Number.isFinite(room.capacity) && room.capacity > 0 ? room.capacity : 0)
      : total
  ), 0);
}

function inferSelectedAcademicSubjects(name: string): string[] {
  const aliases: Array<[string, string]> = [
    ["物", "物理"],
    ["化", "化学"],
    ["生", "生物"],
    ["政", "政治"],
    ["史", "历史"],
    ["地", "地理"],
  ];
  return aliases
    .filter(([alias, subject]) => name.includes(alias) || name.includes(subject))
    .map(([, subject]) => subject);
}

function inferSelectionSubjects(name: string): string[] {
  return uniqueSubjects([...CORE_SUBJECTS, ...inferSelectedAcademicSubjects(name)]);
}

function inferAcademicNonSelectionSubjects(name: string): string[] {
  const selected = new Set(inferSelectedAcademicSubjects(name));
  return ACADEMIC_TEST_SUBJECTS.filter((subject) => !selected.has(subject));
}

function subjectsForSetupMode(mode: ExamSubjectSetupMode, selectionName: string | undefined, enabledSubjects: string[]): string[] {
  if (!selectionName || mode === "all") return [...enabledSubjects];
  const inferred = mode === "academicNonSelection"
    ? inferAcademicNonSelectionSubjects(selectionName)
    : inferSelectionSubjects(selectionName);
  return inferred.filter((subject) => enabledSubjects.includes(subject));
}

function sameSubjects(left: string[], right: string[]): boolean {
  return uniqueSubjects(left).join("\0") === uniqueSubjects(right).join("\0");
}

function mostCommonClassSubjects(
  classId: string,
  context: ExamArrangementContext,
  selections: ExamStudentSubjectSelection[],
  fallback: string[],
): string[] {
  const counts = new Map<string, { subjects: string[]; count: number }>();
  const selectionMap = new Map(selections.map((item) => [item.studentId, item.subjects]));
  for (const student of context.students.filter((item) => item.classId === classId)) {
    const selected = uniqueSubjects(selectionMap.get(student.id) || fallback);
    const key = selected.join("\0");
    const current = counts.get(key);
    if (current) current.count += 1;
    else counts.set(key, { subjects: selected, count: 1 });
  }
  return [...counts.values()].sort((left, right) => right.count - left.count)[0]?.subjects || [...fallback];
}

function createRules(
  context: ExamArrangementContext,
  subjects: string[],
  rooms: ExamRoomConfig[],
  selections: ExamStudentSubjectSelection[] = [],
): ExamClassRoomRule[] {
  return context.classes.map((classItem) => ({
    classId: classItem.id,
    defaultSubjects: mostCommonClassSubjects(classItem.id, context, selections, subjects),
    subjectRoomIds: Object.fromEntries(subjects.map((subject) => [subject, []])),
  }));
}

function normalizeClassRules(
  current: ExamClassRoomRule[],
  context: ExamArrangementContext,
  subjects: string[],
  rooms: ExamRoomConfig[],
): ExamClassRoomRule[] {
  const currentRules = new Map((current || []).map((rule) => [rule.classId, rule]));
  const validRoomIds = new Set(rooms.map((room) => room.id));
  return context.classes.map((classItem) => {
    const existing = currentRules.get(classItem.id);
    const defaultSubjects = uniqueSubjects(existing?.defaultSubjects || subjects).filter((subject) => subjects.includes(subject));
    const fixedSubjectRoomIds = Object.fromEntries(Object.entries(existing?.fixedSubjectRoomIds || {})
      .filter(([subject, roomId]) => subjects.includes(subject) && validRoomIds.has(roomId)));
    return {
      classId: classItem.id,
      defaultSubjects,
      subjectRoomIds: Object.fromEntries(subjects.map((subject) => {
        const configured = (existing?.subjectRoomIds?.[subject] || []).filter((roomId) => validRoomIds.has(roomId));
        const isAutomatic = !existing || configured.length === 0;
        return [subject, isAutomatic ? [] : configured];
      })),
      fixedSubjectRoomIds,
    };
  });
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
  const separateSubjects = new Set(draft.separateSubjects || []);
  const combinedSubjects = draft.subjects.filter((subject) => !separateSubjects.has(subject));
  const legacyCombinedRoomIds = draft.groupRoomIds?.[`combined:${combinedSubjects.join("|")}`] || [];
  return Object.fromEntries(summarizeExamGroups(draft, context).map((group) => {
    const sourceRoomIds = draft.groupRoomIds?.[group.key]
      || (group.sessionKey === "combined" ? legacyCombinedRoomIds : []);
    const configured = [...new Set(sourceRoomIds.filter((roomId) => validRoomIds.has(roomId)))];
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
    classRules: createRules(context, DEFAULT_SUBJECTS, rooms, studentSubjects),
    studentSubjects,
  };
  return { ...draft, groupRoomIds: normalizeGroupRoomIds(draft, context) };
}

function normalizeDraft(current: ExamArrangementInput, context: ExamArrangementContext): ExamArrangementInput {
  const subjects = uniqueSubjects(current.subjects);
  const subjectSetupMode = current.subjectSetupMode || "all";
  const rooms = current.rooms.map((room) => ({
    ...room,
    name: room.number || room.name,
    number: room.number || room.name,
    location: room.location || room.name,
    classroomClassId: room.classroomClassId
      || context.classes.find((classItem) => room.id === `room-${classItem.id}`)?.id,
  }));
  const selectionSubjects = Object.fromEntries(subjectSelectionNames(context).map((name) => {
    const existing = current.selectionSubjects?.[name];
    return [
      name,
      existing
        ? uniqueSubjects(existing).filter((subject) => subjects.includes(subject))
        : subjectsForSetupMode(subjectSetupMode, name, subjects),
    ];
  }));
  const normalized: ExamArrangementInput = {
    ...current,
    mode: current.mode || "combination",
    subjectSetupMode,
    subjects,
    selectionSubjects,
    separateSubjects: uniqueSubjects(current.separateSubjects || []).filter((subject) => subjects.includes(subject)),
    seatOrder: current.seatOrder || "random",
    rooms,
    classRules: normalizeClassRules(current.classRules, context, subjects, rooms),
    studentSubjects: context.students.map((student) => {
      const existing = current.studentSubjects.find((item) => item.studentId === student.id);
      const defaults = subjectSetupMode !== "all" && student.subjectSelection
        ? selectionSubjects[student.subjectSelection] || subjectsForSetupMode(subjectSetupMode, student.subjectSelection, subjects)
        : subjects;
      const selected = uniqueSubjects(existing?.subjects || defaults).filter((subject) => subjects.includes(subject));
      return {
        studentId: student.id,
        subjects: selected.length > 0 || existing?.absent ? selected : [...defaults],
        absent: Boolean(existing?.absent),
        seatPreference: existing?.seatPreference,
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
      aria-pressed={checked}
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

function ClassSwitchTabs({
  classes,
  activeClassId,
  onChange,
  ariaLabel,
}: {
  classes: ExamArrangementContext["classes"];
  activeClassId: string;
  onChange: (classId: string) => void;
  ariaLabel: string;
}) {
  return (
    <div className="flex flex-wrap gap-2" role="tablist" aria-label={ariaLabel}>
      {classes.map((classItem) => {
        const active = classItem.id === activeClassId;
        return (
          <button
            key={classItem.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(classItem.id)}
            className={cn(
              "rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
              active
                ? "border-gold-300 bg-gold-50 text-gold-800"
                : "border-ink-200 bg-paper text-ink-500 hover:border-ink-300 hover:text-ink-700",
            )}
          >
            {classItem.name}
          </button>
        );
      })}
    </div>
  );
}

function PreviewSwitchTabs({
  items,
  activeId,
  onChange,
  ariaLabel,
}: {
  items: Array<{ id: string; label: string; detail?: string }>;
  activeId: string;
  onChange: (id: string) => void;
  ariaLabel: string;
}) {
  return (
    <div className="flex flex-wrap gap-2" role="tablist" aria-label={ariaLabel}>
      {items.map((item) => {
        const active = item.id === activeId;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-label={item.label}
            aria-selected={active}
            onClick={() => onChange(item.id)}
            className={cn(
              "rounded-md border px-3 py-1.5 text-left transition-colors",
              active
                ? "border-gold-300 bg-gold-50 text-gold-800"
                : "border-ink-200 bg-paper text-ink-500 hover:border-ink-300 hover:text-ink-700",
            )}
          >
            <span className="block text-sm font-medium">{item.label}</span>
            {item.detail && (
              <span className={cn("mt-0.5 block text-[11px]", active ? "text-gold-700" : "text-ink-400")}>{item.detail}</span>
            )}
          </button>
        );
      })}
    </div>
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
  const [previewClassId, setPreviewClassId] = useState("");
  const [previewRoomId, setPreviewRoomId] = useState("");
  const [showDeskStudentNo, setShowDeskStudentNo] = useState(true);
  const [showDeskAdmissionNo, setShowDeskAdmissionNo] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [studentKeyword, setStudentKeyword] = useState("");
  const [fixedRoomClassId, setFixedRoomClassId] = useState("");
  const [studentSettingsClassId, setStudentSettingsClassId] = useState("");
  const [bulkCapacity, setBulkCapacity] = useState(30);
  const [newPlanOpen, setNewPlanOpen] = useState(false);
  const [newPlanName, setNewPlanName] = useState("");
  const classPrintRef = useRef<HTMLDivElement>(null);
  const deskPrintRef = useRef<HTMLDivElement>(null);

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
  const selectedDeskRoomGroups = useMemo(
    () => deskRoomGroups.filter((group) => selectedRoomIds.has(group.roomId)),
    [deskRoomGroups, selectedRoomIds],
  );
  const examGroups = useMemo(() => (
    draft && context ? summarizeExamGroups(draft, context) : []
  ), [context, draft]);
  const totalRoomCapacity = useMemo(() => draft ? roomCapacityTotal(draft.rooms) : 0, [draft]);
  const activeFixedRoomClassId = context?.classes.some((classItem) => classItem.id === fixedRoomClassId)
    ? fixedRoomClassId
    : context?.classes[0]?.id || "";
  const activeFixedRoomClass = context?.classes.find((classItem) => classItem.id === activeFixedRoomClassId) || null;
  const activeFixedRoomClassRule = draft?.classRules.find((rule) => rule.classId === activeFixedRoomClassId) || null;
  const activeStudentSettingsClassId = context?.classes.some((classItem) => classItem.id === studentSettingsClassId)
    ? studentSettingsClassId
    : context?.classes[0]?.id || "";
  const activeStudentSettingsClass = context?.classes.find((classItem) => classItem.id === activeStudentSettingsClassId) || null;
  const activeStudentSettingsClassRule = draft?.classRules.find((rule) => rule.classId === activeStudentSettingsClassId) || null;
  const activeClassMajoritySubjects = useMemo(() => (
    context && draft && activeStudentSettingsClass
      ? mostCommonClassSubjects(
        activeStudentSettingsClass.id,
        context,
        draft.studentSubjects,
        activeStudentSettingsClassRule?.defaultSubjects || draft.subjects,
      )
      : []
  ), [activeStudentSettingsClass, activeStudentSettingsClassRule, context, draft]);

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
    updateDraft((current) => {
      const selectionSubjects = mode === "all"
        ? current.selectionSubjects
        : Object.fromEntries(subjectSelectionNames(context).map((selectionName) => [
          selectionName,
          subjectsForSetupMode(mode, selectionName, current.subjects),
        ]));
      const studentSubjects = context.students.map((student) => {
        const existing = current.studentSubjects.find((item) => item.studentId === student.id);
        const subjects = mode === "all"
          ? current.subjects
          : student.subjectSelection
            ? selectionSubjects?.[student.subjectSelection] || current.subjects
            : current.subjects;
        return { studentId: student.id, subjects: [...subjects], absent: Boolean(existing?.absent) };
      });
      return {
        ...current,
        subjectSetupMode: mode,
        selectionSubjects,
        classRules: current.classRules.map((rule) => ({
          ...rule,
          defaultSubjects: mostCommonClassSubjects(rule.classId, context, studentSubjects, current.subjects),
        })),
        studentSubjects,
      };
    });
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

  const toggleClassSubject = (classId: string, subject: string) => {
    if (!context) return;
    const classStudentIds = new Set(context.students.filter((student) => student.classId === classId).map((student) => student.id));
    updateDraft((current) => {
      const rule = current.classRules.find((item) => item.classId === classId);
      const enabled = rule?.defaultSubjects.includes(subject) ?? current.subjects.includes(subject);
      const nextSubjects = enabled
        ? (rule?.defaultSubjects || current.subjects).filter((item) => item !== subject)
        : uniqueSubjects([...(rule?.defaultSubjects || []), subject]);
      return {
        ...current,
        classRules: current.classRules.map((item) => item.classId === classId ? { ...item, defaultSubjects: nextSubjects } : item),
        studentSubjects: current.studentSubjects.map((selection) => classStudentIds.has(selection.studentId)
          ? { ...selection, subjects: [...nextSubjects] }
          : selection),
      };
    });
  };

  const setClassSubjectRoom = (classId: string, subject: string, roomId: string) => {
    if (!context) return;
    updateDraft((current) => {
      const affectedGroupKeys = roomId
        ? summarizeExamGroups(current, context)
          .filter((group) => group.classIds.includes(classId) && group.subjectLabel.split(" / ").includes(subject))
          .map((group) => group.key)
        : [];
      return {
        ...current,
        classRules: current.classRules.map((rule) => rule.classId === classId ? {
          ...rule,
          fixedSubjectRoomIds: {
            ...Object.fromEntries(Object.entries(rule.fixedSubjectRoomIds || {}).filter(([key]) => key !== subject)),
            ...(roomId ? { [subject]: roomId } : {}),
          },
        } : rule),
        groupRoomIds: roomId
          ? Object.fromEntries(Object.entries(current.groupRoomIds || {}).map(([groupKey, roomIds]) => [
            groupKey,
            affectedGroupKeys.includes(groupKey) ? [...new Set([...roomIds, roomId])] : roomIds,
          ]))
          : current.groupRoomIds,
      };
    });
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

  const setStudentSeatPreference = (studentId: string, seatPreference: ExamStudentSeatPreference | undefined) => {
    updateDraft((current) => ({
      ...current,
      studentSubjects: current.studentSubjects.map((selection) => selection.studentId === studentId
        ? { ...selection, seatPreference }
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
      if (student.classId !== activeStudentSettingsClassId) return false;
      return !keyword || student.name.toLowerCase().includes(keyword) || student.studentNo.toLowerCase().includes(keyword);
    });
  }, [activeStudentSettingsClassId, context, studentKeyword]);

  const classAssignmentGroups = useMemo(() => {
    if (!context) return [];
    return context.classes.map((classItem) => ({
      classItem,
      students: groupStudentArrangements(assignments.filter((item) => item.classId === classItem.id)),
    })).filter((group) => group.students.length > 0);
  }, [assignments, context]);
  const selectedClassAssignmentGroups = useMemo(
    () => classAssignmentGroups.filter(({ classItem }) => selectedClassIds.has(classItem.id)),
    [classAssignmentGroups, selectedClassIds],
  );
  const activeClassAssignmentGroup = classAssignmentGroups.find(({ classItem }) => classItem.id === previewClassId)
    || classAssignmentGroups[0]
    || null;
  const activeDeskRoomGroup = deskRoomGroups.find((group) => group.roomId === previewRoomId)
    || deskRoomGroups[0]
    || null;

  useEffect(() => {
    if (view !== "result") return;
    setPreviewMode("class");
    setSelectedClassIds(new Set(classAssignmentGroups.map(({ classItem }) => classItem.id)));
    setSelectedRoomIds(new Set(deskRoomGroups.map((group) => group.roomId)));
    setPreviewClassId(classAssignmentGroups[0]?.classItem.id || "");
    setPreviewRoomId(deskRoomGroups[0]?.roomId || "");
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
      await downloadDeskLabels(selectedArrangement, selectedRoomIds, {
        showStudentNo: showDeskStudentNo,
        showAdmissionNo: showDeskAdmissionNo,
      });
    } catch (error) {
      toast.error("下载桌贴失败", error instanceof Error ? error.message : undefined);
    }
  };

  const downloadSelectedClassPdf = async () => {
    if (!selectedArrangement || !classPrintRef.current) return;
    try {
      const pages = [...classPrintRef.current.querySelectorAll<HTMLElement>(".exam-class-arrangement-page")];
      await downloadExamPreviewPdf(
        pages,
        `${selectedArrangement.name}_${selectedClassIds.size}个班级_考场安排`,
        "A4",
      );
    } catch (error) {
      toast.error("下载班级安排 PDF 失败", error instanceof Error ? error.message : undefined);
    }
  };

  const downloadSelectedDeskPdf = async () => {
    if (!selectedArrangement || !deskPrintRef.current) return;
    try {
      const pages = [...deskPrintRef.current.querySelectorAll<HTMLElement>(".exam-desk-label-page")];
      await downloadExamPreviewPdf(
        pages,
        `${selectedArrangement.name}_${selectedRoomIds.size}个考场_桌贴`,
        "8K",
      );
    } catch (error) {
      toast.error("下载桌贴 PDF 失败", error instanceof Error ? error.message : undefined);
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

              <div className="grid gap-5">
                <Card>
                  <div className="font-medium text-ink-900">第一步：选择考试科目</div>
                  <div className="mt-1 text-xs text-ink-500">选择全部学科、高考六门，或学测科目中自己未选修的三门。</div>
                  <div className="mt-4 grid gap-3 md:grid-cols-3" role="radiogroup" aria-label="考试科目配置方式">
                    <ChoiceCard checked={draft.subjectSetupMode === "all"} title="所有学科" description="所有学生默认参加勾选的学科。" onClick={() => setSubjectSetupMode("all")} />
                    <ChoiceCard checked={draft.subjectSetupMode === "selection"} title="高考六门（语数外 + 选科）" description="语文、数学、英语，加上学生自己的三门选科。" onClick={() => setSubjectSetupMode("selection")} />
                    <ChoiceCard checked={draft.subjectSetupMode === "academicNonSelection"} title="学测科目中非选修科目" description="物化生史政地中，排除学生自己的三门选科。" onClick={() => setSubjectSetupMode("academicNonSelection")} />
                  </div>
                  <div className="mt-4">
                    <div className="mb-2 text-xs font-medium text-ink-500">勾选本次考试包含的学科</div>
                    <div className="flex flex-wrap gap-2">{DEFAULT_SUBJECTS.map((subject) => (
                      <CheckboxPill key={subject} checked={draft.subjects.includes(subject)} label={subject} onClick={() => toggleSubject(subject)} />
                    ))}</div>
                  </div>
                  {draft.subjectSetupMode !== "all" && (
                    <div className="mt-5 space-y-3 border-t border-ink-100 pt-4">
                      <div>
                        <div className="text-sm font-medium text-ink-800">各选科对应的考试科目确认</div>
                        <div className="mt-0.5 text-xs text-ink-500">修改后会同步到该选科下的学生，之后仍可逐个学生调整。</div>
                      </div>
                      {subjectSelectionNames(context).length === 0 ? (
                        <div className="rounded-lg bg-ink-50 px-3 py-2 text-xs text-ink-500">学生档案中暂无选科名称，暂按全部勾选科目处理。</div>
                      ) : subjectSelectionNames(context).map((selectionName) => (
                        <div key={selectionName} className="rounded-lg border border-ink-100 p-3">
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
                  <div className="border-b border-ink-100 px-5 py-4">
                    <div className="font-medium text-ink-900">第二步：学生考试科目</div>
                    <div className="mt-0.5 text-xs text-ink-500">先切换班级批量设置，再逐个学生微调；与本班多数学生选科不同的条目会加深背景。</div>
                    <div className="mt-3">
                      <ClassSwitchTabs
                        classes={context.classes}
                        activeClassId={activeStudentSettingsClassId}
                        onChange={setStudentSettingsClassId}
                        ariaLabel="学生考试科目班级"
                      />
                    </div>
                  </div>
                  <div className="border-b border-ink-100 p-4">
                    <Input value={studentKeyword} onChange={(event) => setStudentKeyword(event.target.value)} placeholder="搜索姓名或学号" aria-label="搜索学生" />
                  </div>
                  <div className="max-h-[640px] overflow-auto divide-y divide-ink-100">
                    {activeStudentSettingsClass && (
                      <section key={activeStudentSettingsClass.id}>
                          <div className="sticky top-0 z-10 border-b border-ink-100 bg-ink-50/95 px-5 py-3 backdrop-blur">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div>
                                <div className="text-sm font-medium text-ink-900">{activeStudentSettingsClass.name} · {filteredStudents.length} 人</div>
                                <div className="text-xs text-ink-500">批量设置会同步覆盖本班学生，之后仍可单独微调。</div>
                              </div>
                              <div className="flex flex-wrap gap-1.5" role="group" aria-label={`${activeStudentSettingsClass.name}批量考试科目`}>
                                {draft.subjects.map((subject) => (
                                  <CheckboxPill
                                    key={subject}
                                    checked={activeStudentSettingsClassRule?.defaultSubjects.includes(subject) || false}
                                    label={subject}
                                    onClick={() => toggleClassSubject(activeStudentSettingsClass.id, subject)}
                                  />
                                ))}
                              </div>
                            </div>
                          </div>
                          <div className="divide-y divide-ink-100">
                            {filteredStudents.map((student) => {
                              const selection = draft.studentSubjects.find((item) => item.studentId === student.id);
                              const classSubjects = activeStudentSettingsClassRule?.defaultSubjects || activeClassMajoritySubjects;
                              const differsFromClass = Boolean(selection && !sameSubjects(selection.subjects, classSubjects));
                              return (
                                <div
                                  key={student.id}
                                  role="group"
                                  aria-label={`${student.name}考试设置`}
                                  title={differsFromClass ? "与本班多数学生的考试科目不同" : undefined}
                                  className={cn(
                                    "grid gap-3 px-5 py-3 lg:grid-cols-[14rem_minmax(0,1fr)] lg:items-center",
                                    differsFromClass && "bg-amber-100/70",
                                    selection?.absent && "bg-red-50/80",
                                  )}
                                >
                                  <div>
                                    <div className="flex flex-wrap items-center gap-1.5 text-sm font-medium text-ink-900">
                                      <span>{student.name}</span>
                                      <span className="font-normal text-ink-400">{student.studentNo}</span>
                                      {student.isExternal && <Badge>借读生</Badge>}
                                    </div>
                                    <div className="text-xs text-ink-400">{activeStudentSettingsClass.name}{student.subjectSelection ? ` · ${student.subjectSelection}` : ""}</div>
                                  </div>
                                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                                    <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">{draft.subjects.map((subject) => <CheckboxPill key={subject} checked={selection?.subjects.includes(subject) || false} label={subject} disabled={selection?.absent} onClick={() => toggleStudentSubject(student.id, subject)} />)}</div>
                                    <div className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-3">
                                      <select
                                        aria-label={`${student.name}特殊要求`}
                                        value={selection?.seatPreference || ""}
                                        disabled={selection?.absent}
                                        onChange={(event) => setStudentSeatPreference(student.id, (event.target.value || undefined) as ExamStudentSeatPreference | undefined)}
                                        className="w-36 rounded-md border border-ink-200 bg-paper px-2 py-2 text-xs text-ink-700 disabled:opacity-50"
                                      >
                                        <option value="">无特殊要求</option>
                                        <option value="first">排场次首</option>
                                        <option value="last">排场次尾</option>
                                      </select>
                                      <label className="inline-flex cursor-pointer items-center gap-2 whitespace-nowrap text-sm text-red-700">
                                        <input aria-label={`${student.name}弃考`} type="checkbox" checked={Boolean(selection?.absent)} onChange={() => toggleStudentAbsent(student.id)} />
                                        弃考
                                      </label>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                            {filteredStudents.length === 0 && (
                              <div className="px-5 py-10 text-center text-sm text-ink-400">当前班级没有匹配的学生</div>
                            )}
                          </div>
                        </section>
                    )}
                  </div>
                </Card>

                <Card className="p-0 overflow-hidden">
                  <div className="flex flex-col gap-3 border-b border-ink-100 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="font-medium text-ink-900">第三步：设置可用考场</div>
                        <Badge><span aria-live="polite">本届学生 {context.students.length} 人</span></Badge>
                        <Badge><span aria-live="polite">最多可安排 {totalRoomCapacity} 个位置</span></Badge>
                      </div>
                      <div className="mt-0.5 text-xs text-ink-500">班级教室默认生成“1考场”“2考场”等，可继续增加教室外考场。</div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="w-28">
                        <Input aria-label="批量考场容量" type="number" min={1} max={1000} value={bulkCapacity} onChange={(event) => setBulkCapacity(Number(event.target.value))} />
                      </div>
                      <Button variant="outline" size="sm" onClick={applyBulkCapacity}>批量设置容量</Button>
                      <Button variant="outline" size="sm" onClick={addRoom}><Plus className="h-4 w-4" />增加考场</Button>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-[680px] w-full text-sm">
                      <thead className="bg-ink-50 text-xs text-ink-500"><tr><th className="px-4 py-2.5 text-left font-medium">考场号</th><th className="px-4 py-2.5 text-left font-medium">考场位置</th><th className="px-4 py-2.5 text-left font-medium">可安排人数</th><th className="px-4 py-2.5 text-right font-medium">操作</th></tr></thead>
                      <tbody className="divide-y divide-ink-100">
                        {draft.rooms.map((room) => (
                          <tr key={room.id}>
                            <td className="px-4 py-3"><Input aria-label="考场号" value={room.number || room.name} onChange={(event) => updateDraft((current) => ({ ...current, rooms: current.rooms.map((item) => item.id === room.id ? { ...item, name: event.target.value, number: event.target.value } : item) }))} /></td>
                            <td className="px-4 py-3"><Input aria-label="考场位置" value={room.location || ""} onChange={(event) => updateDraft((current) => ({ ...current, rooms: current.rooms.map((item) => item.id === room.id ? { ...item, location: event.target.value } : item) }))} /></td>
                            <td className="px-4 py-3"><Input aria-label="考场可安排人数" type="number" min={1} max={1000} value={room.capacity} onChange={(event) => updateDraft((current) => ({ ...current, rooms: current.rooms.map((item) => item.id === room.id ? { ...item, capacity: Number(event.target.value) } : item) }))} /></td>
                            <td className="px-4 py-3 text-right"><Button variant="ghost" size="icon" aria-label={`删除${room.number || room.name}`} disabled={draft.rooms.length === 1} onClick={() => removeRoom(room.id)}><Trash2 className="h-4 w-4 text-red-500" /></Button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              </div>

              <Card>
                <div className="font-medium text-ink-900">第四步：排考场规则</div>
                <div className="mt-1 text-xs text-ink-500">勾选的科目每个学科单独排考场；未勾选的科目按每名学生实际参加的科目组合合并安排。</div>
                <div className="mt-4 flex flex-wrap gap-2">{draft.subjects.map((subject) => (
                  <CheckboxPill key={subject} checked={(draft.separateSubjects || []).includes(subject)} label={`${subject}单独排`} onClick={() => toggleSeparateSubject(subject)} />
                ))}</div>
                <div className="mt-3 rounded-lg bg-ink-50 px-3 py-2 text-xs text-ink-500">
                  参与合并的科目：{draft.subjects.filter((subject) => !(draft.separateSubjects || []).includes(subject)).join("、") || "无"}
                  {(draft.subjects.length > (draft.separateSubjects || []).length) && "；每名学生仅合并本人实际参加的科目"}
                </div>
                <div className="mt-4 border-t border-ink-100 pt-4">
                  <div className="text-sm font-medium text-ink-800">考试组合使用考场</div>
                  <div className="mt-1 text-xs text-ink-500">系统按参加各组合的班级教室和所有教室外考场自动生成，可逐项微调。</div>
                  <div className="mt-3 space-y-3">
                    {examGroups.map((group) => (
                      <div key={group.key} className="rounded-lg border border-ink-100 bg-paper p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <div className="text-sm font-medium text-ink-900">
                              {group.subjectLabel.split(" / ").join("、")}
                            </div>
                            <div className="mt-0.5 text-xs text-ink-500">
                              {group.sessionKey === "combined"
                                ? `合并场次 · ${group.studentCount} 人 · ${group.classIds.length} 个班级`
                                : `单独场次 · ${group.studentCount} 人 · ${group.classIds.length} 个班级`}
                              <span aria-live="polite"> · 所选考场最多可安排 {roomCapacityTotal(draft.rooms, draft.groupRoomIds?.[group.key] || [])} 个位置</span>
                            </div>
                          </div>
                          <Button variant="ghost" size="sm" onClick={() => resetGroupRooms(group)}><RotateCcw className="h-3.5 w-3.5" />恢复自动分配</Button>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {draft.rooms.map((room) => (
                            <CheckboxPill
                              key={room.id}
                              checked={(draft.groupRoomIds?.[group.key] || []).includes(room.id)}
                              label={roomChoiceLabel(room, context)}
                              onClick={() => toggleGroupRoom(group.key, room.id)}
                            />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="mt-4 border-t border-ink-100 pt-4">
                  <div className="text-sm font-medium text-ink-800">班级学科固定考场</div>
                  <div className="mt-1 text-xs text-ink-500">默认自动分配；个别班级的个别学科可固定到指定考场。</div>
                  <div className="mt-3 space-y-3">
                    <ClassSwitchTabs
                      classes={context.classes}
                      activeClassId={activeFixedRoomClassId}
                      onChange={setFixedRoomClassId}
                      ariaLabel="班级学科固定考场班级"
                    />
                    {activeFixedRoomClass && (
                      <div className="rounded-lg border border-ink-100 bg-paper p-4">
                        <div className="mb-3 text-sm font-medium text-ink-900">{activeFixedRoomClass.name}</div>
                        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                          {draft.subjects.map((subject) => {
                            const fixedRoomId = activeFixedRoomClassRule?.fixedSubjectRoomIds?.[subject] || "";
                            return (
                              <label key={subject} className="flex items-center gap-2 text-xs text-ink-600">
                                <span className="w-10 shrink-0">{subject}</span>
                                <select
                                  aria-label={`${activeFixedRoomClass.name}${subject}固定考场`}
                                  value={fixedRoomId}
                                  onChange={(event) => setClassSubjectRoom(activeFixedRoomClass.id, subject, event.target.value)}
                                  className="min-w-0 flex-1 rounded-md border border-ink-200 bg-paper px-2 py-1.5 text-xs text-ink-700"
                                >
                                  <option value="">自动分配</option>
                                  {draft.rooms.map((room) => <option key={room.id} value={room.id}>{room.number || room.name}</option>)}
                                </select>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
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
                      <>
                        <Button variant="outline" disabled={selectedClassIds.size === 0} onClick={() => window.print()}>
                          <Printer className="h-4 w-4" />打印已选班级
                        </Button>
                        <Button variant="outline" disabled={selectedClassIds.size === 0} onClick={() => void downloadSelectedClasses()}>
                          <Download className="h-4 w-4" />下载已选班级
                        </Button>
                        <Button variant="gold" disabled={selectedClassIds.size === 0} onClick={() => void downloadSelectedClassPdf()}>
                          <Download className="h-4 w-4" />下载班级 PDF
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button variant="outline" disabled={selectedDeskLabels.length === 0} onClick={() => window.print()}>
                          <Printer className="h-4 w-4" />打印已选桌贴
                        </Button>
                        <Button variant="outline" disabled={selectedDeskLabels.length === 0} onClick={() => void downloadSelectedLabels()}>
                          <Download className="h-4 w-4" />下载已选桌贴
                        </Button>
                        <Button variant="gold" disabled={selectedDeskLabels.length === 0} onClick={() => void downloadSelectedDeskPdf()}>
                          <Download className="h-4 w-4" />下载桌贴 PDF
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
                    <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
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
                      <span className="h-4 w-px bg-ink-200" aria-hidden="true" />
                      <label className="inline-flex cursor-pointer items-center gap-2">
                        <input
                          type="checkbox"
                          aria-label="桌贴显示学号"
                          checked={showDeskStudentNo}
                          onChange={(event) => setShowDeskStudentNo(event.target.checked)}
                        />
                        显示学号
                      </label>
                      <label className="inline-flex cursor-pointer items-center gap-2">
                        <input
                          type="checkbox"
                          aria-label="桌贴显示准考证号"
                          checked={showDeskAdmissionNo}
                          onChange={(event) => setShowDeskAdmissionNo(event.target.checked)}
                        />
                        显示准考证号
                      </label>
                    </div>
                  )}
                  <span>
                    {previewMode === "class"
                      ? `已选择 ${selectedClassIds.size} / ${classAssignmentGroups.length} 个班级`
                      : `已选择 ${selectedRoomIds.size} / ${deskRoomGroups.length} 个考场，共 ${selectedDeskLabels.length} 张桌贴`}
                  </span>
                </div>
              </Card>

              {previewMode === "class" && activeClassAssignmentGroup ? (
                <Card className="p-0 overflow-hidden">
                  <div className="border-b border-ink-100 bg-ink-50/60 px-5 py-4">
                    <div className="mb-2 text-xs font-medium text-ink-500">按班级切换预览</div>
                    <PreviewSwitchTabs
                      items={classAssignmentGroups.map(({ classItem, students }) => ({
                        id: classItem.id,
                        label: classItem.name,
                        detail: `${students.length} 名学生`,
                      }))}
                      activeId={activeClassAssignmentGroup.classItem.id}
                      onChange={setPreviewClassId}
                      ariaLabel="班级考场安排班级"
                    />
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-100 px-5 py-4">
                    <label className="inline-flex cursor-pointer items-start gap-3">
                      <input
                        className="mt-1"
                        type="checkbox"
                        aria-label={`选择${activeClassAssignmentGroup.classItem.name}`}
                        checked={selectedClassIds.has(activeClassAssignmentGroup.classItem.id)}
                        onChange={() => toggleClassSelection(activeClassAssignmentGroup.classItem.id)}
                      />
                      <span>
                        <span className="block font-medium text-ink-900">{activeClassAssignmentGroup.classItem.name}</span>
                        <span className="mt-0.5 block text-xs text-ink-500">每名学生只显示一条记录，所有考试科目、考场号和位置集中列出。</span>
                      </span>
                    </label>
                    <Badge>{activeClassAssignmentGroup.students.length} 名学生</Badge>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-[700px] w-full text-xs">
                      <thead className="bg-ink-50 text-xs text-ink-500">
                        <tr>
                          <th className="w-28 px-3 py-2 text-left font-medium">姓名</th>
                          <th className="w-32 px-3 py-2 text-left font-medium">学号</th>
                          <th className="px-3 py-2 text-left font-medium">考试安排</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-ink-100">{activeClassAssignmentGroup.students.map((student) => (
                        <tr key={student.key} className="align-top">
                          <td className="px-3 py-2 font-medium text-ink-900">{student.studentName}</td>
                          <td className="px-3 py-2 font-mono text-[11px] text-ink-700">{student.studentNo}</td>
                          <td className="px-3 py-1.5">
                            <div className="divide-y divide-ink-100 rounded-md border border-ink-100">{student.assignments.map((item) => (
                              <div key={item.id} className="grid gap-0.5 px-2 py-1.5 lg:grid-cols-[minmax(8rem,1fr)_minmax(7rem,0.7fr)_minmax(10rem,1.2fr)_auto] lg:items-center">
                                <div className="font-medium text-ink-900">{item.subjectLabel.split(" / ").join("、")}</div>
                                <div className="text-ink-700">{item.roomNumber || item.roomName}</div>
                                <div className="text-ink-600">{item.roomLocation || item.roomName}</div>
                                <div className="text-[11px] text-ink-400">{item.seatNo} 号 · {item.admissionNo}</div>
                              </div>
                            ))}</div>
                          </td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                </Card>
              ) : previewMode === "desk" && activeDeskRoomGroup ? (
                <Card className="p-0 overflow-hidden">
                  <div className="border-b border-ink-100 bg-ink-50/60 px-5 py-4">
                    <div className="mb-2 text-xs font-medium text-ink-500">按考场切换预览</div>
                    <PreviewSwitchTabs
                      items={deskRoomGroups.map((roomGroup) => ({
                        id: roomGroup.roomId,
                        label: roomGroup.roomNumber,
                        detail: `${roomGroup.roomLocation} · ${roomGroup.labels.length} 张桌贴`,
                      }))}
                      activeId={activeDeskRoomGroup.roomId}
                      onChange={setPreviewRoomId}
                      ariaLabel="桌贴预览考场"
                    />
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-100 px-5 py-4">
                    <label className="inline-flex cursor-pointer items-start gap-3">
                      <input
                        className="mt-1"
                        type="checkbox"
                        aria-label={`选择${activeDeskRoomGroup.roomNumber}`}
                        checked={selectedRoomIds.has(activeDeskRoomGroup.roomId)}
                        onChange={() => toggleRoomSelection(activeDeskRoomGroup.roomId)}
                      />
                      <span>
                        <span className="block font-medium text-ink-900">{activeDeskRoomGroup.roomNumber}</span>
                        <span className="mt-0.5 block text-xs text-ink-500">{activeDeskRoomGroup.roomLocation}</span>
                      </span>
                    </label>
                    <Badge>{activeDeskRoomGroup.labels.length} 张桌贴</Badge>
                  </div>
                  <div className="grid gap-2 p-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                    {activeDeskRoomGroup.labels.map((label) => (
                      <article key={label.key} data-testid="desk-label-card" className="rounded-lg border border-ink-300 bg-paper p-3 shadow-sm">
                        <div className="truncate text-center font-serif text-xs font-semibold text-ink-900">{selectedArrangement?.name}</div>
                        <div className="mt-1 flex items-center justify-between gap-2 text-[10px] text-ink-500">
                          <span>{label.roomLocation}</span>
                          <span>{selectedArrangement?.examDate || "考试日期待定"}</span>
                        </div>
                        <div className="mt-1.5 flex items-end justify-between border-y border-ink-200 py-1 text-ink-900">
                          <span className="text-xs font-medium">{label.roomNumber}</span>
                          <strong className="text-base">{label.seatNo} 号</strong>
                        </div>
                        <div className="divide-y divide-ink-100">{label.assignments.map((assignment) => (
                          <div key={assignment.id} className="py-1.5">
                            <div className="flex flex-wrap items-baseline justify-start gap-x-2 gap-y-0.5">
                              <div className="text-sm font-medium text-ink-900">{assignment.studentName}</div>
                              <div className="text-[11px] font-medium text-ink-600">{assignment.subjectLabel.split(" / ").join("、")}</div>
                              <div className="text-[11px] text-ink-500">{assignment.className}</div>
                            </div>
                            <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-ink-500">
                              {showDeskStudentNo && <span>学号：{assignment.studentNo}</span>}
                              {showDeskAdmissionNo && <span className="font-mono text-[10px] text-ink-400">准考证号：{assignment.admissionNo}</span>}
                            </div>
                          </div>
                        ))}</div>
                      </article>
                    ))}
                  </div>
                </Card>
              ) : null}

              {selectedArrangement && <Button variant="ghost" onClick={handleDelete}><Trash2 className="h-4 w-4 text-red-500" />删除当前方案</Button>}
            </div>
          )}

          {previewMode === "class" && selectedClassAssignmentGroups.length > 0 && selectedArrangement && (
            <div ref={classPrintRef} className="print-only exam-class-arrangement-sheet" aria-hidden="true">
              {selectedClassAssignmentGroups.flatMap(({ classItem, students }) => {
                const maxAssignments = Math.max(...students.map((student) => student.assignments.length), 1);
                const baseLayout = getClassPrintLayout(
                  students.length,
                  maxAssignments,
                );
                const pages = chunkForPrint(students, baseLayout.pageCapacity);
                return pages.map((pageStudents, pageIndex) => {
                  const layout = getClassPrintLayout(pageStudents.length, maxAssignments);
                  return (
                  <section
                    key={`${classItem.id}-${pageIndex}`}
                    className="exam-class-arrangement-page"
                    data-density={layout.density}
                    data-columns={layout.columns}
                    data-class-id={classItem.id}
                    data-page-index={pageIndex + 1}
                    data-testid="class-arrangement-print-page"
                  >
                    <header className="exam-class-arrangement-header">
                      <h1>{selectedArrangement.name}</h1>
                      <div className="exam-class-arrangement-header-meta">
                        <strong>
                          {classItem.name} · {students.length} 名学生
                          {pages.length > 1 && ` · 第 ${pageIndex + 1}/${pages.length} 页`}
                        </strong>
                        <span>{selectedArrangement.examDate || "考试日期待定"}</span>
                      </div>
                    </header>
                    <div
                      className="exam-class-arrangement-grid"
                      style={{
                        gridTemplateColumns: `repeat(${layout.columns}, minmax(0, 1fr))`,
                        gridAutoRows: `${layout.rowHeight}mm`,
                      }}
                    >
                      {pageStudents.map((student) => (
                        <article key={student.key} className="exam-class-arrangement-student">
                          <div className="exam-class-arrangement-student-header">
                            <strong>{student.studentName}</strong>
                            <span>{student.studentNo}</span>
                          </div>
                          <div className="exam-class-arrangement-items">
                            {student.assignments.map((item) => (
                              <div key={item.id} className="exam-class-arrangement-item" title={item.admissionNo}>
                                <strong>{item.subjectLabel.split(" / ").join("、")}</strong>
                                <span>{item.roomNumber || item.roomName} · {item.seatNo}号</span>
                                <span>{item.roomLocation || item.roomName}</span>
                              </div>
                            ))}
                          </div>
                        </article>
                      ))}
                    </div>
                  </section>
                  );
                });
              })}
            </div>
          )}

          {previewMode === "desk" && selectedDeskLabels.length > 0 && selectedArrangement && (
            <div ref={deskPrintRef} className="print-only exam-desk-label-sheet" aria-hidden="true">
              {(() => {
                const maxAssignments = Math.max(...selectedDeskLabels.map((label) => label.assignments.length), 1);
                const baseLayout = getDeskLabelPrintLayout(selectedDeskLabels.length, maxAssignments);
                const pages = chunkForPrint(selectedDeskLabels, baseLayout.pageCapacity);
                return pages.map((pageLabels, pageIndex) => {
                  const layout = getDeskLabelPrintLayout(pageLabels.length, maxAssignments);
                  return (
                  <div
                    key={`desk-label-page-${pageIndex}`}
                    className="exam-desk-label-page"
                    data-density={layout.density}
                    data-columns={layout.columns}
                    data-page-index={pageIndex + 1}
                    data-testid="desk-label-print-page"
                    style={{
                      gridTemplateColumns: `repeat(${layout.columns}, minmax(0, 1fr))`,
                      gridAutoRows: `${layout.rowHeight}mm`,
                    }}
                  >
                    {pageLabels.map((group) => (
                    <section key={group.key} className="exam-desk-label">
                      <div className="exam-desk-label-title">{selectedArrangement.name}</div>
                      <div className="exam-desk-label-meta"><span>{group.roomLocation}</span><span>{selectedArrangement.examDate || "考试日期待定"}</span></div>
                      <div className="exam-desk-label-seat"><span>{group.roomNumber}</span><strong>{group.seatNo} 号</strong></div>
                      <div className="exam-desk-label-assignments">
                        {group.assignments.map((assignment) => (
                          <div key={assignment.id} className="exam-desk-label-assignment">
                            <div className="exam-desk-label-assignment-main">
                              <span className="exam-desk-label-name">{assignment.studentName}</span>
                              <span className="exam-desk-label-subject">{assignment.subjectLabel}</span>
                              <span className="exam-desk-label-class">{assignment.className}</span>
                            </div>
                            <div className="exam-desk-label-assignment-meta">
                              {showDeskStudentNo && <span>学号 {assignment.studentNo}</span>}
                              {showDeskAdmissionNo && <span className="exam-desk-label-admission">准考证号 {assignment.admissionNo}</span>}
                            </div>
                          </div>
                        ))}
                      </div>
                    </section>
                    ))}
                  </div>
                  );
                });
              })()}
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
