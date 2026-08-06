import { Users } from "lucide-react";
import { useSearchParams } from "react-router";
import { PageHeader } from "@/components/layout/PageHeader";
import { StudentInteractionPage } from "./StudentInteractionPage";
import StudentLearningPage from "@/pages/analytics/StudentLearningPage";
import { StudentSectionTabs } from "./StudentSectionTabs";
import { StudentArchivePage } from "./StudentArchivePage";

type StudentTab = "interaction" | "learning" | "archive";

export default function MyStudentsPage() {
  const [searchParams] = useSearchParams();
  const tab = searchParams.get("tab");
  const activeTab: StudentTab = tab === "archive"
    ? "archive"
    : tab === "learning"
      ? "learning"
      : "interaction";

  return (
    <div>
      <PageHeader
        title="我的学生"
        description="管理学生互动、学习情况与档案状态"
        icon={<Users className="w-5 h-5" />}
      />

      <StudentSectionTabs />

      {activeTab === "interaction" ? (
        <StudentInteractionPage embedded />
      ) : activeTab === "learning" ? (
        <StudentLearningPage embedded />
      ) : (
        <StudentArchivePage />
      )}
    </div>
  );
}
