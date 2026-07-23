import { useState } from "react";
import { useAuthStore } from "@/stores/auth";
import { Button, Card } from "@/components/ui";
import { cn } from "@/lib/utils";
import { toast } from "@/stores/ui";
import { User, Settings, Link2, Unlink, CheckCircle, Loader2 } from "lucide-react";

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

export default function ProfilePage() {
  const { teacher, bindWechat, unbindWechat, bindWecom, unbindWecom } = useAuthStore();
  const [wechatLoading, setWechatLoading] = useState(false);
  const [wecomLoading, setWecomLoading] = useState(false);

  if (!teacher) return null;

  const handleBindWechat = async () => {
    setWechatLoading(true);
    try {
      const mockOpenId = "wx_" + Math.random().toString(36).slice(2, 10);
      const mockUnionId = "union_" + Math.random().toString(36).slice(2, 10);
      await bindWechat(mockOpenId, mockUnionId);
      toast.success("微信绑定成功", "下次可直接使用微信登录");
    } catch (e) {
      toast.error("绑定失败", e instanceof Error ? e.message : undefined);
    } finally {
      setWechatLoading(false);
    }
  };

  const handleUnbindWechat = async () => {
    if (!confirm("确定要解绑微信吗？解绑后将无法使用微信登录。")) return;
    try {
      await unbindWechat();
      toast.success("微信已解绑");
    } catch (e) {
      toast.error("解绑失败", e instanceof Error ? e.message : undefined);
    }
  };

  const handleBindWecom = async () => {
    setWecomLoading(true);
    try {
      const mockUserId = "wm_" + Math.random().toString(36).slice(2, 10);
      const mockCorpId = "ww_demo_corp";
      await bindWecom(mockUserId, mockCorpId);
      toast.success("企业微信绑定成功", "下次可直接使用企业微信登录");
    } catch (e) {
      toast.error("绑定失败", e instanceof Error ? e.message : undefined);
    } finally {
      setWecomLoading(false);
    }
  };

  const handleUnbindWecom = async () => {
    if (!confirm("确定要解绑企业微信吗？解绑后将无法使用企业微信登录。")) return;
    try {
      await unbindWecom();
      toast.success("企业微信已解绑");
    } catch (e) {
      toast.error("解绑失败", e instanceof Error ? e.message : undefined);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      <div className="flex items-center gap-4 mb-8">
        <div className="w-16 h-16 rounded-full bg-gold-400 text-ink-900 flex items-center justify-center font-serif font-bold text-2xl">
          {teacher.avatar || teacher.name.charAt(0)}
        </div>
        <div>
          <h1 className="font-serif text-2xl font-bold text-ink-900">{teacher.name}</h1>
          <p className="text-sm text-ink-500">{teacher.email}</p>
        </div>
      </div>

      <Card className="p-6 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <Settings className="w-4 h-4 text-ink-500" />
          <h2 className="font-medium text-ink-900">账号安全</h2>
        </div>

        <div className="space-y-4">
          <div className={cn(
            "flex items-center justify-between p-4 rounded-lg border transition-all",
            teacher.wechatOpenId
              ? "bg-emerald-50/50 border-emerald-200"
              : "bg-mist/50 border-ink-200",
          )}>
            <div className="flex items-center gap-4">
              <div className={cn(
                "w-10 h-10 rounded-full flex items-center justify-center",
                teacher.wechatOpenId ? "bg-emerald-100" : "bg-ink-100",
              )}>
                <WechatIcon className={cn(
                  "w-5 h-5",
                  teacher.wechatOpenId ? "text-emerald-600" : "text-ink-400",
                )} />
              </div>
              <div>
                <div className="font-medium text-ink-900">微信</div>
                <div className="text-xs text-ink-500">
                  {teacher.wechatOpenId
                    ? "已绑定，可用于快捷登录"
                    : "绑定后可使用微信直接登录"}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {teacher.wechatOpenId ? (
                <div className="flex items-center gap-1 text-xs text-emerald-600 mr-2">
                  <CheckCircle className="w-3.5 h-3.5" />
                  已绑定
                </div>
              ) : null}
              {teacher.wechatOpenId ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleUnbindWechat}
                  disabled={wechatLoading}
                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
                >
                  <Unlink className="w-3.5 h-3.5" />
                  解绑
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleBindWechat}
                  disabled={wechatLoading}
                  className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                >
                  {wechatLoading ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Link2 className="w-3.5 h-3.5" />
                  )}
                  绑定微信
                </Button>
              )}
            </div>
          </div>

          <div className={cn(
            "flex items-center justify-between p-4 rounded-lg border transition-all",
            teacher.wecomUserId
              ? "bg-blue-50/50 border-blue-200"
              : "bg-mist/50 border-ink-200",
          )}>
            <div className="flex items-center gap-4">
              <div className={cn(
                "w-10 h-10 rounded-full flex items-center justify-center",
                teacher.wecomUserId ? "bg-blue-100" : "bg-ink-100",
              )}>
                <WecomIcon className={cn(
                  "w-5 h-5",
                  teacher.wecomUserId ? "text-blue-600" : "text-ink-400",
                )} />
              </div>
              <div>
                <div className="font-medium text-ink-900">企业微信</div>
                <div className="text-xs text-ink-500">
                  {teacher.wecomUserId
                    ? "已绑定，可用于快捷登录"
                    : "绑定后可使用企业微信直接登录"}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {teacher.wecomUserId ? (
                <div className="flex items-center gap-1 text-xs text-blue-600 mr-2">
                  <CheckCircle className="w-3.5 h-3.5" />
                  已绑定
                </div>
              ) : null}
              {teacher.wecomUserId ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleUnbindWecom}
                  disabled={wecomLoading}
                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
                >
                  <Unlink className="w-3.5 h-3.5" />
                  解绑
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleBindWecom}
                  disabled={wecomLoading}
                  className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                >
                  {wecomLoading ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Link2 className="w-3.5 h-3.5" />
                  )}
                  绑定企微
                </Button>
              )}
            </div>
          </div>
        </div>
      </Card>

      <Card className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <User className="w-4 h-4 text-ink-500" />
          <h2 className="font-medium text-ink-900">个人信息</h2>
        </div>
        <div className="space-y-3">
          <div className="flex items-center justify-between py-2 border-b border-ink-100">
            <span className="text-sm text-ink-500">姓名</span>
            <span className="text-sm font-medium text-ink-900">{teacher.name}</span>
          </div>
          <div className="flex items-center justify-between py-2 border-b border-ink-100">
            <span className="text-sm text-ink-500">邮箱</span>
            <span className="text-sm font-medium text-ink-900">{teacher.email}</span>
          </div>
          <div className="flex items-center justify-between py-2">
            <span className="text-sm text-ink-500">账号状态</span>
            <span className={cn(
              "text-sm font-medium",
              teacher.status === "active" ? "text-emerald-600" :
              teacher.status === "pending" ? "text-amber-600" : "text-red-600",
            )}>
              {teacher.status === "active" ? "已激活" :
               teacher.status === "pending" ? "待审核" : "已拒绝"}
            </span>
          </div>
        </div>
      </Card>
    </div>
  );
}