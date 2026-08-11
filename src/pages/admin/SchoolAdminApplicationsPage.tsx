import { useEffect, useMemo, useState } from "react";
import { Building2, Save, ShieldCheck, UserCog } from "lucide-react";
import { Badge, Button, Card, EmptyState, Select } from "@/components/ui";
import { PageHeader } from "@/components/layout/PageHeader";
import { TEACHER_ROLES } from "@/lib/teacher-roles";
import { authService } from "@/services/auth";
import { organizationService, roleLabels } from "@/services/organization";
import { schoolService } from "@/services/school";
import { toast } from "@/stores/ui";
import type { School, SchoolAdminApplication, Teacher, TeacherRole } from "@/types";

export default function SchoolAdminApplicationsPage() {
  const [applications, setApplications] = useState<SchoolAdminApplication[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [schoolId, setSchoolId] = useState("");
  const [teacherId, setTeacherId] = useState("");
  const [schoolRole, setSchoolRole] = useState<"teacher" | "school_admin">("teacher");
  const [roles, setRoles] = useState<TeacherRole[]>(["teacher"]);
  const [reviewing, setReviewing] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const [pending, schoolList] = await Promise.all([
      authService.getPendingSchoolAdminApplications(),
      schoolService.listSchools(),
    ]);
    setApplications(pending);
    setSchools(schoolList);
    setSchoolId((value) => value || schoolList[0]?.id || "");
  };

  useEffect(() => { void load(); }, []);

  useEffect(() => {
    if (!schoolId) {
      setTeachers([]);
      setTeacherId("");
      return;
    }
    let cancelled = false;
    void organizationService.listTeachers(schoolId).then((teacherList) => {
      if (cancelled) return;
      setTeachers(teacherList);
      setTeacherId((value) => teacherList.some((teacher) => teacher.id === value)
        ? value
        : teacherList[0]?.id || "");
    }).catch((error) => {
      if (!cancelled) toast.error("教师列表加载失败", error instanceof Error ? error.message : undefined);
    });
    return () => { cancelled = true; };
  }, [schoolId]);

  const selectedTeacher = useMemo(
    () => teachers.find((teacher) => teacher.id === teacherId) || null,
    [teacherId, teachers],
  );

  useEffect(() => {
    if (!selectedTeacher || !schoolId) return;
    const affiliation = selectedTeacher.affiliations.find((item) => item.schoolId === schoolId);
    setSchoolRole(affiliation?.role === "school_admin" ? "school_admin" : "teacher");
    setRoles(affiliation?.assignedRoles?.length
      ? affiliation.assignedRoles
      : affiliation?.roles?.length
        ? affiliation.roles
        : ["teacher"]);
  }, [schoolId, selectedTeacher]);

  const review = async (id: string, approved: boolean) => {
    setReviewing(id);
    try {
      await authService.reviewSchoolAdminApplication(id, approved);
      toast.success(approved ? "已授予学校管理员权限" : "申请已拒绝");
      await load();
    } catch (error) {
      toast.error("审核失败", error instanceof Error ? error.message : undefined);
    } finally {
      setReviewing(null);
    }
  };

  const toggleRole = (role: TeacherRole) => {
    if (role === "teacher") return;
    setRoles((current) => current.includes(role)
      ? current.filter((item) => item !== role)
      : [...current, role]);
  };

  const saveDirectAssignment = async () => {
    if (!schoolId || !teacherId) return;
    setSaving(true);
    try {
      await organizationService.setTeacherSchoolRole(teacherId, schoolId, schoolRole);
      await organizationService.updateTeacherRoles(teacherId, schoolId, roles);
      toast.success("学校管理身份与教师角色已更新");
      const teacherList = await organizationService.listTeachers(schoolId);
      setTeachers(teacherList);
    } catch (error) {
      toast.error("保存失败", error instanceof Error ? error.message : undefined);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="学校管理权限"
        description="平台超级管理员可直接指定各校管理员和校级角色，也可继续处理教师提交的管理员申请"
        icon={<ShieldCheck className="w-5 h-5" />}
      />

      <Card className="mb-6 p-5 space-y-5">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-gold-50 p-2 text-gold-700"><UserCog className="h-5 w-5" /></div>
          <div>
            <h2 className="font-serif text-lg font-semibold text-ink-900">直接指定学校管理人员</h2>
            <p className="mt-1 text-sm text-ink-500">无需等待申请，可直接设置学校管理员、校长、副校长、教务主任等固定角色。</p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Select
            label="学校"
            value={schoolId}
            onChange={(event) => setSchoolId(event.target.value)}
            options={schools.map((school) => ({ value: school.id, label: school.name }))}
          />
          <Select
            label="教师"
            value={teacherId}
            onChange={(event) => setTeacherId(event.target.value)}
            options={teachers.map((teacher) => ({ value: teacher.id, label: `${teacher.name} · ${teacher.subject || "未设置学科"}` }))}
          />
        </div>

        {selectedTeacher ? (
          <>
            <Select
              label="学校账号权限"
              value={schoolRole}
              onChange={(event) => setSchoolRole(event.target.value as "teacher" | "school_admin")}
              options={[
                { value: "teacher", label: "普通学校成员" },
                { value: "school_admin", label: "学校管理员" },
              ]}
            />

            <fieldset>
              <legend className="mb-2 text-sm font-medium text-ink-700">校内角色权限</legend>
              <div className="flex flex-wrap gap-2">
                {TEACHER_ROLES.map((role) => (
                  <label key={role} className="inline-flex items-center gap-2 rounded-md border border-ink-200 px-3 py-2 text-sm">
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
            </fieldset>

            <div className="flex flex-wrap items-center gap-2 text-xs text-ink-500">
              <Building2 className="h-3.5 w-3.5" />
              当前：
              <Badge variant={schoolRole === "school_admin" ? "gold" : "ink"}>
                {schoolRole === "school_admin" ? "学校管理员" : "普通成员"}
              </Badge>
              {roles.filter((role) => role !== "teacher").map((role) => (
                <Badge key={role} variant="teal">{roleLabels[role]}</Badge>
              ))}
            </div>

            <Button variant="gold" loading={saving} onClick={saveDirectAssignment}>
              <Save className="h-4 w-4" />保存直接指定
            </Button>
          </>
        ) : (
          <p className="text-sm text-ink-400">所选学校暂无已加入教师。</p>
        )}
      </Card>

      <div className="mb-3 flex items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-ink-500" />
        <h2 className="font-serif text-base font-semibold text-ink-900">待审核管理员申请</h2>
      </div>
      {applications.length === 0 ? (
        <Card><EmptyState icon={<ShieldCheck className="w-7 h-7" />} title="暂无待审核申请" /></Card>
      ) : (
        <div className="space-y-3">
          {applications.map((item) => (
            <Card key={item.id} className="p-5">
              <div className="flex flex-col gap-4 md:flex-row md:items-center">
                <div className="flex-1">
                  <div className="font-medium text-ink-900">{item.teacherName} · {item.schoolName}</div>
                  <div className="mt-1 text-sm text-ink-600">{item.reason}</div>
                  <div className="mt-2 text-xs text-ink-400">提交于 {new Date(item.createdAt).toLocaleString("zh-CN")}</div>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" loading={reviewing === item.id} onClick={() => review(item.id, false)}>拒绝</Button>
                  <Button variant="gold" loading={reviewing === item.id} onClick={() => review(item.id, true)}>通过</Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
