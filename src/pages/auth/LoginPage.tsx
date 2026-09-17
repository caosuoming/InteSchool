import { openPage } from "@/lib/navigation";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { ArrowLeft, BookOpen, GraduationCap, Lock, Mail, Plus, School, Search, Smartphone, Sparkles, User as UserIcon, Users } from "lucide-react";
import { Button, Input, Select, Textarea } from "@/components/ui";
import { authService } from "@/services/auth";
import { parentService } from "@/services/parent";
import { schoolService } from "@/services/school";
import { GRADE_OPTIONS, SUBJECT_OPTIONS } from "@/lib/education";
import { TEACHER_ROLES } from "@/lib/teacher-roles";
import { useAuthStore } from "@/stores/auth";
import type { School as SchoolRecord, TeacherRole } from "@/types";
import { BrandMark } from "@/components/brand/BrandMark";
import { roleLabels } from "@/services/organization";

type Mode = "login" | "register";

interface LoginPageProps {
  destination?: "/dashboard" | "/prep?entry=collective";
  loginOnly?: boolean;
}

export default function LoginPage({
  destination = "/dashboard",
  loginOnly = false,
}: LoginPageProps) {
  const navigate = useNavigate();
  const { teacher, login, register, loading, error, clearError } = useAuthStore();
  const [mode, setMode] = useState<Mode>("login");
  const [identifier, setIdentifier] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [subject, setSubject] = useState("数学");
  const [teachingGrades, setTeachingGrades] = useState<string[]>([]);
  const [roles, setRoles] = useState<TeacherRole[]>(["teacher"]);
  const [requestSchoolAdmin, setRequestSchoolAdmin] = useState(false);
  const [schoolQuery, setSchoolQuery] = useState("");
  const [schoolResults, setSchoolResults] = useState<SchoolRecord[]>([]);
  const [schoolSearching, setSchoolSearching] = useState(false);
  const [selectedSchool, setSelectedSchool] = useState<SchoolRecord | null>(null);
  const [createSchool, setCreateSchool] = useState(false);
  const [schoolName, setSchoolName] = useState("");
  const [schoolCode, setSchoolCode] = useState("");
  const [schoolCity, setSchoolCity] = useState("");
  const [schoolDescription, setSchoolDescription] = useState("");
  const [showRecoveryHelp, setShowRecoveryHelp] = useState(false);
  const [registrationPending, setRegistrationPending] = useState(false);
  const [identityOptions, setIdentityOptions] = useState<{ teacher: boolean; parent: boolean } | null>(null);
  const [loginIdentity, setLoginIdentity] = useState<"teacher" | "parent" | null>(null);
  const [parentLoggingIn, setParentLoggingIn] = useState(false);
  const [parentLoginError, setParentLoginError] = useState("");
  const collectiveEntry = destination === "/prep?entry=collective";

  useEffect(() => {
    if (teacher) navigate(teacher.schoolId ? destination : "/school-auth");
  }, [destination, teacher, navigate]);

  useEffect(() => {
    if (mode !== "register" || createSchool) return;
    const keyword = schoolQuery.trim();
    if (!keyword) {
      setSchoolResults([]);
      setSchoolSearching(false);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setSchoolSearching(true);
      void schoolService.searchSchools(keyword)
        .then((schools) => {
          if (!cancelled) setSchoolResults(schools.slice(0, 8));
        })
        .catch(() => {
          if (!cancelled) setSchoolResults([]);
        })
        .finally(() => {
          if (!cancelled) setSchoolSearching(false);
        });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [createSchool, mode, schoolQuery]);

  const checkLoginIdentity = async (): Promise<{ teacher: boolean; parent: boolean } | null> => {
    const normalized = identifier.trim().replace(/[\s()-]/g, "").replace(/^\+86/, "");
    if (!/^1[3-9]\d{9}$/.test(normalized)) {
      setIdentityOptions(null);
      setLoginIdentity("teacher");
      return null;
    }
    try {
      const result = await authService.getIdentityContext(normalized);
      const options = { teacher: result.teacher, parent: result.parent };
      setIdentityOptions(options);
      if (options.teacher && options.parent) {
        setLoginIdentity((current) => current && options[current] ? current : null);
      } else {
        setLoginIdentity(options.parent ? "parent" : "teacher");
      }
      return options;
    } catch {
      setIdentityOptions(null);
      setLoginIdentity("teacher");
      return null;
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    clearError();
    setParentLoginError("");
    if (mode === "login") {
      if (collectiveEntry) {
        await login(identifier, password);
        return;
      }
      const options = identityOptions || await checkLoginIdentity();
      if (options?.teacher && options.parent && !loginIdentity) return;
      if (loginIdentity === "parent" || (options?.parent && !options.teacher)) {
        setParentLoggingIn(true);
        try {
          await parentService.login(identifier, password);
          navigate("/parent", { replace: true });
        } catch (cause) {
          setParentLoginError(cause instanceof Error ? cause.message : "家长登录失败");
        } finally {
          setParentLoggingIn(false);
        }
        return;
      }
      await login(identifier, password);
      return;
    }
    if (!createSchool && !selectedSchool) return;
    const result = await register({
      email,
      password,
      name,
      phone,
      subject,
      teachingGrades,
      roles,
      requestSchoolAdmin,
      ...(createSchool
        ? { newSchool: { name: schoolName, code: schoolCode, city: schoolCity, description: schoolDescription } }
        : { schoolId: selectedSchool!.id }),
    });
    if (result === "pending") {
      setRegistrationPending(true);
      setMode("login");
      setPassword("");
    }
  };

  const toggleGrade = (grade: string) => {
    setTeachingGrades((current) => current.includes(grade)
      ? current.filter((item) => item !== grade)
      : [...current, grade]);
  };

  const toggleRole = (role: TeacherRole) => {
    if (role === "teacher") return;
    setRoles((current) => current.includes(role)
      ? current.filter((item) => item !== role)
      : [...current, role]);
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
            {collectiveEntry && (
              <button
                type="button"
                onClick={() => openPage("/login")}
                className="mb-5 inline-flex items-center gap-1 text-xs text-ink-500 transition-colors hover:text-ink-900"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                返回个人登录
              </button>
            )}
            <h2 className="font-serif text-2xl font-bold text-ink-900">
              {mode === "register" ? "创建教师账号" : collectiveEntry ? "进入集体研讨" : "欢迎回来"}
            </h2>
            <p className="text-sm text-ink-500 mt-1">
              {mode === "register"
                ? "搜索并选择所在学校；没有匹配学校时可同时申请新增"
                : collectiveEntry
                  ? "使用备课组内任一教师账号登录"
                  : "登录后继续教学工作"}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === "login" && registrationPending && (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                注册申请已提交。现在可先以个人身份登录；审核通过后，下次登录将默认进入学校身份。
              </div>
            )}
            {mode === "register" && (
              <>
                <Input label="姓名" value={name} onChange={(event) => setName(event.target.value)} required placeholder="请输入真实姓名" />
                <Input label="手机号" type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} required placeholder="请输入手机号" />

                {!createSchool ? (
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-ink-700" htmlFor="registration-school-search">所在学校</label>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
                      <input
                        id="registration-school-search"
                        className="input-base pl-10"
                        value={schoolQuery}
                        onChange={(event) => {
                          setSchoolQuery(event.target.value);
                          setSelectedSchool(null);
                        }}
                        placeholder="搜索学校名称、代码或城市"
                        autoComplete="off"
                      />
                    </div>
                    {selectedSchool ? (
                      <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                        已选择：{selectedSchool.name} · {selectedSchool.city}
                      </div>
                    ) : schoolSearching ? (
                      <p className="text-xs text-ink-400">正在搜索学校...</p>
                    ) : schoolQuery.trim() && schoolResults.length > 0 ? (
                      <div className="max-h-48 overflow-y-auto rounded-lg border border-ink-200 bg-white p-1">
                        {schoolResults.map((school) => (
                          <button
                            key={school.id}
                            type="button"
                            onClick={() => {
                              setSelectedSchool(school);
                              setSchoolQuery(school.name);
                            }}
                            className="w-full rounded-md px-3 py-2 text-left hover:bg-ink-50"
                          >
                            <div className="text-sm font-medium text-ink-900">{school.name}</div>
                            <div className="mt-0.5 text-xs text-ink-400">{school.city} · {school.code}</div>
                          </button>
                        ))}
                      </div>
                    ) : schoolQuery.trim() ? (
                      <p className="text-xs text-ink-500">没有找到匹配学校，可申请新增。</p>
                    ) : (
                      <p className="text-xs text-ink-400">输入学校名称、代码或城市后选择搜索结果。</p>
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setCreateSchool(true);
                        setSelectedSchool(null);
                        setSchoolName(schoolQuery.trim());
                      }}
                    >
                      <Plus className="h-4 w-4" />
                      没有我的学校，申请新增
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3 rounded-lg border border-ink-200 bg-white p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-medium text-ink-800">申请新增学校</div>
                        <p className="mt-0.5 text-xs text-ink-500">注册时会同时提交学校新增申请和您的学校身份申请。</p>
                      </div>
                      <Button type="button" variant="ghost" size="sm" onClick={() => setCreateSchool(false)}>返回搜索</Button>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Input label="学校名称" value={schoolName} onChange={(event) => setSchoolName(event.target.value)} required />
                      <Input label="学校代码" value={schoolCode} onChange={(event) => setSchoolCode(event.target.value)} required placeholder="如 NJUHS" />
                      <Input label="所在城市" value={schoolCity} onChange={(event) => setSchoolCity(event.target.value)} required />
                      <Textarea label="学校简介（可选）" value={schoolDescription} onChange={(event) => setSchoolDescription(event.target.value)} />
                    </div>
                  </div>
                )}

                <Select label="任教学科" value={subject} onChange={(event) => setSubject(event.target.value)} options={SUBJECT_OPTIONS.map((value) => ({ value, label: value }))} />
                <fieldset className="rounded-lg border border-ink-200 bg-white p-4">
                  <legend className="px-1 text-sm font-medium text-ink-700">任教年级</legend>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {GRADE_OPTIONS.map((grade) => (
                      <label key={grade} className="inline-flex items-center gap-2 rounded-md border border-ink-200 px-3 py-2 text-sm">
                        <input type="checkbox" checked={teachingGrades.includes(grade)} onChange={() => toggleGrade(grade)} />
                        {grade}
                      </label>
                    ))}
                  </div>
                </fieldset>
                <fieldset className="rounded-lg border border-ink-200 bg-white p-4">
                  <legend className="px-1 text-sm font-medium text-ink-700">职务与权限申请</legend>
                  <p className="mb-3 text-xs text-ink-500">勾选实际担任的职务；审核通过后获得相应权限。</p>
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
                  <label className="mt-3 inline-flex items-center gap-2 text-sm text-ink-700">
                    <input type="checkbox" checked={requestSchoolAdmin} onChange={(event) => setRequestSchoolAdmin(event.target.checked)} />
                    同时申请学校管理员权限（仅平台超级管理员可授予）
                  </label>
                </fieldset>
              </>
            )}

            {mode === "login" ? (
              <div className="relative">
                <Smartphone className="absolute left-3 top-9 w-4 h-4 text-ink-400" />
                <Input
                  label="邮箱或手机号"
                  type="text"
                  value={identifier}
                  onChange={(event) => {
                    setIdentifier(event.target.value);
                    setIdentityOptions(null);
                    setLoginIdentity(null);
                    setParentLoginError("");
                  }}
                  onBlur={() => { if (!collectiveEntry) void checkLoginIdentity(); }}
                  required
                  autoComplete="username"
                  hint="手机号可直接登录；绑定邮箱用于忘记密码时的身份验证"
                  className="pl-10"
                />
              </div>
            ) : (
              <div className="relative">
                <Mail className="absolute left-3 top-9 w-4 h-4 text-ink-400" />
                <Input
                  label="邮箱（可选）"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  autoComplete="email"
                  hint="可稍后在个人中心绑定，用于忘记密码时找回账号"
                  className="pl-10"
                />
              </div>
            )}
            {mode === "login" && !collectiveEntry && identityOptions?.teacher && identityOptions.parent && (
              <fieldset className="rounded-lg border border-gold-200 bg-gold-50/50 p-3">
                <legend className="px-1 text-sm font-medium text-ink-700">选择登录身份</legend>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <Button type="button" variant={loginIdentity === "teacher" ? "ink" : "outline"} onClick={() => setLoginIdentity("teacher")}>教师身份</Button>
                  <Button type="button" variant={loginIdentity === "parent" ? "ink" : "outline"} onClick={() => setLoginIdentity("parent")}>家长身份</Button>
                </div>
              </fieldset>
            )}
            <div className="relative"><Lock className="absolute left-3 top-9 w-4 h-4 text-ink-400" /><Input label="密码" type="password" minLength={mode === "register" ? 10 : undefined} value={password} onChange={(event) => setPassword(event.target.value)} required className="pl-10" /></div>
            {(error || parentLoginError) && <div className="px-3 py-2 rounded-md bg-red-50 border border-red-200 text-xs text-red-700">{parentLoginError || error}</div>}
            <Button
              type="submit"
              variant="gold"
              size="lg"
              loading={loading || parentLoggingIn}
              className="w-full"
              disabled={mode === "register" && !createSchool && !selectedSchool}
            >
              {mode === "register"
                ? "提交注册申请"
                : collectiveEntry ? "登录并进入集体研讨" : "登录"}
            </Button>
          </form>

          {mode === "login" && (
            <>
              <div className="mt-3 flex justify-end">
                <button
                  type="button"
                  className="text-xs text-gold-700 hover:text-gold-800"
                  onClick={() => setShowRecoveryHelp((visible) => !visible)}
                >
                  忘记密码？
                </button>
              </div>
              {showRecoveryHelp && (
                <div className="mt-2 rounded-md border border-gold-200 bg-gold-50 px-3 py-2 text-xs leading-5 text-ink-600">
                  已绑定邮箱的账号可使用邮箱联系学校管理员完成身份验证；未绑定邮箱时请通过学校登记信息核验身份。
                </div>
              )}
              {!loginOnly && (
                <div className="mt-4 grid grid-cols-2 gap-3" aria-label="快捷登录入口">
                  <Button type="button" variant="outline" onClick={() => openPage("/classroom-login")}>
                    <BookOpen className="w-4 h-4" />我要上课
                  </Button>
                  <Button
                    type="button"
                    variant={collectiveEntry ? "gold" : "outline"}
                    onClick={() => openPage("/prep-login")}
                  >
                    <Users className="w-4 h-4" />集体研讨
                  </Button>
                </div>
              )}
            </>
          )}

          {!loginOnly && (
            <div className="mt-6 space-y-2 text-center text-sm text-ink-500">
              <div>
                {mode === "login" ? "还没有账号？" : "已有账号？"}
                <button type="button" onClick={() => { setMode(mode === "login" ? "register" : "login"); clearError(); }} className="ml-1 text-gold-600 font-medium">{mode === "login" ? "立即注册" : "返回登录"}</button>
              </div>
              {mode === "login" && (
                <div>
                  学校已登记家长手机号？
                  <button type="button" onClick={() => openPage("/parent-register")} className="ml-1 text-gold-600 font-medium">家长注册</button>
                </div>
              )}
            </div>
          )}
          <div className="mt-5 flex items-center justify-center gap-2 text-xs text-ink-400"><School className="w-3.5 h-3.5" /><Smartphone className="w-3.5 h-3.5" /><UserIcon className="w-3.5 h-3.5" /><GraduationCap className="w-3.5 h-3.5" />学校身份需经对应管理员审核</div>
        </div>
      </div>
    </div>
  );
}
