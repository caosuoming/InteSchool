import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PermissionApplicationsPage from "@/pages/admin/PermissionApplicationsPage";
import { roleLabels } from "@/services/organization";
import { authService } from "@/services/auth";
import { classService } from "@/services/class";
import { useAuthStore } from "@/stores/auth";
import type { Teacher, TeacherAffiliation, TeacherPermissionApplication, TeacherRoleApplication } from "@/types";

vi.mock("@/services/auth", () => ({
  authService: {
    getMyTeacherPermissionApplications: vi.fn(), getPendingTeacherPermissionApplications: vi.fn(),
    getMyTeacherRoleApplications: vi.fn(), getPendingTeacherRoleApplications: vi.fn(),
    applyTeacherPermissions: vi.fn(), reviewTeacherPermissionApplication: vi.fn(),
    reviewTeacherRoleApplication: vi.fn(),
  },
}));
vi.mock("@/services/class", () => ({ classService: { listSchoolClasses: vi.fn() } }));
vi.mock("@/stores/ui", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/pages/admin/TeacherProfilesPage", () => ({ default: () => <div>权限管理测试页面</div> }));

const fields = {
  roles: ["teacher", "gradeLeader"] as const,
  teachingClassIds: ["class-1"],
  homeroomClassIds: [],
  position: "年级负责人",
};

const application: TeacherPermissionApplication = {
  id: "application-1", teacherId: "teacher-2", teacherName: "张老师",
  schoolId: "school-1", schoolName: "测试学校",
  requestedRoles: [...fields.roles], requestedTeachingClassIds: [...fields.teachingClassIds],
  requestedHomeroomClassIds: [], requestedPosition: fields.position,
  previous: { roles: ["teacher"], teachingClassIds: [], homeroomClassIds: [], position: "" },
  reason: "负责年级教学课程组织工作", status: "pending", createdAt: "2026-10-19T08:00:00Z",
};

const legacy: TeacherRoleApplication = {
  id: "legacy-1", teacherId: "teacher-3", teacherName: "李老师",
  schoolId: "school-1", schoolName: "测试学校",
  requestedRoles: ["gradeLeader"], reason: "负责教研活动组织工作",
  status: "pending", createdAt: "2026-10-18T08:00:00Z",
};

function renderPage(role: TeacherAffiliation["role"], path = "/admin/permission-applications#review") {
  const affiliation: TeacherAffiliation = {
    id: "affiliation-1", teacherId: "teacher-1", schoolId: "school-1",
    schoolName: "测试学校", subject: "数学", subjectGroupIds: [], prepGroupIds: [],
    status: "active", role, roles: ["teacher"],
    isCurrent: true, joinedAt: "2026-08-01T00:00:00Z",
  };
  const teacher: Teacher = {
    id: "teacher-1", name: "管理员", email: "admin@example.com", avatar: "管",
    schoolId: "school-1", subject: "数学", subjectGroupIds: [], prepGroupIds: [],
    status: "active", role, roles: ["teacher"],
    affiliations: [affiliation], currentAffiliationId: affiliation.id,
    createdAt: "2026-08-01T00:00:00Z",
  };
  useAuthStore.setState({ teacher, getCurrentAffiliation: () => affiliation, refresh: vi.fn().mockResolvedValue(undefined) });
  return render(<MemoryRouter initialEntries={[path]}><PermissionApplicationsPage /></MemoryRouter>);
}

describe("PermissionApplicationsPage school review", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(classService.listSchoolClasses).mockResolvedValue([{
      id: "class-1", schoolId: "school-1", grade: "高一", name: "一班",
    } as Awaited<ReturnType<typeof classService.listSchoolClasses>>[number]]);
    vi.mocked(authService.getMyTeacherPermissionApplications).mockResolvedValue([]);
    vi.mocked(authService.getPendingTeacherPermissionApplications).mockResolvedValue([]);
    vi.mocked(authService.getMyTeacherRoleApplications).mockResolvedValue([]);
    vi.mocked(authService.getPendingTeacherRoleApplications).mockResolvedValue([]);
    vi.mocked(authService.reviewTeacherPermissionApplication).mockResolvedValue(undefined);
    vi.mocked(authService.reviewTeacherRoleApplication).mockResolvedValue(undefined);
  });

  it("opens the school-only review queue directly and approves adjusted permissions", async () => {
    vi.mocked(authService.getPendingTeacherPermissionApplications).mockResolvedValue([application]);
    const user = userEvent.setup();
    renderPage("school_admin");
    expect(await screen.findByRole("heading", { name: "本校待审核权限申请" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "申请权限调整" })).not.toBeInTheDocument();
    const checkbox = screen.getByRole("checkbox", { name: roleLabels.subjectLeader });
    await user.click(checkbox);
    await user.click(screen.getByRole("button", { name: "按上述权限通过" }));
    await waitFor(() => expect(authService.reviewTeacherPermissionApplication).toHaveBeenCalledWith(
      "application-1", true, {
        roles: ["teacher", "gradeLeader", "subjectLeader"],
        teachingClassIds: ["class-1"], homeroomClassIds: [], position: "年级负责人",
      },
    ));
  });

  it("supports adjusting a historical role request before approval", async () => {
    vi.mocked(authService.getPendingTeacherRoleApplications).mockResolvedValue([legacy]);
    const user = userEvent.setup();
    renderPage("school_admin");
    const group = await screen.findByRole("group", { name: "拟批准的职务权限（可调整）" });
    await user.click(within(group).getByRole("checkbox", { name: roleLabels.gradeLeader }));
    await user.click(within(group).getByRole("checkbox", { name: roleLabels.subjectLeader }));
    await user.click(screen.getByRole("button", { name: "按上述权限通过" }));
    await waitFor(() => expect(authService.reviewTeacherRoleApplication)
      .toHaveBeenCalledWith("legacy-1", true, ["subjectLeader"]));
  });

  it("rejects applications without approval adjustments and hides the queue from ordinary teachers", async () => {
    vi.mocked(authService.getPendingTeacherPermissionApplications).mockResolvedValue([application]);
    const user = userEvent.setup();
    const { unmount } = renderPage("school_admin");
    await screen.findByRole("heading", { name: "本校待审核权限申请" });
    await user.click(screen.getByRole("button", { name: "拒绝" }));
    await waitFor(() => expect(authService.reviewTeacherPermissionApplication)
      .toHaveBeenCalledWith("application-1", false, undefined));
    const administratorCalls = vi.mocked(authService.getPendingTeacherPermissionApplications).mock.calls.length;
    unmount();
    renderPage("teacher");
    expect(await screen.findByRole("heading", { name: "申请权限调整" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "本校待审核权限申请" })).not.toBeInTheDocument();
    expect(authService.getPendingTeacherPermissionApplications).toHaveBeenCalledTimes(administratorCalls);
  });
});
