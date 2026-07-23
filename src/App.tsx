import { lazy, Suspense, useEffect } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { useAuthStore } from "@/stores/auth";
import { useSettingsStore, applyUiScale } from "@/stores/settings";
import { AppLayout } from "@/components/layout/AppLayout";

const LoginPage = lazy(() => import("@/pages/auth/LoginPage"));
const SchoolAuthPage = lazy(() => import("@/pages/auth/SchoolAuthPage"));
const DashboardPage = lazy(() => import("@/pages/dashboard/DashboardPage"));
const LectureEditorPage = lazy(() => import("@/pages/lectures/LectureEditorPage"));
const LecturePreviewPage = lazy(() => import("@/pages/lectures/LecturePreviewPage"));
const ExamPaperEditorPage = lazy(() => import("@/pages/exam-papers/ExamPaperEditorPage"));
const ExamPaperAnswerSheetPage = lazy(() => import("@/pages/exam-papers/ExamPaperAnswerSheetPage"));
const MyResourcesPage = lazy(() => import("@/pages/resources/MyResourcesPage"));
const SchoolResourcesPage = lazy(() => import("@/pages/resources/SchoolResourcesPage"));
const PlatformResourcesPage = lazy(() => import("@/pages/resources/PlatformResourcesPage"));
const UploadPage = lazy(() => import("@/pages/resources/UploadPage"));
const ResourcePreviewPage = lazy(() => import("@/pages/resources/ResourcePreviewPage"));
const KnowledgeTreePage = lazy(() => import("@/pages/knowledge-tree/KnowledgeTreePage"));
const ClassesPage = lazy(() => import("@/pages/classes/ClassesPage"));
const BasketsPage = lazy(() => import("@/pages/baskets/BasketsPage"));
const AnalyticsPage = lazy(() => import("@/pages/analytics/AnalyticsPage"));
const OnlineResourcesPage = lazy(() => import("@/pages/online-resources/OnlineResourcesPage"));
const OrganizationPage = lazy(() => import("@/pages/organization/OrganizationPage"));
const AdminPage = lazy(() => import("@/pages/admin/AdminPage"));
const SettingsPage = lazy(() => import("@/pages/admin/SettingsPage"));
const PrepTaskDetailPage = lazy(() => import("@/pages/prep/PrepTaskDetailPage"));
const MyLessonsPage = lazy(() => import("@/pages/lessons/MyLessonsPage"));
const LessonEditorPage = lazy(() => import("@/pages/lessons/LessonEditorPage"));
const MyStudentsPage = lazy(() => import("@/pages/students/MyStudentsPage"));
const ProfilePage = lazy(() => import("@/pages/profile/ProfilePage"));

function RouteLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-mist text-sm text-ink-500">
      页面加载中...
    </div>
  );
}

export default function App() {
  const { init, teacher } = useAuthStore();
  const uiScale = useSettingsStore((s) => s.uiScale);

  useEffect(() => {
    init();
  }, [init]);

  // 字体版本同步到 :root
  useEffect(() => {
    applyUiScale(uiScale);
  }, [uiScale]);

  return (
    <Router>
      <Suspense fallback={<RouteLoading />}>
        <Routes>
        {/* 公共路由 */}
        <Route
          path="/login"
          element={teacher ? <Navigate to={teacher.schoolId ? "/dashboard" : "/school-auth"} replace /> : <LoginPage />}
        />
        <Route
          path="/school-auth"
          element={teacher ? (teacher.schoolId ? <Navigate to="/dashboard" replace /> : <SchoolAuthPage />) : <Navigate to="/login" replace />}
        />

        {/* 受保护路由（需登录 + 已加入学校） */}
        <Route
          path="/*"
          element={
            <AppLayout>
              <Routes>
                {/* 工作台 */}
                <Route path="/dashboard" element={<DashboardPage />} />

                {/* 我的资源 */}
                <Route path="/my-resources" element={<MyResourcesPage />} />
                <Route path="/my-resources/questions" element={<MyResourcesPage initialTab="question" />} />
                <Route path="/my-resources/exam-papers" element={<MyResourcesPage initialTab="examPaper" />} />
                <Route path="/my-resources/lectures" element={<MyResourcesPage initialTab="lecture" />} />
                <Route path="/my-resources/coursewares" element={<MyResourcesPage initialTab="courseware" />} />
                <Route path="/my-resources/materials" element={<MyResourcesPage initialTab="material" />} />

                {/* 上传资源 */}
                <Route path="/upload" element={<UploadPage />} />

                {/* 我的上课 */}
                <Route path="/my-lessons" element={<MyLessonsPage />} />
                <Route path="/my-lessons/:id/edit" element={<LessonEditorPage />} />

                {/* 我的学生 */}
                <Route path="/my-students" element={<MyStudentsPage />} />
                <Route path="/my-students/interaction" element={<MyStudentsPage />} />
                <Route path="/my-students/learning" element={<MyStudentsPage />} />
                {/* 兼容旧路由 */}
                <Route path="/student-learning" element={<MyStudentsPage />} />

                {/* 校本资源 */}
                <Route path="/school-resources" element={<SchoolResourcesPage />} />

                {/* 平台资源 */}
                <Route path="/platform-resources" element={<PlatformResourcesPage />} />

                {/* 集体备课 */}
                <Route path="/prep" element={<DashboardPage />} />
                <Route path="/prep/tasks/:id" element={<PrepTaskDetailPage />} />

                {/* 后台设置 */}
                <Route path="/admin" element={<AdminPage />} />
                <Route path="/admin/settings" element={<SettingsPage />} />

                {/* 兼容旧路由 - 重定向到新路由 */}
                <Route path="/question-bank" element={<Navigate to="/my-resources/questions" replace />} />
                <Route path="/question-bank/:id" element={<Navigate to="/my-resources/questions" replace />} />
                <Route path="/lectures" element={<Navigate to="/my-resources/lectures" replace />} />
                <Route path="/lectures/new" element={<LectureEditorPage />} />
                <Route path="/lectures/:id/edit" element={<LectureEditorPage />} />
                <Route path="/lectures/:id/preview" element={<LecturePreviewPage />} />
                <Route path="/exam-papers/:id" element={<ExamPaperEditorPage />} />
                <Route path="/exam-papers/:id/preview" element={<ExamPaperEditorPage />} />
                <Route path="/exam-papers/:id/answer-sheet" element={<ExamPaperAnswerSheetPage />} />
                <Route path="/resources/preview/:id" element={<ResourcePreviewPage />} />
                <Route path="/import" element={<Navigate to="/upload" replace />} />

                {/* 个人中心 */}
                <Route path="/profile" element={<ProfilePage />} />

                {/* 其他功能页面 */}
                <Route path="/baskets" element={<BasketsPage />} />
                <Route path="/baskets/:id" element={<BasketsPage />} />
                <Route path="/analytics" element={<AnalyticsPage />} />
                <Route path="/classes" element={<ClassesPage />} />
                <Route path="/knowledge-tree" element={<KnowledgeTreePage />} />
                <Route path="/online-resources" element={<OnlineResourcesPage />} />
                <Route path="/organization" element={<OrganizationPage />} />

                <Route path="/" element={<Navigate to="/dashboard" replace />} />
                <Route path="*" element={<Navigate to="/dashboard" replace />} />
              </Routes>
            </AppLayout>
          }
        />
        </Routes>
      </Suspense>
    </Router>
  );
}
