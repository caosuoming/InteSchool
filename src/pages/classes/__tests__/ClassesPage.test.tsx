import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ClassesPage from "@/pages/classes/ClassesPage";
import { classService } from "@/services/class";
import { settingsService } from "@/services/settings";
import { useAuthStore } from "@/stores/auth";
import type { PersonalClass, Student, Teacher, TeacherAffiliation } from "@/types";

vi.mock("@/hooks/useSchoolResourceOptions", () => ({
  includeCurrentOption: (options: unknown[]) => options,
  useSchoolResourceOptions: () => ({
    gradeOptions: [{ value: "高一", label: "高一" }],
    defaultGrade: "高一",
  }),
}));

vi.mock("@/services/class", () => ({
  classService: {
    listPersonalClasses: vi.fn(),
    listSchoolClasses: vi.fn(),
    listStudentsBySchool: vi.fn(),
    listSuspendedStudents: vi.fn(),
    listDepartedStudents: vi.fn(),
    listStudentsByClass: vi.fn(),
    addStudentToPersonalClass: vi.fn(),
  },
}));

vi.mock("@/services/settings", () => ({
  settingsService: {
    listClassTypes: vi.fn(),
  },
}));

vi.mock("@/stores/ui", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

const affiliation: TeacherAffiliation = {
  id: "affiliation-1",
  teacherId: "teacher-1",
  schoolId: "school-1",
  schoolName: "测试学校",
  subject: "数学",
  role: "teacher",
  roles: ["teacher"],
  subjectGroupIds: [],
  prepGroupIds: [],
  status: "active",
  isCurrent: true,
  joinedAt: "2026-08-01T00:00:00.000Z",
};

const personalClass: PersonalClass = {
  id: "personal-class-1",
  type: "personal",
  teacherId: "teacher-1",
  name: "竞赛辅导班",
  description: "",
  studentIds: [],
  createdAt: "2026-08-01T00:00:00.000Z",
};

const student: Student = {
  id: "student-1",
  name: "张同学",
  studentNo: "20260001",
  classId: "school-class-1",
  schoolId: "school-1",
  grade: "高一",
  status: "active",
};

describe("ClassesPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({
      teacher: { id: "teacher-1" } as Teacher,
      loading: false,
      error: null,
      getCurrentAffiliation: () => affiliation,
    });

    vi.mocked(classService.listPersonalClasses).mockResolvedValue([personalClass]);
    vi.mocked(classService.listSchoolClasses).mockResolvedValue([]);
    vi.mocked(classService.listStudentsBySchool).mockResolvedValue([student]);
    vi.mocked(classService.listSuspendedStudents).mockResolvedValue([]);
    vi.mocked(classService.listDepartedStudents).mockResolvedValue([]);
    vi.mocked(classService.listStudentsByClass).mockResolvedValue([student]);
    vi.mocked(settingsService.listClassTypes).mockResolvedValue([]);
  });

  it("marks a student from the loaded class roster as already added", async () => {
    render(<ClassesPage />);

    fireEvent.click(await screen.findByRole("button", { name: "个人教学班 (1)" }));
    fireEvent.click(await screen.findByText("竞赛辅导班"));

    await waitFor(() => {
      expect(classService.listStudentsByClass).toHaveBeenCalledWith(personalClass.id);
    });

    fireEvent.click(screen.getByRole("button", { name: "添加学生" }));

    const addedButton = await screen.findByRole("button", { name: "已添加" });
    expect(addedButton).toBeDisabled();
    expect(screen.queryByRole("button", { name: "添加" })).not.toBeInTheDocument();
  });
});
