import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Mail, Lock, User as UserIcon, BookOpen, Sparkles, Shield, GraduationCap } from "lucide-react";
import { useAuthStore } from "@/stores/auth";
import { Button, Input } from "@/components/ui";
import { cn } from "@/lib/utils";

function WechatIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M8.691 2C4.768 2 1.5 4.693 1.5 8.02c0 1.908 1.01 3.607 2.579 4.734-.152.517-.548 1.885-.622 2.156 0 0-.07.263.102.368.172.106.385.035.385.035s1.785-.97 2.515-1.39c.806.12 1.641.18 2.505.16 1.133.03 2.232-.16 3.275-.52l2.012 1.116s.153.045.262-.02c.108-.065.14-.168.14-.168s.08-.26.167-.558l.016-.05c1.92-1.075 3.208-2.98 3.208-5.117C18.438 4.693 15.169 2 11.246 2c-1.083 0-2.115.15-3.073.424A8.436 8.436 0 0 0 8.691 2zM5.785 5.892a.86.86 0 1 1 0 1.72.86.86 0 0 1 0-1.72zm5.305 0a.86.86 0 1 1 0 1.72.86.86 0 0 1 0-1.72z" />
      <path d="M22.49 15.94c0-2.765-2.711-5.008-6.058-5.008-3.348 0-6.057 2.243-6.057 5.008 0 2.766 2.71 5.009 6.057 5.009.748 0 1.47-.102 2.14-.292l1.85 1.027s.14.06.237-.024c.097-.083.14-.197.14-.197s.074-.226.152-.486l.014-.045c1.245-.85 2.074-2.31 2.074-3.992zm-7.975-1.002a.645.645 0 1 1 0-1.29.645.645 0 0 1 0 1.29zm3.835 0a.645.645 0 1 1 0-1.29.645.645 0 0 1 0 1.29z" />
    </svg>
  );
}

function WecomIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M3.406 7.168h17.188v1.072H3.406zM3.406 11.462h17.188v1.071H3.406zM3.406 15.757h10.74v1.071H3.406z" />
      <path d="M19.624 20.089a.536.536 0 0 1-.379-.158l-2.154-2.127a.536.536 0 0 1 .758-.757l1.774 1.752 3.835-4.758a.536.536 0 0 1 .847.682l-4.192 5.203a.536.536 0 0 1-.489.163z" />
      <path d="M2.138 3.792h19.724v17.116H2.138zm.536-2.009a.536.536 0 0 0-.535.536v20.072c0 .296.239.536.535.536h20.794a.536.536 0 0 0 .536-.536V2.319a.536.536 0 0 0-.536-.536z" />
    </svg>
  );
}

type Mode = "login" | "register";

export default function LoginPage() {
  const navigate = useNavigate();
  const { teacher, login, register, loginWithWechat, loginWithWecom, loading, error, clearError } = useAuthStore();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [thirdPartyLoading, setThirdPartyLoading] = useState<string | null>(null);

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
        : await register(email, password, name);
    if (ok) {
      // 登录/注册成功后由 useEffect 跳转
    }
  };

  const handleDemo = () => {
    setEmail("li.zhang@bj04.edu.cn");
    setPassword("demo1234");
    setMode("login");
  };

  const handleWechatLogin = async () => {
    setThirdPartyLoading("wechat");
    clearError();
    try {
      const mockOpenId = "wx_" + Math.random().toString(36).slice(2, 10);
      const mockUnionId = "union_" + Math.random().toString(36).slice(2, 10);
      await loginWithWechat(mockOpenId, mockUnionId);
    } finally {
      setThirdPartyLoading(null);
    }
  };

  const handleWecomLogin = async () => {
    setThirdPartyLoading("wecom");
    clearError();
    try {
      const mockUserId = "wm_" + Math.random().toString(36).slice(2, 10);
      const mockCorpId = "ww_demo_corp";
      await loginWithWecom(mockUserId, mockCorpId);
    } finally {
      setThirdPartyLoading(null);
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
            © 2025 智题云校 · 教学辅助 SaaS 平台
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
                : "注册后即可申请加入学校"}
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
                placeholder={mode === "register" ? "至少 6 位" : "请输入密码"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
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

          <div className="mt-6">
            <div className="relative flex items-center">
              <div className="flex-1 border-t border-ink-200" />
              <span className="px-4 text-xs text-ink-400">其他登录方式</span>
              <div className="flex-1 border-t border-ink-200" />
            </div>
            <div className="mt-4 flex items-center justify-center gap-6">
              <button
                onClick={handleWechatLogin}
                disabled={thirdPartyLoading !== null}
                className="flex flex-col items-center gap-1.5 group disabled:opacity-50"
              >
                <div className={cn(
                  "w-12 h-12 rounded-full flex items-center justify-center transition-all",
                  "bg-emerald-50 group-hover:bg-emerald-100",
                  thirdPartyLoading === "wechat" && "animate-pulse",
                )}>
                  <WechatIcon className="w-6 h-6 text-emerald-600" />
                </div>
                <span className="text-xs text-ink-600 group-hover:text-ink-800">微信登录</span>
              </button>
              <button
                onClick={handleWecomLogin}
                disabled={thirdPartyLoading !== null}
                className="flex flex-col items-center gap-1.5 group disabled:opacity-50"
              >
                <div className={cn(
                  "w-12 h-12 rounded-full flex items-center justify-center transition-all",
                  "bg-blue-50 group-hover:bg-blue-100",
                  thirdPartyLoading === "wecom" && "animate-pulse",
                )}>
                  <WecomIcon className="w-6 h-6 text-blue-600" />
                </div>
                <span className="text-xs text-ink-600 group-hover:text-ink-800">企业微信</span>
              </button>
            </div>
          </div>

          <div className="mt-8 p-4 rounded-lg bg-ink-50 border border-ink-100">
            <div className="flex items-center gap-2 mb-2">
              <BookOpen className="w-4 h-4 text-gold-600" />
              <span className="text-sm font-medium text-ink-800">演示账号</span>
            </div>
            <p className="text-xs text-ink-600 mb-3">
              点击下方按钮快速填充演示教师账号（北京四中·张立老师）。
            </p>
            <button
              onClick={handleDemo}
              className="text-xs text-gold-700 hover:text-gold-800 font-medium underline-offset-2 hover:underline"
            >
              li.zhang@bj04.edu.cn / demo1234 →
            </button>
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
