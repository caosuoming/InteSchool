import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import TeacherProfilesPage from "@/pages/admin/TeacherProfilesPage";
import { authService } from "@/services/auth";
import { classService } from "@/services/class";
import { organizationService } from "@/services/organization";
import { useAuthStore } from "@/stores/auth";
import type { SchoolClass, Teacher, TeacherAffiliation } from "@/types";

vi.mock("@/services/auth", () => ({
  authService: {
    listTeachers: vi.fn(),
    updateTeacherTeachingProfile: vi.fn(),
    getCurrentAffiliation: vi.fn(),
  },
}));

vi.mock("@/services/class", () => ({
  classService: {
    listSchoolClasses: vi.fn(),
  },
}));

vi.mock("@/services/organization", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/organization")>();
  return {
    ...actual,
    organizationService: {
      ...actual.organizationService,
      updateTeacherRoles: vi.fn(),
    },
  };
});

vi.mock("@/stores/ui", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

const affiliation: TeacherAffiliation = {
  id: "affiliation-1",
  teacherId: "teacher-2",
  schoolId: "school-1",
  schoolName: "测试学校",
  subject: "数学",
  teachingGrades: ["高一"],
  teachingClassIds: ["class-high-2"],
  homeroomClassIds: [],
  status: "active",
  role: "teacher",
  roles: ["teacher"],
  subjectGroupIds: [],
  prepGroupIds: [],
  isCurrent: true,
  joinedAt: "2026-08-01T00:00:00.000Z",
};

const managedTeacher: Teacher = {
  id: "teacher-2",
  email: "teacher@example.com",
  name: "王老师",
  avatar: "王",
  schoolId: "school-1",
  subject: "数学",
  teachingGrades: ["高一"],
  teachingClassIds: ["class-high-2"],
  homeroomClassIds: [],
  status: "active",
  role: "teacher",
  roles: ["teacher"],
  subjectGroupIds: [],
  prepGroupIds: [],
  affiliations: [affiliation],
  currentAffiliationId: affiliation.id,
  createdAt: "2026-08-01T00:00:00.000Z",
};

const classes: SchoolClass[] = [
  createClass("class-high-10", "高一", "高一（10）班"),
  createClass("class-middle-1", "初一", "初一（1）班"),
  createClass("class-high-2", "高一", "高一（2）班"),
  createClass("class-high-2b", "高二", "高二（1）班"),
];

function createClass(id: string, grade: string, name: string): SchoolClass {
  return {
    id,
    type: "school",
    schoolId: "school-1",
    name,
    grade,
    studentCount: 0,
    status: "active",
    createdBy: "teacher-1",
    createdAt: "2026-08-01T00:00:00.000Z",
  };
}

describe("TeacherProfilesPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const managerAffiliation: TeacherAffiliation = {
      ...affiliation,
      id: "affiliation-manager",
      teacherId: "teacher-1",
      role: "school_admin",
      roles: ["teacher"],
    };
    useAuthStore.setState({
      teacher: {
        ...managedTeacher,
        id: "teacher-1",
        name: "管理员",
        role: "school_admin",
        affiliations: [managerAffiliation],
        currentAffiliationId: managerAffiliation.id,
      },
      loading: false,
      error: null,
    });
    vi.mocked(authService.listTeachers).mockResolvedValue([managedTeacher]);
    vi.mocked(authService.updateTeacherTeachingProfile).mockResolvedValue(managedTeacher);
    vi.mocked(authService.getCurrentAffiliation).mockReturnValue(managerAffiliation);
    vi.mocked(organizationService.updateTeacherRoles).mockResolvedValue(undefined);
    vi.mocked(classService.listSchoolClasses).mockResolvedValue(classes);
  });

  it("groups class choices by grade in education order", async () => {
    render(<TeacherProfilesPage />);

    const teachingClasses = await screen.findByRole("group", { name: "任教班级" });
    const gradeGroups = within(teachingClasses).getAllByRole("group");

    expect(gradeGroups.map((group) => group.getAttribute("aria-label"))).toEqual(["初一", "高一", "高二"]);
    expect(within(gradeGroups[1]).getAllByRole("checkbox").map((checkbox) => checkbox.parentElement?.textContent)).toEqual([
      "高一（2）班",
      "高一（10）班",
    ]);

    const homeroomClasses = screen.getByRole("group", { name: "班主任班级" });
    expect(within(homeroomClasses).getAllByRole("group")).toHaveLength(3);
  });

  it("saves teaching and homeroom assignments selected from grade groups", async () => {
    const user = userEvent.setup();
    render(<TeacherProfilesPage />);

    const teachingClasses = await screen.findByRole("group", { name: "任教班级" });
    const homeroomClasses = screen.getByRole("group", { name: "班主任班级" });

    await user.click(within(teachingClasses).getByRole("checkbox", { name: "初一（1）班" }));
    await user.click(within(homeroomClasses).getByRole("checkbox", { name: "高一（2）班" }));
    await user.click(screen.getByRole("button", { name: "保存教师权限" }));

    await waitFor(() => {
      expect(organizationService.updateTeacherRoles).toHaveBeenCalledWith("teacher-2", "school-1", ["teacher"]);
      expect(authService.updateTeacherTeachingProfile).toHaveBeenCalledWith("teacher-2", {
        subject: "数学",
        teachingGrades: ["高一"],
        teachingClassIds: ["class-high-2", "class-middle-1"],
        homeroomClassIds: ["class-high-2"],
      });
    });
  });
});
