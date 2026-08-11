import { useCallback, useEffect, useMemo, useState } from "react";
import { BookOpen, Save, ShieldCheck, Users } from "lucide-react";
import { Badge, Button, Card, Select } from "@/components/ui";
import { PageHeader } from "@/components/layout/PageHeader";
import { authService } from "@/services/auth";
import { classService } from "@/services/class";
import { organizationService, roleLabels } from "@/services/organization";
import { GRADE_OPTIONS, SUBJECT_OPTIONS } from "@/lib/education";
import { highestTeacherRoleLevel, TEACHER_ROLES, TEACHER_ROLE_LEVEL } from "@/lib/teacher-roles";
import { useAuthStore } from "@/stores/auth";
import { toast } from "@/stores/ui";
import type { SchoolClass, Teacher, TeacherAffiliation, TeacherRole } from "@/types";

function affiliationFor(teacher: Teacher, schoolId: string | null): TeacherAffiliation | null {
  return teacher.affiliations.find((item) => item.schoolId === schoolId) || null;
}

export default function TeacherProfilesPage() {
  const { teacher: current, getCurrentAffiliation } = useAuthStore();
  const currentAffiliation = getCurrentAffiliation();
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [subject, setSubject] = useState("数学");
  const [grades, setGrades] = useState<string[]>([]);
  const [classIds, setClassIds] = useState<string[]>([]);
  const [homeroomClassIds, setHomeroomClassIds] = useState<string[]>([]);
  const [roles, setRoles] = useState<TeacherRole[]>(["teacher"]);
  const [saving, setSaving] = useState(false);
  const schoolId = currentAffiliation?.schoolId || current?.schoolId || null;
  const accountRole = currentAffiliation?.role || current?.role;
  const managerRoles = currentAffiliation?.roles || current?.roles || [];
  const managerLevel = highestTeacherRoleLevel(managerRoles);
  const isSchoolAdmin = accountRole === "school_admin" || accountRole === "platform_admin";

  const load = useCallback(async () => {
    if (!schoolId) return;
    const [teacherList, classList] = await Promise.all([
      authService.listTeachers(),
      classService.listSchoolClasses(schoolId),
    ]);
    setTeachers(teacherList);
    setClasses(classList);
  }, [schoolId]);

  useEffect(() => { void load(); }, [load]);

  const manageableTeachers = useMemo(() => {
    if (isSchoolAdmin) return teachers;
    const managerGrades = new Set(currentAffiliation?.teachingGrades || current?.teachingGrades || []);
    return teachers.filter((teacher) => {
      if (teacher.id === current?.id) return false;
      const affiliation = affiliationFor(teacher, schoolId);
      if (!affiliation) return false;
      const targetLevel = highestTeacherRoleLevel(affiliation.roles || teacher.roles);
      if (targetLevel >= managerLevel) return false;
      if (managerLevel === TEACHER_ROLE_LEVEL.gradeLeader) {
        return (affiliation.teachingGrades || []).some((grade) => managerGrades.has(grade));
      }
      return managerLevel >= TEACHER_ROLE_LEVEL.dean;
    });
  }, [current, currentAffiliation, isSchoolAdmin, managerLevel, schoolId, teachers]);

  useEffect(() => {
    setSelectedId((value) => manageableTeachers.some((teacher) => teacher.id === value)
      ? value
      : manageableTeachers[0]?.id || "");
  }, [manageableTeachers]);

  const selected = useMemo(
    () => manageableTeachers.find((item) => item.id === selectedId),
    [manageableTeachers, selectedId],
  );
  const selectedAffiliation = useMemo(
    () => selected ? affiliationFor(selected, schoolId) : null,
    [selected, schoolId],
  );

  useEffect(() => {
    if (!selected) return;
    const affiliation = affiliationFor(selected, schoolId);
    setSubject(affiliation?.subject || selected.subject || "数学");
    setGrades(affiliation?.teachingGrades || selected.teachingGrades || []);
    setClassIds(affiliation?.teachingClassIds || selected.teachingClassIds || []);
    setHomeroomClassIds(affiliation?.homeroomClassIds || selected.homeroomClassIds || []);
    setRoles(affiliation?.assignedRoles?.length
      ? affiliation.assignedRoles
      : affiliation?.roles?.length
        ? affiliation.roles
        : selected.roles || ["teacher"]);
  }, [selected, schoolId]);

  const inheritedRoles = useMemo(
    () => (selectedAffiliation?.assignedRoles
      ? selectedAffiliation.roles.filter((role) => !selectedAffiliation.assignedRoles?.includes(role))
      : []),
    [selectedAffiliation],
  );

  const assignableRoles = useMemo(
    () => TEACHER_ROLES.filter((role) => role === "teacher" || isSchoolAdmin || TEACHER_ROLE_LEVEL[role] < managerLevel),
    [isSchoolAdmin, managerLevel],
  );

  const visibleClasses = useMemo(() => {
    if (isSchoolAdmin || managerLevel > TEACHER_ROLE_LEVEL.gradeLeader) return classes;
    const managerGrades = new Set(currentAffiliation?.teachingGrades || current?.teachingGrades || []);
    return classes.filter((item) => managerGrades.has(item.grade));
  }, [classes, current, currentAffiliation, isSchoolAdmin, managerLevel]);

  const toggle = (value: string, values: string[], setValues: (next: string[]) => void) => {
    setValues(values.includes(value) ? values.filter((item) => item !== value) : [...values, value]);
  };

  const toggleRole = (role: TeacherRole) => {
    if (role === "teacher") return;
    setRoles((currentRoles) => currentRoles.includes(role)
      ? currentRoles.filter((item) => item !== role)
      : [...currentRoles, role]);
  };

  const save = async () => {
    if (!selected || !schoolId) return;
    setSaving(true);
    try {
      await organizationService.updateTeacherRoles(selected.id, schoolId, roles);
      await authService.updateTeacherTeachingProfile(selected.id, {
        subject,
        teachingGrades: grades,
        teachingClassIds: classIds,
        homeroomClassIds,
      });
      toast.success("教师权限与教学资料已更新");
      await load();
    } catch (error) {
      toast.error("保存失败", error instanceof Error ? error.message : undefined);
    } finally {
      setSaving(false);
    }
  };

  return <div>
    <PageHeader
      title="教师权限与教学资料"
      description="按管理层级维护教师角色、任教学科、年级、任教班级和班主任班级"
      icon={<Users className="w-5 h-5" />}
    />
    <Card className="max-w-4xl p-6 space-y-5">
      <Select
        label="选择教师"
        value={selectedId}
        onChange={(event) => setSelectedId(event.target.value)}
        options={manageableTeachers.map((teacher) => {
          const affiliation = affiliationFor(teacher, schoolId);
          return { value: teacher.id, label: `${teacher.name} · ${affiliation?.subject || teacher.subject || "未设置学科"}` };
        })}
      />
      {selected && <>
        <fieldset>
          <legend className="text-sm font-medium text-ink-700 mb-2 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4" />直接授予的角色权限
          </legend>
          <p className="text-xs text-ink-500 mb-3">
            只能授予低于自身管理层级的角色；学校管理员可配置本校全部教师角色。
          </p>
          <div className="flex flex-wrap gap-2">
            {assignableRoles.map((role) => (
              <label key={role} className="inline-flex items-center gap-2 border border-ink-200 rounded-md px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  checked={roles.includes(role)}
                  disabled={role === "teacher"}
                  onChange={() => toggleRole(role)}
                />
                {roleLabels[role]}
              </label>
            ))}
          </div>
          {inheritedRoles.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-ink-500">
              <span>由负责部门继承：</span>
              {inheritedRoles.map((role) => <Badge key={role} variant="teal">{roleLabels[role]}</Badge>)}
            </div>
          )}
        </fieldset>
        <Select label="任教学科" value={subject} onChange={(event) => setSubject(event.target.value)} options={SUBJECT_OPTIONS.map((value) => ({ value, label: value }))} />
        <Choices label="任教年级" values={isSchoolAdmin || managerLevel > TEACHER_ROLE_LEVEL.gradeLeader ? GRADE_OPTIONS : [...new Set(currentAffiliation?.teachingGrades || current?.teachingGrades || [])]} selected={grades} onToggle={(value) => toggle(value, grades, setGrades)} />
        <ClassChoices label="任教班级" classes={visibleClasses} selected={classIds} onToggle={(value) => toggle(value, classIds, setClassIds)} />
        <ClassChoices label="班主任班级" classes={visibleClasses} selected={homeroomClassIds} onToggle={(value) => toggle(value, homeroomClassIds, setHomeroomClassIds)} />
        <Button variant="gold" loading={saving} onClick={save}><Save className="w-4 h-4" />保存教师权限</Button>
      </>}
      {!selected && <p className="text-sm text-ink-500">当前管理范围内暂无可配置教师。</p>}
    </Card>
  </div>;
}

function Choices({ label, values, selected, onToggle, labels = {} }: { label: string; values: string[]; selected: string[]; onToggle: (value: string) => void; labels?: Record<string, string> }) {
  return <fieldset><legend className="text-sm font-medium text-ink-700 mb-2 flex items-center gap-2"><BookOpen className="w-4 h-4" />{label}</legend><div className="flex flex-wrap gap-2">{values.map((value) => <label key={value} className="inline-flex items-center gap-2 border border-ink-200 rounded-md px-3 py-2 text-sm"><input type="checkbox" checked={selected.includes(value)} onChange={() => onToggle(value)} />{labels[value] || value}</label>)}</div></fieldset>;
}

function ClassChoices({ label, classes, selected, onToggle }: {
  label: string;
  classes: SchoolClass[];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  const groups = groupClassesByGrade(classes);

  return (
    <fieldset>
      <legend className="mb-2 flex items-center gap-2 text-sm font-medium text-ink-700">
        <BookOpen className="h-4 w-4" />
        {label}
      </legend>
      {groups.length === 0 ? (
        <p className="text-sm text-ink-400">当前管理范围内尚未创建班级</p>
      ) : (
        <div className="space-y-3">
          {groups.map((group) => (
            <div key={group.grade} role="group" aria-label={group.grade} className="rounded-lg border border-ink-100 bg-ink-50/60 p-3">
              <div className="mb-2 text-sm font-medium text-ink-700">{group.grade}</div>
              <div className="flex flex-wrap gap-2">
                {group.classes.map((item) => (
                  <label key={item.id} className="inline-flex items-center gap-2 rounded-md border border-ink-200 bg-white px-3 py-2 text-sm">
                    <input type="checkbox" checked={selected.includes(item.id)} onChange={() => onToggle(item.id)} />
                    {item.name}
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </fieldset>
  );
}

function groupClassesByGrade(classes: SchoolClass[]): Array<{ grade: string; classes: SchoolClass[] }> {
  const groups = new Map<string, SchoolClass[]>();
  for (const item of classes) {
    const grade = item.grade.trim() || "未设置年级";
    groups.set(grade, [...(groups.get(grade) || []), item]);
  }

  const gradeOrder = new Map(GRADE_OPTIONS.map((grade, index) => [grade, index]));
  return [...groups.entries()]
    .sort(([left], [right]) => {
      const leftOrder = gradeOrder.get(left) ?? Number.MAX_SAFE_INTEGER;
      const rightOrder = gradeOrder.get(right) ?? Number.MAX_SAFE_INTEGER;
      return leftOrder - rightOrder || left.localeCompare(right, "zh-CN", { numeric: true });
    })
    .map(([grade, items]) => ({
      grade,
      classes: [...items].sort((left, right) => left.name.localeCompare(right.name, "zh-CN", { numeric: true })),
    }));
}
