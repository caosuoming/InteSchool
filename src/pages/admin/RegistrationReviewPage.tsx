import { useCallback, useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router";
import { ShieldCheck, UserCheck } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge, Button, Card, EmptyState, Input, Select, Spinner } from "@/components/ui";
import { authService } from "@/services/auth";
import { schoolService } from "@/services/school";
import { roleLabels } from "@/services/organization";
import { toast } from "@/stores/ui";
import { useAuthStore } from "@/stores/auth";
import { isPlatformAdminAccount } from "@/lib/platform-admin";
import type {
  PlatformAccessSettings,
  School,
  SchoolAdminApplication,
  SchoolApplication,
  SchoolCreationApplication,
  TeacherRoleApplication,
} from "@/types";

const DEFAULT_SETTINGS: PlatformAccessSettings = {
  registrationMode: "open",
  schoolCreationMode: "review",
};

export default function RegistrationReviewPage() {
  const teacher = useAuthStore((state) => state.teacher);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [schools, setSchools] = useState<School[]>([]);
  const [schoolId, setSchoolId] = useState("");
  const [phone, setPhone] = useState("");
  const [membershipApplications, setMembershipApplications] = useState<SchoolApplication[]>([]);
  const [roleApplications, setRoleApplications] = useState<TeacherRoleApplication[]>([]);
  const [adminApplications, setAdminApplications] = useState<SchoolAdminApplication[]>([]);
  const [schoolApplications, setSchoolApplications] = useState<SchoolCreationApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [authorizing, setAuthorizing] = useState(false);
  const [reviewing, setReviewing] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [nextSettings, nextSchools, memberships, roles, admins, creations] = await Promise.all([
        authService.getAccessSettings(),
        schoolService.listSchools(),
        authService.getPendingApplications(""),
        authService.getPendingTeacherRoleApplications(),
        authService.getPendingSchoolAdminApplications(),
        schoolService.listPendingSchoolCreationApplications(),
      ]);
      setSettings(nextSettings);
      setSchools(nextSchools);
      setSchoolId((current) => nextSchools.some((school) => school.id === current)
        ? current
        : nextSchools.find((school) => !school.accountsDisabled)?.id || "");
      setMembershipApplications(memberships);
      setRoleApplications(roles);
      setAdminApplications(admins);
      setSchoolApplications(creations);
    } catch (error) {
      toast.error("审核数据加载失败", error instanceof Error ? error.message : undefined);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const saveSettings = async () => {
    setSavingSettings(true);
    try {
      setSettings(await authService.updateAccessSettings(settings));
      toast.success("平台注册策略已保存");
    } catch (error) {
      toast.error("保存失败", error instanceof Error ? error.message : undefined);
    } finally {
      setSavingSettings(false);
    }
  };

  const authorizePhone = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!schoolId) return;
    setAuthorizing(true);
    try {
      await authService.createRegistrationAuthorization(phone, "admin", schoolId);
      setPhone("");
      toast.success("已添加平台注册授权");
    } catch (error) {
      toast.error("授权失败", error instanceof Error ? error.message : undefined);
    } finally {
      setAuthorizing(false);
    }
  };

  const runReview = async (id: string, approved: boolean, action: () => Promise<unknown>) => {
    setReviewing(id);
    try {
      await action();
      toast.success(approved ? "已通过" : "已拒绝");
      await load();
    } catch (error) {
      toast.error("审核失败", error instanceof Error ? error.message : undefined);
    } finally {
      setReviewing(null);
    }
  };

  const totalPending = membershipApplications.length + roleApplications.length
    + adminApplications.length + schoolApplications.length;
  const activeSchools = useMemo(() => schools.filter((school) => !school.accountsDisabled), [schools]);

  if (!isPlatformAdminAccount(teacher)) return <Navigate to="/admin" replace />;

  return (
    <div>
      <PageHeader
        title="新用户和新建校审核"
        description="统一配置平台注册准入、新建学校策略，并处理新用户相关权限与学校申请"
        icon={<ShieldCheck className="h-5 w-5" />}
      />

      <div className="space-y-6">
        <Card className="p-5">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <h2 className="font-serif font-semibold text-ink-900">平台注册策略</h2>
              <p className="mt-1 text-xs text-ink-500">策略即时影响之后的新注册；个人身份注册始终可用。</p>
            </div>
            <Button variant="gold" loading={savingSettings} onClick={() => void saveSettings()}>保存策略</Button>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <Select
              label="加入已有学校"
              value={settings.registrationMode}
              onChange={(event) => setSettings((current) => ({
                ...current,
                registrationMode: event.target.value as PlatformAccessSettings["registrationMode"],
              }))}
              options={[
                { value: "open", label: "无需校验，直接加入" },
                { value: "authorized", label: "老用户担保或平台管理员授权" },
              ]}
            />
            <Select
              label="新建学校"
              value={settings.schoolCreationMode}
              onChange={(event) => setSettings((current) => ({
                ...current,
                schoolCreationMode: event.target.value as PlatformAccessSettings["schoolCreationMode"],
              }))}
              options={[
                { value: "open", label: "允许直接新建" },
                { value: "review", label: "需要平台管理员确认" },
              ]}
            />
          </div>
        </Card>

        <Card className="p-5">
          <div className="mb-4">
            <h2 className="font-serif font-semibold text-ink-900">平台管理员授权</h2>
            <p className="mt-1 text-xs text-ink-500">当加入已有学校采用授权模式时，可在这里为手机号指定允许加入的学校。</p>
          </div>
          <form className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] md:items-end" onSubmit={authorizePhone}>
            <Select
              label="授权学校"
              value={schoolId}
              onChange={(event) => setSchoolId(event.target.value)}
              options={activeSchools.map((school) => ({ value: school.id, label: `${school.name} · ${school.city}` }))}
            />
            <Input
              label="待注册手机号"
              type="tel"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              pattern="(?:[+]86)?1[3-9][0-9]{9}"
              required
            />
            <Button type="submit" variant="gold" loading={authorizing} disabled={!schoolId}>添加授权</Button>
          </form>
        </Card>

        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-serif text-lg font-semibold text-ink-900">待审核事项</h2>
            <p className="mt-1 text-xs text-ink-500">平台注册无需额外职务时不会产生审核事项。</p>
          </div>
          <Badge variant={totalPending ? "amber" : "green"}>待处理 {totalPending}</Badge>
        </div>

        {loading ? (
          <Card className="flex items-center justify-center gap-2 py-14 text-sm text-ink-500"><Spinner />加载中...</Card>
        ) : totalPending === 0 ? (
          <Card><EmptyState icon={<UserCheck className="h-7 w-7" />} title="暂无待审核事项" /></Card>
        ) : (
          <div className="space-y-4">
            {membershipApplications.map((item) => (
              <Card key={item.id} className="p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="ink">加入学校</Badge>
                      <strong className="text-ink-900">{item.teacherName || "未知用户"}</strong>
                      <span className="text-sm text-ink-500">→ {item.schoolName || item.schoolId}</span>
                    </div>
                    <p className="mt-2 text-xs text-ink-500">学科：{item.subject}；申请职务：{(item.roles || ["teacher"]).map((role) => roleLabels[role]).join("、")}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" loading={reviewing === item.id} disabled={reviewing !== null}
                      onClick={() => void runReview(item.id, false, () => authService.reviewApplication(item.id, false))}>拒绝</Button>
                    <Button variant="gold" loading={reviewing === item.id} disabled={reviewing !== null}
                      onClick={() => void runReview(item.id, true, () => authService.reviewApplication(item.id, true))}>通过</Button>
                  </div>
                </div>
              </Card>
            ))}

            {roleApplications.map((item) => (
              <Card key={item.id} className="p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="teal">职务权限</Badge>
                      <strong className="text-ink-900">{item.teacherName}</strong>
                      <span className="text-sm text-ink-500">· {item.schoolName}</span>
                    </div>
                    <p className="mt-2 text-xs text-ink-500">申请：{item.requestedRoles.map((role) => roleLabels[role]).join("、")}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" loading={reviewing === item.id} disabled={reviewing !== null}
                      onClick={() => void runReview(item.id, false, () => authService.reviewTeacherRoleApplication(item.id, false))}>拒绝</Button>
                    <Button variant="gold" loading={reviewing === item.id} disabled={reviewing !== null}
                      onClick={() => void runReview(item.id, true, () => authService.reviewTeacherRoleApplication(item.id, true))}>通过</Button>
                  </div>
                </div>
              </Card>
            ))}

            {adminApplications.map((item) => (
              <Card key={item.id} className="p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="gold">学校管理员</Badge>
                      <strong className="text-ink-900">{item.teacherName}</strong>
                      <span className="text-sm text-ink-500">· {item.schoolName}</span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" loading={reviewing === item.id} disabled={reviewing !== null}
                      onClick={() => void runReview(item.id, false, () => authService.reviewSchoolAdminApplication(item.id, false))}>拒绝</Button>
                    <Button variant="gold" loading={reviewing === item.id} disabled={reviewing !== null}
                      onClick={() => void runReview(item.id, true, () => authService.reviewSchoolAdminApplication(item.id, true))}>通过</Button>
                  </div>
                </div>
              </Card>
            ))}

            {schoolApplications.map((item) => (
              <Card key={item.id} className="p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="amber">新建学校</Badge>
                      <strong className="text-ink-900">{item.name}</strong>
                      <span className="text-sm text-ink-500">· {item.city} · {item.code}</span>
                    </div>
                    <p className="mt-2 text-xs text-ink-500">申请人：{item.requesterName}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" loading={reviewing === item.id} disabled={reviewing !== null}
                      onClick={() => void runReview(item.id, false, () => schoolService.reviewSchoolCreationApplication(item.id, false))}>拒绝</Button>
                    <Button variant="gold" loading={reviewing === item.id} disabled={reviewing !== null}
                      onClick={() => void runReview(item.id, true, () => schoolService.reviewSchoolCreationApplication(item.id, true))}>通过并创建</Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
