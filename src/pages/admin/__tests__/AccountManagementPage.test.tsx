import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AccountManagementPage from "@/pages/admin/AccountManagementPage";
import { authService } from "@/services/auth";
import { organizationService } from "@/services/organization";
import { schoolService } from "@/services/school";
import { useAuthStore } from "@/stores/auth";
import type { School, Teacher, TeacherAffiliation } from "@/types";

vi.mock("@/services/auth", () => ({
  authService: {
    resetTeacherPassword: vi.fn(),
    getCurrentAffiliation: vi.fn(),
  },
}));

vi.mock("@/services/organization", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/organization")>();
  return {
    ...actual,
    organizationService: {
      ...actual.organizationService,
      listTeachers: vi.fn(),
      setTeacherSchoolRole: vi.fn(),
    },
  };
});

vi.mock("@/services/school", () => ({
  schoolService: { listSchools: vi.fn() },
}));

vi.mock("@/stores/ui", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

const schools: School[] = [
  { id: "school-1", name: "甲校", code: "A", logo: "甲", description: "", teacherCount: 2, studentCount: 0, city: "南京" },
  { id: "school-2", name: "乙校", code: "B", logo: "乙", description: "", teacherCount: 1, studentCount: 0, city: "上海" },
];

function affiliation(teacherId: string, schoolId: string, role: TeacherAffiliation["role"]): TeacherAffiliation {
  return {
    id: `${teacherId}-${schoolId}`,
    teacherId,
    schoolId,
    schoolName: schools.find((school) => school.id === schoolId)?.name || schoolId,
    subject: "数学",
    status: "active",
    role,
    roles: ["teacher"],
    subjectGroupIds: [],
    prepGroupIds: [],
    isCurrent: true,
    joinedAt: "2026-08-01T00:00:00.000Z",
  };
}

function teacher(id: string, name: string, schoolId: string, role: TeacherAffiliation["role"]): Teacher {
  const current = affiliation(id, schoolId, role);
  return {
    id,
    email: `${id}@example.com`,
    name,
    avatar: name[0],
    schoolId,
    subject: "数学",
    status: "active",
    role,
    roles: ["teacher"],
    subjectGroupIds: [],
    prepGroupIds: [],
    affiliations: [current],
    currentAffiliationId: current.id,
    createdAt: "2026-08-01T00:00:00.000Z",
  };
}

function setCurrent(current: Teacher) {
  useAuthStore.setState({ teacher: current, loading: false, error: null });
  vi.mocked(authService.getCurrentAffiliation).mockReturnValue(current.affiliations[0] || null);
}

describe("AccountManagementPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(schoolService.listSchools).mockResolvedValue(schools);
    vi.mocked(organizationService.setTeacherSchoolRole).mockResolvedValue(undefined);
    vi.mocked(authService.resetTeacherPassword).mockResolvedValue({ password: "RandomPass_12345" });
  });

  it("lets a school administrator randomly reset a local teacher password", async () => {
    const admin = teacher("admin", "校管理员", "school-1", "school_admin");
    const target = teacher("teacher-1", "王老师", "school-1", "teacher");
    setCurrent(admin);
    vi.mocked(organizationService.listTeachers).mockResolvedValue([admin, target]);
    const user = userEvent.setup();

    render(<AccountManagementPage />);

    expect(await screen.findByText("王老师")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "重置密码" }));
    await user.click(screen.getByRole("button", { name: "随机重置" }));

    await waitFor(() => expect(authService.resetTeacherPassword).toHaveBeenCalledWith("teacher-1", undefined));
    expect(await screen.findByText("RandomPass_12345")).toBeInTheDocument();
  });

  it("lets a platform administrator select a school and assign its school administrator", async () => {
    const platform = teacher("platform", "平台管理员", "school-1", "platform_admin");
    const schoolOneTeacher = teacher("teacher-1", "甲校教师", "school-1", "teacher");
    const schoolTwoTeacher = teacher("teacher-2", "乙校教师", "school-2", "teacher");
    setCurrent(platform);
    vi.mocked(organizationService.listTeachers).mockImplementation(async (schoolId) => (
      schoolId === "school-2" ? [schoolTwoTeacher] : [platform, schoolOneTeacher]
    ));
    const user = userEvent.setup();

    render(<AccountManagementPage />);

    const schoolSelect = await screen.findByLabelText("学校");
    await user.selectOptions(schoolSelect, "school-2");
    expect(await screen.findByText("乙校教师")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "设为校管理员" }));

    await waitFor(() => expect(organizationService.setTeacherSchoolRole)
      .toHaveBeenCalledWith("teacher-2", "school-2", "school_admin"));
  });
});
