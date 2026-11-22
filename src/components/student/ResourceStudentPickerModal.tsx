import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { classService } from "@/services/class";
import { schoolService } from "@/services/school";
import type { AnyClass, ResourceStudentChoice, School } from "@/types";

type Group = "taught" | "personal" | "grade" | "school" | "platform";
const labels: Record<Group, string> = {
  taught: "自己任教的班级和学生",
  personal: "个人教学班和学生",
  grade: "同年级所有班级和学生",
  school: "全校所有班级和学生",
  platform: "平台所有学校的班级和学生",
};
const initialExpanded: Record<Group, boolean> = {
  taught: true, personal: true, grade: true, school: false, platform: false,
};

interface Props {
  open: boolean;
  onClose: () => void;
  selectedStudentIds: string[];
  onChange: (ids: string[]) => void;
  schoolId: string | null;
  teacherId: string;
  teachingGrades: string[];
  onStudentsLoaded?: (students: ResourceStudentChoice[]) => void;
}

export function ResourceStudentPickerModal({
  open, onClose, selectedStudentIds, onChange, schoolId, teacherId,
  teachingGrades, onStudentsLoaded,
}: Props) {
  const [classes, setClasses] = useState<AnyClass[]>([]);
  const [myClassIds, setMyClassIds] = useState<string[]>([]);
  const [students, setStudents] = useState<ResourceStudentChoice[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [loadedSchools, setLoadedSchools] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingSchool, setLoadingSchool] = useState("");
  const [error, setError] = useState("");
  const [externalSchool, setExternalSchool] = useState("");
  const [externalGrade, setExternalGrade] = useState("");
  const [expanded, setExpanded] = useState(initialExpanded);
  const [expandedClasses, setExpandedClasses] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    setExpanded(initialExpanded);
    setExpandedClasses([]);
    Promise.all([
      classService.listAudienceClasses(schoolId || ""),
      classService.listMyClasses(schoolId, teacherId),
      classService.listResourceStudentChoices(),
      schoolService.listSchools(),
    ]).then(([allClasses, myClasses, ownStudents, allSchools]) => {
      if (cancelled) return;
      setClasses(allClasses);
      setMyClassIds(myClasses.filter((item) => item.type === "school").map((item) => item.id));
      setStudents(ownStudents);
      setSchools(allSchools);
      setLoadedSchools(schoolId ? [schoolId] : []);
      onStudentsLoaded?.(ownStudents);
    }).catch((cause) => {
      if (!cancelled) setError(cause instanceof Error ? cause.message : "加载学生名单失败");
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, schoolId, teacherId, onStudentsLoaded]);

  const myIds = useMemo(() => new Set(myClassIds), [myClassIds]);
  const grades = useMemo(() => new Set([
    ...teachingGrades,
    ...classes.flatMap((item) => item.type === "school" && myIds.has(item.id) ? [item.grade] : []),
  ]), [teachingGrades, classes, myIds]);
  const grouped = useMemo(() => ({
    taught: classes.filter((item) => item.type === "school" && item.schoolId === schoolId && myIds.has(item.id)),
    personal: classes.filter((item) => item.type === "personal"),
    grade: classes.filter((item) => item.type === "school" && item.schoolId === schoolId
      && grades.has(item.grade)),
    school: classes.filter((item) => item.type === "school" && item.schoolId === schoolId),
    platform: classes.filter((item) => item.type === "school"),
  }), [classes, schoolId, myIds, grades]);

  const selectSchool = async (id: string) => {
    setExternalSchool(id);
    setExternalGrade("");
    if (!id || loadedSchools.includes(id)) return;
    setLoadingSchool(id);
    setError("");
    try {
      const result = await classService.listResourceStudentChoices(id);
      setStudents((current) => {
        const merged = new Map(current.map((student) => [student.id, student]));
        result.forEach((student) => merged.set(student.id, student));
        return [...merged.values()];
      });
      setLoadedSchools((current) => current.includes(id) ? current : [...current, id]);
      onStudentsLoaded?.(result);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "加载学校学生名单失败");
    } finally {
      setLoadingSchool((current) => current === id ? "" : current);
    }
  };

  const studentsById = useMemo(() => new Map(students.map((item) => [item.id, item])), [students]);
  const studentsByClass = useMemo(() => {
    const result = new Map<string, ResourceStudentChoice[]>();
    students.forEach((student) => {
      const members = result.get(student.classId) || [];
      members.push(student);
      result.set(student.classId, members);
    });
    return result;
  }, [students]);
  const studentsOf = (item: AnyClass) => item.type === "personal"
    ? item.studentIds.flatMap((id) => {
      const student = studentsById.get(id);
      return student ? [student] : [];
    })
    : studentsByClass.get(item.id) || [];
  const toggleStudent = (id: string) => onChange(selectedStudentIds.includes(id)
    ? selectedStudentIds.filter((item) => item !== id)
    : [...selectedStudentIds, id]);
  const toggleClass = (item: AnyClass) => {
    const ids = studentsOf(item).map((student) => student.id);
    if (!ids.length) return;
    const allSelected = ids.every((id) => selectedStudentIds.includes(id));
    onChange(allSelected
      ? selectedStudentIds.filter((id) => !ids.includes(id))
      : [...new Set([...selectedStudentIds, ...ids])]);
  };
  const showClass = (item: AnyClass) => {
    const available = item.type === "personal" || !item.schoolId || loadedSchools.includes(item.schoolId);
    const pupils = available ? studentsOf(item) : [];
    const checked = pupils.length > 0 && pupils.every((student) => selectedStudentIds.includes(student.id));
    const partial = !checked && pupils.some((student) => selectedStudentIds.includes(student.id));
    const isExpanded = expandedClasses.includes(item.id);
    return (
      <div key={item.id} className="rounded-md border border-ink-100 bg-paper">
        <div className="flex items-center gap-2 px-3 py-2">
          <input type="checkbox" aria-label={`选择班级 ${item.name}`}
            checked={checked} ref={(node) => { if (node) node.indeterminate = partial; }}
            disabled={!available || pupils.length === 0}
            onChange={() => toggleClass(item)}
            className="h-4 w-4 rounded border-ink-300 text-gold-500" />
          <button type="button" aria-label={`${isExpanded ? "折叠" : "展开"}班级 ${item.name}`}
            aria-expanded={isExpanded}
            onClick={() => setExpandedClasses((current) => isExpanded
              ? current.filter((id) => id !== item.id) : [...current, item.id])}
            className="flex min-w-0 flex-1 items-center gap-2 text-left text-sm text-ink-800">
            {isExpanded ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
            <span className="truncate">{item.name}</span>
            <span className="shrink-0 text-xs text-ink-400">（{pupils.length} 人）</span>
          </button>
        </div>
        {isExpanded && (
          <div className="border-t border-ink-100 px-3 py-2 pl-9">
            {!available ? <p className="text-xs text-ink-400">请先选择学校加载学生</p>
              : pupils.length === 0 ? <p className="text-xs text-ink-400">暂无在读学生</p>
              : <div className="grid gap-1 sm:grid-cols-2">
                {pupils.map((student) => (
                  <label key={student.id} className="flex cursor-pointer items-center gap-2 rounded p-1.5 text-sm hover:bg-mist">
                    <input type="checkbox" checked={selectedStudentIds.includes(student.id)}
                      onChange={() => toggleStudent(student.id)}
                      className="h-4 w-4 rounded border-ink-300 text-gold-500" />
                    <span className="truncate">{student.name}</span>
                    {student.studentNo && <span className="truncate text-xs text-ink-400">{student.studentNo}</span>}
                  </label>
                ))}
              </div>}
          </div>
        )}
      </div>
    );
  };

  const externalClasses = grouped.platform.filter((item) => item.type === "school"
    && item.schoolId === externalSchool
    && (!externalGrade || item.grade === externalGrade));
  const externalGrades = [...new Set(grouped.platform
    .flatMap((item) => item.type === "school" && item.schoolId === externalSchool ? [item.grade] : []))].sort((a, b) => a.localeCompare(b, "zh-CN"));
  const section = (group: Group) => {
    const isOpen = expanded[group];
    const items = group === "platform" ? externalClasses : grouped[group];
    return <section key={group} className="rounded-lg border border-ink-100">
      <button type="button" aria-expanded={isOpen} aria-label={labels[group]}
        className="flex w-full items-center gap-2 px-3 py-3 text-left text-sm font-medium text-ink-900 hover:bg-mist"
        onClick={() => setExpanded((current) => ({ ...current, [group]: !current[group] }))}>
        {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        <span>{labels[group]}</span>
        <span className="ml-auto text-xs font-normal text-ink-400">{group === "platform" ? grouped.platform.length : items.length} 班</span>
      </button>
      {isOpen && <div className="space-y-2 border-t border-ink-100 px-3 py-3">
        {group === "platform" && <>
          <select aria-label="选择平台学校" className="w-full rounded-md border border-ink-200 p-2 text-sm"
            value={externalSchool} onChange={(event) => void selectSchool(event.target.value)}>
            <option value="">请选择学校</option>
            {schools.filter((item) => grouped.platform.some((schoolClass) =>
              schoolClass.type === "school" && schoolClass.schoolId === item.id))
              .map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
          {externalSchool && <select aria-label="选择平台年级"
            className="w-full rounded-md border border-ink-200 p-2 text-sm" value={externalGrade}
            onChange={(event) => setExternalGrade(event.target.value)}>
            <option value="">全部年级</option>
            {externalGrades.map((grade) => <option key={grade} value={grade}>{grade}</option>)}
          </select>}
          {loadingSchool === externalSchool && <p className="text-xs text-ink-500">正在加载该校学生…</p>}
        </>}
        {items.length ? items.map(showClass)
          : <p className="text-sm text-ink-400">{group === "platform" && !externalSchool ? "请选择学校" : "暂无班级"}</p>}
      </div>}
    </section>;
  };

  return <Modal open={open} onClose={onClose} title="选择学生"
    description="按任教、个人教学班、同年级、全校及平台学校分组；勾选班级可选择班内全部在读学生"
    size="xl"
    footer={<div className="flex w-full items-center justify-between">
      <Button variant="ghost" size="sm" onClick={() => onChange([])}>清空选择</Button>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={onClose}>取消</Button>
        <Button variant="gold" size="sm" onClick={onClose}>确定（{selectedStudentIds.length} 人）</Button>
      </div>
    </div>}>
    <div className="space-y-3">
      {loading && <p className="text-sm text-ink-500">正在加载班级和学生…</p>}
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      {!loading && (["taught", "personal", "grade", "school", "platform"] as const).map(section)}
    </div>
  </Modal>;
}
