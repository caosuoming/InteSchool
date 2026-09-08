import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { StudentInteractionPage } from "@/pages/students/StudentInteractionPage";
import { classService } from "@/services/class";
import { studentInteractionService } from "@/services/studentInteraction";
import { homeworkRecordService } from "@/services/homeworkRecord";
import { knowledgeService } from "@/services/knowledge";
import { gradeService } from "@/services/grade";
import { uploadFile } from "@/services/api";
import { useAuthStore } from "@/stores/auth";
import type { GradeQueryData, SchoolClass, Student, StudentInteraction, Teacher } from "@/types";

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
    listFollowedStudentIds: vi.fn(),
    setStudentFollowed: vi.fn(),
    createInteraction: vi.fn(),
    deleteInteraction: vi.fn(),
  },
}));

vi.mock("@/services/homeworkRecord", () => ({
  homeworkRecordService: {
    listByStudent: vi.fn(),
  },
}));

vi.mock("@/services/knowledge", () => ({
  knowledgeService: {
    listKnowledgePoints: vi.fn(),
  },
}));

vi.mock("@/services/grade", () => ({
  gradeService: {
    getQueryData: vi.fn(),
  },
}));

vi.mock("@/services/api", () => ({
  uploadFile: vi.fn(),
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

const emptyGradeQueryData: GradeQueryData = {
  scope: "teacher",
  scopeLabel: "任教班级",
  subject: "数学",
  roles: ["teacher"],
  teachingClassIds: ["class-1", "class-2"],
  homeroomClassIds: [],
  fullClassIds: [],
  grades: ["高一"],
  classes: [],
  exams: [],
};

describe("StudentInteractionPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({ teacher, loading: false, error: null });
    vi.mocked(classService.listMyStudents).mockResolvedValue(students);
    vi.mocked(classService.listMyClasses).mockResolvedValue(classes);
    vi.mocked(studentInteractionService.listByTeacher).mockResolvedValue([]);
    vi.mocked(studentInteractionService.listByStudent).mockResolvedValue([]);
    vi.mocked(studentInteractionService.listFollowedStudentIds).mockResolvedValue([]);
    vi.mocked(studentInteractionService.setStudentFollowed).mockResolvedValue(undefined);
    vi.mocked(studentInteractionService.createInteraction).mockResolvedValue(createdInteraction);
    vi.mocked(studentInteractionService.deleteInteraction).mockResolvedValue(undefined);
    vi.mocked(homeworkRecordService.listByStudent).mockResolvedValue([]);
    vi.mocked(knowledgeService.listKnowledgePoints).mockResolvedValue([]);
    vi.mocked(gradeService.getQueryData).mockResolvedValue(emptyGradeQueryData);
    vi.mocked(uploadFile).mockResolvedValue({
      id: "file-1",
      ownerId: "teacher-1",
      schoolId: "school-1",
      originalName: "clipboard.png",
      mimeType: "image/png",
      size: 5,
      createdAt: "2026-08-03T09:00:00.000Z",
      url: "/api/files/file-1",
    });
  });

  it("keeps the detail pane sticky while the desktop student list can extend with the page", async () => {
    render(<StudentInteractionPage embedded />);

    await screen.findByPlaceholderText("搜索学生...");
    const stickyPane = document.querySelector('[class~="lg:sticky"]');
    const desktopStudentList = document.querySelector('[class~="lg:overflow-visible"]');

    expect(stickyPane).toHaveClass("lg:sticky", "lg:top-6", "lg:self-start");
    expect(desktopStudentList).toBeInTheDocument();
  });

  it("groups students by class and toggles groups from a collapsed state", async () => {
    const user = userEvent.setup();
    render(<StudentInteractionPage embedded />);

    const classOneToggle = await screen.findByRole("button", { name: /高一（1）班/ });
    const classTwoToggle = screen.getByRole("button", { name: /高一（2）班/ });

    expect(classOneToggle).toHaveAttribute("aria-expanded", "false");
    expect(classTwoToggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("button", { name: /^甲同学$/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^丙同学$/ })).not.toBeInTheDocument();

    await user.click(classOneToggle);

    expect(classOneToggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: /^甲同学$/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^乙同学$/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^丙同学$/ })).not.toBeInTheDocument();

    await user.click(classTwoToggle);

    expect(screen.getByRole("button", { name: /^丙同学$/ })).toBeInTheDocument();

    await user.click(classOneToggle);

    expect(classOneToggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("button", { name: /^甲同学$/ })).not.toBeInTheDocument();
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

  it("persists followed students and lets the teacher toggle the star from the list", async () => {
    const user = userEvent.setup();
    vi.mocked(studentInteractionService.listFollowedStudentIds).mockResolvedValue(["student-2"]);
    render(<StudentInteractionPage embedded />);

    const classOneToggle = await screen.findByRole("button", { name: /高一（1）班/ });
    await user.click(classOneToggle);

    expect(screen.getByRole("button", { name: "取消关注乙同学" })).toBeInTheDocument();
    const followStudentOne = screen.getByRole("button", { name: "关注甲同学" });
    await user.click(followStudentOne);

    await waitFor(() => {
      expect(studentInteractionService.setStudentFollowed).toHaveBeenCalledWith("student-1", true);
    });
    expect(screen.getByRole("button", { name: "取消关注甲同学" })).toBeInTheDocument();
  });

  it("uploads pasted chat images and submits an image-only interaction", async () => {
    const user = userEvent.setup();
    render(<StudentInteractionPage embedded />);

    const textarea = await screen.findByPlaceholderText("记录本次与学生交流的内容...");
    const image = new File(["image"], "clipboard.png", { type: "image/png" });
    fireEvent.paste(textarea, {
      clipboardData: {
        items: [{ kind: "file", type: "image/png", getAsFile: () => image }],
      },
    });

    expect(await screen.findByAltText("clipboard.png")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "添加记录" }));

    await waitFor(() => {
      expect(studentInteractionService.createInteraction).toHaveBeenCalledWith(
        "teacher-1",
        "school-1",
        expect.objectContaining({
          studentId: "student-1",
          type: "chat",
          content: "",
          attachments: [{
            id: "file-1",
            name: "clipboard.png",
            url: "/api/files/file-1",
            mimeType: "image/png",
            size: 5,
          }],
        }),
      );
    });
  });

  it.each([
    ["学习态度", "记录学生学习态度的具体表现...", "attitude"],
    ["学习状态", "记录学生学习状态的观察...", "status"],
  ] as const)("uploads pasted images for %s records", async (tabLabel, placeholder, expectedType) => {
    const user = userEvent.setup();
    render(<StudentInteractionPage embedded />);

    await user.click(await screen.findByRole("button", { name: tabLabel }));
    const textarea = screen.getByPlaceholderText(placeholder);
    const image = new File(["image"], "clipboard.png", { type: "image/png" });
    fireEvent.paste(textarea, {
      clipboardData: {
        items: [{ kind: "file", type: "image/png", getAsFile: () => image }],
      },
    });

    expect(await screen.findByAltText("clipboard.png")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "添加记录" }));

    await waitFor(() => {
      expect(studentInteractionService.createInteraction).toHaveBeenCalledWith(
        "teacher-1",
        "school-1",
        expect.objectContaining({
          type: expectedType,
          attachments: [expect.objectContaining({ id: "file-1" })],
        }),
      );
    });
  });

  it("shows the two most recent homework records and subject exam scores beside the student name", async () => {
    vi.mocked(knowledgeService.listKnowledgePoints).mockResolvedValue([
      { id: "kp-1", schoolId: "school-1", teacherId: "teacher-1", parentId: null, name: "函数", order: 1, level: 0 },
      { id: "kp-2", schoolId: "school-1", teacherId: "teacher-1", parentId: null, name: "数列", order: 2, level: 0 },
      { id: "kp-3", schoolId: "school-1", teacherId: "teacher-1", parentId: null, name: "集合", order: 3, level: 0 },
    ]);
    vi.mocked(homeworkRecordService.listByStudent).mockResolvedValue([
      { id: "hr-1", teacherId: "teacher-1", schoolId: "school-1", studentId: "student-1", knowledgePointId: "kp-1", status: "correct", createdAt: "2026-09-03T00:00:00.000Z", updatedAt: "2026-09-03T00:00:00.000Z" },
      { id: "hr-2", teacherId: "teacher-1", schoolId: "school-1", studentId: "student-1", knowledgePointId: "kp-2", status: "partial", createdAt: "2026-09-02T00:00:00.000Z", updatedAt: "2026-09-02T00:00:00.000Z" },
      { id: "hr-3", teacherId: "teacher-1", schoolId: "school-1", studentId: "student-1", knowledgePointId: "kp-3", status: "wrong", createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z" },
    ]);
    const exam = (id: string, name: string, examDate: string, score: number) => ({
      id, cohortKey: "2029", cohortLabel: "2029届高一", name, examDate, subjects: ["数学"],
      subjectAverages: { 数学: 80 }, classSummaries: [], createdAt: `${examDate}T00:00:00.000Z`,
      records: [{
        id: `record-${id}`, studentId: "student-1", studentName: "甲同学", studentNo: "001", classId: "class-1", className: "高一（1）班",
        scores: { 数学: score }, assignedScores: { 数学: score }, rawTotal: null, assignedTotal: null, gradeRank: 1, classRank: 1,
      }],
    });
    vi.mocked(gradeService.getQueryData).mockResolvedValue({
      ...emptyGradeQueryData,
      exams: [
        exam("exam-old", "第一次月考", "2026-08-01", 81),
        exam("exam-new", "第三次月考", "2026-09-05", 93),
        exam("exam-mid", "第二次月考", "2026-08-20", 88),
      ],
    });

    render(<StudentInteractionPage embedded />);

    expect(await screen.findByText("函数")).toBeInTheDocument();
    expect(screen.getByText("数列")).toBeInTheDocument();
    expect(screen.queryByText("集合")).not.toBeInTheDocument();
    expect(screen.getByText("第三次月考")).toBeInTheDocument();
    expect(screen.getByText("第二次月考")).toBeInTheDocument();
    expect(screen.queryByText("第一次月考")).not.toBeInTheDocument();
    expect(screen.getByText("最近考试成绩 · 数学")).toBeInTheDocument();
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
