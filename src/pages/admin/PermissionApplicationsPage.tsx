import { useCallback, useEffect, useMemo, useState } from "react";
import { Clock3, ShieldCheck, UserCheck } from "lucide-react";
import { Badge, Button, Card, EmptyState, Spinner, Textarea } from "@/components/ui";
import { PageHeader } from "@/components/layout/PageHeader";
import { TEACHER_ROLES } from "@/lib/teacher-roles";
import { authService } from "@/services/auth";
import { roleLabels } from "@/services/organization";
import { useAuthStore } from "@/stores/auth";
import { toast } from "@/stores/ui";
import type { TeacherRole, TeacherRoleApplication } from "@/types";

const statusLabel: Record<TeacherRoleApplication["status"], string> = {
  pending: "待审核",
  approved: "已通过",
  rejected: "未通过",
};

export default function PermissionApplicationsPage() {
  const { teacher, getCurrentAffiliation, refresh } = useAuthStore();
  const affiliation = getCurrentAffiliation();
  const activeRole = affiliation?.role || teacher?.role;
  const currentRoles = useMemo(
    () => affiliation?.roles || teacher?.roles || [],
    [affiliation?.roles, teacher?.roles],
  );
  const schoolAdmin = activeRole === "school_admin";
  const platformAdmin = activeRole === "platform_admin";
  const [mine, setMine] = useState<TeacherRoleApplication[]>([]);
  const [pending, setPending] = useState<TeacherRoleApplication[]>([]);
  const [requestedRoles, setRequestedRoles] = useState<TeacherRole[]>([]);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [reviewing, setReviewing] = useState<string | null>(null);

  const availableRoles = useMemo(
    () => TEACHER_ROLES.filter((role) => role !== "teacher" && !currentRoles.includes(role)),
    [currentRoles],
  );

  const load = useCallback(async () => {
    if (!teacher || platformAdmin) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [myApplications, pendingApplications] = await Promise.all([
        authService.getMyTeacherRoleApplications(),
        schoolAdmin ? authService.getPendingTeacherRoleApplications() : Promise.resolve([]),
      ]);
      setMine(myApplications);
      setPending(pendingApplications);
    } catch (error) {
      toast.error("权限申请加载失败", error instanceof Error ? error.message : undefined);
    } finally {
      setLoading(false);
    }
  }, [platformAdmin, schoolAdmin, teacher]);

  useEffect(() => { void load(); }, [load]);

  const toggleRole = (role: TeacherRole) => {
    setRequestedRoles((roles) => roles.includes(role)
      ? roles.filter((item) => item !== role)
      : [...roles, role]);
  };

  const submit = async () => {
    if (requestedRoles.length === 0) {
      toast.error("请至少选择一项需要申请的职务权限");
      return;
    }
    if (reason.trim().length < 5) {
      toast.error("请填写至少 5 个字的申请说明");
      return;
    }
    setSubmitting(true);
    try {
      await authService.applyTeacherRoles(["teacher", ...requestedRoles], reason);
      setRequestedRoles([]);
      setReason("");
      toast.success("教师权限申请已提交");
      await load();
    } catch (error) {
      toast.error("权限申请提交失败", error instanceof Error ? error.message : undefined);
    } finally {
      setSubmitting(false);
    }
  };

  const review = async (id: string, approved: boolean) => {
    setReviewing(id);
    try {
      await authService.reviewTeacherRoleApplication(id, approved);
      toast.success(approved ? "教师权限申请已通过" : "教师权限申请已拒绝");
      await Promise.all([load(), refresh()]);
    } catch (error) {
      toast.error("审核失败", error instanceof Error ? error.message : undefined);
    } finally {
      setReviewing(null);
    }
  };

  if (platformAdmin) {
    return (
      <div>
        <PageHeader
          title="教师权限申请"
          description="教师职务权限由各学校管理员审核；平台超级管理员仅查看权限并指定学校管理员"
          icon={<ShieldCheck className="w-5 h-5" />}
        />
        <Card className="p-6 text-sm text-ink-600">
          请在“学校管理权限”中查看各校教师现有权限或指定学校管理员。平台超级管理员不能修改教师职务权限。
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="教师权限申请"
        description={schoolAdmin ? "申请本人职务权限，并审核本校教师提交的权限申请" : "申请新的校内职务权限，由本校管理员审核"}
        icon={<ShieldCheck className="w-5 h-5" />}
      />

      <Card className="mb-6 p-6 space-y-5">
        <div>
          <h2 className="font-serif text-lg font-semibold text-ink-900">申请职务权限</h2>
          <p className="mt-1 text-sm text-ink-500">当前已有：{currentRoles.map((role) => roleLabels[role]).join("、") || "教师"}</p>
        </div>
        {availableRoles.length === 0 ? (
          <p className="text-sm text-ink-500">当前已拥有全部可申请的教师职务权限。</p>
        ) : (
          <>
            <fieldset>
              <legend className="mb-2 text-sm font-medium text-ink-700">需要申请的权限</legend>
              <div className="flex flex-wrap gap-2">
                {availableRoles.map((role) => (
                  <label key={role} className="inline-flex items-center gap-2 rounded-md border border-ink-200 px-3 py-2 text-sm">
                    <input type="checkbox" checked={requestedRoles.includes(role)} onChange={() => toggleRole(role)} />
                    {roleLabels[role]}
                  </label>
                ))}
              </div>
            </fieldset>
            <Textarea
              label="申请说明"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="说明申请该职务权限的原因"
            />
            <Button variant="gold" loading={submitting} onClick={submit}>提交权限申请</Button>
          </>
        )}
      </Card>

      {loading ? (
        <Card className="py-12 flex items-center justify-center gap-2 text-sm text-ink-500"><Spinner />加载申请中...</Card>
      ) : (
        <>
          <section className="mb-6">
            <div className="mb-3 flex items-center gap-2">
              <Clock3 className="h-4 w-4 text-ink-500" />
              <h2 className="font-serif font-semibold text-ink-900">我的申请</h2>
            </div>
            {mine.length === 0 ? (
              <Card><EmptyState icon={<Clock3 className="w-7 h-7" />} title="暂无权限申请记录" /></Card>
            ) : (
              <div className="space-y-3">
                {mine.map((item) => (
                  <Card key={item.id} className="p-5">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap gap-2">
                          {item.requestedRoles.map((role) => <Badge key={role} variant="teal">{roleLabels[role]}</Badge>)}
                        </div>
                        <p className="mt-2 text-sm text-ink-600">{item.reason}</p>
                        <p className="mt-1 text-xs text-ink-400">{new Date(item.createdAt).toLocaleString("zh-CN")}</p>
                      </div>
                      <Badge variant={item.status === "approved" ? "teal" : item.status === "rejected" ? "red" : "gold"}>{statusLabel[item.status]}</Badge>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </section>

          {schoolAdmin && (
            <section>
              <div className="mb-3 flex items-center gap-2">
                <UserCheck className="h-4 w-4 text-ink-500" />
                <h2 className="font-serif font-semibold text-ink-900">本校待审核申请</h2>
              </div>
              {pending.length === 0 ? (
                <Card><EmptyState icon={<UserCheck className="w-7 h-7" />} title="暂无待审核权限申请" /></Card>
              ) : (
                <div className="space-y-3">
                  {pending.map((item) => (
                    <Card key={item.id} className="p-5">
                      <div className="flex flex-col gap-4 md:flex-row md:items-center">
                        <div className="flex-1">
                          <div className="font-medium text-ink-900">{item.teacherName}</div>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {item.requestedRoles.map((role) => <Badge key={role} variant="teal">{roleLabels[role]}</Badge>)}
                          </div>
                          <p className="mt-2 text-sm text-ink-600">{item.reason}</p>
                        </div>
                        <div className="flex gap-2">
                          <Button variant="outline" disabled={reviewing !== null} loading={reviewing === item.id} onClick={() => review(item.id, false)}>拒绝</Button>
                          <Button variant="gold" disabled={reviewing !== null} loading={reviewing === item.id} onClick={() => review(item.id, true)}>通过</Button>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}
