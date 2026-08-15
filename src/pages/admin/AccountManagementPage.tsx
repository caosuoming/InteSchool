import { useCallback, useEffect, useMemo, useState } from "react";
import { Building2, Copy, Gauge, KeyRound, ShieldCheck, UserCog, Users } from "lucide-react";
import { Badge, Button, Card, EmptyState, Input, Modal, Select } from "@/components/ui";
import { PageHeader } from "@/components/layout/PageHeader";
import { authService } from "@/services/auth";
import { organizationService, roleLabels } from "@/services/organization";
import { schoolService } from "@/services/school";
import { quotaService } from "@/services/quota";
import { useAuthStore } from "@/stores/auth";
import { toast } from "@/stores/ui";
import type {
  ExamUsageQuotaKey,
  ResourceQuotaKey,
  School,
  Teacher,
  TeacherAffiliation,
  UserQuotaOverrides,
  UserQuotaSnapshot,
} from "@/types";

const RESOURCE_QUOTA_FIELDS: Array<[ResourceQuotaKey, string]> = [
  ["question", "题库"],
  ["examPaper", "试卷库"],
  ["lecture", "讲义库"],
  ["courseware", "课件库"],
  ["material", "素材库"],
];

const EXAM_QUOTA_FIELDS: Array<[ExamUsageQuotaKey, string]> = [
  ["examRoom", "考场布置"],
  ["invigilation", "监考表"],
  ["gradeStatistics", "成绩统计"],
];

function affiliationFor(teacher: Teacher, schoolId: string): TeacherAffiliation | null {
  return teacher.affiliations.find((item) => item.schoolId === schoolId) || null;
}

function accountRoleLabel(role: TeacherAffiliation["role"]): string {
  if (role === "platform_admin") return "平台管理员";
  if (role === "school_admin") return "学校管理员";
  return "普通成员";
}

function accountRoleVariant(role: TeacherAffiliation["role"]): "red" | "gold" | "ink" {
  if (role === "platform_admin") return "red";
  if (role === "school_admin") return "gold";
  return "ink";
}

export default function AccountManagementPage() {
  const { teacher: current, getCurrentAffiliation } = useAuthStore();
  const currentAffiliation = getCurrentAffiliation();
  const activeRole = currentAffiliation?.role || current?.role;
  const isPlatformAdmin = activeRole === "platform_admin";
  const currentSchoolId = currentAffiliation?.schoolId || current?.schoolId || "";

  const [schools, setSchools] = useState<School[]>([]);
  const [selectedSchoolId, setSelectedSchoolId] = useState(currentSchoolId);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [loading, setLoading] = useState(true);
  const [roleSavingId, setRoleSavingId] = useState<string | null>(null);
  const [resetTarget, setResetTarget] = useState<Teacher | null>(null);
  const [customPassword, setCustomPassword] = useState("");
  const [issuedPassword, setIssuedPassword] = useState("");
  const [resetting, setResetting] = useState(false);
  const [quotaTarget, setQuotaTarget] = useState<Teacher | null>(null);
  const [quotaSnapshot, setQuotaSnapshot] = useState<UserQuotaSnapshot | null>(null);
  const [quotaDraft, setQuotaDraft] = useState<UserQuotaOverrides>({});
  const [quotaLoading, setQuotaLoading] = useState(false);
  const [quotaSaving, setQuotaSaving] = useState(false);

  const schoolId = isPlatformAdmin ? selectedSchoolId : currentSchoolId;

  useEffect(() => {
    if (!isPlatformAdmin) return;
    let cancelled = false;
    void schoolService.listSchools().then((items) => {
      if (cancelled) return;
      setSchools(items);
      setSelectedSchoolId((value) => items.some((item) => item.id === value)
        ? value
        : items[0]?.id || "");
    }).catch((error) => {
      if (!cancelled) toast.error("学校列表加载失败", error instanceof Error ? error.message : undefined);
    });
    return () => { cancelled = true; };
  }, [isPlatformAdmin]);

  const loadTeachers = useCallback(async () => {
    if (!schoolId) {
      setTeachers([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      setTeachers(await organizationService.listTeachers(schoolId));
    } catch (error) {
      toast.error("用户列表加载失败", error instanceof Error ? error.message : undefined);
    } finally {
      setLoading(false);
    }
  }, [schoolId]);

  useEffect(() => { void loadTeachers(); }, [loadTeachers]);

  const sortedTeachers = useMemo(() => [...teachers].sort((left, right) => {
    const leftRole = affiliationFor(left, schoolId)?.role || "teacher";
    const rightRole = affiliationFor(right, schoolId)?.role || "teacher";
    const rank = { platform_admin: 0, school_admin: 1, teacher: 2 } as const;
    return rank[leftRole] - rank[rightRole] || left.name.localeCompare(right.name, "zh-CN");
  }), [schoolId, teachers]);

  const adminCount = useMemo(() => teachers.filter((teacher) => {
    const role = affiliationFor(teacher, schoolId)?.role;
    return role === "school_admin" || role === "platform_admin";
  }).length, [schoolId, teachers]);

  const selectedSchoolName = isPlatformAdmin
    ? schools.find((school) => school.id === schoolId)?.name || "所选学校"
    : currentAffiliation?.schoolName || "本校";

  const setSchoolAdmin = async (target: Teacher, nextRole: "teacher" | "school_admin") => {
    if (!schoolId) return;
    setRoleSavingId(target.id);
    try {
      await organizationService.setTeacherSchoolRole(target.id, schoolId, nextRole);
      toast.success(nextRole === "school_admin" ? "已设为学校管理员" : "已取消学校管理员身份");
      await loadTeachers();
    } catch (error) {
      toast.error("权限更新失败", error instanceof Error ? error.message : undefined);
    } finally {
      setRoleSavingId(null);
    }
  };

  const openReset = (target: Teacher) => {
    setResetTarget(target);
    setCustomPassword("");
    setIssuedPassword("");
  };

  const closeReset = () => {
    if (resetting) return;
    setResetTarget(null);
    setCustomPassword("");
    setIssuedPassword("");
  };

  const resetPassword = async (random: boolean) => {
    if (!resetTarget) return;
    const password = customPassword.trim();
    if (!random && password.length < 10) {
      toast.error("新密码至少需要 10 位");
      return;
    }
    setResetting(true);
    try {
      const result = await authService.resetTeacherPassword(resetTarget.id, random ? undefined : password);
      setIssuedPassword(result.password);
      toast.success("登录密码已重置");
    } catch (error) {
      toast.error("密码重置失败", error instanceof Error ? error.message : undefined);
    } finally {
      setResetting(false);
    }
  };

  const copyPassword = async () => {
    if (!issuedPassword) return;
    try {
      await navigator.clipboard.writeText(issuedPassword);
      toast.success("临时密码已复制");
    } catch {
      toast.error("复制失败，请手动复制密码");
    }
  };

  const openQuota = async (target: Teacher) => {
    setQuotaTarget(target);
    setQuotaSnapshot(null);
    setQuotaLoading(true);
    try {
      const snapshot = await quotaService.getQuota(target.id);
      setQuotaSnapshot(snapshot);
      setQuotaDraft({
        resourceBaseCapacities: Object.fromEntries(
          RESOURCE_QUOTA_FIELDS.map(([key]) => [key, snapshot.resources[key].baseCapacity]),
        ),
        examRemainingUses: Object.fromEntries(
          EXAM_QUOTA_FIELDS.map(([key]) => [key, snapshot.exam[key].remaining]),
        ),
      });
    } catch (error) {
      toast.error("使用量加载失败", error instanceof Error ? error.message : undefined);
      setQuotaTarget(null);
    } finally {
      setQuotaLoading(false);
    }
  };

  const saveQuota = async () => {
    if (!quotaTarget) return;
    setQuotaSaving(true);
    try {
      const snapshot = await quotaService.updateQuota(quotaTarget.id, quotaDraft);
      setQuotaSnapshot(snapshot);
      toast.success("用户使用量已更新");
      setQuotaTarget(null);
    } catch (error) {
      toast.error("使用量更新失败", error instanceof Error ? error.message : undefined);
    } finally {
      setQuotaSaving(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="用户与密码管理"
        description={isPlatformAdmin
          ? "按学校查看用户权限、指定学校管理员并重置登录密码"
          : "查看本校用户权限并为本校教师重置登录密码"}
        icon={<KeyRound className="w-5 h-5" />}
      />

      <Card className="mb-5 p-5">
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto_auto] md:items-end">
          <div>
            {isPlatformAdmin ? (
              <Select
                label="学校"
                value={schoolId}
                onChange={(event) => setSelectedSchoolId(event.target.value)}
                options={schools.map((school) => ({ value: school.id, label: `${school.name} · ${school.city}` }))}
              />
            ) : (
              <div>
                <div className="mb-1.5 text-sm font-medium text-ink-700">管理范围</div>
                <div className="flex items-center gap-2 rounded-lg border border-ink-200 bg-white px-3 py-2.5 text-sm text-ink-800">
                  <Building2 className="h-4 w-4 text-gold-600" />
                  {selectedSchoolName}
                </div>
              </div>
            )}
          </div>
          <div className="rounded-lg border border-ink-100 bg-ink-50 px-4 py-2.5 text-sm text-ink-600">
            用户 <strong className="ml-1 text-ink-900">{teachers.length}</strong>
          </div>
          <div className="rounded-lg border border-gold-100 bg-gold-50 px-4 py-2.5 text-sm text-gold-800">
            管理员 <strong className="ml-1">{adminCount}</strong>
          </div>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-ink-100 px-5 py-4">
          <div>
            <h2 className="font-serif font-semibold text-ink-900">{selectedSchoolName}用户</h2>
            <p className="mt-1 text-xs text-ink-500">账号权限与校内职务权限分开显示；密码重置会注销该用户的全部现有登录会话。</p>
          </div>
          <Users className="h-5 w-5 text-ink-400" />
        </div>

        {loading ? (
          <div className="py-16 text-center text-sm text-ink-400">加载中...</div>
        ) : sortedTeachers.length === 0 ? (
          <EmptyState icon={<Users className="h-7 w-7" />} title="该学校暂无已加入用户" />
        ) : (
          <div className="divide-y divide-ink-100">
            {sortedTeachers.map((teacher) => {
              const affiliation = affiliationFor(teacher, schoolId);
              if (!affiliation) return null;
              const isSelf = teacher.id === current?.id;
              const isPlatformTarget = affiliation.role === "platform_admin";
              const canReset = !isSelf && (isPlatformAdmin || !isPlatformTarget);
              const canChangeSchoolRole = isPlatformAdmin && !isPlatformTarget;
              const directRoles = affiliation.assignedRoles?.length ? affiliation.assignedRoles : affiliation.roles;

              return (
                <div key={teacher.id} className="px-5 py-4">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-ink-900">{teacher.name}</span>
                        {isSelf && <Badge variant="teal">当前账号</Badge>}
                        <Badge variant={accountRoleVariant(affiliation.role)}>{accountRoleLabel(affiliation.role)}</Badge>
                      </div>
                      <div className="mt-1 truncate text-sm text-ink-500">
                        {teacher.email || "未绑定邮箱"} · {affiliation.subject || teacher.subject || "未设置学科"}
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <span className="mr-1 text-xs text-ink-400">职务权限</span>
                        {directRoles.length > 0
                          ? directRoles.map((role) => <Badge key={role} variant={role === "teacher" ? "ink" : "teal"}>{roleLabels[role]}</Badge>)
                          : <span className="text-xs text-ink-400">无</span>}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                      {canChangeSchoolRole && (
                        <Button
                          type="button"
                          variant="outline"
                          loading={roleSavingId === teacher.id}
                          onClick={() => void setSchoolAdmin(teacher, affiliation.role === "school_admin" ? "teacher" : "school_admin")}
                        >
                          <UserCog className="h-4 w-4" />
                          {affiliation.role === "school_admin" ? "取消校管理员" : "设为校管理员"}
                        </Button>
                      )}
                      {canReset && (
                        <Button type="button" variant="gold" onClick={() => openReset(teacher)}>
                          <KeyRound className="h-4 w-4" />重置密码
                        </Button>
                      )}
                      {isPlatformAdmin && (
                        <Button type="button" variant="outline" onClick={() => void openQuota(teacher)}>
                          <Gauge className="h-4 w-4" />使用量
                        </Button>
                      )}
                      {!canReset && isPlatformTarget && !isPlatformAdmin && (
                        <span className="text-xs text-ink-400">平台管理员密码仅可由平台管理员处理</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Modal
        open={Boolean(resetTarget)}
        onClose={closeReset}
        title={issuedPassword ? "密码已重置" : `重置 ${resetTarget?.name || "教师"} 的登录密码`}
        description={issuedPassword
          ? "旧密码已失效，该用户的全部现有登录会话也已注销。"
          : "可随机生成安全临时密码，也可以指定不少于 10 位的新密码。"}
        size="sm"
        footer={issuedPassword ? (
          <Button type="button" variant="gold" onClick={closeReset}>完成</Button>
        ) : (
          <>
            <Button type="button" variant="ghost" disabled={resetting} onClick={closeReset}>取消</Button>
            <Button type="button" variant="outline" loading={resetting} onClick={() => void resetPassword(true)}>随机重置</Button>
            <Button type="button" variant="gold" loading={resetting} disabled={customPassword.trim().length < 10} onClick={() => void resetPassword(false)}>使用此密码</Button>
          </>
        )}
      >
        {issuedPassword ? (
          <div className="space-y-3">
            <div className="text-sm text-ink-600">请将以下临时密码安全地交给 {resetTarget?.name}。服务器不会保存可读取的明文密码。</div>
            <div className="flex items-center gap-2 rounded-lg border border-gold-200 bg-gold-50 p-3">
              <code className="min-w-0 flex-1 select-all break-all text-sm font-semibold text-ink-900">{issuedPassword}</code>
              <Button type="button" variant="ghost" size="icon" onClick={() => void copyPassword()} aria-label="复制临时密码" title="复制临时密码">
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              <ShieldCheck className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <span>重置后该用户需要使用新密码重新登录。此操作不会修改其学校、学科或职务权限。</span>
            </div>
            <Input
              label="自定义新密码"
              type="text"
              autoComplete="new-password"
              value={customPassword}
              onChange={(event) => setCustomPassword(event.target.value)}
              placeholder="留空可使用随机重置"
              hint="至少 10 位；如无指定需求，建议直接使用随机重置。"
            />
          </div>
        )}
      </Modal>

      <Modal
        open={Boolean(quotaTarget)}
        onClose={() => !quotaSaving && setQuotaTarget(null)}
        title={`设置 ${quotaTarget?.name || "用户"} 的使用量`}
        description="资源库填写基础容量；有效捐赠产生的扩容会在基础容量上继续叠加。考试功能填写当前剩余可使用次数。"
        size="lg"
        footer={(
          <>
            <Button type="button" variant="ghost" disabled={quotaSaving} onClick={() => setQuotaTarget(null)}>取消</Button>
            <Button type="button" variant="gold" loading={quotaSaving} disabled={quotaLoading || !quotaSnapshot} onClick={() => void saveQuota()}>保存使用量</Button>
          </>
        )}
      >
        {quotaLoading || !quotaSnapshot ? (
          <div className="py-10 text-center text-sm text-ink-400">加载中...</div>
        ) : (
          <div className="space-y-6">
            <section>
              <div className="mb-3">
                <h3 className="font-medium text-ink-900">个人资源库基础容量</h3>
                <p className="mt-1 text-xs text-ink-500">每个有效捐赠额外增加 10 道题或 10 份对应资源；有效捐赠需保留在平台且至少被 5 个其他用户创建过副本。</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {RESOURCE_QUOTA_FIELDS.map(([key, label]) => {
                  const status = quotaSnapshot.resources[key];
                  return (
                    <Input
                      key={key}
                      label={`${label}基础容量`}
                      type="number"
                      min={0}
                      step={1}
                      value={quotaDraft.resourceBaseCapacities?.[key] ?? 0}
                      onChange={(event) => setQuotaDraft((current) => ({
                        ...current,
                        resourceBaseCapacities: {
                          ...(current.resourceBaseCapacities || {}),
                          [key]: Math.max(0, Math.trunc(Number(event.target.value) || 0)),
                        },
                      }))}
                      hint={`已用 ${status.used}；有效捐赠 ${status.effectiveDonations}，扩容 +${status.donationBonus}；当前总容量 ${status.capacity}`}
                    />
                  );
                })}
              </div>
            </section>
            <section className="border-t border-ink-100 pt-5">
              <div className="mb-3">
                <h3 className="font-medium text-ink-900">我的考试剩余次数</h3>
                <p className="mt-1 text-xs text-ink-500">考场布置、监考表和成绩统计默认各 50 次；每次导出或发布扣减 1 次。</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                {EXAM_QUOTA_FIELDS.map(([key, label]) => (
                  <Input
                    key={key}
                    label={`${label}剩余次数`}
                    type="number"
                    min={0}
                    step={1}
                    value={quotaDraft.examRemainingUses?.[key] ?? 0}
                    onChange={(event) => setQuotaDraft((current) => ({
                      ...current,
                      examRemainingUses: {
                        ...(current.examRemainingUses || {}),
                        [key]: Math.max(0, Math.trunc(Number(event.target.value) || 0)),
                      },
                    }))}
                  />
                ))}
              </div>
            </section>
          </div>
        )}
      </Modal>
    </div>
  );
}
