import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import TeacherProfilesPage from "@/pages/admin/TeacherProfilesPage";
import { authService } from "@/services/auth";
import { classService } from "@/services/class";
import { organizationService } from "@/services/organization";
import { useAuthStore } from "@/stores/auth";
import type { SchoolClass, SchoolGrade, Teacher, TeacherAffiliation } from "@/types";

vi.mock("@/services/auth", () => ({
  authService: {
    updateTeacherTeachingProfile: vi.fn(),
    getCurrentAffiliation: vi.fn(),
  },
}));

vi.mock("@/services/class", () => ({
  classService: {
    listSchoolClasses: vi.fn(),
    listSchoolGrades: vi.fn(),
  },
}));

vi.mock("@/services/organization", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/organization")>();
  return {
    ...actual,
    organizationService: {
      ...actual.organizationService,
      listTeachers: vi.fn(),
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
    vi.mocked(organizationService.listTeachers).mockResolvedValue([managedTeacher]);
    vi.mocked(authService.updateTeacherTeachingProfile).mockResolvedValue(managedTeacher);
    vi.mocked(authService.getCurrentAffiliation).mockReturnValue(managerAffiliation);
    vi.mocked(organizationService.updateTeacherRoles).mockResolvedValue(undefined);
    vi.mocked(classService.listSchoolClasses).mockResolvedValue(classes);
    vi.mocked(classService.listSchoolGrades).mockResolvedValue([]);
  });

  it("groups class choices by grade in education order", async () => {
    render(<TeacherProfilesPage />);

    const teachingClasses = await screen.findByRole("group", { name: "任教班级" });
    expect(organizationService.listTeachers).toHaveBeenCalledWith("school-1");
    const gradeGroups = within(teachingClasses).getAllByRole("group");

    expect(gradeGroups.map((group) => group.getAttribute("aria-label"))).toEqual(["初一", "高一", "高二"]);
    expect(within(gradeGroups[1]).getAllByRole("checkbox").map((checkbox) => checkbox.parentElement?.textContent)).toEqual([
      "高一（2）班",
      "高一（10）班",
    ]);

    const homeroomClasses = screen.getByRole("group", { name: "班主任班级" });
    expect(within(homeroomClasses).getAllByRole("group")).toHaveLength(3);
  });

  it("hides graduated classes and grades, while separating active cohorts", async () => {
    const grade = (id: string, year: number, status: SchoolGrade["status"]): SchoolGrade => ({
      id, schoolId: "school-1", name: `${year}届高三`, grade: "高三", gradYear: year, status,
      createdBy: "teacher-1", createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-01T00:00:00.000Z",
    });
    vi.mocked(classService.listSchoolGrades).mockResolvedValue([
      grade("grade-2028", 2028, "active"),
      grade("grade-2027", 2027, "active"),
      grade("grade-2026", 2026, "graduated"),
    ]);
    vi.mocked(classService.listSchoolClasses).mockResolvedValue([
      { ...createClass("active-2028", "高三", "1班"), gradeId: "grade-2028" },
      { ...createClass("active-2027", "高三", "1班"), gradeId: "grade-2027", gradYear: 2027 },
      { ...createClass("graduated-class", "高二", "往届1班"), status: "graduated" },
      { ...createClass("graduated-grade", "高三", "往届2班"), gradeId: "grade-2026", status: "active" },
      { ...createClass("graduated-legacy", "高三", "往届3班"), gradeYear: 2023 },
      { ...createClass("deleted-class", "高一", "已删除班"), status: "deleted" },
    ]);

    render(<TeacherProfilesPage />);
    const teachingClasses = await screen.findByRole("group", { name: "任教班级" });
    await waitFor(() => expect(within(teachingClasses).getAllByRole("group")).toHaveLength(2));
    const cohorts = within(teachingClasses).getAllByRole("group");
    expect(cohorts.map((item) => item.getAttribute("aria-label"))).toEqual(["高三 · 2028届", "高三 · 2027届"]);
    expect(within(cohorts[0]).getByRole("checkbox", { name: "1班" })).toBeInTheDocument();
    expect(within(cohorts[1]).getByRole("checkbox", { name: "1班" })).toBeInTheDocument();
    expect(within(teachingClasses).queryByText(/往届|已删除/)).not.toBeInTheDocument();
    expect(within(screen.getByRole("group", { name: "班主任班级" })).getAllByRole("group")).toHaveLength(2);
    const teachingGrades = screen.getByRole("group", { name: "任教年级" });
    expect(within(teachingGrades).getAllByRole("checkbox").map((item) => item.parentElement?.textContent)).toEqual(["高三"]);
  });

  it("keeps legacy active classes without graduation metadata selectable", async () => {
    vi.mocked(classService.listSchoolClasses).mockResolvedValue([createClass("legacy", "初一", "1班")]);
    render(<TeacherProfilesPage />);

    const teachingClasses = await screen.findByRole("group", { name: "任教班级" });
    expect(within(teachingClasses).getByRole("group", { name: "初一" })).toBeInTheDocument();
    expect(within(teachingClasses).getByRole("checkbox", { name: "1班" })).toBeInTheDocument();
  });

  it("saves teaching and homeroom assignments selected from grade groups", async () => {
    const user = userEvent.setup();
    render(<TeacherProfilesPage />);

    const teachingClasses = await screen.findByRole("group", { name: "任教班级" });
    const homeroomClasses = screen.getByRole("group", { name: "班主任班级" });

    await user.click(screen.getByRole("checkbox", { name: "教务主任" }));
    await user.click(within(teachingClasses).getByRole("checkbox", { name: "初一（1）班" }));
    await user.click(within(homeroomClasses).getByRole("checkbox", { name: "高一（2）班" }));
    await user.click(screen.getByRole("button", { name: "保存教师权限" }));

    await waitFor(() => {
      expect(organizationService.updateTeacherRoles).toHaveBeenCalledWith("teacher-2", "school-1", ["teacher", "dean"]);
      expect(authService.updateTeacherTeachingProfile).toHaveBeenCalledWith("teacher-2", {
        subject: "数学", subjects: ["数学"],
        teachingGrades: ["高一"],
        teachingClassIds: ["class-high-2", "class-middle-1"],
        homeroomClassIds: ["class-high-2"],
      });
    });
  });
});
