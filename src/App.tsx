import { lazy, Suspense, useEffect } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router";
import { useAuthStore } from "@/stores/auth";
import { useSettingsStore, applyUiScale } from "@/stores/settings";
import { AppLayout } from "@/components/layout/AppLayout";
import { RequireExamManager } from "@/components/auth/RequireExamManager";
import { RequireSchoolRosterManager } from "@/components/auth/RequireSchoolRosterManager";
import { RequireTeachingProfileManager } from "@/components/auth/RequireTeachingProfileManager";
import { RequireAccountManager } from "@/components/auth/RequireAccountManager";

const LoginPage = lazy(() => import("@/pages/auth/LoginPage"));
const ClassroomLoginPage = lazy(() => import("@/pages/auth/ClassroomLoginPage"));
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
const CoursewarePreviewPage = lazy(() => import("@/pages/resources/CoursewarePreviewPage"));
const BatchSharePage = lazy(() => import("@/pages/resources/BatchSharePage"));
const KnowledgeTreePage = lazy(() => import("@/pages/knowledge-tree/KnowledgeTreePage"));
const BasketsPage = lazy(() => import("@/pages/baskets/BasketsPage"));
const AnalyticsPage = lazy(() => import("@/pages/analytics/AnalyticsPage"));
const OnlineResourcesPage = lazy(() => import("@/pages/online-resources/OnlineResourcesPage"));
const OrganizationPage = lazy(() => import("@/pages/organization/OrganizationPage"));
const AdminPage = lazy(() => import("@/pages/admin/AdminPage"));
const SettingsPage = lazy(() => import("@/pages/admin/SettingsPage"));
const RegistrationAccessPage = lazy(() => import("@/pages/admin/RegistrationAccessPage"));
const PermissionApplicationsPage = lazy(() => import("@/pages/admin/PermissionApplicationsPage"));
const TeacherProfilesPage = lazy(() => import("@/pages/admin/TeacherProfilesPage"));
const AccountManagementPage = lazy(() => import("@/pages/admin/AccountManagementPage"));
const TeacherSchoolApplicationsPage = lazy(() => import("@/pages/admin/TeacherSchoolApplicationsPage"));
const SchoolAdminApplicationsPage = lazy(() => import("@/pages/admin/SchoolAdminApplicationsPage"));
const SchoolCreationApplicationsPage = lazy(() => import("@/pages/admin/SchoolCreationApplicationsPage"));
const SchoolRosterPage = lazy(() => import("@/pages/admin/SchoolRosterPage"));
const ClassesPage = lazy(() => import("@/pages/classes/ClassesPage"));
const PrepWorkspacePage = lazy(() => import("@/pages/prep/PrepWorkspacePage"));
const PrepTaskDetailPage = lazy(() => import("@/pages/prep/PrepTaskDetailPage"));
const MyLessonsPage = lazy(() => import("@/pages/lessons/MyLessonsPage"));
const LessonEditorPage = lazy(() => import("@/pages/lessons/LessonEditorPage"));
const ClassroomPage = lazy(() => import("@/pages/lessons/ClassroomPage"));
const MyStudentsPage = lazy(() => import("@/pages/students/MyStudentsPage"));
const StudentGradesPage = lazy(() => import("@/pages/students/StudentGradesPage"));
const PublishedGradeReportPage = lazy(() => import("@/pages/students/PublishedGradeReportPage"));
const MyExamsPage = lazy(() => import("@/pages/exams/MyExamsPage"));
const ProfilePage = lazy(() => import("@/pages/profile/ProfilePage"));

function RouteLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-mist text-sm text-ink-500">
      页面加载中...
    </div>
  );
}

export default function App() {
  const { init, teacher, loading } = useAuthStore();
  const uiScale = useSettingsStore((s) => s.uiScale);

  useEffect(() => {
    void init();
  }, [init]);

  // 字体版本同步到 :root
  useEffect(() => {
    applyUiScale(uiScale);
  }, [uiScale]);

  if (loading) return <RouteLoading />;

  const protectedRoutes = teacher
    ? teacher.schoolId
      ? (
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
            <Route path="/my-students/archive" element={<Navigate to="/my-students?tab=archive" replace />} />
            <Route path="/my-students/grades" element={<StudentGradesPage />} />
            <Route path="/my-students/exam-rooms" element={<Navigate to="/my-exams/rooms" replace />} />
            <Route path="/student-learning" element={<MyStudentsPage />} />

            {/* 我的考试（年级组长及学校管理身份） */}
            <Route path="/my-exams" element={<RequireExamManager><MyExamsPage /></RequireExamManager>} />
            <Route path="/my-exams/rooms" element={<RequireExamManager><MyExamsPage section="rooms" /></RequireExamManager>} />
            <Route path="/my-exams/invigilation" element={<RequireExamManager><MyExamsPage section="invigilation" /></RequireExamManager>} />
            <Route path="/my-exams/grades" element={<RequireExamManager><MyExamsPage section="grades" /></RequireExamManager>} />

            <Route path="/school-resources" element={<SchoolResourcesPage />} />
            <Route path="/platform-resources" element={<PlatformResourcesPage />} />
            <Route path="/prep" element={<PrepWorkspacePage />} />
            <Route path="/prep/tasks/:id" element={<PrepTaskDetailPage />} />
            <Route path="/admin" element={<AdminPage />} />
            <Route path="/admin/settings" element={<SettingsPage />} />
            <Route path="/admin/registration-access" element={<RegistrationAccessPage />} />
            <Route path="/admin/permission-applications" element={<PermissionApplicationsPage />} />
            <Route path="/admin/teacher-profiles" element={<RequireTeachingProfileManager><TeacherProfilesPage /></RequireTeachingProfileManager>} />
            <Route path="/admin/accounts" element={<RequireAccountManager><AccountManagementPage /></RequireAccountManager>} />
            <Route path="/admin/teacher-school-applications" element={<TeacherSchoolApplicationsPage />} />
            <Route path="/admin/school-admin-applications" element={<SchoolAdminApplicationsPage />} />
            <Route path="/admin/school-creation-applications" element={<SchoolCreationApplicationsPage />} />
            <Route path="/admin/classes" element={<RequireSchoolRosterManager><SchoolRosterPage /></RequireSchoolRosterManager>} />

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
            <Route path="/coursewares/:id" element={<CoursewarePreviewPage />} />
            <Route path="/shared-resources/:batchId" element={<BatchSharePage />} />
            <Route path="/import" element={<Navigate to="/upload" replace />} />

            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/baskets" element={<BasketsPage />} />
            <Route path="/baskets/:id" element={<BasketsPage />} />
            <Route path="/analytics" element={<AnalyticsPage />} />
            <Route path="/classes" element={<ClassesPage personalOnly />} />
            <Route path="/knowledge-tree" element={<KnowledgeTreePage />} />
            <Route path="/online-resources" element={<OnlineResourcesPage />} />
            <Route path="/organization" element={<OrganizationPage />} />

            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </AppLayout>
      )
      : <Navigate to="/school-auth" replace />
    : <Navigate to="/login" replace />;

  return (
    <Router>
      <Suspense fallback={<RouteLoading />}>
        <Routes>
          <Route
            path="/login"
            element={teacher ? <Navigate to={teacher.schoolId ? "/dashboard" : "/school-auth"} replace /> : <LoginPage />}
          />
          <Route
            path="/prep-login"
            element={
              teacher
                ? <Navigate to={teacher.schoolId ? "/prep?entry=collective" : "/school-auth"} replace />
                : <LoginPage destination="/prep?entry=collective" loginOnly />
            }
          />
          <Route path="/classroom-login" element={<ClassroomLoginPage />} />
          <Route path="/grade-reports/:token" element={<PublishedGradeReportPage />} />
          <Route
            path="/classroom"
            element={teacher ? (teacher.schoolId ? <ClassroomPage /> : <Navigate to="/school-auth" replace />) : <Navigate to="/classroom-login" replace />}
          />
          <Route
            path="/classroom/:classId"
            element={teacher ? (teacher.schoolId ? <ClassroomPage /> : <Navigate to="/school-auth" replace />) : <Navigate to="/classroom-login" replace />}
          />
          <Route
            path="/school-auth"
            element={teacher ? <SchoolAuthPage /> : <Navigate to="/login" replace />}
          />
          <Route path="/*" element={protectedRoutes} />
        </Routes>
      </Suspense>
    </Router>
  );
}
