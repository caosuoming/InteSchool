import { useState } from "react";
import { MessagesSquare, LineChart, Users } from "lucide-react";
import { useSearchParams } from "react-router";
import { PageHeader } from "@/components/layout/PageHeader";
import { cn } from "@/lib/utils";
import { StudentInteractionPage } from "./StudentInteractionPage";
import StudentLearningPage from "@/pages/analytics/StudentLearningPage";

type StudentTab = "interaction" | "learning";

const tabConfig: { key: StudentTab; label: string; icon: typeof MessagesSquare }[] = [
  { key: "interaction", label: "师生互动", icon: MessagesSquare },
  { key: "learning", label: "学生学情", icon: LineChart },
];

export default function MyStudentsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initial = (searchParams.get("tab") as StudentTab) || "interaction";
  const [activeTab, setActiveTab] = useState<StudentTab>(initial);

  const handleTabChange = (tab: StudentTab) => {
    setActiveTab(tab);
    setSearchParams({ tab });
  };

  return (
    <div>
      <PageHeader
        title="我的学生"
        description="管理学生互动记录与学习情况"
        icon={<Users className="w-5 h-5" />}
      />

      {/* 顶部 Tab 切换 */}
      <div className="mb-4 border-b border-ink-200">
        <div className="flex gap-1">
          {tabConfig.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => handleTabChange(tab.key)}
                className={cn(
                  "px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px flex items-center gap-2",
                  active
                    ? "text-gold-600 border-gold-500"
                    : "text-ink-500 border-transparent hover:text-ink-700 hover:border-ink-300",
                )}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {activeTab === "interaction" ? (
        <StudentInteractionPage embedded />
      ) : (
        <StudentLearningPage embedded />
      )}
    </div>
  );
}
