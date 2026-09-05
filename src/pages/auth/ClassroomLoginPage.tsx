import { openPage } from "@/lib/navigation";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { ArrowLeft, BookOpen, Lock, Mail, MonitorCheck, School } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";
import { Spinner } from "@/components/ui/Spinner";
import { classService } from "@/services/class";
import {
  CLASSROOM_DEVICE_TOKEN_KEY,
  classroomDeviceService,
  classroomInstallationId,
  createClassroomDeviceToken,
} from "@/services/classroomDevice";
import { useAuthStore } from "@/stores/auth";
import type { ClassroomChoice } from "@/types";

const PUBLIC_CLASSROOM_VALUE = "__public_classroom__";

export default function ClassroomLoginPage() {
  const navigate = useNavigate();
  const { login, logout, loading, error, clearError } = useAuthStore();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [classes, setClasses] = useState<ClassroomChoice[]>([]);
  const [classId, setClassId] = useState("");
  const [classLoading, setClassLoading] = useState(true);
  const [classError, setClassError] = useState("");
  const [checkingBinding, setCheckingBinding] = useState(true);
  const [binding, setBinding] = useState(false);

  useEffect(() => {
    let active = true;
    const token = localStorage.getItem(CLASSROOM_DEVICE_TOKEN_KEY);
    if (!token) {
      setCheckingBinding(false);
      return () => { active = false; };
    }
    classroomDeviceService.getDeviceSession(token)
      .then(() => {
        if (active) navigate("/classroom-device", { replace: true });
      })
      .catch(() => {
        localStorage.removeItem(CLASSROOM_DEVICE_TOKEN_KEY);
        if (active) setCheckingBinding(false);
      });
    return () => { active = false; };
  }, [navigate]);

  useEffect(() => {
    if (checkingBinding) return;
    classService.listClassroomChoices()
      .then((items) => {
        setClasses(items);
        setClassId(items[0]?.id || "");
      })
      .catch((cause) => setClassError(cause instanceof Error ? cause.message : "班级列表加载失败"))
      .finally(() => setClassLoading(false));
  }, [checkingBinding]);

  const options = useMemo(
    () => [
      { value: PUBLIC_CLASSROOM_VALUE, label: "公共班级（管理员当前学校）" },
      ...classes.map((item) => ({
        value: item.id,
        label: `${item.schoolName} · ${item.grade} · ${item.name}`,
      })),
    ],
    [classes],
  );

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    clearError();
    setClassError("");
    if (!email.trim() || !password) return;
    setBinding(true);
    try {
      const ok = await login(email, password);
      if (!ok) return;
      const loggedInTeacher = useAuthStore.getState().teacher;
      const affiliation = loggedInTeacher?.affiliations?.find((item) => item.id === loggedInTeacher.currentAffiliationId)
        || loggedInTeacher?.affiliations?.find((item) => item.isCurrent);
      const role = affiliation?.role || loggedInTeacher?.role;
      if (role !== "school_admin" && role !== "platform_admin") {
        navigate(loggedInTeacher?.schoolId ? "/classroom" : "/school-auth", { replace: true });
        return;
      }
      if (!classId) throw new Error("请选择要绑定的班级或公共班级");
      const deviceToken = createClassroomDeviceToken();
      await classroomDeviceService.bindDevice({
        ...(classId === PUBLIC_CLASSROOM_VALUE
          ? { publicClassroom: true }
          : { classId }),
        deviceToken,
        installationId: classroomInstallationId(),
      });
      localStorage.setItem(CLASSROOM_DEVICE_TOKEN_KEY, deviceToken);
      await logout();
      navigate("/classroom-device", { replace: true });
    } catch (cause) {
      setClassError(cause instanceof Error ? cause.message : "教室一体机绑定失败");
      if (useAuthStore.getState().teacher) await logout().catch(() => undefined);
    } finally {
      setBinding(false);
    }
  };

  if (checkingBinding) {
    return (
      <div className="min-h-screen bg-mist flex flex-col items-center justify-center gap-3 text-sm text-ink-500">
        <Spinner size={30} />
        正在识别本教室一体机…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-mist flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl bg-paper border border-ink-100 shadow-xl overflow-hidden">
        <div className="bg-ink-900 text-paper px-7 py-6">
          <button
            type="button"
            onClick={() => openPage("/login")}
            className="inline-flex items-center gap-1 text-xs text-ink-300 hover:text-paper mb-5"
          >
            <ArrowLeft className="w-3.5 h-3.5" />返回个人登录
          </button>
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-gold-400 text-ink-900 flex items-center justify-center">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-serif text-2xl font-semibold">我要上课</h1>
              <p className="text-sm text-ink-300 mt-1">管理员首次登录可绑定一体机，普通账号直接登录使用</p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-7 space-y-4">
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-xs leading-relaxed text-amber-900">
            <div className="flex items-center gap-1.5 font-medium"><MonitorCheck className="h-4 w-4" />管理员登录会绑定本机，普通账号不会绑定</div>
            <p className="mt-1 text-amber-800">选择“公共班级”后，本机进入教室时可在左上角切换本校班级。固定班级绑定后仍会直接进入对应班级。</p>
          </div>

          <div className="relative">
            <School className="absolute left-3 top-9 w-4 h-4 text-ink-400 z-10" />
            <Select
              label="管理员绑定班级"
              value={classId}
              onChange={(event) => setClassId(event.target.value)}
              options={options}
              placeholder={classLoading ? "正在加载班级…" : "请选择班级"}
              className="pl-10"
              disabled={classLoading}
            />
          </div>

          <div className="relative">
            <Mail className="absolute left-3 top-9 w-4 h-4 text-ink-400" />
            <Input
              label="账号邮箱"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="pl-10"
              required
            />
          </div>
          <div className="relative">
            <Lock className="absolute left-3 top-9 w-4 h-4 text-ink-400" />
            <Input
              label="密码"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="pl-10"
              required
            />
          </div>

          {classError && <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">{classError}</div>}
          {error && <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</div>}

          <Button
            type="submit"
            variant="gold"
            size="lg"
            className="w-full"
            loading={loading || binding}
            disabled={!email.trim() || !password}
          >
            <MonitorCheck className="w-4 h-4" />登录
          </Button>
        </form>
      </div>
    </div>
  );
}
