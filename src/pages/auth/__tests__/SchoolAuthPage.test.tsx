import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SchoolAuthPage from "@/pages/auth/SchoolAuthPage";
import { authService } from "@/services/auth";
import { schoolService } from "@/services/school";
import { useAuthStore } from "@/stores/auth";
import type { School, Teacher } from "@/types";

vi.mock("@/services/auth", () => ({
  authService: {
    applySchool: vi.fn(),
  },
}));

vi.mock("@/services/school", () => ({
  schoolService: {
    listSchools: vi.fn(),
    searchSchools: vi.fn(),
    listMySchoolCreationApplications: vi.fn(),
    submitSchoolCreationApplication: vi.fn(),
  },
}));

vi.mock("@/services/api", () => ({
  uploadFile: vi.fn(),
}));

vi.mock("@/stores/ui", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const school: School = {
  id: "school-1",
  name: "测试中学",
  code: "TEST",
  logo: "测",
  description: "用于测试教师入校申请",
  teacherCount: 12,
  studentCount: 300,
  city: "南京",
};

const teacher: Teacher = {
  id: "teacher-1",
  email: "teacher@example.com",
  name: "王老师",
  avatar: "王",
  schoolId: null,
  subject: "数学",
  status: "active",
  role: "teacher",
  roles: ["teacher"],
  subjectGroupIds: [],
  prepGroupIds: [],
  affiliations: [],
  currentAffiliationId: null,
  createdAt: "2026-08-05T00:00:00.000Z",
};

describe("SchoolAuthPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({
      teacher,
      loading: false,
      error: null,
      refresh: vi.fn(),
      logout: vi.fn(),
    });
    vi.mocked(schoolService.listSchools).mockResolvedValue([school]);
    vi.mocked(schoolService.listMySchoolCreationApplications).mockResolvedValue([]);
    vi.mocked(schoolService.searchSchools).mockResolvedValue([school]);
    vi.mocked(authService.applySchool).mockResolvedValue({
      id: "application-1",
      teacherId: teacher.id,
      schoolId: school.id,
      subject: "数学",
      subjects: ["数学"],
      roles: ["teacher", "headTeacher", "gradeLeader"],
      status: "pending",
      createdAt: "2026-08-05T00:00:00.000Z",
    });
  });

  it("submits multiple selected teacher roles for administrator review", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <SchoolAuthPage />
      </MemoryRouter>,
    );

    await user.click(await screen.findByRole("button", { name: /测试中学/ }));

    const teacherRole = screen.getByRole("checkbox", { name: "教师" });
    expect(teacherRole).toBeChecked();
    expect(teacherRole).toBeDisabled();

    await user.click(screen.getByRole("checkbox", { name: "数学" }));
    await user.click(screen.getByRole("checkbox", { name: "班主任" }));
    await user.click(screen.getByRole("checkbox", { name: "年级组长" }));
    await user.click(screen.getByRole("button", { name: /提交认证申请/ }));

    await waitFor(() => {
      expect(authService.applySchool).toHaveBeenCalledWith(
        teacher.id,
        school.id,
        "",
        ["数学"],
        undefined,
        [],
        "教师、班主任、年级组长",
        false,
        ["teacher", "headTeacher", "gradeLeader"],
      );
    });
  });

  it("submits a new school without asking for a school code", async () => {
    const user = userEvent.setup();
    vi.mocked(schoolService.searchSchools).mockResolvedValue([]);
    vi.mocked(schoolService.submitSchoolCreationApplication).mockResolvedValue({
      id: "new-school-application",
      requesterId: teacher.id,
      requesterName: teacher.name,
      name: "新建测试学校",
      code: "SCH-1234567890ABCDEF",
      city: "南京",
      description: "由用户申请新增",
      status: "pending",
      createdAt: "2026-10-14T12:00:00.000Z",
    });
    render(
      <MemoryRouter>
        <SchoolAuthPage />
      </MemoryRouter>,
    );

    await user.type(screen.getByPlaceholderText("搜索学校名称、代码或城市"), "新建测试学校");
    await user.click(await screen.findByRole("button", { name: /申请新增“新建测试学校”/ }));
    expect(screen.queryByLabelText("学校代码")).not.toBeInTheDocument();
    await user.type(screen.getByLabelText("所在城市"), "南京");
    await user.click(screen.getByRole("button", { name: "提交审核" }));

    await waitFor(() => {
      expect(schoolService.submitSchoolCreationApplication).toHaveBeenCalledWith({
        name: "新建测试学校",
        city: "南京",
        description: "",
      });
    });
  });

});
