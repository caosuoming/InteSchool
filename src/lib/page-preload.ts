const navigationLoaders: Record<string, () => Promise<unknown>> = {
  dashboard: () => import("@/pages/dashboard/DashboardPage"),
  "my-resources": () => import("@/pages/resources/MyResourcesPage"),
  "my-lessons": () => import("@/pages/lessons/MyLessonsPage"),
  "homework-exams": () => import("@/pages/homework-exams/HomeworkExamManagementPage"),
  "my-students": () => import("@/pages/students/MyStudentsPage"),
  "individual-tutoring": () => import("@/pages/individual-tutoring/IndividualTutoringPage"),
  "my-classrooms": () => import("@/pages/lessons/MyClassroomsPage"),
  "school-resources": () => import("@/pages/resources/SchoolResourcesPage"),
  "platform-resources": () => import("@/pages/resources/PlatformResourcesPage"),
  prep: () => import("@/pages/prep/PrepWorkspacePage"),
  "my-exams": () => import("@/pages/exams/MyExamsPage"),
  admin: () => import("@/pages/admin/AdminPage"),
};

const requested = new Set<string>();

export function preloadNavigationPage(path: string): void {
  const section = path.split("/")[1];
  const load = navigationLoaders[section];
  if (!load || requested.has(section)) return;

  const connection = (navigator as Navigator & {
    connection?: { saveData?: boolean; effectiveType?: string };
  }).connection;
  if (connection?.saveData || connection?.effectiveType?.includes("2g")) return;

  requested.add(section);
  void load().catch(() => requested.delete(section));
}
