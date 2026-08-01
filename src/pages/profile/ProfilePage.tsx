import { useEffect, useState } from "react";
import { Link } from "react-router";
import { BookOpen, Building2, FolderOpen, HardDrive, KeyRound, Mail, RefreshCw, School, ShieldCheck, Users } from "lucide-react";
import { Button, Card, Input, Select, Textarea } from "@/components/ui";
import { classService } from "@/services/class";
import { authService } from "@/services/auth";
import {
  ensureLocalBackupPermission,
  getLocalBackupSnapshot,
  isLocalBackupSupported,
  loadLocalBackupDirectory,
  localBackupKey,
  pickLocalBackupDirectory,
  saveLocalBackupDirectory,
  startLocalResourceBackup,
  subscribeLocalBackup,
  type BackupDirectoryHandle,
  type LocalBackupSnapshot,
} from "@/services/localResourceBackup";
import { GRADE_OPTIONS, SUBJECT_OPTIONS } from "@/lib/education";
import { useAuthStore } from "@/stores/auth";
import { toast } from "@/stores/ui";
import type { SchoolAdminApplication, SchoolClass } from "@/types";

export default function ProfilePage() {
  const teacher = useAuthStore((state) => state.teacher);
  const updateProfile = useAuthStore((state) => state.updateProfile);
  const refresh = useAuthStore((state) => state.refresh);
  const affiliation = teacher?.affiliations?.find((item) => item.id === teacher.currentAffiliationId)
    || teacher?.affiliations?.find((item) => item.isCurrent);
  const [nickname, setNickname] = useState(teacher?.nickname || "");
  const [subject, setSubject] = useState(affiliation?.subject || teacher?.subject || "数学");
  const [grades, setGrades] = useState<string[]>(affiliation?.teachingGrades || teacher?.teachingGrades || []);
  const [classIds, setClassIds] = useState<string[]>(affiliation?.teachingClassIds || teacher?.teachingClassIds || []);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [savingProfile, setSavingProfile] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [adminReason, setAdminReason] = useState("");
  const [adminApplications, setAdminApplications] = useState<SchoolAdminApplication[]>([]);
  const [submittingAdmin, setSubmittingAdmin] = useState(false);
  const backupContext = teacher
    ? { teacherId: teacher.id, schoolId: affiliation?.schoolId || null }
    : null;
  const backupKey = backupContext ? localBackupKey(backupContext) : "";
  const [backupSnapshot, setBackupSnapshot] = useState<LocalBackupSnapshot>({
    running: false,
    state: { directoryName: "", lastCompletedAt: null, lastResult: null },
  });

  useEffect(() => {
    setNickname(teacher?.nickname || "");
    setSubject(affiliation?.subject || teacher?.subject || "数学");
    setGrades(affiliation?.teachingGrades || teacher?.teachingGrades || []);
    setClassIds(affiliation?.teachingClassIds || teacher?.teachingClassIds || []);
  }, [
    teacher,
    affiliation?.id,
    affiliation?.subject,
    affiliation?.teachingGrades,
    affiliation?.teachingClassIds,
  ]);

  useEffect(() => {
    if (!affiliation?.schoolId) {
      setClasses([]);
      return;
    }
    void classService.listSchoolClasses(affiliation.schoolId).then(setClasses);
    void authService.getMySchoolAdminApplications().then(setAdminApplications);
  }, [affiliation?.schoolId]);

  useEffect(() => {
    if (!backupKey) return;
    setBackupSnapshot(getLocalBackupSnapshot(backupKey));
    return subscribeLocalBackup((changedKey, snapshot) => {
      if (changedKey === backupKey) setBackupSnapshot(snapshot);
    });
  }, [backupKey]);

  if (!teacher) return null;

  const toggle = (value: string, values: string[], setter: (next: string[]) => void) => {
    setter(values.includes(value) ? values.filter((item) => item !== value) : [...values, value]);
  };

  const handleProfileSave = async (event: React.FormEvent) => {
    event.preventDefault();
    setSavingProfile(true);
    try {
      const ok = await updateProfile({ nickname: nickname.trim(), subject, teachingGrades: grades, teachingClassIds: classIds });
      if (!ok) throw new Error("资料保存失败");
      toast.success("个人与教学资料已更新");
    } catch (error) {
      toast.error("资料保存失败", error instanceof Error ? error.message : undefined);
    } finally {
      setSavingProfile(false);
    }
  };

  const handlePasswordChange = async (event: React.FormEvent) => {
    event.preventDefault();
    if (newPassword.length < 10 || newPassword !== confirmPassword) {
      toast.error(newPassword.length < 10 ? "新密码至少需要 10 位" : "两次输入的新密码不一致");
      return;
    }
    setSavingPassword(true);
    try {
      await authService.changePassword(currentPassword, newPassword);
      setCurrentPassword(""); setNewPassword(""); setConfirmPassword("");
      toast.success("密码已更新");
    } catch (error) {
      toast.error("密码修改失败", error instanceof Error ? error.message : undefined);
    } finally {
      setSavingPassword(false);
    }
  };

  const handleAdminApplication = async () => {
    if (adminReason.trim().length < 5) {
      toast.error("请填写至少 5 个字的申请说明");
      return;
    }
    setSubmittingAdmin(true);
    try {
      await authService.applySchoolAdmin(adminReason);
      setAdminReason("");
      setAdminApplications(await authService.getMySchoolAdminApplications());
      await refresh();
      toast.success("学校管理员申请已提交");
    } catch (error) {
      toast.error("申请提交失败", error instanceof Error ? error.message : undefined);
    } finally {
      setSubmittingAdmin(false);
    }
  };

  const runBackup = (directory: BackupDirectoryHandle) => {
    if (!backupContext) return;
    void startLocalResourceBackup(backupContext, directory)
      .then((result) => {
        if (result.failed > 0) {
          toast.warning(
            "本地备份已完成，但有部分资源失败",
            `已更新 ${result.updated} 项，跳过 ${result.skipped} 项，失败 ${result.failed} 项`,
          );
          return;
        }
        toast.success(
          "“我的资源”本地备份完成",
          `已更新 ${result.updated} 项，跳过 ${result.skipped} 项`,
        );
      })
      .catch((error) => {
        toast.error("本地备份失败", error instanceof Error ? error.message : undefined);
      });
  };

  const handleChooseBackupDirectory = async () => {
    if (!backupContext) return;
    try {
      const directory = await pickLocalBackupDirectory();
      await saveLocalBackupDirectory(backupKey, directory);
      runBackup(directory);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      toast.error("无法选择备份文件夹", error instanceof Error ? error.message : undefined);
    }
  };

  const handleRunBackup = async () => {
    const directory = await loadLocalBackupDirectory(backupKey);
    if (!directory) {
      toast.error("请先选择本地备份文件夹");
      return;
    }
    try {
      if (!await ensureLocalBackupPermission(directory)) {
        toast.error("未获得备份文件夹的写入权限，请重新选择文件夹");
        return;
      }
      runBackup(directory);
    } catch (error) {
      toast.error("无法访问备份文件夹", error instanceof Error ? error.message : undefined);
    }
  };

  const activeRole = affiliation?.role || teacher.role;
  const latestApplication = adminApplications[0];

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div><h1 className="font-serif text-2xl font-bold text-ink-900">个人中心</h1><p className="text-sm text-ink-500 mt-1">维护公开资料、任教学科、年级、班级和学校身份。</p></div>

      <Card className="p-6">
        <div className="flex items-center gap-4 mb-5">
          <div className="w-14 h-14 rounded-full bg-gold-400 text-ink-900 flex items-center justify-center text-xl font-semibold">{teacher.avatar}</div>
          <div><div className="text-lg font-semibold text-ink-900">{teacher.name}</div><div className="text-sm text-ink-500">{affiliation?.schoolName || "个人身份"} · {subject}教师</div></div>
        </div>
        <div className="grid sm:grid-cols-3 gap-3 text-sm">
          <div className="rounded-lg bg-ink-50 p-4 flex gap-2"><Mail className="w-4 h-4 text-gold-600" /><div><div className="text-ink-500">邮箱</div><div className="font-medium">{teacher.email}</div></div></div>
          <div className="rounded-lg bg-ink-50 p-4 flex gap-2"><School className="w-4 h-4 text-gold-600" /><div><div className="text-ink-500">当前单位</div><div className="font-medium">{affiliation?.schoolName || "个人身份"}</div></div></div>
          <div className="rounded-lg bg-ink-50 p-4 flex gap-2"><ShieldCheck className="w-4 h-4 text-gold-600" /><div><div className="text-ink-500">权限</div><div className="font-medium">{activeRole}</div></div></div>
        </div>
      </Card>

      <Card className="p-6">
        <div className="flex items-center gap-2 mb-5"><BookOpen className="w-5 h-5 text-gold-600" /><h2 className="font-serif text-lg font-semibold">个人与教学资料</h2></div>
        <form onSubmit={handleProfileSave} className="space-y-5">
          <div className="grid md:grid-cols-2 gap-4">
            <Input label="公开昵称" maxLength={20} value={nickname} onChange={(event) => setNickname(event.target.value)} required hint="平台资源仅展示昵称。" />
            <Select label="任教学科" value={subject} onChange={(event) => setSubject(event.target.value)} options={SUBJECT_OPTIONS.map((value) => ({ value, label: value }))} />
          </div>
          <ChoiceGrid icon={<Building2 className="w-4 h-4" />} label="任教年级" values={GRADE_OPTIONS} selected={grades} onToggle={(value) => toggle(value, grades, setGrades)} />
          {affiliation?.schoolId && <ChoiceGrid icon={<Users className="w-4 h-4" />} label="任教班级" values={classes.map((item) => item.id)} selected={classIds} onToggle={(value) => toggle(value, classIds, setClassIds)} labels={Object.fromEntries(classes.map((item) => [item.id, `${item.grade} · ${item.name}`]))} empty="本校尚未创建班级" />}
          <Button type="submit" variant="gold" loading={savingProfile}>保存资料</Button>
        </form>
      </Card>

      <Card className="p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <HardDrive className="h-5 w-5 text-gold-600" />
              <h2 className="font-serif text-lg font-semibold">“我的资源”本地备份</h2>
            </div>
            <p className="mt-2 max-w-2xl text-sm text-ink-500">
              将题目、试卷、讲义、课件、素材和资源篮增量保存到本地文件夹。备份在后台执行，期间可继续使用其他功能。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={!isLocalBackupSupported() || backupSnapshot.running}
              onClick={handleChooseBackupDirectory}
            >
              <FolderOpen className="h-4 w-4" />
              {backupSnapshot.state.directoryName ? "更换文件夹" : "选择文件夹并备份"}
            </Button>
            {backupSnapshot.state.directoryName && (
              <Button
                type="button"
                variant="gold"
                loading={backupSnapshot.running}
                onClick={handleRunBackup}
              >
                <RefreshCw className="h-4 w-4" />
                {backupSnapshot.running ? "正在备份" : "立即增量备份"}
              </Button>
            )}
          </div>
        </div>

        {!isLocalBackupSupported() ? (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            当前浏览器不支持直接写入本地文件夹，请使用最新版 Chrome 或 Edge。
          </div>
        ) : (
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg bg-ink-50 p-4">
              <div className="text-xs text-ink-500">备份文件夹</div>
              <div className="mt-1 text-sm font-medium text-ink-900">
                {backupSnapshot.state.directoryName || "尚未选择"}
              </div>
            </div>
            <div className="rounded-lg bg-ink-50 p-4">
              <div className="text-xs text-ink-500">上次备份时间</div>
              <div className="mt-1 text-sm font-medium text-ink-900">
                {formatBackupTime(backupSnapshot.state.lastCompletedAt)}
              </div>
            </div>
          </div>
        )}

        {backupSnapshot.state.lastResult && (
          <p className="mt-3 text-xs text-ink-500">
            上次共检查 {backupSnapshot.state.lastResult.total} 项，更新 {backupSnapshot.state.lastResult.updated} 项，
            跳过 {backupSnapshot.state.lastResult.skipped} 项
            {backupSnapshot.state.lastResult.failed > 0 ? `，失败 ${backupSnapshot.state.lastResult.failed} 项` : ""}。
          </p>
        )}
      </Card>

      <Card className="p-6">
        <div className="flex items-center justify-between gap-3 mb-4"><div className="flex items-center gap-2"><School className="w-5 h-5 text-gold-600" /><h2 className="font-serif text-lg font-semibold">所属学校</h2></div><Link to="/school-auth?add=1"><Button variant="outline">新增学校</Button></Link></div>
        <div className="space-y-2">{teacher.affiliations.filter((item) => item.schoolId).map((item) => <div key={item.id} className="rounded-lg border border-ink-100 p-3 flex justify-between"><div><div className="font-medium">{item.schoolName}</div><div className="text-xs text-ink-500">{item.subject} · {item.status}</div></div>{item.isCurrent && <span className="text-xs text-emerald-700">当前身份</span>}</div>)}</div>
      </Card>

      {affiliation?.schoolId && !["school_admin", "platform_admin"].includes(activeRole) && (
        <Card className="p-6">
          <div className="flex items-center gap-2 mb-4"><ShieldCheck className="w-5 h-5 text-gold-600" /><h2 className="font-serif text-lg font-semibold">申请学校管理员</h2></div>
          {latestApplication?.status === "pending" ? <p className="text-sm text-amber-700">申请正在等待平台管理员审核。</p> : latestApplication?.status === "approved" ? <p className="text-sm text-emerald-700">申请已通过，请重新登录或切换身份刷新权限。</p> : <div className="space-y-3"><Textarea label="申请说明" value={adminReason} onChange={(event) => setAdminReason(event.target.value)} placeholder="说明为何需要管理本校教师资料" /><Button variant="gold" loading={submittingAdmin} onClick={handleAdminApplication}>提交申请</Button>{latestApplication?.status === "rejected" && <p className="text-xs text-red-600">上一次申请未通过，可补充说明后重新申请。</p>}</div>}
        </Card>
      )}

      <Card className="p-6">
        <div className="flex items-center gap-2 mb-5"><KeyRound className="w-5 h-5 text-gold-600" /><h2 className="font-serif text-lg font-semibold">修改密码</h2></div>
        <form onSubmit={handlePasswordChange} className="max-w-md space-y-4"><Input label="当前密码" type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required /><Input label="新密码" type="password" minLength={10} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required /><Input label="确认新密码" type="password" minLength={10} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required /><Button type="submit" variant="gold" loading={savingPassword}>保存新密码</Button></form>
      </Card>
    </div>
  );
}

function formatBackupTime(value: string | null): string {
  if (!value) return "尚未备份";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "尚未备份";
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

function ChoiceGrid({ label, values, selected, onToggle, labels = {}, empty, icon }: { label: string; values: string[]; selected: string[]; onToggle: (value: string) => void; labels?: Record<string, string>; empty?: string; icon: React.ReactNode }) {
  return <fieldset><legend className="text-sm font-medium text-ink-700 mb-2 flex items-center gap-2">{icon}{label}</legend>{values.length === 0 ? <p className="text-sm text-ink-400">{empty}</p> : <div className="flex flex-wrap gap-2">{values.map((value) => <label key={value} className="inline-flex items-center gap-2 rounded-md border border-ink-200 bg-white px-3 py-2 text-sm cursor-pointer"><input type="checkbox" checked={selected.includes(value)} onChange={() => onToggle(value)} />{labels[value] || value}</label>)}</div>}</fieldset>;
}
