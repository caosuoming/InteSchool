import { useCallback, useEffect, useMemo, useState } from "react";
import { Building2, Pencil, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { Badge, Button, Card, Input, Modal, Select, Textarea } from "@/components/ui";
import { TEACHER_ROLES } from "@/lib/teacher-roles";
import { organizationService, roleLabels } from "@/services/organization";
import { toast } from "@/stores/ui";
import type { OrganizationDepartment, Teacher, TeacherRole } from "@/types";

interface DepartmentManagerProps {
  schoolId: string;
  canEdit: boolean;
}

const EMPTY_ROLES: TeacherRole[] = [];

export function DepartmentManager({ schoolId, canEdit }: DepartmentManagerProps) {
  const [departments, setDepartments] = useState<OrganizationDepartment[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [editing, setEditing] = useState<OrganizationDepartment | null>(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState("");
  const [grade, setGrade] = useState("");
  const [leaderId, setLeaderId] = useState("");
  const [roles, setRoles] = useState<TeacherRole[]>(EMPTY_ROLES);
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const [departmentList, teacherList] = await Promise.all([
      organizationService.listDepartments(schoolId),
      organizationService.listTeachers(schoolId),
    ]);
    setDepartments(departmentList);
    setTeachers(teacherList);
  }, [schoolId]);

  useEffect(() => { void load(); }, [load]);

  const ordered = useMemo(() => flattenDepartments(departments), [departments]);
  const teacherName = useMemo(() => new Map(teachers.map((teacher) => [teacher.id, teacher.name])), [teachers]);

  const resetForm = (department?: OrganizationDepartment) => {
    setEditing(department || null);
    setName(department?.name || "");
    setParentId(department?.parentId || "");
    setGrade(department?.grade || "");
    setLeaderId(department?.leaderId || "");
    setRoles(department?.roles || []);
    setDescription(department?.description || "");
    setOpen(true);
  };

  const toggleRole = (role: TeacherRole) => {
    setRoles((current) => current.includes(role)
      ? current.filter((item) => item !== role)
      : [...current, role]);
  };

  const save = async () => {
    if (!name.trim()) {
      toast.error("请填写部门名称");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        parentId: parentId || null,
        grade: grade.trim() || undefined,
        leaderId: leaderId || null,
        roles,
        description: description.trim() || undefined,
      };
      if (editing) {
        await organizationService.updateDepartment(editing.id, payload);
        toast.success("部门设置已更新");
      } else {
        await organizationService.createDepartment(schoolId, {
          ...payload,
          parentId: payload.parentId || undefined,
          leaderId: payload.leaderId || undefined,
        });
        toast.success("部门已创建");
      }
      setOpen(false);
      await load();
    } catch (error) {
      toast.error("保存失败", error instanceof Error ? error.message : undefined);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (department: OrganizationDepartment) => {
    if (!confirm(`确定删除部门「${department.name}」？下级部门会保留并移动到顶层。`)) return;
    try {
      await organizationService.deleteDepartment(department.id);
      toast.success("部门已删除");
      await load();
    } catch (error) {
      toast.error("删除失败", error instanceof Error ? error.message : undefined);
    }
  };

  return (
    <Card className="mb-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-gold-600" />
            <h3 className="font-serif text-base font-semibold text-ink-900">学校部门</h3>
          </div>
          <p className="mt-1 text-xs text-ink-500">
            管理员可自定义部门名称和层级，并指定负责人自动获得的角色权限。
          </p>
        </div>
        {canEdit && (
          <Button variant="gold" size="sm" onClick={() => resetForm()}>
            <Plus className="h-3.5 w-3.5" />新建部门
          </Button>
        )}
      </div>

      {ordered.length === 0 ? (
        <div className="mt-4 rounded-lg border border-dashed border-ink-200 px-4 py-8 text-center text-sm text-ink-400">
          暂无自定义部门
        </div>
      ) : (
        <div className="mt-4 divide-y divide-ink-100 rounded-lg border border-ink-100">
          {ordered.map(({ department, depth }) => (
            <div key={department.id} className="flex items-start gap-3 px-4 py-3" style={{ paddingLeft: `${16 + depth * 24}px` }}>
              <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-ink-400" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-ink-900">{department.name}</span>
                  {department.grade && <Badge variant="ink">{department.grade}</Badge>}
                  {department.leaderId && <Badge variant="teal">负责人：{teacherName.get(department.leaderId) || "未知教师"}</Badge>}
                </div>
                {department.description && <p className="mt-1 text-xs text-ink-500">{department.description}</p>}
                <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-ink-500">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  {department.roles.length === 0
                    ? <span>负责人不自动附加角色</span>
                    : department.roles.map((role) => <Badge key={role} variant="gold">{roleLabels[role]}</Badge>)}
                </div>
              </div>
              {canEdit && (
                <div className="flex shrink-0 gap-1">
                  <button className="rounded p-1.5 text-ink-400 hover:bg-mist hover:text-ink-700" onClick={() => resetForm(department)} aria-label={`编辑${department.name}`}>
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button className="rounded p-1.5 text-ink-400 hover:bg-red-50 hover:text-red-600" onClick={() => remove(department)} aria-label={`删除${department.name}`}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? "编辑部门" : "新建部门"}
        description="部门负责人会自动继承这里配置的角色，换负责人时自动重新计算。"
        size="md"
        footer={<>
          <Button variant="ghost" onClick={() => setOpen(false)}>取消</Button>
          <Button variant="gold" loading={saving} onClick={save}>保存</Button>
        </>}
      >
        <div className="space-y-4">
          <Input label="部门名称" value={name} onChange={(event) => setName(event.target.value)} placeholder="如：教务处、高一年级部" autoFocus />
          <Select
            label="上级部门（可选）"
            value={parentId}
            onChange={(event) => setParentId(event.target.value)}
            options={departments.filter((item) => item.id !== editing?.id).map((item) => ({ value: item.id, label: item.name }))}
          />
          <Input label="年级范围（可选）" value={grade} onChange={(event) => setGrade(event.target.value)} placeholder="如：高一" />
          <Select
            label="负责人（可选）"
            value={leaderId}
            onChange={(event) => setLeaderId(event.target.value)}
            options={teachers.map((teacher) => ({ value: teacher.id, label: `${teacher.name} · ${teacher.subject || "未设置学科"}` }))}
          />
          <fieldset>
            <legend className="mb-2 text-sm font-medium text-ink-700">负责人自动获得的角色</legend>
            <div className="flex flex-wrap gap-2">
              {TEACHER_ROLES.filter((role) => role !== "teacher").map((role) => (
                <label key={role} className="inline-flex items-center gap-2 rounded-md border border-ink-200 px-3 py-2 text-sm">
                  <input type="checkbox" checked={roles.includes(role)} onChange={() => toggleRole(role)} />
                  {roleLabels[role]}
                </label>
              ))}
            </div>
          </fieldset>
          <Textarea label="职责说明（可选）" value={description} onChange={(event) => setDescription(event.target.value)} />
        </div>
      </Modal>
    </Card>
  );
}

function flattenDepartments(departments: OrganizationDepartment[]): Array<{ department: OrganizationDepartment; depth: number }> {
  const children = new Map<string | null, OrganizationDepartment[]>();
  for (const department of departments) {
    const key = department.parentId && departments.some((item) => item.id === department.parentId)
      ? department.parentId
      : null;
    children.set(key, [...(children.get(key) || []), department]);
  }
  for (const group of children.values()) group.sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));

  const result: Array<{ department: OrganizationDepartment; depth: number }> = [];
  const visit = (parentId: string | null, depth: number) => {
    for (const department of children.get(parentId) || []) {
      result.push({ department, depth });
      visit(department.id, depth + 1);
    }
  };
  visit(null, 0);
  return result;
}
