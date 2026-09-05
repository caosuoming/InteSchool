import { Users } from "lucide-react";
import { useLocation, useSearchParams } from "react-router";
import { PageHeader } from "@/components/layout/PageHeader";
import { StudentInteractionPage } from "./StudentInteractionPage";
import { StudentHomeworkRecordPage } from "./StudentHomeworkRecordPage";
import StudentLearningPage from "@/pages/analytics/StudentLearningPage";
import { StudentSectionTabs } from "./StudentSectionTabs";
import { StudentArchivePage } from "./StudentArchivePage";

type StudentTab = "interaction" | "homework" | "learning" | "archive";

export default function MyStudentsPage() {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const tab = searchParams.get("tab");
  const activeTab: StudentTab = location.pathname === "/my-students/archive" || tab === "archive"
    ? "archive"
    : location.pathname === "/my-students/learning" || tab === "learning"
      ? "learning"
      : location.pathname === "/my-students/homework" || tab === "homework"
        ? "homework"
        : "interaction";

  return (
    <div>
      <PageHeader
        title="我的学生"
        description="管理学生互动、作业记录、学习情况与档案状态"
        icon={<Users className="w-5 h-5" />}
      />

      <StudentSectionTabs />

      {activeTab === "interaction" ? (
        <StudentInteractionPage embedded />
      ) : activeTab === "homework" ? (
        <StudentHomeworkRecordPage />
      ) : activeTab === "learning" ? (
        <StudentLearningPage embedded />
      ) : (
        <StudentArchivePage />
      )}
    </div>
  );
}
