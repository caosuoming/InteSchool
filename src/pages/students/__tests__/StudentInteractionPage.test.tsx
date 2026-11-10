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
    listIgnoredStudentIds: vi.fn(),
    setStudentIgnored: vi.fn(),
    createInteraction: vi.fn(),
    deleteInteraction: vi.fn(),
  },
}));

vi.mock("@/services/homeworkRecord", () => ({
  homeworkRecordService: {
    listByStudent: vi.fn(),
    listAttitudesByStudent: vi.fn(),
    listMissingByStudent: vi.fn(),
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
    vi.mocked(studentInteractionService.listIgnoredStudentIds).mockResolvedValue([]);
    vi.mocked(studentInteractionService.setStudentIgnored).mockResolvedValue(undefined);
    vi.mocked(studentInteractionService.createInteraction).mockResolvedValue(createdInteraction);
    vi.mocked(studentInteractionService.deleteInteraction).mockResolvedValue(undefined);
    vi.mocked(homeworkRecordService.listByStudent).mockResolvedValue([]);
    vi.mocked(homeworkRecordService.listAttitudesByStudent).mockResolvedValue([]);
    vi.mocked(homeworkRecordService.listMissingByStudent).mockResolvedValue([]);
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

    expect(stickyPane).toHaveClass(
      "lg:sticky",
      "lg:top-6",
      "lg:h-[calc(100vh-3rem)]",
      "lg:self-start",
    );
    expect(desktopStudentList).toBeInTheDocument();
  });

  it("lets the interaction timeline use the remaining detail-pane height", async () => {
    render(<StudentInteractionPage embedded />);

    const timelineTitle = await screen.findByText(/互动记录时间线/);
    const timelineCard = timelineTitle.parentElement;

    expect(timelineCard).toHaveClass("flex-1", "min-h-0", "overflow-auto");
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

  it("marks students as ignored and makes follow/ignore mutually exclusive", async () => {
    const user = userEvent.setup();
    vi.mocked(studentInteractionService.listFollowedStudentIds).mockResolvedValue(["student-1"]);
    render(<StudentInteractionPage embedded />);

    const classOneToggle = await screen.findByRole("button", { name: /高一（1）班/ });
    await user.click(classOneToggle);

    expect(screen.getByRole("button", { name: "取消关注甲同学" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "标记甲同学为不关注" }));

    await waitFor(() => {
      expect(studentInteractionService.setStudentIgnored).toHaveBeenCalledWith("student-1", true);
    });
    expect(screen.getByRole("button", { name: "取消不关注甲同学" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "关注甲同学" })).toBeInTheDocument();
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

  it("shows only a scrollable single-subject score trend beside the student info", async () => {
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

    expect(await screen.findByText("第三次月考")).toBeInTheDocument();
    expect(screen.queryByText("最近作业记录")).not.toBeInTheDocument();
    expect(homeworkRecordService.listByStudent).not.toHaveBeenCalled();
    expect(knowledgeService.listKnowledgePoints).not.toHaveBeenCalled();
    expect(screen.getByText("第二次月考")).toBeInTheDocument();
    expect(screen.getByText("第一次月考")).toBeInTheDocument();
    expect(screen.getByText("历次单科成绩 · 数学")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /甲同学单科成绩与名次折线图/ })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /成绩越高位置越高/ })).toBeInTheDocument();
    expect(screen.getByTestId("rank-trend-scroll")).toHaveClass("overflow-x-auto");
  });


  it("shows class ranking trends when selecting a class group and returns to student details", async () => {
    const user = userEvent.setup();
    const exam = (id: string, date: string, ownAverage: number, otherAverage: number) => ({
      id, cohortKey: "2029", cohortLabel: "2029届高一", name: `${id}月考`, examDate: date,
      subjects: ["数学"], subjectAverages: { 数学: 80 }, createdAt: `${date}T00:00:00.000Z`,
      records: [],
      classSummaries: [
        { classId: "class-1", className: "高一（1）班", studentCount: 2, subjectAverages: { 数学: ownAverage }, rawTotalAverage: null, assignedTotalAverage: null },
        { classId: "class-2", className: "高一（2）班", studentCount: 1, subjectAverages: { 数学: otherAverage }, rawTotalAverage: null, assignedTotalAverage: null },
      ],
    });
    vi.mocked(gradeService.getQueryData).mockResolvedValue({ ...emptyGradeQueryData, exams: [
      exam("二", "2026-09-01", 85, 80), exam("一", "2026-08-01", 75, 90),
    ] });
    render(<StudentInteractionPage embedded />);
    const button = await screen.findByRole("button", { name: /高一（1）班/ });
    await user.click(button);
    expect(screen.getByText("高一（1）班 · 历次考试班级名次")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /高一（1）班班级考试名次折线图/ })).toBeInTheDocument();
    expect(screen.getByText(/按数学班级均分/)).toBeInTheDocument();
    expect(screen.getByText("第2名")).toBeInTheDocument();
    expect(screen.getByText("第1名")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "甲同学" }));
    expect(screen.getByText(/学号：001/)).toBeInTheDocument();
    expect(screen.queryByText("高一（1）班 · 历次考试班级名次")).not.toBeInTheDocument();
  });

  it("allows homeroom teachers to view other subjects as individual score-and-rank timelines", async () => {
    const user = userEvent.setup();
    const exam = {
      id: "exam-full", cohortKey: "2029", cohortLabel: "2029届高一", name: "期中考试", examDate: "2026-10-01",
      subjects: ["数学", "语文"], subjectAverages: { 数学: 80, 语文: 85 }, classSummaries: [], createdAt: "2026-10-01T00:00:00.000Z",
      records: [{ id: "record-full", studentId: "student-1", studentName: "甲同学", studentNo: "001", classId: "class-1", className: "高一（1）班", scores: { 数学: 94, 语文: 87 }, assignedScores: { 数学: 95, 语文: 90 }, rawTotal: 181, assignedTotal: 185, gradeRank: 2, classRank: 1, subjectRanks: { 数学: 3, 语文: 4 }, subjectRankScopes: { 数学: "cohort" as const, 语文: "cohort" as const } }],
    };
    vi.mocked(gradeService.getQueryData).mockResolvedValue({ ...emptyGradeQueryData, scope: "homeroom", homeroomClassIds: ["class-1"], fullClassIds: ["class-1"], exams: [exam] });
    render(<StudentInteractionPage embedded />);
    const more = await screen.findByRole("button", { name: "更多" });
    await user.click(more);
    expect(screen.getByText("甲同学 · 其他学科成绩与名次")).toBeInTheDocument();
    expect(screen.getByText("语文 · 历次成绩与名次")).toBeInTheDocument();
    expect(screen.queryByText("数学 · 历次成绩与名次")).not.toBeInTheDocument();
    expect(screen.getByRole("img", { name: /甲同学语文成绩走势折线图/ })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /甲同学语文名次走势折线图/ })).toBeInTheDocument();
    expect(screen.getAllByLabelText(/语文成绩：90/)).toHaveLength(2);
    expect(more.parentElement).toHaveClass("justify-end");
    await user.click(screen.getByRole("button", { name: /高一（2）班/ }));
    expect(screen.queryByText("甲同学 · 其他学科成绩与名次")).not.toBeInTheDocument();
  });

  it("does not expose the other-subject modal to a subject-only teacher", async () => {
    const exam = {
      id: "exam-teacher", cohortKey: "2029", cohortLabel: "2029届高一",
      name: "期中考试", examDate: "2026-10-01", createdAt: "2026-10-01T00:00:00.000Z",
      subjects: ["数学", "语文"], subjectAverages: { 数学: 80, 语文: 85 }, classSummaries: [],
      records: [{
        id: "record-teacher", studentId: "student-1", studentName: "甲同学",
        studentNo: "001", classId: "class-1", className: "高一（1）班",
        scores: { 数学: 95, 语文: 90 }, assignedScores: { 数学: 95, 语文: 90 },
        rawTotal: 185, assignedTotal: 185, gradeRank: 2, classRank: 1,
      }],
    };
    vi.mocked(gradeService.getQueryData).mockResolvedValue({ ...emptyGradeQueryData, exams: [exam] });
    render(<StudentInteractionPage embedded />);
    expect(await screen.findByText("历次单科成绩 · 数学")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "更多" })).not.toBeInTheDocument();
  });

  it("shows homework attitude and evaluation in the interaction timeline", async () => {
    vi.mocked(homeworkRecordService.listAttitudesByStudent).mockResolvedValue([{
      id: "homework-feedback-1",
      teacherId: "teacher-1",
      schoolId: "school-1",
      studentId: "student-1",
      homeworkDate: "2026-09-06",
      keywords: ["按时完成", "书写认真"],
      evaluation: "步骤完整，订正及时",
      createdAt: "2026-09-06T08:00:00.000Z",
      updatedAt: "2026-09-06T08:10:00.000Z",
    }]);

    render(<StudentInteractionPage embedded />);

    expect(await screen.findByText("作业")).toBeInTheDocument();
    expect(screen.getByText("按时完成、书写认真")).toBeInTheDocument();
    expect(screen.getByText("步骤完整，订正及时")).toBeInTheDocument();
    expect(screen.getByText(/互动记录时间线（1 条）/)).toBeInTheDocument();
    expect(homeworkRecordService.listAttitudesByStudent).toHaveBeenCalledWith("student-1");
  });

  it("shows missing homework from class attendance in the interaction timeline", async () => {
    vi.mocked(homeworkRecordService.listMissingByStudent).mockResolvedValue([{
      id: "overview-1:student-1",
      classOverviewId: "overview-1",
      teacherId: "teacher-1",
      schoolId: "school-1",
      classId: "class-1",
      studentId: "student-1",
      homeworkDate: "2026-09-07",
      summary: "二次函数作业整体完成一般",
      createdAt: "2026-09-07T08:00:00.000Z",
      updatedAt: "2026-09-07T08:10:00.000Z",
    }]);

    render(<StudentInteractionPage embedded />);

    expect(await screen.findByText("未交作业")).toBeInTheDocument();
    expect(screen.getByText("二次函数作业整体完成一般")).toBeInTheDocument();
    expect(screen.getByText(/互动记录时间线（1 条）/)).toBeInTheDocument();
    expect(homeworkRecordService.listMissingByStudent).toHaveBeenCalledWith("student-1");
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
