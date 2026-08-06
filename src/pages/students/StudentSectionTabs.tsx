import { Archive, BarChart3, LineChart, MessagesSquare } from "lucide-react";
import { Link, useLocation, useSearchParams } from "react-router";
import { cn } from "@/lib/utils";

const tabs = [
  { key: "interaction", label: "师生互动", icon: MessagesSquare, path: "/my-students?tab=interaction" },
  { key: "learning", label: "学生学情", icon: LineChart, path: "/my-students?tab=learning" },
  { key: "grades", label: "成绩查询", icon: BarChart3, path: "/my-students/grades" },
  { key: "archive", label: "档案记录", icon: Archive, path: "/my-students?tab=archive" },
] as const;

export function StudentSectionTabs() {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const active = location.pathname === "/my-students/grades"
    ? "grades"
    : location.pathname === "/my-students/archive" || searchParams.get("tab") === "archive"
      ? "archive"
      : searchParams.get("tab") === "learning"
        ? "learning"
        : "interaction";

  return (
    <div className="mb-5 border-b border-ink-200">
      <div className="flex gap-1 overflow-x-auto">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const selected = active === tab.key;
          return (
            <Link
              key={tab.key}
              to={tab.path}
              className={cn(
                "px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px flex items-center gap-2 whitespace-nowrap",
                selected
                  ? "text-gold-600 border-gold-500"
                  : "text-ink-500 border-transparent hover:text-ink-700 hover:border-ink-300",
              )}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
