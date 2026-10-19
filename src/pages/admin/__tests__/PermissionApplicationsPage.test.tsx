import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PermissionApplicationsPage from "../PermissionApplicationsPage";
import { authService } from "@/services/auth";
import { useAuthStore } from "@/stores/auth";
import type { Teacher, TeacherAffiliation } from "@/types";

vi.mock("@/services/auth", () => ({
  authService: {
    getMyTeacherRoleApplications: vi.fn(),
    getPendingTeacherRoleApplications: vi.fn(),
    applyTeacherRoles: vi.fn(),
    reviewTeacherRoleApplication: vi.fn(),
  },
}));

vi.mock("../TeacherProfilesPage", () => ({
  default: ({ embedded }: { embedded?: boolean }) => embedded ? <div>本校教师权限编辑器</div> : null,
}));

vi.mock("@/stores/ui", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

function setRole(role: TeacherAffiliation["role"]) {
  const affiliation: TeacherAffiliation = {
    id: "aff-1", teacherId: "teacher-1", schoolId: "school-1", schoolName: "测试学校",
    subject: "数学", teachingGrades: ["高一"], teachingClassIds: [], homeroomClassIds: [],
    status: "active", role, roles: ["teacher"], subjectGroupIds: [], prepGroupIds: [],
    isCurrent: true, joinedAt: "2026-08-01T00:00:00.000Z",
  };
  const teacher: Teacher = {
    id: "teacher-1", email: "teacher@example.com", name: "测试教师", avatar: "测",
    schoolId: "school-1", subject: "数学", status: "active", role, roles: ["teacher"],
    subjectGroupIds: [], prepGroupIds: [], affiliations: [affiliation],
    currentAffiliationId: affiliation.id, createdAt: "2026-08-01T00:00:00.000Z",
  };
  useAuthStore.setState({ teacher, loading: false, getCurrentAffiliation: () => affiliation });
}

describe("PermissionApplicationsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(authService.getMyTeacherRoleApplications).mockResolvedValue([]);
    vi.mocked(authService.getPendingTeacherRoleApplications).mockResolvedValue([]);
  });

  it("lets school administrators switch between approval and full teacher management", async () => {
    setRole("school_admin");
    const user = userEvent.setup();
    render(<PermissionApplicationsPage />);

    expect(screen.getByRole("heading", { name: "教师权限申请与管理" })).toBeInTheDocument();
    expect(await screen.findByText("本校待审核申请")).toBeInTheDocument();
    expect(screen.queryByText("本校教师权限编辑器")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "本校教师权限管理" }));
    expect(screen.getByText("本校教师权限编辑器")).toBeInTheDocument();
    expect(screen.queryByText("本校待审核申请")).not.toBeInTheDocument();
    await waitFor(() => expect(authService.getPendingTeacherRoleApplications).toHaveBeenCalledOnce());
  });

  it("keeps ordinary teachers in application-only mode", async () => {
    setRole("teacher");
    render(<PermissionApplicationsPage />);

    expect(screen.getByRole("heading", { name: "教师权限申请" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "提交权限申请" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "本校教师权限管理" })).not.toBeInTheDocument();
    expect(screen.queryByText("本校教师权限编辑器")).not.toBeInTheDocument();
    await waitFor(() => expect(authService.getMyTeacherRoleApplications).toHaveBeenCalledOnce());
    expect(authService.getPendingTeacherRoleApplications).not.toHaveBeenCalled();
  });

  it("does not expose school role management to platform administrators", () => {
    setRole("platform_admin");
    render(<PermissionApplicationsPage />);

    expect(screen.getByText(/平台超级管理员不能修改教师职务权限/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "本校教师权限管理" })).not.toBeInTheDocument();
    expect(screen.queryByText("本校教师权限编辑器")).not.toBeInTheDocument();
  });
});
