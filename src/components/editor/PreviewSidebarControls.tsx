import { ClipboardCheck, ListChecks, ShoppingBasket } from "lucide-react";
import { cn } from "@/lib/utils";

export interface PreviewSidebarVisibility {
  properties: boolean;
  answerStatus: boolean;
  basket: boolean;
}

interface PreviewSidebarControlsProps {
  value: PreviewSidebarVisibility;
  onChange: (value: PreviewSidebarVisibility) => void;
}

const items = [
  { key: "properties" as const, label: "题目属性", icon: ListChecks },
  { key: "answerStatus" as const, label: "答题情况", icon: ClipboardCheck },
  { key: "basket" as const, label: "添加资源篮", icon: ShoppingBasket },
];

export function PreviewSidebarControls({ value, onChange }: PreviewSidebarControlsProps) {
  return (
    <div
      role="toolbar"
      aria-label="题目侧栏显示控制"
      className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-ink-100 pt-3"
    >
      <span className="mr-1 text-[11px] font-medium text-ink-400">显示内容</span>
      {items.map(({ key, label, icon: Icon }) => {
        const active = value[key];
        return (
          <button
            key={key}
            type="button"
            aria-pressed={active}
            onClick={() => onChange({ ...value, [key]: !active })}
            className={cn(
              "no-print inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors",
              active
                ? "border-gold-200 bg-gold-50 text-gold-700"
                : "border-ink-200 bg-paper text-ink-400 hover:border-ink-300 hover:text-ink-600",
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        );
      })}
    </div>
  );
}
