import { Users } from "lucide-react";
import { useSearchParams } from "react-router";
import { PageHeader } from "@/components/layout/PageHeader";
import { StudentInteractionPage } from "./StudentInteractionPage";
import StudentLearningPage from "@/pages/analytics/StudentLearningPage";
import { StudentSectionTabs } from "./StudentSectionTabs";

type StudentTab = "interaction" | "learning";

export default function MyStudentsPage() {
  const [searchParams] = useSearchParams();
  const activeTab: StudentTab = searchParams.get("tab") === "learning" ? "learning" : "interaction";

  return (
    <div>
      <PageHeader
        title="我的学生"
        description="管理学生互动记录与学习情况"
        icon={<Users className="w-5 h-5" />}
      />

      <StudentSectionTabs />

      {activeTab === "interaction" ? (
        <StudentInteractionPage embedded />
      ) : (
        <StudentLearningPage embedded />
      )}
    </div>
  );
}
