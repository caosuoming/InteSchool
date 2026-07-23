import { useState, useRef, useEffect } from "react";
import {
  Settings2, ChevronLeft, ChevronRight, Eye, EyeOff, RotateCcw,
} from "lucide-react";
import { useTagPrefsStore } from "@/stores/tagPrefs";
import { cn } from "@/lib/utils";

const tagMeta: Record<string, { label: string; description: string }> = {
  type: { label: "题型", description: "单选/多选/判断等" },
  difficulty: { label: "难度", description: "简单~困难" },
  recommendation: { label: "推荐", description: "推荐星级" },
  remark: { label: "备注", description: "备注条数" },
  source: { label: "来源", description: "导入/手动/共享" },
  category: { label: "题类", description: "练习/考试/作业/复习" },
  grade: { label: "年级", description: "高一/高二/高三" },
  schoolYear: { label: "学年", description: "2025-2026等" },
  usage: { label: "使用次数", description: "使用次数统计" },
};

interface TagSettingsProps {
  size?: "sm" | "md";
}

export function TagSettings({ size = "sm" }: TagSettingsProps) {
  const { prefs, toggleHidden, move, reset } = useTagPrefsStore();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const sizeClasses = {
    sm: "text-xs px-2.5 py-1.5",
    md: "text-sm px-3 py-2",
  };

  const visibleCount = prefs.order.filter((k) => !prefs.hidden.includes(k)).length;

  return (
    <div ref={ref} className="relative inline-flex">
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          "font-medium transition-colors rounded-md flex items-center gap-1.5",
          sizeClasses[size],
          open
            ? "bg-gold-50 text-gold-700"
            : "text-ink-500 hover:bg-mist hover:text-ink-700",
        )}
      >
        <Settings2 className={size === "sm" ? "w-3.5 h-3.5" : "w-4 h-4"} />
        <span>标签设置</span>
        <span className="text-[10px] text-ink-400 bg-mist px-1 rounded">
          {visibleCount}/{prefs.order.length}
        </span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 w-72 bg-paper border border-ink-100 rounded-lg shadow-lg z-30 py-2 animate-fade-in">
            <div className="px-3 pb-2 border-b border-ink-50 flex items-center justify-between">
              <div>
                <div className="text-xs font-medium text-ink-700">自定义标签显示</div>
                <div className="text-[11px] text-ink-400 mt-0.5">
                  调整顺序和显示/隐藏
                </div>
              </div>
              <button
                onClick={reset}
                className="text-[11px] text-ink-400 hover:text-gold-600 flex items-center gap-1"
                title="重置为默认"
              >
                <RotateCcw className="w-3 h-3" />
                重置
              </button>
            </div>
            <div className="max-h-80 overflow-y-auto py-1">
              {prefs.order.map((key, index) => {
                const meta = tagMeta[key];
                const isHidden = prefs.hidden.includes(key);
                const isFirst = index === 0;
                const isLast = index === prefs.order.length - 1;
                return (
                  <div
                    key={key}
                    className="flex items-center px-2 py-1.5 hover:bg-mist/50 transition-colors group"
                  >
                    <div className="flex flex-col">
                      <button
                        onClick={() => move(key, "left")}
                        disabled={isFirst}
                        className="p-0.5 text-ink-300 hover:text-gold-600 disabled:opacity-30 disabled:cursor-not-allowed"
                        title="左移"
                      >
                        <ChevronLeft className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => move(key, "right")}
                        disabled={isLast}
                        className="p-0.5 text-ink-300 hover:text-gold-600 disabled:opacity-30 disabled:cursor-not-allowed"
                        title="右移"
                      >
                        <ChevronRight className="w-3 h-3" />
                      </button>
                    </div>
                    <div className="ml-1.5 flex-1 min-w-0">
                      <div className="text-xs font-medium text-ink-700 truncate">
                        {meta?.label || key}
                      </div>
                      <div className="text-[10px] text-ink-400 truncate">
                        {meta?.description || ""}
                      </div>
                    </div>
                    <button
                      onClick={() => toggleHidden(key)}
                      className={cn(
                        "p-1 rounded transition-colors ml-1",
                        isHidden
                          ? "text-ink-300 hover:text-gold-600"
                          : "text-gold-600 hover:text-gold-700",
                      )}
                      title={isHidden ? "显示" : "隐藏"}
                    >
                      {isHidden ? (
                        <EyeOff className="w-3.5 h-3.5" />
                      ) : (
                        <Eye className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
