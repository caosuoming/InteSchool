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
});
