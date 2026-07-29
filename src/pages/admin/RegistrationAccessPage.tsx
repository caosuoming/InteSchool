import { useCallback, useEffect, useMemo, useState } from "react";
import { ShieldCheck, Smartphone, Trash2, UserCheck, UserPlus } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge, Button, Card, Input } from "@/components/ui";
import { authService } from "@/services/auth";
import { useAuthStore } from "@/stores/auth";
import { toast } from "@/stores/ui";
import type { RegistrationAuthorization, RegistrationAuthorizationKind, Teacher } from "@/types";
import { cn } from "@/lib/utils";

function currentRole(teacher: Teacher | null): string | null {
  if (!teacher) return null;
  const affiliation = teacher.affiliations.find((item) => item.id === teacher.currentAffiliationId)
    || teacher.affiliations.find((item) => item.isCurrent);
  return affiliation?.role || teacher.role;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

export default function RegistrationAccessPage() {
  const teacher = useAuthStore((state) => state.teacher);
  const isAdmin = ["school_admin", "platform_admin"].includes(currentRole(teacher) || "");
  const [kind, setKind] = useState<RegistrationAuthorizationKind>(isAdmin ? "admin" : "guarantee");
  const [phone, setPhone] = useState("");
  const [records, setRecords] = useState<RegistrationAuthorization[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  useEffect(() => {
    if (!isAdmin) setKind("guarantee");
  }, [isAdmin]);

  const loadRecords = useCallback(async () => {
    setLoading(true);
    try {
      setRecords(await authService.listRegistrationAuthorizations());
    } catch (error) {
      toast.error("加载注册授权失败", error instanceof Error ? error.message : undefined);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRecords();
  }, [loadRecords]);

  const pendingCount = useMemo(() => records.filter((record) => !record.consumedAt).length, [records]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      const created = await authService.createRegistrationAuthorization(phone, kind);
      setRecords((current) => [created, ...current]);
      setPhone("");
      toast.success(kind === "admin" ? "已添加管理员预授权" : "已加入担保名单");
    } catch (error) {
      toast.error("添加失败", error instanceof Error ? error.message : undefined);
    } finally {
      setSubmitting(false);
    }
  };

  const handleRevoke = async (record: RegistrationAuthorization) => {
    setRevokingId(record.id);
    try {
      await authService.revokeRegistrationAuthorization(record.id);
      setRecords((current) => current.filter((item) => item.id !== record.id));
      toast.success("注册授权已撤销");
    } catch (error) {
      toast.error("撤销失败", error instanceof Error ? error.message : undefined);
    } finally {
      setRevokingId(null);
    }
  };

  return (
    <div className="min-h-screen bg-mist">
      <div className="max-w-5xl mx-auto px-4 py-6">
        <PageHeader
          title="教师注册管理"
          description={isAdmin
            ? "管理学校的教师注册准入；管理员可预授权，也可查看本校教师担保记录"
            : "将待注册教师的手机号加入“我来担保”名单"}
          icon={<UserPlus className="w-5 h-5" />}
        />

        <div className="grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
          <Card className="p-5 h-fit">
            <div className="flex items-start gap-3 mb-5">
              <div className="w-10 h-10 rounded-lg bg-gold-50 text-gold-700 flex items-center justify-center flex-shrink-0">
                {kind === "admin" ? <ShieldCheck className="w-5 h-5" /> : <UserCheck className="w-5 h-5" />}
              </div>
              <div>
                <h2 className="font-serif font-semibold text-ink-900">
                  {kind === "admin" ? "管理员预授权" : "我来担保"}
                </h2>
                <p className="text-xs text-ink-500 mt-1 leading-relaxed">
                  手机号仅可核销一次。完成注册后，授权记录会保留为已使用状态。
                </p>
              </div>
            </div>

            {isAdmin && (
              <div className="grid grid-cols-2 gap-2 mb-4">
                <button
                  type="button"
                  onClick={() => setKind("admin")}
                  className={cn(
                    "rounded-lg border px-3 py-2 text-sm transition-colors",
                    kind === "admin"
                      ? "border-gold-400 bg-gold-50 text-gold-800"
                      : "border-ink-200 bg-white text-ink-600 hover:border-ink-300",
                  )}
                >
                  管理员预授权
                </button>
                <button
                  type="button"
                  onClick={() => setKind("guarantee")}
                  className={cn(
                    "rounded-lg border px-3 py-2 text-sm transition-colors",
                    kind === "guarantee"
                      ? "border-gold-400 bg-gold-50 text-gold-800"
                      : "border-ink-200 bg-white text-ink-600 hover:border-ink-300",
                  )}
                >
                  我来担保
                </button>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="relative">
                <Smartphone className="absolute left-3 top-9 w-4 h-4 text-ink-400" />
                <Input
                  label="待注册教师手机号"
                  type="tel"
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="例如 13800138000"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  required
                  pattern="(?:[+]86)?1[3-9][0-9]{9}"
                  className="pl-10"
                />
              </div>
              <Button type="submit" variant="gold" loading={submitting} className="w-full">
                {kind === "admin" ? "添加预授权" : "加入担保名单"}
              </Button>
            </form>
          </Card>

          <Card className="p-5">
            <div className="flex items-center justify-between gap-4 mb-4">
              <div>
                <h2 className="font-serif font-semibold text-ink-900">授权记录</h2>
                <p className="text-xs text-ink-500 mt-1">
                  {isAdmin ? "显示本校全部注册授权" : "仅显示由你担保的手机号"}
                </p>
              </div>
              <Badge variant="gold">待注册 {pendingCount}</Badge>
            </div>

            {loading ? (
              <div className="py-16 text-center text-sm text-ink-400">加载中...</div>
            ) : records.length === 0 ? (
              <div className="py-16 text-center">
                <UserPlus className="w-8 h-8 mx-auto text-ink-300 mb-3" />
                <p className="text-sm text-ink-500">暂无注册授权记录</p>
              </div>
            ) : (
              <div className="divide-y divide-ink-100">
                {records.map((record) => (
                  <div key={record.id} className="py-4 first:pt-0 last:pb-0 flex items-center gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-ink-900 tabular-nums">{record.phone}</span>
                        <Badge variant={record.kind === "admin" ? "gold" : "teal"}>
                          {record.kind === "admin" ? "管理员预授权" : "教师担保"}
                        </Badge>
                        <Badge variant={record.consumedAt ? "green" : "amber"}>
                          {record.consumedAt ? "已注册" : "待注册"}
                        </Badge>
                      </div>
                      <div className="text-xs text-ink-400 mt-1.5 leading-relaxed">
                        添加人：{record.createdByName || "未知教师"} · {formatDate(record.createdAt)}
                        {record.consumedAt && (
                          <> · 注册人：{record.consumedByName || "未知教师"} · {formatDate(record.consumedAt)}</>
                        )}
                      </div>
                    </div>
                    {!record.consumedAt && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        loading={revokingId === record.id}
                        onClick={() => void handleRevoke(record)}
                        aria-label={`撤销 ${record.phone} 的注册授权`}
                        title="撤销授权"
                      >
                        <Trash2 className="w-4 h-4 text-red-600" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
