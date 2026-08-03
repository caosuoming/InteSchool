import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { StudentInteractionPage } from "@/pages/students/StudentInteractionPage";
import { classService } from "@/services/class";
import { studentInteractionService } from "@/services/studentInteraction";
import { useAuthStore } from "@/stores/auth";
import type { SchoolClass, Student, StudentInteraction, Teacher } from "@/types";

vi.mock("@/services/class", () => ({
  classService: {
    listMyStudents: vi.fn(),
    listMyClasses: vi.fn(),
  },
}));

vi.mock("@/services/studentInteraction", () => ({
  studentInteractionService: {
    listByStudent: vi.fn(),
    listByTeacher: vi.fn(),
    createInteraction: vi.fn(),
    deleteInteraction: vi.fn(),
  },
}));

vi.mock("@/stores/ui", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const teacher = {
  id: "teacher-1",
  schoolId: "school-1",
} as Teacher;

const classes: SchoolClass[] = [
  {
    id: "class-1",
    type: "school",
    schoolId: "school-1",
    name: "高一（1）班",
    grade: "高一",
    studentCount: 2,
    createdBy: "admin-1",
    createdAt: "2026-08-01T00:00:00.000Z",
  },
  {
    id: "class-2",
    type: "school",
    schoolId: "school-1",
    name: "高一（2）班",
    grade: "高一",
    studentCount: 1,
    createdBy: "admin-1",
    createdAt: "2026-08-01T00:00:00.000Z",
  },
];

const students: Student[] = [
  {
    id: "student-1",
    name: "甲同学",
    studentNo: "001",
    classId: "class-1",
    schoolId: "school-1",
    grade: "高一",
    status: "active",
  },
  {
    id: "student-2",
    name: "乙同学",
    studentNo: "002",
    classId: "class-1",
    schoolId: "school-1",
    grade: "高一",
    status: "active",
  },
  {
    id: "student-3",
    name: "丙同学",
    studentNo: "003",
    classId: "class-2",
    schoolId: "school-1",
    grade: "高一",
    status: "active",
  },
];

const createdInteraction: StudentInteraction = {
  id: "interaction-created",
  teacherId: "teacher-1",
  schoolId: "school-1",
  studentId: "student-1",
  type: "chat",
  content: "课后沟通记录",
  sharedWithHomeroom: true,
  createdAt: "2026-08-03T10:00:00.000Z",
};

describe("StudentInteractionPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({ teacher, loading: false, error: null });
    vi.mocked(classService.listMyStudents).mockResolvedValue(students);
    vi.mocked(classService.listMyClasses).mockResolvedValue(classes);
    vi.mocked(studentInteractionService.listByTeacher).mockResolvedValue([]);
    vi.mocked(studentInteractionService.listByStudent).mockResolvedValue([]);
    vi.mocked(studentInteractionService.createInteraction).mockResolvedValue(createdInteraction);
    vi.mocked(studentInteractionService.deleteInteraction).mockResolvedValue(undefined);
  });

  it("groups the student list by class", async () => {
    render(<StudentInteractionPage embedded />);

    expect(await screen.findByText("高一（2）班")).toBeInTheDocument();
    expect(screen.getAllByText("高一（1）班").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole("button", { name: /甲同学/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /乙同学/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /丙同学/ })).toBeInTheDocument();
  });

  it("keeps sharing off by default and resets it after submission", async () => {
    const user = userEvent.setup();
    render(<StudentInteractionPage embedded />);

    const shareCheckbox = await screen.findByRole("checkbox", { name: /分享记录/ });
    expect(shareCheckbox).not.toBeChecked();

    await user.type(screen.getByPlaceholderText("记录本次与学生交流的内容..."), "课后沟通记录");
    await user.click(shareCheckbox);
    await user.click(screen.getByRole("button", { name: "添加记录" }));

    await waitFor(() => {
      expect(studentInteractionService.createInteraction).toHaveBeenCalledWith(
        "teacher-1",
        "school-1",
        expect.objectContaining({
          studentId: "student-1",
          content: "课后沟通记录",
          shareWithHomeroom: true,
        }),
      );
    });
    expect(shareCheckbox).not.toBeChecked();
  });

  it("labels received records as anonymous and only allows deleting owned records", async () => {
    vi.mocked(studentInteractionService.listByStudent).mockResolvedValue([
      {
        id: "interaction-shared",
        schoolId: "school-1",
        studentId: "student-1",
        type: "chat",
        content: "匿名共享内容",
        sharedWithHomeroom: true,
        createdAt: "2026-08-03T11:00:00.000Z",
        isAnonymous: true,
        canDelete: false,
      },
      {
        id: "interaction-own",
        teacherId: "teacher-1",
        schoolId: "school-1",
        studentId: "student-1",
        type: "chat",
        content: "本人记录",
        createdAt: "2026-08-03T10:00:00.000Z",
        isAnonymous: false,
        canDelete: true,
      },
    ]);

    render(<StudentInteractionPage embedded />);

    expect(await screen.findByText("匿名分享")).toBeInTheDocument();
    expect(screen.getByText("匿名共享内容")).toBeInTheDocument();
    expect(screen.getAllByTitle("删除")).toHaveLength(1);
  });
});
