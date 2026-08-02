import { useCallback, useEffect, useMemo, useState } from "react";
import { BookOpen, Save, Users } from "lucide-react";
import { Button, Card, Select } from "@/components/ui";
import { PageHeader } from "@/components/layout/PageHeader";
import { authService } from "@/services/auth";
import { classService } from "@/services/class";
import { GRADE_OPTIONS, SUBJECT_OPTIONS } from "@/lib/education";
import { useAuthStore } from "@/stores/auth";
import { toast } from "@/stores/ui";
import type { SchoolClass, Teacher } from "@/types";

export default function TeacherProfilesPage() {
  const current = useAuthStore((state) => state.teacher);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [subject, setSubject] = useState("数学");
  const [grades, setGrades] = useState<string[]>([]);
  const [classIds, setClassIds] = useState<string[]>([]);
  const [homeroomClassIds, setHomeroomClassIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const schoolId = current?.schoolId || null;

  const load = useCallback(async () => {
    if (!schoolId) return;
    const [teacherList, classList] = await Promise.all([authService.listTeachers(), classService.listSchoolClasses(schoolId)]);
    setTeachers(teacherList);
    setClasses(classList);
    setSelectedId((value) => value || teacherList[0]?.id || "");
  }, [schoolId]);

  useEffect(() => { void load(); }, [load]);
  const selected = useMemo(() => teachers.find((item) => item.id === selectedId), [teachers, selectedId]);
  useEffect(() => {
    if (!selected) return;
    const affiliation = selected.affiliations.find((item) => item.schoolId === schoolId);
    setSubject(affiliation?.subject || selected.subject || "数学");
    setGrades(affiliation?.teachingGrades || selected.teachingGrades || []);
    setClassIds(affiliation?.teachingClassIds || selected.teachingClassIds || []);
    setHomeroomClassIds(affiliation?.homeroomClassIds || selected.homeroomClassIds || []);
  }, [selected, schoolId]);

  const toggle = (value: string, values: string[], setValues: (next: string[]) => void) => setValues(values.includes(value) ? values.filter((item) => item !== value) : [...values, value]);
  const save = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      await authService.updateTeacherTeachingProfile(selected.id, {
        subject,
        teachingGrades: grades,
        teachingClassIds: classIds,
        homeroomClassIds,
      });
      toast.success("教师教学资料已更新");
      await load();
    } catch (error) {
      toast.error("保存失败", error instanceof Error ? error.message : undefined);
    } finally { setSaving(false); }
  };

  return <div>
    <PageHeader title="教师教学资料" description="维护本校教师的任教学科、年级、任教班级和班主任班级" icon={<Users className="w-5 h-5" />} />
    <Card className="max-w-4xl p-6 space-y-5">
      <Select label="选择教师" value={selectedId} onChange={(event) => setSelectedId(event.target.value)} options={teachers.map((teacher) => ({ value: teacher.id, label: `${teacher.name} · ${teacher.subject || "未设置学科"}` }))} />
      {selected && <>
        <Select label="任教学科" value={subject} onChange={(event) => setSubject(event.target.value)} options={SUBJECT_OPTIONS.map((value) => ({ value, label: value }))} />
        <Choices label="任教年级" values={GRADE_OPTIONS} selected={grades} onToggle={(value) => toggle(value, grades, setGrades)} />
        <Choices label="任教班级" values={classes.map((item) => item.id)} labels={Object.fromEntries(classes.map((item) => [item.id, `${item.grade} · ${item.name}`]))} selected={classIds} onToggle={(value) => toggle(value, classIds, setClassIds)} />
        <Choices label="班主任班级" values={classes.map((item) => item.id)} labels={Object.fromEntries(classes.map((item) => [item.id, `${item.grade} · ${item.name}`]))} selected={homeroomClassIds} onToggle={(value) => toggle(value, homeroomClassIds, setHomeroomClassIds)} />
        <Button variant="gold" loading={saving} onClick={save}><Save className="w-4 h-4" />保存教师资料</Button>
      </>}
    </Card>
  </div>;
}

function Choices({ label, values, selected, onToggle, labels = {} }: { label: string; values: string[]; selected: string[]; onToggle: (value: string) => void; labels?: Record<string, string> }) {
  return <fieldset><legend className="text-sm font-medium text-ink-700 mb-2 flex items-center gap-2"><BookOpen className="w-4 h-4" />{label}</legend><div className="flex flex-wrap gap-2">{values.map((value) => <label key={value} className="inline-flex items-center gap-2 border border-ink-200 rounded-md px-3 py-2 text-sm"><input type="checkbox" checked={selected.includes(value)} onChange={() => onToggle(value)} />{labels[value] || value}</label>)}</div></fieldset>;
}
