import { openPage } from "@/lib/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { AtSign, Bell, CheckCheck, CircleCheck, Gift, Megaphone, ShieldCheck } from "lucide-react";
import { notificationService } from "@/services/notification";
import type { AppNotification } from "@/types";
import { cn } from "@/lib/utils";

const typeMeta = {
  system: { label: "系统", icon: Megaphone },
  admin: { label: "管理员", icon: ShieldCheck },
  approval: { label: "审批", icon: CircleCheck },
  reward: { label: "奖励", icon: Gift },
  mention: { label: "提及", icon: AtSign },
} as const;

function formatTime(value: string): string {
  const time = new Date(value);
  const diff = Date.now() - time.getTime();
  if (diff >= 0 && diff < 60_000) return "刚刚";
  if (diff >= 0 && diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff >= 0 && diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
  return time.toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

interface NotificationBellProps {
  teacherId: string;
  collapsed?: boolean;
}

export function NotificationBell({ teacherId, collapsed = false }: NotificationBellProps) {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    try {
      const items = await notificationService.listNotifications(teacherId);
      setNotifications(items);
    } catch {
      // 消息入口不能阻断主界面。网络恢复后下一次轮询会自动补齐。
    }
  }, [teacherId]);

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => void refresh(), 30_000);
    const handleFocus = () => void refresh();
    window.addEventListener("focus", handleFocus);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", handleFocus);
    };
  }, [refresh]);

  useEffect(() => {
    if (!open) return;
    const handleOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [open]);

  const unreadCount = notifications.filter((item) => !item.readAt).length;

  const handleOpen = () => {
    setOpen((value) => !value);
    if (!open) void refresh();
  };

  const handleNotification = async (notification: AppNotification) => {
    if (notification.actionUrl) openPage(notification.actionUrl);
    if (!notification.readAt) {
      try {
        const updated = await notificationService.markRead(notification.id, teacherId);
        setNotifications((items) => items.map((item) => item.id === updated.id ? updated : item));
      } catch {
        return;
      }
    }
    setOpen(false);
  };

  const handleMarkAll = async () => {
    if (unreadCount === 0 || loading) return;
    setLoading(true);
    try {
      await notificationService.markAllRead(teacherId);
      const now = new Date().toISOString();
      setNotifications((items) => items.map((item) => item.readAt ? item : { ...item, readAt: now }));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div ref={wrapperRef} className={cn("relative flex-shrink-0", collapsed && "absolute right-1 top-1")}>
      <button
        type="button"
        onClick={handleOpen}
        className={cn(
          "relative flex items-center justify-center rounded-md text-ink-400 hover:bg-ink-800 hover:text-paper transition-colors",
          collapsed ? "w-6 h-6" : "w-8 h-8",
        )}
        title="消息"
        aria-label={unreadCount > 0 ? `消息，${unreadCount} 条未读` : "消息"}
        aria-expanded={open}
      >
        <Bell className={cn(collapsed ? "w-3.5 h-3.5" : "w-4 h-4", unreadCount > 0 && "notification-bell-unread text-gold-300")} />
        {unreadCount > 0 && (
          <span className={cn(
            "absolute rounded-full bg-red-500 text-white font-semibold leading-none flex items-center justify-center ring-2 ring-ink-900",
            collapsed ? "-right-0.5 -top-0.5 min-w-3 h-3 px-0.5 text-[8px]" : "-right-1 -top-1 min-w-4 h-4 px-1 text-[9px]",
          )}>
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className={cn(
          "z-50 overflow-hidden rounded-lg border border-ink-200 bg-paper text-ink-900 shadow-xl",
          collapsed
            ? "fixed left-[4.5rem] top-2 w-[min(22rem,calc(100vw-5.5rem))]"
            : "absolute right-0 top-10 w-[22rem] max-w-[calc(100vw-2rem)]",
        )}>
          <div className="flex items-center justify-between border-b border-ink-100 px-4 py-3">
            <div>
              <div className="text-sm font-semibold">消息</div>
              <div className="mt-0.5 text-[11px] text-ink-400">{unreadCount > 0 ? `${unreadCount} 条未读` : "暂无未读消息"}</div>
            </div>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAll}
                disabled={loading}
                className="flex items-center gap-1 text-xs text-ink-500 hover:text-ink-900 disabled:opacity-50"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                全部已读
              </button>
            )}
          </div>

          <div className="max-h-[28rem] overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="px-6 py-10 text-center">
                <Bell className="mx-auto h-6 w-6 text-ink-300" />
                <div className="mt-2 text-sm text-ink-500">暂时没有消息</div>
              </div>
            ) : notifications.map((notification) => {
              const meta = typeMeta[notification.type];
              const Icon = meta.icon;
              return (
                <button
                  key={notification.id}
                  type="button"
                  onClick={() => void handleNotification(notification)}
                  className={cn(
                    "w-full border-b border-ink-100 px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-mist",
                    !notification.readAt && "bg-gold-50/70",
                  )}
                >
                  <div className="flex gap-3">
                    <div className={cn(
                      "mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full",
                      notification.readAt ? "bg-ink-100 text-ink-500" : "bg-gold-100 text-gold-700",
                    )}>
                      <Icon className="h-3.5 w-3.5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start gap-2">
                        <span className={cn("flex-1 text-sm", !notification.readAt && "font-semibold")}>{notification.title}</span>
                        {!notification.readAt && <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-gold-500" />}
                      </div>
                      <div className="mt-1 line-clamp-2 text-xs leading-5 text-ink-500">{notification.content}</div>
                      <div className="mt-1.5 flex items-center gap-2 text-[10px] text-ink-400">
                        <span>{meta.label}</span>
                        <span>·</span>
                        <span>{formatTime(notification.createdAt)}</span>
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default NotificationBell;
