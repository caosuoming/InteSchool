import { useState } from "react";
import { ArrowLeft, School, Smartphone, UserRound } from "lucide-react";
import { useNavigate } from "react-router";
import { BrandMark } from "@/components/brand/BrandMark";
import { Button, Input } from "@/components/ui";
import { parentService, type ParentRegistrationContext } from "@/services/parent";

export default function ParentRegisterPage() {
  const navigate = useNavigate();
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [context, setContext] = useState<ParentRegistrationContext | null>(null);
  const [checking, setChecking] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const checkPhone = async () => {
    if (!phone.trim()) return;
    setChecking(true);
    setError("");
    try {
      const result = await parentService.getRegistrationContext(phone);
      setContext(result);
    } catch (cause) {
      setContext(null);
      setError(cause instanceof Error ? cause.message : "无法核验家长手机号");
    } finally {
      setChecking(false);
    }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!context) {
      await checkPhone();
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      await parentService.register({ name, phone, password });
      navigate("/parent", { replace: true });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "注册失败");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-mist p-6">
      <div className="mx-auto max-w-xl py-8">
        <button
          type="button"
          onClick={() => navigate("/login")}
          className="mb-5 inline-flex items-center gap-1 text-sm text-ink-500 hover:text-ink-900"
        >
          <ArrowLeft className="h-4 w-4" />返回登录
        </button>
        <div className="rounded-2xl border border-ink-100 bg-white p-6 shadow-sm sm:p-8">
          <div className="mb-6 flex items-center gap-3">
            <BrandMark className="h-11 w-11" />
            <div>
              <h1 className="font-serif text-2xl font-bold text-ink-900">创建家长账号</h1>
              <p className="mt-1 text-sm text-ink-500">仅学生名单中已登记并授权的家长手机号可以注册。</p>
            </div>
          </div>

          <form className="space-y-4" onSubmit={submit}>
            <div className="space-y-2">
              <div className="relative">
                <Smartphone className="absolute left-3 top-9 h-4 w-4 text-ink-400" />
                <Input
                  label="家长手机号"
                  type="tel"
                  value={phone}
                  onChange={(event) => { setPhone(event.target.value); setContext(null); }}
                  className="pl-10"
                  required
                />
              </div>
              <Button type="button" variant="outline" size="sm" loading={checking} onClick={() => void checkPhone()}>
                核验家长授权
              </Button>
            </div>

            {context && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-4">
                <div className="text-sm font-medium text-emerald-800">已找到 {context.children.length} 名关联学生</div>
                <div className="mt-2 space-y-1.5 text-xs text-emerald-800/80">
                  {context.children.map((child) => (
                    <div key={`${child.schoolId}:${child.id}`} className="flex items-center gap-2">
                      <School className="h-3.5 w-3.5" />
                      {child.schoolName} · {child.className} · {child.name}
                    </div>
                  ))}
                </div>
                {context.registered && (
                  <div className="mt-3 text-xs text-amber-700">该手机号已创建家长账号，请直接返回登录。</div>
                )}
              </div>
            )}

            <div className="relative">
              <UserRound className="absolute left-3 top-9 h-4 w-4 text-ink-400" />
              <Input label="家长姓名" value={name} onChange={(event) => setName(event.target.value)} className="pl-10" required />
            </div>
            <Input
              label="密码"
              type="password"
              minLength={10}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              hint="至少 10 位"
              required
            />
            {error && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
            <Button type="submit" variant="gold" size="lg" className="w-full" loading={submitting} disabled={!context || context.registered}>
              创建家长账号
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
