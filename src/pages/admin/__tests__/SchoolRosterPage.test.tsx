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
    updateSchoolGrade: vi.fn(),
    bulkCreateSchoolClasses: vi.fn(),
    advanceSchoolGrade: vi.fn(),
    decreaseSchoolGrade: vi.fn(),
    graduateSchoolGrade: vi.fn(),
    bulkImportStudents: vi.fn(),
    deleteClass: vi.fn(),
    deleteStudent: vi.fn(),
    restoreSchoolClass: vi.fn(),
    restoreStudent: vi.fn(),
    updateSchoolClass: vi.fn(),
    addStudent: vi.fn(),
    updateStudent: vi.fn(),
    transferStudent: vi.fn(),
    suspendStudent: vi.fn(),
    transferOutStudent: vi.fn(),
    resumeStudent: vi.fn(),
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
    vi.mocked(classService.updateSchoolGrade).mockResolvedValue(grade);
    vi.mocked(classService.advanceSchoolGrade).mockResolvedValue({
      grade: { ...grade, grade: "高三" },
      updatedClasses: classes.length,
      updatedStudents: 1,
    });
    vi.mocked(classService.decreaseSchoolGrade).mockResolvedValue({
      grade: { ...grade, grade: "高一" },
      updatedClasses: classes.length,
      updatedStudents: 1,
    });
    vi.mocked(classService.graduateSchoolGrade).mockResolvedValue({
      grade: { ...grade, status: "graduated" },
      updatedClasses: classes.length,
      graduatedStudents: 1,
    });
    vi.mocked(classService.updateSchoolClass).mockResolvedValue(classes[0]);
    vi.mocked(classService.addStudent).mockResolvedValue({
      ...student,
      id: "student-new",
      name: "李同学",
      studentNo: "20260002",
    });
    vi.mocked(authService.updateTeacherTeachingProfile).mockResolvedValue(managedTeachers[0]);
    vi.mocked(classService.updateStudent).mockResolvedValue(student);
    vi.mocked(classService.transferStudent).mockResolvedValue(student);
    vi.mocked(classService.suspendStudent).mockResolvedValue({ ...student, status: "suspended" });
    vi.mocked(classService.transferOutStudent).mockResolvedValue({ ...student, status: "transferred" });
    vi.mocked(classService.resumeStudent).mockResolvedValue(student);
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

  it("edits, raises, lowers, and graduates a grade", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "编辑年级" }));
    fireEvent.change(screen.getByLabelText("年级名称"), { target: { value: "高二创新年级" } });
    fireEvent.click(screen.getByRole("button", { name: "保存修改" }));
    await waitFor(() => {
      expect(classService.updateSchoolGrade).toHaveBeenCalledWith(grade.id, { name: "高二创新年级" });
    });

    fireEvent.click(screen.getByRole("button", { name: "降学年" }));
    await waitFor(() => expect(classService.decreaseSchoolGrade).toHaveBeenCalledWith(grade.id));

    fireEvent.click(screen.getByRole("button", { name: "升学年" }));
    await waitFor(() => expect(classService.advanceSchoolGrade).toHaveBeenCalledWith(grade.id));

    fireEvent.click(screen.getByRole("button", { name: "毕业" }));
    await waitFor(() => expect(classService.graduateSchoolGrade).toHaveBeenCalledWith(grade.id));
    expect(confirm).toHaveBeenCalledTimes(3);
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

  it("adds a single student to the selected class", async () => {
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "新增学生" }));
    fireEvent.change(screen.getByLabelText("姓名"), { target: { value: " 李同学 " } });
    fireEvent.change(screen.getByLabelText("学号"), { target: { value: " 20260002 " } });
    fireEvent.change(screen.getByLabelText("选科"), { target: { value: "物化地" } });
    fireEvent.change(screen.getByLabelText("性别"), { target: { value: "female" } });
    fireEvent.click(screen.getByRole("button", { name: "添加学生" }));

    await waitFor(() => {
      expect(classService.addStudent).toHaveBeenCalledWith(classes[0].id, "school-1", {
        name: "李同学",
        studentNo: "20260002",
        grade: "高二",
        gender: "female",
        subjectSelection: "物化地",
      });
    });
  });

  it("rejects a duplicate student number before creating a student", async () => {
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "新增学生" }));
    fireEvent.change(screen.getByLabelText("姓名"), { target: { value: "重名学号同学" } });
    fireEvent.change(screen.getByLabelText("学号"), { target: { value: student.studentNo } });
    fireEvent.click(screen.getByRole("button", { name: "添加学生" }));

    await waitFor(() => expect(classService.addStudent).not.toHaveBeenCalled());
  });

  it("supports transfer, suspension, and transfer-out from the student editor", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "编辑" }));
    fireEvent.click(screen.getByRole("button", { name: "休学" }));
    await waitFor(() => {
      expect(classService.suspendStudent).toHaveBeenCalledWith(student.id);
    });

    fireEvent.click(await screen.findByRole("button", { name: "编辑" }));
    fireEvent.click(screen.getByRole("button", { name: "转学" }));
    await waitFor(() => {
      expect(classService.transferOutStudent).toHaveBeenCalledWith(student.id);
    });

    fireEvent.click(await screen.findByRole("button", { name: "编辑" }));
    fireEvent.change(screen.getByLabelText("转入班级"), { target: { value: classes[1].id } });
    fireEvent.click(screen.getByRole("button", { name: "转班" }));
    await waitFor(() => {
      expect(classService.transferStudent).toHaveBeenCalledWith(student.id, classes[1].id);
    });
    expect(confirm).toHaveBeenCalledTimes(3);
  });

  it("keeps suspended and transferred students in dedicated recoverable bins", async () => {
    const suspendedStudent: Student = {
      ...student,
      id: "student-suspended",
      name: "休学同学",
      status: "suspended",
      suspendedAt: "2026-08-10T00:00:00.000Z",
    };
    const transferredStudent: Student = {
      ...student,
      id: "student-transferred",
      name: "转学同学",
      status: "transferred",
      transferredAt: "2026-08-11T00:00:00.000Z",
    };
    vi.mocked(classService.listStudentsBySchool).mockResolvedValue([
      student,
      suspendedStudent,
      transferredStudent,
    ]);
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "休学回收站 (1)" }));
    expect(await screen.findByText("休学学生回收站")).toBeInTheDocument();
    expect(screen.getByText("休学同学")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "复学" }));
    await waitFor(() => {
      expect(classService.resumeStudent).toHaveBeenCalledWith(suspendedStudent.id, classes[0].id);
    });

    fireEvent.click(screen.getByRole("button", { name: "转学回收站 (1)" }));
    expect(await screen.findByText("转学学生回收站")).toBeInTheDocument();
    expect(screen.getByText("转学同学")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "撤销转学" }));
    await waitFor(() => {
      expect(classService.resumeStudent).toHaveBeenCalledWith(transferredStudent.id, classes[0].id);
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

    expect(await screen.findByText("确认学生名单对应关系")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("对应原学生"), { target: { value: "__create__" } });
    expect(screen.getAllByText("张同学")).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "导入并保留旧学生" }));

    await waitFor(() => {
      expect(classService.bulkImportStudents).toHaveBeenCalledWith(
        grade.id,
        "teacher-1",
        importedRows,
        { missingStudents: "keep", matchStudentIds: { "0": null } },
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
    await screen.findByText("确认学生名单对应关系");
    fireEvent.change(screen.getByLabelText("对应原学生"), { target: { value: "__create__" } });
    fireEvent.click(screen.getByRole("button", { name: "导入并移入回收站" }));

    await waitFor(() => {
      expect(classService.bulkImportStudents).toHaveBeenCalledWith(
        grade.id,
        "teacher-1",
        importedRows,
        { missingStudents: "delete", matchStudentIds: { "0": null } },
      );
    });
  });

  it("opens the personal teaching-class manager in a new tab", async () => {
    const openSpy = vi.spyOn(window, "open").mockReturnValue(null);
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "个人教学班" }));

    expect(openSpy).toHaveBeenCalledWith("/classes", "_blank", "noopener,noreferrer");
  });
});
