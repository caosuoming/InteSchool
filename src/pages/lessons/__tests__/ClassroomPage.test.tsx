import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ClassroomPage from "@/pages/lessons/ClassroomPage";
import { classService } from "@/services/class";
import { classroomHomeworkService } from "@/services/classroomHomework";
import { classroomNoticeService } from "@/services/classroomNotice";
import { lessonCoursewareService } from "@/services/lessonCourseware";
import { extractStoredFile } from "@/services/api";
import { useAuthStore } from "@/stores/auth";
import type { ClassroomHomework, ClassroomNotice, LessonCourseware, Teacher } from "@/types";

vi.mock("@/services/class", () => ({
  classService: {
    listSchoolClasses: vi.fn(),
    listStudentsByClass: vi.fn(),
  },
}));

vi.mock("@/services/classroomHomework", () => ({
  classroomHomeworkService: {
    listHomeworks: vi.fn(),
  },
}));

vi.mock("@/services/classroomNotice", () => ({
  classroomNoticeService: {
    listNotices: vi.fn(),
  },
}));

vi.mock("@/services/lessonCourseware", () => ({
  lessonCoursewareService: {
    listCoursewares: vi.fn(),
  },
}));

vi.mock("@/services/api", () => ({
  extractStoredFile: vi.fn(),
}));

vi.mock("@/stores/ui", () => ({
  toast: {
    error: vi.fn(),
  },
}));

const teacher: Teacher = {
  id: "teacher-1",
  email: "teacher@example.com",
  name: "王老师",
  avatar: "王",
  schoolId: "school-1",
  subject: "数学",
  teachingClassIds: ["class-1"],
  homeroomClassIds: [],
  status: "active",
  role: "teacher",
  roles: ["teacher"],
  subjectGroupIds: [],
  prepGroupIds: [],
  affiliations: [],
  currentAffiliationId: null,
  createdAt: "2026-08-02T00:00:00.000Z",
};

const mathHomework: ClassroomHomework = {
  id: "homework-1",
  teacherId: "teacher-1",
  teacherName: "王老师",
  schoolId: "school-1",
  subject: "数学",
  content: "完成课本第 42 页第 1—6 题",
  classIds: ["class-1"],
  assignedDate: "2026-08-02",
  publishAt: "2026-08-02T00:00:00.000Z",
  createdAt: "2026-08-02T00:00:00.000Z",
  updatedAt: "2026-08-02T00:00:00.000Z",
};

const chineseHomework: ClassroomHomework = {
  ...mathHomework,
  id: "homework-2",
  subject: "语文",
  content: "背诵《劝学》第一段",
};

const pastHomework: ClassroomHomework = {
  ...mathHomework,
  id: "homework-past",
  content: "订正上一周数学周练",
  assignedDate: "2020-01-01",
  publishAt: "2020-01-01T00:00:00.000Z",
};

const activeNotice: ClassroomNotice = {
  id: "notice-1",
  teacherId: "teacher-1",
  teacherName: "王老师",
  schoolId: "school-1",
  content: "今天放学后进行卫生检查",
  classIds: ["class-1"],
  startsAt: "2020-01-01T00:00:00.000Z",
  endsAt: "2999-01-01T00:00:00.000Z",
  createdAt: "2026-08-02T00:00:00.000Z",
  updatedAt: "2026-08-02T00:00:00.000Z",
};

const secondNotice: ClassroomNotice = {
  ...activeNotice,
  id: "notice-2",
  content: "下午第三节课调整到实验楼",
};

const attachedHomework: ClassroomHomework = {
  ...mathHomework,
  id: "homework-attachment",
  content: "阅读附件中的函数定义",
  attachments: [{
    id: "file-1",
    name: "函数定义.docx",
    url: "/api/files/file-1",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    size: 2048,
  }],
};

const lesson: LessonCourseware = {
  id: "lesson-1",
  teacherId: "teacher-1",
  teacherName: "王老师",
  schoolId: "school-1",
  subject: "数学",
  title: "函数图像",
  chapterIds: [],
  knowledgePointIds: [],
  grade: "高一",
  schoolYear: "2026-2027",
  sourceType: "manual",
  slides: [],
  classIds: ["class-1"],
  status: "published",
  publishedAt: "2026-08-02T00:00:00.000Z",
  createdAt: "2026-08-02T00:00:00.000Z",
  updatedAt: "2026-08-02T00:00:00.000Z",
};

const chineseLesson: LessonCourseware = {
  ...lesson,
  id: "lesson-2",
  teacherId: "teacher-2",
  teacherName: "李老师",
  subject: "语文",
  title: "《劝学》文本研读",
};

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/classroom/class-1"]}>
      <Routes>
        <Route path="/classroom/:classId" element={<ClassroomPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ClassroomPage", () => {
  let fullscreenElement: Element | null;

  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
      configurable: true,
      value: vi.fn(() => ({
        clearRect: vi.fn(),
        drawImage: vi.fn(),
      })),
    });
    localStorage.clear();
    sessionStorage.clear();
    fullscreenElement = null;
    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      get: () => fullscreenElement,
    });
    Object.defineProperty(HTMLElement.prototype, "requestFullscreen", {
      configurable: true,
      value: vi.fn(async () => {
        fullscreenElement = document.documentElement;
        document.dispatchEvent(new Event("fullscreenchange"));
      }),
    });
    Object.defineProperty(document, "exitFullscreen", {
      configurable: true,
      value: vi.fn(async () => {
        fullscreenElement = null;
        document.dispatchEvent(new Event("fullscreenchange"));
      }),
    });

    useAuthStore.setState({ teacher, loading: false, error: null });
    vi.mocked(classService.listSchoolClasses).mockResolvedValue([{
      id: "class-1",
      type: "school",
      schoolId: "school-1",
      name: "高一（1）班",
      grade: "高一",
      studentCount: 40,
      status: "active",
      createdBy: "teacher-1",
      createdAt: "2026-08-02T00:00:00.000Z",
    }]);
    vi.mocked(classService.listStudentsByClass).mockResolvedValue([]);
    vi.mocked(classroomHomeworkService.listHomeworks).mockResolvedValue([mathHomework]);
    vi.mocked(classroomNoticeService.listNotices).mockResolvedValue([activeNotice]);
    vi.mocked(lessonCoursewareService.listCoursewares).mockResolvedValue([lesson]);
    vi.mocked(extractStoredFile).mockResolvedValue({
      text: "函数定义",
      html: "<p>函数定义</p>",
      format: "docx",
      warnings: [],
    });
  });

  it("shows the compact homework layout and keeps display preferences locally", async () => {
    const user = userEvent.setup();
    const { unmount } = renderPage();

    const homeworkContent = await screen.findByText("完成课本第 42 页第 1—6 题");
    expect(homeworkContent).toBeInTheDocument();
    expect(homeworkContent.closest("article")).not.toHaveClass("min-h-40");
    expect(homeworkContent.closest("article")).toHaveClass("grid-cols-[2.75rem_minmax(0,1fr)_4.25rem]");
    expect(screen.queryByText(/任课教师/)).not.toBeInTheDocument();
    expect(screen.queryByText("王老师")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^作业/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^上课/ })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "放大作业字体" }));
    await waitFor(() => {
      expect(localStorage.getItem("inteschool-classroom-preferences:class-1")).toContain('"fontSize":32');
    });

    unmount();
    renderPage();
    expect(await screen.findByText("完成课本第 42 页第 1—6 题")).toHaveStyle({ fontSize: "32px" });

    await user.click(screen.getByRole("button", { name: "将数学作业标记为已完成" }));
    expect(screen.getByRole("button", { name: /已完成 1/ })).toBeInTheDocument();
    expect(localStorage.getItem("inteschool-classroom-preferences:class-1")).toContain("数学");
  });

  it("moves subjects with arrow controls and opens previous homework from the footer", async () => {
    const user = userEvent.setup();
    vi.mocked(classroomHomeworkService.listHomeworks)
      .mockResolvedValueOnce([mathHomework, chineseHomework])
      .mockResolvedValueOnce([pastHomework]);

    renderPage();

    expect(await screen.findByText("背诵《劝学》第一段")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "语文作业上移" }));
    expect(localStorage.getItem("inteschool-classroom-preferences:class-1")).toContain(
      '"subjectOrder":["语文","数学"]',
    );

    await user.click(screen.getByRole("button", { name: "往期作业查看" }));
    expect(await screen.findByText("订正上一周数学周练")).toBeInTheDocument();
  });

  it("switches to the lesson tab and starts published courseware in fullscreen presentation mode", async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByText("完成课本第 42 页第 1—6 题");
    await user.click(screen.getByRole("button", { name: /^上课/ }));

    expect(await screen.findByText("函数图像")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "数学" })).not.toBeInTheDocument();
    expect(screen.queryByText("1 份已推送课件")).not.toBeInTheDocument();
    expect(screen.getByText("全屏上课")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /函数图像/ }));

    expect(HTMLElement.prototype.requestFullscreen).toHaveBeenCalled();
    expect(await screen.findByText("课件暂无页面")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "退出全屏" })).toBeInTheDocument();
  });

  it("keeps the subject rail available before any lesson is published", async () => {
    const user = userEvent.setup();
    vi.mocked(lessonCoursewareService.listCoursewares).mockResolvedValue([]);
    renderPage();

    await screen.findByText("完成课本第 42 页第 1—6 题");
    await user.click(screen.getByRole("button", { name: /^上课/ }));

    expect(screen.getByRole("complementary", { name: "上课学科" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "选择语文学科，0份课件" })).toBeInTheDocument();
    expect(screen.getByText("该学科暂无已推送课件")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "更多课件" }));
    expect(screen.getByText("该班级暂无已发布课件。")).toBeInTheDocument();
  });

  it("filters lessons by an ordered subject rail and opens every lesson from More", async () => {
    const user = userEvent.setup();
    vi.mocked(lessonCoursewareService.listCoursewares).mockResolvedValue([lesson, chineseLesson]);
    renderPage();

    await screen.findByText("完成课本第 42 页第 1—6 题");
    await user.click(screen.getByRole("button", { name: /^上课/ }));

    expect(screen.getByRole("complementary", { name: "上课学科" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "选择英语学科，0份课件" })).toBeInTheDocument();
    expect(await screen.findByText("《劝学》文本研读")).toBeInTheDocument();
    expect(screen.queryByText("函数图像")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "选择数学学科，1份课件" }));
    expect(await screen.findByText("函数图像")).toBeInTheDocument();
    expect(screen.queryByText("《劝学》文本研读")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "数学学科上移" }));
    expect(localStorage.getItem("inteschool-classroom-preferences:class-1")).toContain(
      '"lessonSubjectOrder":["数学","语文"',
    );

    await user.click(screen.getByRole("button", { name: "更多课件" }));
    expect(screen.getByRole("heading", { name: "全部上课课件" })).toBeInTheDocument();
    expect(screen.getAllByText("函数图像")).toHaveLength(2);
    expect(screen.getByText("《劝学》文本研读")).toBeInTheDocument();
  });

  it("scrolls active notices outside lesson mode and toggles page fullscreen", async () => {
    const user = userEvent.setup();
    vi.mocked(classroomNoticeService.listNotices).mockResolvedValue([activeNotice, secondNotice]);
    renderPage();

    const noticeBar = await screen.findByRole("status", { name: "班级通知" });
    expect(noticeBar).toHaveTextContent("今天放学后进行卫生检查");
    expect(noticeBar).toHaveTextContent("下午第三节课调整到实验楼");
    expect(noticeBar).toHaveClass("bg-black", "text-amber-300");
    expect(noticeBar.querySelector(".classroom-notice-track")?.children).toHaveLength(2);

    await user.click(screen.getByRole("button", { name: /^上课/ }));
    expect(screen.queryByRole("status", { name: "班级通知" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^作业/ }));
    expect(screen.getByRole("status", { name: "班级通知" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "全屏" }));
    expect(await screen.findByRole("button", { name: "退出全屏" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "退出全屏" }));
    expect(await screen.findByRole("button", { name: "全屏" })).toBeInTheDocument();
  });

  it("opens homework documents and enlarges their page and font", async () => {
    const user = userEvent.setup();
    vi.mocked(classroomHomeworkService.listHomeworks).mockResolvedValue([attachedHomework]);
    renderPage();

    await user.click(await screen.findByRole("button", { name: /函数定义\.docx/ }));
    expect(await screen.findByText("函数定义")).toBeInTheDocument();
    expect(extractStoredFile).toHaveBeenCalledWith("/api/files/file-1");

    await user.click(screen.getByRole("button", { name: "放大附件页面" }));
    await user.click(screen.getByRole("button", { name: "放大文档字体" }));

    expect(screen.getByText("125%")).toBeInTheDocument();
    expect(screen.getByText("字体 20")).toBeInTheDocument();
  });
});
