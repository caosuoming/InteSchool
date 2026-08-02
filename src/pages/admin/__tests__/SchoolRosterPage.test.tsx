import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SchoolRosterPage from "@/pages/admin/SchoolRosterPage";
import { classService } from "@/services/class";
import { useAuthStore } from "@/stores/auth";
import type { SchoolClass, SchoolGrade, Student, Teacher, TeacherAffiliation } from "@/types";

vi.mock("@/services/class", () => ({
  classService: {
    listSchoolGrades: vi.fn(),
    listSchoolClasses: vi.fn(),
    listStudentsBySchool: vi.fn(),
    listSchoolRosterRecycleBin: vi.fn(),
    createSchoolGrade: vi.fn(),
    bulkCreateSchoolClasses: vi.fn(),
    advanceSchoolGrade: vi.fn(),
    bulkImportStudents: vi.fn(),
    deleteClass: vi.fn(),
    deleteStudent: vi.fn(),
    restoreSchoolClass: vi.fn(),
    restoreStudent: vi.fn(),
    updateStudent: vi.fn(),
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
  role: "school_admin",
  roles: ["principal"],
  subjectGroupIds: [],
  prepGroupIds: [],
  status: "active",
  isCurrent: true,
  joinedAt: "2026-08-01T00:00:00.000Z",
};

const grade: SchoolGrade = {
  id: "grade-1",
  schoolId: "school-1",
  name: "2029届高二",
  grade: "高二",
  gradYear: 2029,
  status: "active",
  createdBy: "teacher-1",
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
};

const classes: SchoolClass[] = Array.from({ length: 10 }, (_, index) => ({
  id: `class-${index + 1}`,
  type: "school" as const,
  schoolId: "school-1",
  gradeId: grade.id,
  name: `高二（${index + 1}）班`,
  grade: "高二",
  gradYear: 2029,
  studentCount: index === 0 ? 1 : 0,
  status: "active" as const,
  createdBy: "teacher-1",
  createdAt: "2026-08-01T00:00:00.000Z",
}));

const student: Student = {
  id: "student-1",
  name: "张同学",
  studentNo: "20260001",
  classId: classes[0].id,
  schoolId: "school-1",
  grade: "高二",
  gender: "male",
  subjectSelection: "物化生",
  status: "active",
};

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/admin/classes"]}>
      <Routes>
        <Route path="/admin/classes" element={<SchoolRosterPage />} />
        <Route path="/classes" element={<div>个人教学班页面</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("SchoolRosterPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({
      teacher: { id: "teacher-1", schoolId: "school-1" } as Teacher,
      loading: false,
      error: null,
      getCurrentAffiliation: () => affiliation,
    });

    vi.mocked(classService.listSchoolGrades).mockResolvedValue([grade]);
    vi.mocked(classService.listSchoolClasses).mockResolvedValue(classes);
    vi.mocked(classService.listStudentsBySchool).mockResolvedValue([student]);
    vi.mocked(classService.listSchoolRosterRecycleBin).mockResolvedValue({ classes: [], students: [] });
    vi.mocked(classService.updateStudent).mockResolvedValue(student);
  });

  it("renders classes in a compact ten-column selector", async () => {
    renderPage();

    const lastClassButton = await screen.findByRole("button", { name: "选择班级 高二（10）班" });
    const selector = lastClassButton.parentElement?.parentElement;

    expect(selector).not.toBeNull();
    expect(selector?.className).toContain("xl:grid-cols-10");
    for (const item of classes) {
      expect(screen.getByRole("button", { name: `选择班级 ${item.name}` })).toBeInTheDocument();
    }
  });

  it("edits student name, number, elective subjects, grade, and gender", async () => {
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "编辑" }));
    fireEvent.change(screen.getByLabelText("姓名"), { target: { value: "张三" } });
    fireEvent.change(screen.getByLabelText("学号"), { target: { value: "20260009" } });
    fireEvent.change(screen.getByLabelText("选科"), { target: { value: "物化地" } });
    fireEvent.change(screen.getByLabelText("年级"), { target: { value: "高三" } });
    fireEvent.change(screen.getByLabelText("性别"), { target: { value: "female" } });
    fireEvent.click(screen.getByRole("button", { name: "保存修改" }));

    await waitFor(() => {
      expect(classService.updateStudent).toHaveBeenCalledWith(student.id, {
        name: "张三",
        studentNo: "20260009",
        subjectSelection: "物化地",
        grade: "高三",
        gender: "female",
      });
    });
  });

  it("opens the personal teaching-class manager", async () => {
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "个人教学班" }));

    expect(await screen.findByText("个人教学班页面")).toBeInTheDocument();
  });
});
