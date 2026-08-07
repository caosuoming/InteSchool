import type { AnyClass } from "@/types";
import { cn } from "@/lib/utils";

export function ClassAudiencePicker({
  classes,
  selectedClassIds,
  onChange,
}: {
  classes: AnyClass[];
  selectedClassIds: string[];
  onChange: (classIds: string[]) => void;
}) {
  if (classes.length === 0) {
    return <div className="py-10 text-center text-sm text-ink-400">暂无可选班级</div>;
  }

  return (
    <div className="grid max-h-[420px] gap-2 overflow-y-auto sm:grid-cols-2">
      {classes.map((item) => {
        const checked = selectedClassIds.includes(item.id);
        return (
          <label
            key={item.id}
            className={cn(
              "flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-3 transition-colors",
              checked
                ? "border-gold-300 bg-gold-50/60"
                : "border-ink-100 bg-paper hover:border-ink-200 hover:bg-ink-50/40",
            )}
          >
            <input
              type="checkbox"
              checked={checked}
              onChange={() => onChange(checked
                ? selectedClassIds.filter((classId) => classId !== item.id)
                : [...selectedClassIds, item.id])}
              className="rounded border-ink-300 text-gold-500 focus:ring-gold-400"
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-ink-900">{item.name}</span>
              <span className="block truncate text-xs text-ink-400">
                {item.type === "personal" ? "个人班级" : `${item.grade || "未设置年级"} · ${item.studentCount} 人`}
              </span>
            </span>
          </label>
        );
      })}
    </div>
  );
}
