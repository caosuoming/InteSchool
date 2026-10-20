import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { Clock3, ShieldCheck, UserCheck } from "lucide-react";
import { Badge, Button, Card, EmptyState, Input, Spinner, Textarea } from "@/components/ui";
import { PageHeader } from "@/components/layout/PageHeader";
import TeacherProfilesPage from "./TeacherProfilesPage";
import { isPlatformAdminAccount } from "@/lib/platform-admin";
import { TEACHER_ROLES } from "@/lib/teacher-roles";
import { SUBJECT_OPTIONS } from "@/lib/education";
import { authService } from "@/services/auth";
import { classService } from "@/services/class";
import { roleLabels } from "@/services/organization";
import { useAuthStore } from "@/stores/auth";
import { toast } from "@/stores/ui";
import type {
  SchoolClass, TeacherPermissionApplication, TeacherPermissionFields, TeacherRole, TeacherRoleApplication,
} from "@/types";

const statusLabel = { pending: "待审核", approved: "已通过", rejected: "未通过" };

function classLabel(classes: SchoolClass[], id: string): string {
  const item = classes.find((schoolClass) => schoolClass.id === id);
  return item ? `${item.grade} · ${item.name}` : `已移除的班级（${id}）`;
}

function roleNames(roles: TeacherRole[]): string {
  return roles.map((role) => roleLabels[role]).join("、") || "教师";
}

function changeSelection<T extends string>(items: T[], value: T): T[] {
  return items.includes(value) ? items.filter((item) => item !== value) : [...items, value];
}

function PermissionEditor({
  fields, onChange, classes, disabled = false,
}: {
  fields: TeacherPermissionFields;
  onChange: (next: TeacherPermissionFields) => void;
  classes: SchoolClass[];
  disabled?: boolean;
}) {
  const set = <K extends keyof TeacherPermissionFields>(key: K, value: TeacherPermissionFields[K]) =>
    onChange({ ...fields, [key]: value });

  return (
    <div className="space-y-5">
      <fieldset disabled={disabled}>
        <legend className="mb-2 font-medium text-ink-700 text-sm">任教学科</legend>
        <div className="flex flex-wrap gap-2">
          {SUBJECT_OPTIONS.map((subject) => (
            <label key={subject} className="flex items-center gap-2 rounded-md border border-ink-200 px-3 py-2 text-sm">
              <input type="checkbox" checked={(fields.subjects || []).includes(subject)}
                onChange={() => {
                  const next = changeSelection(fields.subjects || [], subject);
                  if (next.length) set("subjects", next);
                }} />
              {subject}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset disabled={disabled}>
        <legend className="mb-2 font-medium text-ink-700 text-sm">行政职务与角色</legend>
        <div className="flex flex-wrap gap-2">
          {TEACHER_ROLES.filter((role) => role !== "teacher").map((role) => (
            <label key={role} className="inline-flex items-center gap-2 rounded-md border border-ink-200 px-3 py-2 text-sm">
              <input type="checkbox" checked={fields.roles.includes(role)}
                onChange={() => set("roles", changeSelection(fields.roles, role))} />
              {roleLabels[role]}
            </label>
          ))}
        </div>
      </fieldset>
      <Input label="行政职务名称（选填）" value={fields.position}
        onChange={(event) => set("position", event.target.value)}
        disabled={disabled} placeholder="例如：教研组负责人" maxLength={50} />
      {([
        ["teachingClassIds", "任课班级"],
        ["homeroomClassIds", "班主任班级"],
      ] as const).map(([key, label]) => (
        <fieldset key={key} disabled={disabled}>
          <legend className="mb-2 font-medium text-ink-700 text-sm">{label}</legend>
          {classes.length === 0 ? (
            <p className="text-sm text-ink-500">本校暂无可选班级</p>
          ) : (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {classes.map((schoolClass) => (
                <label key={schoolClass.id} className="flex items-center gap-2 rounded-md border border-ink-200 px-3 py-2 text-sm">
                  <input type="checkbox" checked={fields[key].includes(schoolClass.id)}
                    onChange={() => set(key, changeSelection(fields[key], schoolClass.id))} />
                  {classLabel(classes, schoolClass.id)}
                </label>
              ))}
            </div>
          )}
          {fields[key].filter((id) => !classes.some((schoolClass) => schoolClass.id === id)).map((id) => (
            <label key={id} className="mt-2 flex items-center gap-2 text-sm text-red-700">
              <input type="checkbox" checked onChange={() => set(key, fields[key].filter((item) => item !== id))} />
              {classLabel(classes, id)}（请取消后提交）
            </label>
          ))}
        </fieldset>
      ))}
      {fields.homeroomClassIds.length > 0 && !fields.roles.includes("headTeacher") && (
        <p className="text-xs text-ink-500">指定班主任班级后，审核通过时会自动授予班主任角色。</p>
      )}
    </div>
  );
}

function PermissionSummary({ fields, classes }: { fields: TeacherPermissionFields; classes: SchoolClass[] }) {
  return (
    <div className="space-y-1 text-sm text-ink-600">
      <p>任教学科：{(fields.subjects || []).join("、") || "未设置"}</p>
      <p>职务权限：{roleNames(fields.roles)}</p>
      <p>行政职务：{fields.position || "未设置"}</p>
      <p>任课班级：{fields.teachingClassIds.map((id) => classLabel(classes, id)).join("、") || "无"}</p>
      <p>班主任班级：{fields.homeroomClassIds.map((id) => classLabel(classes, id)).join("、") || "无"}</p>
    </div>
  );
}

function applicationFields(item: TeacherPermissionApplication): TeacherPermissionFields {
  return {
    roles: item.requestedRoles,
    subjects: item.requestedSubjects || item.previous?.subjects,
    teachingClassIds: item.requestedTeachingClassIds,
    homeroomClassIds: item.requestedHomeroomClassIds,
    position: item.requestedPosition,
  };
}

export default function PermissionApplicationsPage() {
  const { teacher, getCurrentAffiliation, refresh } = useAuthStore();
  const affiliation = getCurrentAffiliation();
  const schoolId = affiliation?.schoolId || null;
  const platformAdmin = isPlatformAdminAccount(teacher);
  const schoolAdmin = affiliation?.role === "school_admin" && !platformAdmin;
  const location = useLocation();
  const navigate = useNavigate();
  const view = schoolAdmin && (location.hash === "#review" || location.hash === "#pending")
    ? "review" : schoolAdmin && location.hash === "#management" ? "management" : "applications";
  const switchView = (next: "applications" | "review" | "management") => {
    void navigate({ pathname: location.pathname, search: location.search,
      hash: next === "applications" ? "" : `#${next}` });
  };
  const current = useMemo<TeacherPermissionFields>(() => ({
    roles: affiliation?.assignedRoles?.length ? affiliation.assignedRoles : affiliation?.roles || ["teacher"],
    subjects: affiliation?.subjects?.length ? affiliation.subjects : [affiliation?.subject || teacher?.subject || "数学"],
    teachingClassIds: affiliation?.teachingClassIds || [],
    homeroomClassIds: affiliation?.homeroomClassIds || [],
    position: affiliation?.position || "",
  }), [affiliation, teacher?.subject]);
  const [draft, setDraft] = useState<TeacherPermissionFields>(current);
  const [reason, setReason] = useState("");
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [mine, setMine] = useState<TeacherPermissionApplication[]>([]);
  const [pending, setPending] = useState<TeacherPermissionApplication[]>([]);
  const [legacyMine, setLegacyMine] = useState<TeacherRoleApplication[]>([]);
  const [legacyPending, setLegacyPending] = useState<TeacherRoleApplication[]>([]);
  const [reviewDrafts, setReviewDrafts] = useState<Record<string, TeacherPermissionFields>>({});
  const [legacyReviewDrafts, setLegacyReviewDrafts] = useState<Record<string, TeacherRole[]>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [reviewing, setReviewing] = useState<string | null>(null);

  useEffect(() => { setDraft(current); }, [current]);

  const load = useCallback(async () => {
    if (!teacher || !schoolId || platformAdmin) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [classList, own, pendingList, previousMine, previousPending] = await Promise.all([
        classService.listSchoolClasses(schoolId),
        authService.getMyTeacherPermissionApplications(),
        schoolAdmin ? authService.getPendingTeacherPermissionApplications() : Promise.resolve([]),
        authService.getMyTeacherRoleApplications(),
        schoolAdmin ? authService.getPendingTeacherRoleApplications() : Promise.resolve([]),
      ]);
      setClasses(classList);
      setMine(own);
      setPending(pendingList);
      setLegacyMine(previousMine);
      setLegacyPending(previousPending);
      setReviewDrafts((old) => Object.fromEntries(pendingList.map((item) => [
        item.id, old[item.id] || applicationFields(item),
      ])));
      setLegacyReviewDrafts((old) => Object.fromEntries(previousPending.map((item) => [
        item.id, old[item.id] || item.requestedRoles.filter((role) => role !== "teacher"),
      ])));
    } catch (error) {
      toast.error("权限申请加载失败", error instanceof Error ? error.message : undefined);
    } finally {
      setLoading(false);
    }
  }, [teacher, schoolId, schoolAdmin, platformAdmin]);

  useEffect(() => { void load(); }, [load]);

  const submit = async () => {
    if (reason.trim().length < 5) {
      toast.error("请填写至少 5 个字的申请说明");
      return;
    }
    setSubmitting(true);
    try {
      await authService.applyTeacherPermissions(draft, reason);
      setReason("");
      toast.success("权限调整申请已提交");
      await load();
    } catch (error) {
      toast.error("提交申请失败", error instanceof Error ? error.message : undefined);
    } finally {
      setSubmitting(false);
    }
  };

  const review = async (id: string, approved: boolean, legacy = false) => {
    if (reviewing !== null) return;
    setReviewing(id);
    try {
      if (legacy) {
        const approvedRoles = legacyReviewDrafts[id] || [];
        if (approved && approvedRoles.length === 0) {
          toast.error("请至少选择一项拟批准的职务权限，或拒绝该申请");
          return;
        }
        await authService.reviewTeacherRoleApplication(id, approved, approved ? approvedRoles : undefined);
      } else {
        await authService.reviewTeacherPermissionApplication(id, approved, approved ? reviewDrafts[id] : undefined);
      }
      toast.success(approved ? "权限申请已通过" : "权限申请已拒绝");
      await Promise.all([load(), refresh()]);
    } catch (error) {
      toast.error("审核失败", error instanceof Error ? error.message : undefined);
    } finally {
      setReviewing(null);
    }
  };

  if (!schoolId || platformAdmin) {
    return (
      <div>
        <PageHeader title="我的权限申请" description="学校身份的权限由所属学校管理员审核" icon={<ShieldCheck className="h-5 w-5" />} />
        <Card className="p-6 text-sm text-ink-600">
          {platformAdmin ? "平台管理员不通过校内权限申请调整职务。" : "请先切换到已加入的学校身份。"}
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title={view === "review" ? "本校教师权限审核" : view === "management" ? "本校教师权限管理" : "我的权限申请"}
        description={view === "review" ? "审核本校教师的权限申请，可拒绝、通过或调整后通过" : view === "management" ? "管理本校教师职务与任教权限" : "查看个人权限并申请调整，提交后由本校管理员审核"}
        icon={<ShieldCheck className="h-5 w-5" />} />
      {schoolAdmin && <nav aria-label="教师权限申请与管理" className="mb-6 flex flex-wrap gap-2">
        <Button variant={view === "applications" ? "gold" : "outline"} onClick={() => switchView("applications")}>我的权限申请</Button>
        <Button variant={view === "review" ? "gold" : "outline"} onClick={() => switchView("review")}>本校教师权限审核</Button>
        <Button variant={view === "management" ? "gold" : "outline"} onClick={() => switchView("management")}>本校教师权限管理</Button>
      </nav>}
      {schoolAdmin && view === "management" && <TeacherProfilesPage embedded />}
      {view === "applications" && <>
      <Card className="mb-6 space-y-4 p-6">
        <h2 className="font-serif text-lg font-semibold text-ink-900">当前权限 · {affiliation?.schoolName || "本校"}</h2>
        <PermissionSummary fields={{ ...current, roles: affiliation?.roles || current.roles }} classes={classes} />
      </Card>
      <Card className="mb-6 space-y-5 p-6">
        <div>
          <h2 className="font-serif text-lg font-semibold text-ink-900">申请权限调整</h2>
          <p className="mt-1 text-sm text-ink-500">选择希望调整后的完整权限组合，可新增或取消现有职务与班级。</p>
        </div>
        <PermissionEditor fields={draft} onChange={setDraft} classes={classes} disabled={submitting} />
        <Textarea label="申请说明" value={reason} onChange={(event) => setReason(event.target.value)}
          placeholder="说明需要调整权限的原因" maxLength={300} disabled={submitting} />
        <Button variant="gold" loading={submitting} onClick={submit}>提交权限申请</Button>
      </Card>

      {loading ? <Card className="flex items-center justify-center gap-2 py-12 text-sm text-ink-500"><Spinner />加载申请中...</Card> : (
        <>
          <section className="mb-6">
            <div className="mb-3 flex items-center gap-2">
              <Clock3 className="h-4 w-4 text-ink-500" />
              <h2 className="font-serif font-semibold text-ink-900">我的申请记录</h2>
            </div>
            {mine.length === 0 && legacyMine.length === 0 ? (
              <Card><EmptyState icon={<Clock3 className="h-7 w-7" />} title="暂无权限申请记录" /></Card>
            ) : <div className="space-y-3">
              {mine.map((item) => (
                <Card key={item.id} className="space-y-3 p-5">
                  <div className="flex justify-between gap-3">
                    <strong className="text-sm text-ink-800">权限调整申请</strong>
                    <Badge variant={item.status === "approved" ? "teal" : item.status === "rejected" ? "red" : "gold"}>{statusLabel[item.status]}</Badge>
                  </div>
                  <PermissionSummary fields={applicationFields(item)} classes={classes} />
                  <p className="text-sm text-ink-600">申请原因：{item.reason}</p>
                  {item.approvedPermissions && <>
                    <p className="text-sm font-medium text-ink-800">管理员实际批准的权限</p>
                    <PermissionSummary fields={item.approvedPermissions} classes={classes} />
                  </>}
                  <p className="text-xs text-ink-400">提交于 {new Date(item.createdAt).toLocaleString("zh-CN")}</p>
                </Card>
              ))}
              {legacyMine.map((item) => (
                <Card key={item.id} className="space-y-2 p-5">
                  <div className="flex justify-between gap-3">
                    <strong className="text-sm text-ink-800">历史职务申请</strong>
                    <Badge variant={item.status === "approved" ? "teal" : item.status === "rejected" ? "red" : "gold"}>{statusLabel[item.status]}</Badge>
                  </div>
                  <p className="text-sm text-ink-600">{roleNames(item.requestedRoles)} · {item.reason}</p>
                  {item.approvedRoles && <p className="text-sm text-ink-600">实际批准：{roleNames(item.approvedRoles)}</p>}
                </Card>
              ))}
            </div>}
          </section>
        </>
      )}
      </>}
      {schoolAdmin && view === "review" && (loading
        ? <Card className="flex items-center justify-center gap-2 py-12 text-sm text-ink-500"><Spinner />加载待审核申请中...</Card>
        : (
          <section aria-label="本校待审核权限申请">
            <div className="mb-3 flex items-center gap-2">
              <UserCheck className="h-4 w-4 text-ink-500" />
              <h2 className="font-serif font-semibold text-ink-900">本校待审核权限申请</h2>
            </div>
            {pending.length === 0 && legacyPending.length === 0 ? (
              <Card><EmptyState icon={<UserCheck className="h-7 w-7" />} title="暂无待审核申请" /></Card>
            ) : <div className="space-y-4">
              {pending.map((item) => (
                <Card key={item.id} className="space-y-4 p-6">
                  <div>
                    <h3 className="font-medium text-ink-900">{item.teacherName}</h3>
                    <p className="mt-1 text-sm text-ink-500">{item.reason}</p>
                    <p className="mt-1 text-xs text-ink-400">{new Date(item.createdAt).toLocaleString("zh-CN")}</p>
                  </div>
                  <div>
                    <h4 className="mb-2 text-sm font-medium text-ink-700">原有权限</h4>
                    <PermissionSummary fields={item.previous} classes={classes} />
                  </div>
                  <div className="rounded-lg border border-ink-200 p-4">
                    <h4 className="mb-3 text-sm font-medium text-ink-800">拟批准的权限（可由管理员调整）</h4>
                    <PermissionEditor fields={reviewDrafts[item.id] || applicationFields(item)}
                      onChange={(fields) => setReviewDrafts((old) => ({ ...old, [item.id]: fields }))}
                      classes={classes} disabled={reviewing !== null} />
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" disabled={reviewing !== null} loading={reviewing === item.id}
                      onClick={() => review(item.id, false)}>拒绝</Button>
                    <Button variant="gold" disabled={reviewing !== null} loading={reviewing === item.id}
                      onClick={() => review(item.id, true)}>按上述权限通过</Button>
                  </div>
                </Card>
              ))}
              {legacyPending.map((item) => (
                <Card key={item.id} className="space-y-4 p-5">
                  <div>
                    <p className="font-medium text-ink-900">{item.teacherName} · 历史职务申请</p>
                    <p className="mt-1 text-sm text-ink-600">原申请：{roleNames(item.requestedRoles)} · {item.reason}</p>
                  </div>
                  <fieldset disabled={reviewing !== null}>
                    <legend className="mb-2 text-sm font-medium text-ink-700">拟批准的职务权限（可调整）</legend>
                    <div className="flex flex-wrap gap-2">
                      {TEACHER_ROLES.filter((role) => role !== "teacher").map((role) => (
                        <label key={role} className="inline-flex items-center gap-2 rounded-md border border-ink-200 px-3 py-2 text-sm">
                          <input type="checkbox" checked={(legacyReviewDrafts[item.id] || []).includes(role)}
                            onChange={() => setLegacyReviewDrafts((old) => ({
                              ...old, [item.id]: changeSelection(old[item.id] || [], role),
                            }))} />
                          {roleLabels[role]}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" disabled={reviewing !== null} loading={reviewing === item.id} onClick={() => review(item.id, false, true)}>拒绝</Button>
                    <Button variant="gold" disabled={reviewing !== null} loading={reviewing === item.id} onClick={() => review(item.id, true, true)}>按上述权限通过</Button>
                  </div>
                </Card>
              ))}
            </div>}
          </section>
        ))}
    </div>
  );
}
