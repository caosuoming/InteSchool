import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { BookOpen, GraduationCap, Lock, Mail, School, Smartphone, Sparkles, User as UserIcon } from "lucide-react";
import { Button, Input, Select, Textarea } from "@/components/ui";
import { authService } from "@/services/auth";
import { SUBJECT_OPTIONS } from "@/lib/education";
import { useAuthStore } from "@/stores/auth";
import type { RegistrationContext } from "@/types";
import { BrandMark } from "@/components/brand/BrandMark";

type Mode = "login" | "register";

export default function LoginPage() {
  const navigate = useNavigate();
  const { teacher, login, register, loading, error, clearError } = useAuthStore();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [subject, setSubject] = useState("数学");
  const [context, setContext] = useState<RegistrationContext | null>(null);
  const [checkingPhone, setCheckingPhone] = useState(false);
  const [createSchool, setCreateSchool] = useState(false);
  const [schoolId, setSchoolId] = useState("");
  const [schoolName, setSchoolName] = useState("");
  const [schoolCode, setSchoolCode] = useState("");
  const [schoolCity, setSchoolCity] = useState("");
  const [schoolDescription, setSchoolDescription] = useState("");
  const [phoneError, setPhoneError] = useState("");

  useEffect(() => {
    if (teacher) navigate(teacher.schoolId ? "/dashboard" : "/school-auth");
  }, [teacher, navigate]);

  const checkAuthorization = async () => {
    if (!phone.trim()) return;
    setCheckingPhone(true);
    setPhoneError("");
    try {
      const result = await authService.getRegistrationContext(phone);
      setContext(result);
      setSchoolId(result.authorization.schoolId);
    } catch (cause) {
      setContext(null);
      setSchoolId("");
      setPhoneError(cause instanceof Error ? cause.message : "无法核验注册授权");
    } finally {
      setCheckingPhone(false);
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    clearError();
    if (mode === "login") {
      await login(email, password);
      return;
    }
    if (!context) {
      await checkAuthorization();
      return;
    }
    await register({
      email,
      password,
      name,
      phone,
      subject,
      teachingGrades: [],
      ...(createSchool
        ? { newSchool: { name: schoolName, code: schoolCode, city: schoolCity, description: schoolDescription } }
        : { schoolId }),
    });
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-mist">
      <div className="hidden lg:flex bg-ink-900 text-paper p-12 relative overflow-hidden">
        <div className="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_top_left,_#f3c969,_transparent_45%)]" />
        <div className="relative z-10 flex flex-col justify-between w-full">
          <div className="flex items-center gap-3">
            <BrandMark className="w-12 h-12" />
            <div><div className="font-serif text-2xl font-bold">智题云校</div><div className="text-xs text-ink-400 tracking-widest">ZHI TI YUN XIAO</div></div>
          </div>
          <div className="max-w-md space-y-5">
            <div className="inline-flex items-center gap-2 text-gold-300 text-sm"><Sparkles className="w-4 h-4" />AI 驱动的教学资源平台</div>
            <h1 className="font-serif text-5xl font-bold leading-tight">学校、教师与教学资源<br /><span className="text-gold-400">统一管理</span></h1>
            <p className="text-ink-300 leading-relaxed">注册时确认学校和任教学科，登录后可维护任教年级、班级以及多个学校身份。</p>
          </div>
          <div className="text-xs text-ink-400">© 2025–2026 智题云校</div>
        </div>
      </div>

      <div className="flex items-center justify-center p-6 lg:p-10 overflow-y-auto">
        <div className="w-full max-w-lg py-6">
          <div className="mb-6">
            <h2 className="font-serif text-2xl font-bold text-ink-900">{mode === "login" ? "欢迎回来" : "创建教师账号"}</h2>
            <p className="text-sm text-ink-500 mt-1">{mode === "login" ? "登录后继续教学工作" : "手机号须已获学校授权或教师担保"}</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === "register" && (
              <>
                <Input label="姓名" value={name} onChange={(event) => setName(event.target.value)} required placeholder="请输入真实姓名" />
                <div className="space-y-2">
                  <Input label="手机号" type="tel" value={phone} onChange={(event) => { setPhone(event.target.value); setContext(null); }} required placeholder="请输入已获授权的手机号" />
                  <Button type="button" variant="outline" size="sm" loading={checkingPhone} onClick={checkAuthorization}>核验手机号授权</Button>
                  {phoneError && <p className="text-xs text-red-600">{phoneError}</p>}
                  {context && <p className="text-xs text-emerald-700">已核验：授权学校为 {context.authorization.schoolName}</p>}
                </div>
                {context && (
                  <>
                    <Select
                      label="所在学校"
                      value={createSchool ? "__new__" : schoolId}
                      onChange={(event) => {
                        const isNew = event.target.value === "__new__";
                        setCreateSchool(isNew);
                        if (!isNew) setSchoolId(event.target.value);
                      }}
                      options={[
                        ...context.schools.map((school) => ({ value: school.id, label: school.id === context.authorization.schoolId ? `${school.name}（已授权）` : `${school.name}（需该校授权）` })),
                        { value: "__new__", label: "列表中没有，创建新学校" },
                      ]}
                    />
                    {!createSchool && schoolId !== context.authorization.schoolId && (
                      <p className="text-xs text-amber-700">当前手机号仅可加入已授权学校；选择其他学校会被拒绝。</p>
                    )}
                    {createSchool && (
                      <div className="grid sm:grid-cols-2 gap-3 rounded-lg border border-ink-200 bg-white p-4">
                        <Input label="学校名称" value={schoolName} onChange={(event) => setSchoolName(event.target.value)} required />
                        <Input label="学校代码" value={schoolCode} onChange={(event) => setSchoolCode(event.target.value)} required placeholder="如 NJUHS" />
                        <Input label="所在城市" value={schoolCity} onChange={(event) => setSchoolCity(event.target.value)} required />
                        <Textarea label="学校简介（可选）" value={schoolDescription} onChange={(event) => setSchoolDescription(event.target.value)} />
                      </div>
                    )}
                    <Select label="任教学科" value={subject} onChange={(event) => setSubject(event.target.value)} options={SUBJECT_OPTIONS.map((value) => ({ value, label: value }))} />
                  </>
                )}
              </>
            )}

            <div className="relative"><Mail className="absolute left-3 top-9 w-4 h-4 text-ink-400" /><Input label="邮箱" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required className="pl-10" /></div>
            <div className="relative"><Lock className="absolute left-3 top-9 w-4 h-4 text-ink-400" /><Input label="密码" type="password" minLength={mode === "register" ? 10 : undefined} value={password} onChange={(event) => setPassword(event.target.value)} required className="pl-10" /></div>
            {error && <div className="px-3 py-2 rounded-md bg-red-50 border border-red-200 text-xs text-red-700">{error}</div>}
            <Button type="submit" variant="gold" size="lg" loading={loading} className="w-full" disabled={mode === "register" && !context}>{mode === "login" ? "登录" : "注册并进入学校"}</Button>
          </form>

          {mode === "login" && (
            <Button type="button" variant="outline" className="w-full mt-3" onClick={() => navigate("/classroom-login")}>
              <BookOpen className="w-4 h-4" />我要上课（登录并选择班级）
            </Button>
          )}

          <div className="mt-6 text-center text-sm text-ink-500">
            {mode === "login" ? "还没有账号？" : "已有账号？"}
            <button type="button" onClick={() => { setMode(mode === "login" ? "register" : "login"); clearError(); }} className="ml-1 text-gold-600 font-medium">{mode === "login" ? "立即注册" : "返回登录"}</button>
          </div>
          <div className="mt-5 flex items-center justify-center gap-2 text-xs text-ink-400"><School className="w-3.5 h-3.5" /><Smartphone className="w-3.5 h-3.5" /><UserIcon className="w-3.5 h-3.5" /><GraduationCap className="w-3.5 h-3.5" />学校授权信息仅用于注册校验</div>
        </div>
      </div>
    </div>
  );
}
