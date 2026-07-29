import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router";
import { Mail, Lock, User as UserIcon, Sparkles, Shield, GraduationCap, Smartphone } from "lucide-react";
import { useAuthStore } from "@/stores/auth";
import { Button, Input } from "@/components/ui";

type Mode = "login" | "register";

export default function LoginPage() {
  const navigate = useNavigate();
  const { teacher, login, register, loading, error, clearError } = useAuthStore();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");

  useEffect(() => {
    if (teacher) {
      navigate(teacher.schoolId ? "/dashboard" : "/school-auth");
    }
  }, [teacher, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    const ok =
      mode === "login"
        ? await login(email, password)
        : await register(email, password, name, phone);
    if (ok) {
      // 登录/注册成功后由 useEffect 跳转
    }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-mist">
      {/* 左侧品牌区 */}
      <div className="hidden lg:flex relative bg-ink-900 text-paper overflow-hidden">
        <div className="absolute inset-0 opacity-30">
          {/* 学术几何装饰 */}
          <div className="absolute top-20 left-20 w-72 h-72 rounded-full bg-gold-400 blur-3xl opacity-20" />
          <div className="absolute bottom-20 right-20 w-96 h-96 rounded-full bg-teal-400 blur-3xl opacity-15" />
          {/* 网格背景 */}
          <div
            className="absolute inset-0 opacity-[0.04]"
            style={{
              backgroundImage:
                "linear-gradient(to right, #fff 1px, transparent 1px), linear-gradient(to bottom, #fff 1px, transparent 1px)",
              backgroundSize: "32px 32px",
            }}
          />
        </div>

        <div className="relative z-10 flex flex-col justify-between p-12 w-full">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-lg bg-gold-400 text-ink-900 flex items-center justify-center font-serif font-bold text-2xl">
              智
            </div>
            <div>
              <div className="font-serif text-2xl font-bold">智题云校</div>
              <div className="text-xs text-ink-400 tracking-widest">ZHI TI YUN XIAO</div>
            </div>
          </div>

          <div className="space-y-6 max-w-md">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-gold-400/10 text-gold-300 text-xs font-medium border border-gold-400/20">
              <Sparkles className="w-3 h-3" />
              AI 驱动的智能题库平台
            </div>
            <h1 className="font-serif text-5xl font-bold leading-tight">
              让每一道题
              <br />
              <span className="text-gradient-gold">发挥价值</span>
            </h1>
            <p className="text-ink-300 leading-relaxed">
              多学校隔离、教师自主建题、AI 自动识别知识点与章节、联网分析同类题目、智能生成讲义。从题目结构化到讲义编制的一体化解决方案。
            </p>

            <div className="grid grid-cols-3 gap-4 pt-4">
              {[
                { icon: Shield, label: "学校隔离", desc: "数据安全" },
                { icon: Sparkles, label: "AI 识别", desc: "智能入库" },
                { icon: GraduationCap, label: "讲义生成", desc: "一键组卷" },
              ].map((f) => (
                <div key={f.label} className="text-center">
                  <div className="w-10 h-10 mx-auto rounded-lg bg-ink-800 flex items-center justify-center mb-2">
                    <f.icon className="w-4 h-4 text-gold-400" />
                  </div>
                  <div className="text-xs font-medium">{f.label}</div>
                  <div className="text-[10px] text-ink-400">{f.desc}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="text-xs text-ink-400">
            © 2025–2026 智题云校 · 教学辅助 SaaS 平台
          </div>
        </div>
      </div>

      {/* 右侧表单区 */}
      <div className="flex items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-md">
          <div className="lg:hidden mb-8 flex items-center gap-2">
            <div className="w-10 h-10 rounded-lg bg-ink-900 text-gold-400 flex items-center justify-center font-serif font-bold text-xl">
              智
            </div>
            <div className="font-serif text-xl font-bold text-ink-900">智题云校</div>
          </div>

          <div className="mb-6">
            <h2 className="font-serif text-2xl font-bold text-ink-900">
              {mode === "login" ? "欢迎回来" : "创建账号"}
            </h2>
            <p className="text-sm text-ink-500 mt-1">
              {mode === "login"
                ? "登录账号继续您的教学工作"
                : "使用已获授权或担保的手机号创建账号"}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === "register" && (
              <div className="relative">
                <UserIcon className="absolute left-3 top-9 w-4 h-4 text-ink-400" />
                <Input
                  label="姓名"
                  placeholder="请输入您的姓名"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="pl-10"
                />
              </div>
            )}
            {mode === "register" && (
              <div className="relative">
                <Smartphone className="absolute left-3 top-9 w-4 h-4 text-ink-400" />
                <Input
                  label="手机号"
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel"
                  placeholder="请输入已获授权的手机号"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  required
                  pattern="(?:\+?86)?1[3-9]\d{9}"
                  className="pl-10"
                />
                <p className="mt-1.5 text-xs text-ink-400">
                  仅管理员预授权或现有教师担保名单中的手机号可以注册
                </p>
              </div>
            )}
            <div className="relative">
              <Mail className="absolute left-3 top-9 w-4 h-4 text-ink-400" />
              <Input
                label="邮箱"
                type="email"
                placeholder="teacher@school.edu.cn"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="pl-10"
              />
            </div>
            <div className="relative">
              <Lock className="absolute left-3 top-9 w-4 h-4 text-ink-400" />
              <Input
                label="密码"
                type="password"
                placeholder={mode === "register" ? "至少 10 位" : "请输入密码"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={mode === "register" ? 10 : undefined}
                className="pl-10"
              />
            </div>

            {error && (
              <div className="px-3 py-2 rounded-md bg-red-50 border border-red-200 text-xs text-red-700">
                {error}
              </div>
            )}

            <Button type="submit" variant="gold" size="lg" loading={loading} className="w-full">
              {mode === "login" ? "登 录" : "注 册"}
            </Button>
          </form>

          <div className="mt-6 text-center text-sm text-ink-500">
            {mode === "login" ? (
              <>
                还没有账号？
                <button
                  onClick={() => {
                    setMode("register");
                    clearError();
                  }}
                  className="ml-1 text-gold-600 hover:text-gold-700 font-medium"
                >
                  立即注册
                </button>
              </>
            ) : (
              <>
                已有账号？
                <button
                  onClick={() => {
                    setMode("login");
                    clearError();
                  }}
                  className="ml-1 text-gold-600 hover:text-gold-700 font-medium"
                >
                  返回登录
                </button>
              </>
            )}
          </div>
          <div className="mt-6 text-center">
            <Link to="/school-auth" className="text-xs text-ink-400 hover:text-ink-600">
              浏览学校列表 →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
