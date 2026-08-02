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
    renderPage();

    expect(await screen.findByText("完成课本第 42 页第 1—6 题")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^作业/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^上课/ })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "放大作业字体" }));
    await waitFor(() => {
      expect(localStorage.getItem("inteschool-classroom-preferences:class-1")).toContain('"fontSize":32');
    });

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

  it("switches to the lesson tab and displays published courseware", async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByText("完成课本第 42 页第 1—6 题");
    await user.click(screen.getByRole("button", { name: /^上课/ }));

    expect(await screen.findByText("函数图像")).toBeInTheDocument();
    expect(screen.getByText("全屏上课")).toBeInTheDocument();
  });

  it("scrolls active notices outside lesson mode and toggles page fullscreen", async () => {
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByRole("status", { name: "班级通知" })).toHaveTextContent("今天放学后进行卫生检查");

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
