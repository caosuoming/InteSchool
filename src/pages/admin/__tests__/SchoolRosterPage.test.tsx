import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SchoolRosterPage from "@/pages/admin/SchoolRosterPage";
import { readStudentRosterFile } from "@/lib/student-roster-spreadsheet";
import { authService } from "@/services/auth";
import { classService } from "@/services/class";
import { settingsService } from "@/services/settings";
import { useAuthStore } from "@/stores/auth";
import type { ClassTypeCategory, SchoolClass, SchoolGrade, Student, Teacher, TeacherAffiliation } from "@/types";

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
    updateSchoolClass: vi.fn(),
    updateStudent: vi.fn(),
  },
}));

vi.mock("@/services/auth", () => ({
  authService: {
    listTeachers: vi.fn(),
    updateTeacherTeachingProfile: vi.fn(),
  },
}));

vi.mock("@/services/settings", () => ({
  settingsService: {
    listClassTypes: vi.fn(),
  },
}));

vi.mock("@/lib/student-roster-spreadsheet", () => ({
  downloadStudentRosterTemplate: vi.fn(),
  readStudentRosterFile: vi.fn(),
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

const classType: ClassTypeCategory = {
  id: "class-type-1",
  schoolId: "school-1",
  name: "实验班",
  color: "#2563eb",
  sortOrder: 0,
  enabled: true,
  createdAt: "2026-08-01T00:00:00.000Z",
};

const classes: SchoolClass[] = Array.from({ length: 10 }, (_, index) => ({
  id: `class-${index + 1}`,
  type: "school" as const,
  schoolId: "school-1",
  gradeId: grade.id,
  name: `高二（${index + 1}）班`,
  grade: "高二",
  gradYear: 2029,
  classTypeId: index === 0 ? classType.id : undefined,
  studentCount: index === 0 ? 1 : 0,
  status: "active" as const,
  createdBy: "teacher-1",
  createdAt: "2026-08-01T00:00:00.000Z",
}));

const managedTeachers = [
  {
    id: "teacher-a",
    name: "王老师",
    subject: "数学",
    teachingClassIds: [classes[0].id],
    homeroomClassIds: [classes[0].id],
    affiliations: [{
      id: "aff-teacher-a",
      teacherId: "teacher-a",
      schoolId: "school-1",
      subject: "数学",
      teachingClassIds: [classes[0].id],
      homeroomClassIds: [classes[0].id],
    }],
  },
  {
    id: "teacher-b",
    name: "李老师",
    subject: "物理",
    teachingClassIds: [],
    homeroomClassIds: [],
    affiliations: [{
      id: "aff-teacher-b",
      teacherId: "teacher-b",
      schoolId: "school-1",
      subject: "物理",
      teachingClassIds: [],
      homeroomClassIds: [],
    }],
  },
] as Teacher[];

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
    vi.mocked(settingsService.listClassTypes).mockResolvedValue([classType]);
    vi.mocked(authService.listTeachers).mockResolvedValue(managedTeachers);
    vi.mocked(classService.updateSchoolClass).mockResolvedValue(classes[0]);
    vi.mocked(authService.updateTeacherTeachingProfile).mockResolvedValue(managedTeachers[0]);
    vi.mocked(classService.updateStudent).mockResolvedValue(student);
    vi.mocked(classService.bulkImportStudents).mockResolvedValue({
      createdClasses: 0,
      createdStudents: 1,
      updatedStudents: 0,
      deletedStudents: 0,
      skippedStudents: 0,
    });
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

    const typedClass = screen.getByRole("button", { name: `选择班级 ${classes[0].name}` }).parentElement;
    expect(typedClass?.getAttribute("style")).toContain("background-color");
    expect(typedClass).toHaveTextContent("实验班");
  });

  it("edits class type, homeroom teacher, and subject teachers", async () => {
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: `编辑班级 ${classes[0].name}` }));
    fireEvent.change(screen.getByLabelText("班级名称"), { target: { value: "高二实验班" } });
    fireEvent.change(screen.getByLabelText("班主任"), { target: { value: managedTeachers[1].id } });
    fireEvent.click(screen.getByRole("checkbox", { name: /王老师/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /李老师/ }));
    fireEvent.click(screen.getByRole("button", { name: "保存修改" }));

    await waitFor(() => {
      expect(classService.updateSchoolClass).toHaveBeenCalledWith(classes[0].id, {
        name: "高二实验班",
        classTypeId: classType.id,
      });
      expect(authService.updateTeacherTeachingProfile).toHaveBeenCalledWith(managedTeachers[0].id, {
        teachingClassIds: [],
        homeroomClassIds: [],
      });
      expect(authService.updateTeacherTeachingProfile).toHaveBeenCalledWith(managedTeachers[1].id, {
        teachingClassIds: [classes[0].id],
        homeroomClassIds: [classes[0].id],
      });
    });
  });

  it("emphasizes subject selections and student types that differ from the class majority", async () => {
    vi.mocked(classService.listStudentsBySchool).mockResolvedValue([
      student,
      {
        ...student,
        id: "student-2",
        name: "李同学",
        studentNo: "20260002",
      },
      {
        ...student,
        id: "student-3",
        name: "王同学",
        studentNo: "20260003",
        subjectSelection: "史政地",
        isExternal: true,
      },
    ]);

    renderPage();

    expect(await screen.findByTitle("与本班多数学生的选科不同")).toHaveTextContent("史政地");
    expect(screen.getByTitle("与本班多数学生的类型不同")).toHaveTextContent("借读生");
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

  it("asks whether to keep old students missing from a repeated roster import", async () => {
    const importedRows = [
      { className: classes[1].name, name: "李同学", studentNo: "20260002" },
    ];
    vi.mocked(readStudentRosterFile).mockResolvedValue(importedRows);
    const { container } = renderPage();
    await screen.findByRole("button", { name: "导入学生" });

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, {
      target: { files: [new File(["roster"], "students.xlsx")] },
    });

    expect(await screen.findByText("发现旧名单中未匹配的学生")).toBeInTheDocument();
    expect(screen.getAllByText("张同学")).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "保留未匹配学生" }));

    await waitFor(() => {
      expect(classService.bulkImportStudents).toHaveBeenCalledWith(
        grade.id,
        "teacher-1",
        importedRows,
        { missingStudents: "keep" },
      );
    });
  });

  it("can delete old students missing from a repeated roster import", async () => {
    const importedRows = [
      { className: classes[1].name, name: "李同学", studentNo: "20260002" },
    ];
    vi.mocked(readStudentRosterFile).mockResolvedValue(importedRows);
    vi.mocked(classService.bulkImportStudents).mockResolvedValue({
      createdClasses: 0,
      createdStudents: 1,
      updatedStudents: 0,
      deletedStudents: 1,
      skippedStudents: 0,
    });
    const { container } = renderPage();
    await screen.findByRole("button", { name: "导入学生" });

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, {
      target: { files: [new File(["roster"], "students.xlsx")] },
    });
    await screen.findByText("发现旧名单中未匹配的学生");
    fireEvent.click(screen.getByRole("button", { name: "删除未匹配学生" }));

    await waitFor(() => {
      expect(classService.bulkImportStudents).toHaveBeenCalledWith(
        grade.id,
        "teacher-1",
        importedRows,
        { missingStudents: "delete" },
      );
    });
  });

  it("opens the personal teaching-class manager", async () => {
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "个人教学班" }));

    expect(await screen.findByText("个人教学班页面")).toBeInTheDocument();
  });
});
