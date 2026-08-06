import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { StudentArchivePage } from "@/pages/students/StudentArchivePage";
import { classService } from "@/services/class";
import { useAuthStore } from "@/stores/auth";
import type { StudentArchiveOverview, Teacher, TeacherAffiliation, TeacherRole } from "@/types";

vi.mock("@/services/class", () => ({
  classService: {
    listMyStudentArchives: vi.fn(),
    updateStudentContacts: vi.fn(),
    updateStudentArchiveStatus: vi.fn(),
  },
}));

vi.mock("@/stores/ui", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

const overview: StudentArchiveOverview = {
  classes: [{
    id: "class-1",
    type: "school",
    schoolId: "school-1",
    name: "高一(1)班",
    grade: "高一",
    studentCount: 1,
    status: "active",
    createdBy: "teacher-1",
    createdAt: "2026-08-01T00:00:00.000Z",
  }],
  students: [{
    id: "student-1",
    name: "张同学",
    studentNo: "20260001",
    classId: "class-1",
    schoolId: "school-1",
    grade: "高一",
    status: "active",
    archiveStatus: "attending",
  }],
  records: [],
};

function setTeacher(roles: TeacherRole[], homeroomClassIds: string[] = []) {
  const affiliation: TeacherAffiliation = {
    id: "aff-1",
    teacherId: "teacher-1",
    schoolId: "school-1",
    schoolName: "测试学校",
    subject: "数学",
    teachingClassIds: ["class-1"],
    homeroomClassIds,
    status: "active",
    role: "teacher",
    roles,
    subjectGroupIds: [],
    prepGroupIds: [],
    isCurrent: true,
    joinedAt: "2026-08-01T00:00:00.000Z",
  };
  const teacher: Teacher = {
    id: "teacher-1",
    email: "teacher@example.com",
    name: "测试教师",
    avatar: "测",
    schoolId: "school-1",
    subject: "数学",
    teachingClassIds: ["class-1"],
    homeroomClassIds,
    status: "active",
    role: "teacher",
    roles,
    subjectGroupIds: [],
    prepGroupIds: [],
    affiliations: [affiliation],
    currentAffiliationId: affiliation.id,
    createdAt: "2026-08-01T00:00:00.000Z",
  };
  useAuthStore.setState({
    teacher,
    loading: false,
    error: null,
    getCurrentAffiliation: () => affiliation,
  });
}

describe("StudentArchivePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(classService.listMyStudentArchives).mockResolvedValue(overview);
  });

  it("shows current student status to an ordinary teacher without edit actions", async () => {
    setTeacher(["teacher"]);
    render(<StudentArchivePage />);

    expect((await screen.findAllByText("张同学")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("在籍 · 在读").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "补充联系方式" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "登记请假" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "更新状态" })).not.toBeInTheDocument();
  });

  it("lets a homeroom teacher maintain contacts and leave", async () => {
    setTeacher(["headTeacher"], ["class-1"]);
    render(<StudentArchivePage />);

    expect(await screen.findByRole("button", { name: "补充联系方式" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "登记请假" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "更新状态" })).not.toBeInTheDocument();
  });

  it("restores the pre-leave visiting status in the homeroom action", async () => {
    const user = userEvent.setup();
    setTeacher(["headTeacher"], ["class-1"]);
    vi.mocked(classService.listMyStudentArchives).mockResolvedValue({
      ...overview,
      students: [{
        ...overview.students[0],
        archiveStatus: "leave",
        archiveStatusBeforeLeave: "visiting",
        isExternal: true,
        externalSchool: "外校",
      }],
    });
    render(<StudentArchivePage />);

    await user.click(await screen.findByRole("button", { name: "结束请假" }));
    expect(screen.getByLabelText("当前状态")).toHaveValue("visiting");
  });

  it("gives a grade leader the full archive status action", async () => {
    setTeacher(["gradeLeader"]);
    render(<StudentArchivePage />);

    expect(await screen.findByRole("button", { name: "补充联系方式" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "更新状态" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "登记请假" })).not.toBeInTheDocument();
  });
});
