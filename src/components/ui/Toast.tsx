import { CheckCircle2, XCircle, Info, AlertTriangle, X } from "lucide-react";
import { useUIStore } from "@/stores/ui";
import { cn } from "@/lib/utils";
import type { ToastType } from "@/types";

const iconMap: Record<ToastType, typeof Info> = {
  success: CheckCircle2,
  error: XCircle,
  info: Info,
  warning: AlertTriangle,
};

const colorMap: Record<ToastType, string> = {
  success: "border-emerald-200 bg-emerald-50 text-emerald-700",
  error: "border-red-200 bg-red-50 text-red-700",
  info: "border-teal-200 bg-teal-50 text-teal-700",
  warning: "border-amber-200 bg-amber-50 text-amber-700",
};

export function ToastContainer() {
  const { toasts, removeToast } = useUIStore();

  return (
    <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 max-w-sm w-full pointer-events-none">
      {toasts.map((t) => {
        const Icon = iconMap[t.type];
        return (
          <div
            key={t.id}
            className={cn(
              "flex items-start gap-2 p-3 rounded-lg border shadow-cardHover bg-paper animate-slide-in-right pointer-events-auto",
            )}
          >
            <div className={cn("p-1 rounded", colorMap[t.type])}>
              <Icon className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-ink-900">{t.title}</div>
              {t.message && <div className="text-xs text-ink-600 mt-0.5">{t.message}</div>}
            </div>
            <button
              onClick={() => removeToast(t.id)}
              className="text-ink-400 hover:text-ink-700 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

export default ToastContainer;
