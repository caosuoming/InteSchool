import { useEffect, useState } from "react";
import { KeyRound, Mail, School, ShieldCheck, User } from "lucide-react";
import { Button, Card, Input } from "@/components/ui";
import { useAuthStore } from "@/stores/auth";
import { authService } from "@/services/auth";
import { toast } from "@/stores/ui";

export default function ProfilePage() {
  const teacher = useAuthStore((state) => state.teacher);
  const updateNickname = useAuthStore((state) => state.updateNickname);
  const [nickname, setNickname] = useState(teacher?.nickname || "");
  const [savingNickname, setSavingNickname] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setNickname(teacher?.nickname || "");
  }, [teacher?.nickname]);

  if (!teacher) return null;

  const affiliation = teacher.affiliations?.find((item) => item.id === teacher.currentAffiliationId)
    || teacher.affiliations?.find((item) => item.isCurrent);

  const handlePasswordChange = async (event: React.FormEvent) => {
    event.preventDefault();
    if (newPassword.length < 10) {
      toast.error("新密码至少需要 10 位");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("两次输入的新密码不一致");
      return;
    }
    setSaving(true);
    try {
      await authService.changePassword(currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast.success("密码已更新");
    } catch (error) {
      toast.error("密码修改失败", error instanceof Error ? error.message : undefined);
    } finally {
      setSaving(false);
    }
  };

  const handleNicknameChange = async (event: React.FormEvent) => {
    event.preventDefault();
    const value = nickname.trim();
    if (!value) {
      toast.error("昵称不能为空");
      return;
    }
    setSavingNickname(true);
    try {
      if (await updateNickname(value)) toast.success("昵称已更新");
      else toast.error("昵称保存失败");
    } finally {
      setSavingNickname(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="font-serif text-2xl font-bold text-ink-900">个人中心</h1>
        <p className="text-sm text-ink-500 mt-1">查看当前账号、设置公开昵称和管理安全选项。</p>
      </div>

      <Card className="p-6">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-14 h-14 rounded-full bg-gold-400 text-ink-900 flex items-center justify-center text-xl font-semibold">
            {teacher.avatar}
          </div>
          <div>
            <div className="text-lg font-semibold text-ink-900">{teacher.name}</div>
            <div className="text-sm text-ink-500">{teacher.subject || "尚未设置学科"}</div>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 text-sm">
          <div className="flex items-start gap-3 rounded-lg bg-ink-50 p-4">
            <Mail className="w-4 h-4 mt-0.5 text-gold-600" />
            <div><div className="text-ink-500">邮箱</div><div className="font-medium text-ink-900">{teacher.email}</div></div>
          </div>
          <div className="flex items-start gap-3 rounded-lg bg-ink-50 p-4">
            <School className="w-4 h-4 mt-0.5 text-gold-600" />
            <div><div className="text-ink-500">当前单位</div><div className="font-medium text-ink-900">{String(affiliation?.schoolName || "个人身份")}</div></div>
          </div>
          <div className="flex items-start gap-3 rounded-lg bg-ink-50 p-4">
            <User className="w-4 h-4 mt-0.5 text-gold-600" />
            <div><div className="text-ink-500">工号</div><div className="font-medium text-ink-900">{teacher.employeeNo || "—"}</div></div>
          </div>
          <div className="flex items-start gap-3 rounded-lg bg-ink-50 p-4">
            <ShieldCheck className="w-4 h-4 mt-0.5 text-gold-600" />
            <div><div className="text-ink-500">角色</div><div className="font-medium text-ink-900">{String(affiliation?.role || teacher.role)}</div></div>
          </div>
        </div>
      </Card>

      <Card className="p-6">
        <div className="flex items-center gap-2 mb-5">
          <User className="w-5 h-5 text-gold-600" />
          <h2 className="font-serif text-lg font-semibold text-ink-900">公开昵称</h2>
        </div>
        <form onSubmit={handleNicknameChange} className="max-w-md space-y-3">
          <Input
            label="昵称"
            hint="捐赠到平台资源库后，仅公开显示该昵称，不显示学校和真实姓名。"
            maxLength={20}
            value={nickname}
            onChange={(event) => setNickname(event.target.value)}
            placeholder="请输入 1-20 个字符"
            required
          />
          <Button type="submit" variant="gold" loading={savingNickname}>保存昵称</Button>
        </form>
      </Card>

      <Card className="p-6">
        <div className="flex items-center gap-2 mb-5">
          <KeyRound className="w-5 h-5 text-gold-600" />
          <h2 className="font-serif text-lg font-semibold text-ink-900">修改密码</h2>
        </div>
        <form onSubmit={handlePasswordChange} className="max-w-md space-y-4">
          <Input label="当前密码" type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required />
          <Input label="新密码" type="password" minLength={10} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required />
          <Input label="确认新密码" type="password" minLength={10} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required />
          <Button type="submit" variant="gold" loading={saving}>保存新密码</Button>
        </form>
      </Card>
    </div>
  );
}
