import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PermissionApplicationsPage from "@/pages/admin/PermissionApplicationsPage";
import { authService } from "@/services/auth";
import { classService } from "@/services/class";
import { useAuthStore } from "@/stores/auth";
import type { Teacher, TeacherAffiliation, TeacherPermissionApplication } from "@/types";

vi.mock("@/services/auth", () => ({
  authService: {
    applyTeacherPermissions: vi.fn(),
    getMyTeacherPermissionApplications: vi.fn(),
    getPendingTeacherPermissionApplications: vi.fn(),
    reviewTeacherPermissionApplication: vi.fn(),
    getMyTeacherRoleApplications: vi.fn(),
    getPendingTeacherRoleApplications: vi.fn(),
    reviewTeacherRoleApplication: vi.fn(),
  },
}));

vi.mock("@/services/class", () => ({
  classService: { listSchoolClasses: vi.fn() },
}));

vi.mock("@/pages/admin/TeacherProfilesPage", () => ({
  default: ({ embedded }: { embedded?: boolean }) => embedded ? <div>本校教师权限编辑器</div> : null,
}));

vi.mock("@/stores/ui", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

function setAccount(role: TeacherAffiliation["role"]) {
  const affiliation: TeacherAffiliation = {
    id: "aff-1", teacherId: "teacher-1", schoolId: "school-1",
    schoolName: "南京测试学校", subject: "数学",
    teachingClassIds: [], homeroomClassIds: [],
    status: "active", role, roles: ["teacher"],
    subjectGroupIds: [], prepGroupIds: [], isCurrent: true,
    joinedAt: "2026-08-01",
  };
  const teacher = {
    id: "teacher-1", name: "申请人", schoolId: "school-1",
    affiliations: [affiliation], currentAffiliationId: "aff-1", role,
  } as Teacher;
  useAuthStore.setState({
    teacher, getCurrentAffiliation: () => affiliation, refresh: vi.fn().mockResolvedValue(undefined),
  });
}

const classes = [
  { id: "cls-1", name: "一班", grade: "高一", schoolId: "school-1" },
  { id: "cls-2", name: "二班", grade: "高一", schoolId: "school-1" },
];

describe("PermissionApplicationsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(classService.listSchoolClasses).mockResolvedValue(classes as never);
    vi.mocked(authService.getMyTeacherPermissionApplications).mockResolvedValue([]);
    vi.mocked(authService.getPendingTeacherPermissionApplications).mockResolvedValue([]);
    vi.mocked(authService.getMyTeacherRoleApplications).mockResolvedValue([]);
    vi.mocked(authService.getPendingTeacherRoleApplications).mockResolvedValue([]);
    vi.mocked(authService.applyTeacherPermissions).mockResolvedValue({} as TeacherPermissionApplication);
    vi.mocked(authService.reviewTeacherPermissionApplication).mockResolvedValue();
  });

  it("lets school administrators switch between approval and complete teacher management", async () => {
    setAccount("school_admin");
    const user = userEvent.setup();
    render(<MemoryRouter><PermissionApplicationsPage /></MemoryRouter>);
    expect(await screen.findByRole("heading", { name: "申请权限调整" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "本校教师权限审核" }));
    expect(screen.getByRole("heading", { name: "本校待审核权限申请" })).toBeInTheDocument();
    expect(screen.queryByText("本校教师权限编辑器")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "本校教师权限管理" }));
    expect(screen.getByText("本校教师权限编辑器")).toBeInTheDocument();
    expect(screen.queryByText("本校待审核权限申请")).not.toBeInTheDocument();
  });

  it("displays current permissions and submits the selected role and classes for review", async () => {
    setAccount("teacher");
    const user = userEvent.setup();
    render(<MemoryRouter><PermissionApplicationsPage /></MemoryRouter>);

    expect(await screen.findByText("当前权限 · 南京测试学校")).toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", { name: "年级组长" }));
    const teaching = screen.getByRole("group", { name: "任课班级" });
    await user.click(within(teaching).getByRole("checkbox", { name: "高一 · 一班" }));
    const homeroom = screen.getByRole("group", { name: "班主任班级" });
    await user.click(within(homeroom).getByRole("checkbox", { name: "高一 · 二班" }));
    await user.type(screen.getByRole("textbox", { name: "行政职务名称（选填）" }), "年级负责人");
    await user.type(screen.getByRole("textbox", { name: "申请说明" }), "本学期负责新班级");
    await user.click(screen.getByRole("button", { name: "提交权限申请" }));

    await waitFor(() => expect(authService.applyTeacherPermissions).toHaveBeenCalledWith({
      roles: ["teacher", "gradeLeader"],
      teachingClassIds: ["cls-1"], homeroomClassIds: ["cls-2"],
      position: "年级负责人",
    }, "本学期负责新班级"));
  });

  it("lets a school admin adjust approval fields before confirming", async () => {
    setAccount("school_admin");
    const pending: TeacherPermissionApplication = {
      id: "application-1", teacherId: "other", teacherName: "待审核教师",
      schoolId: "school-1", schoolName: "南京测试学校",
      requestedRoles: ["teacher", "gradeLeader"],
      requestedTeachingClassIds: ["cls-1"], requestedHomeroomClassIds: [],
      requestedPosition: "组长",
      previous: { roles: ["teacher"], teachingClassIds: [], homeroomClassIds: [], position: "" },
      reason: "申请年级相关教学职责", createdAt: "2026-10-18T00:00:00.000Z", status: "pending",
    };
    vi.mocked(authService.getPendingTeacherPermissionApplications).mockResolvedValue([pending]);
    const user = userEvent.setup();
    render(<MemoryRouter><PermissionApplicationsPage /></MemoryRouter>);

    await user.click(screen.getByRole("button", { name: "本校教师权限审核" }));
    const section = await screen.findByRole("heading", { name: "本校待审核权限申请" });
    const reviewArea = section.closest("section")!;
    const teaching = within(reviewArea).getByRole("group", { name: "任课班级" });
    await user.click(within(teaching).getByRole("checkbox", { name: "高一 · 二班" }));
    await user.click(within(reviewArea).getByRole("button", { name: "按上述权限通过" }));
    await waitFor(() => expect(authService.reviewTeacherPermissionApplication).toHaveBeenCalledWith(
      "application-1", true, {
        roles: ["teacher", "gradeLeader"],
        teachingClassIds: ["cls-1", "cls-2"],
        homeroomClassIds: [], position: "组长",
      },
    ));
  });
});
