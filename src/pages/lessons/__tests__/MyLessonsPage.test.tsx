import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import MyLessonsPage from "@/pages/lessons/MyLessonsPage";
import { classService } from "@/services/class";
import { classroomHomeworkService } from "@/services/classroomHomework";
import { classroomNoticeService } from "@/services/classroomNotice";
import { lessonCoursewareService } from "@/services/lessonCourseware";
import { uploadFile } from "@/services/api";
import { useAuthStore } from "@/stores/auth";
import type { ClassroomHomework, ClassroomNotice, LessonCourseware, Teacher } from "@/types";

vi.mock("@/services/class", () => ({
  classService: {
    listSchoolClasses: vi.fn(),
  },
}));

vi.mock("@/services/classroomHomework", () => ({
  classroomHomeworkService: {
    listHomeworks: vi.fn(),
    createHomework: vi.fn(),
    updateHomework: vi.fn(),
    deleteHomework: vi.fn(),
  },
}));

vi.mock("@/services/classroomNotice", () => ({
  classroomNoticeService: {
    listNotices: vi.fn(),
    createNotice: vi.fn(),
    updateNotice: vi.fn(),
  },
}));

vi.mock("@/services/lessonCourseware", () => ({
  lessonCoursewareService: {
    listCoursewares: vi.fn(),
    deleteCourseware: vi.fn(),
    completeCourseware: vi.fn(),
    restoreCourseware: vi.fn(),
    publishCourseware: vi.fn(),
    unpublishCourseware: vi.fn(),
  },
}));

vi.mock("@/services/api", () => ({
  uploadFile: vi.fn(),
}));

vi.mock("@/stores/ui", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
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
  affiliations: [{
    id: "affiliation-1",
    teacherId: "teacher-1",
    schoolId: "school-1",
    schoolName: "示例中学",
    subject: "数学",
    teachingClassIds: ["class-1"],
    homeroomClassIds: [],
    status: "active",
    role: "teacher",
    roles: ["teacher"],
    subjectGroupIds: [],
    prepGroupIds: [],
    isCurrent: true,
    joinedAt: "2026-08-02T00:00:00.000Z",
  }],
  currentAffiliationId: "affiliation-1",
  createdAt: "2026-08-02T00:00:00.000Z",
};

const createdHomework: ClassroomHomework = {
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

function courseware(
  id: string,
  lifecycleStatus: "active" | "completed" | "trashed" = "active",
): LessonCourseware {
  return {
    id,
    teacherId: "teacher-1",
    schoolId: "school-1",
    title: `函数课件 ${id}`,
    chapterIds: [],
    knowledgePointIds: [],
    grade: "高一",
    schoolYear: "2026-2027",
    semester: "上学期",
    sourceType: "manual",
    slides: [{
      id: `${id}-slide`,
      type: "knowledge",
      title: "函数",
      content: "函数基础",
      relatedQuestionIds: [],
      askableStudentIds: [],
    }],
    classIds: ["class-1"],
    status: "draft",
    lifecycleStatus,
    completedAt: lifecycleStatus === "completed" ? "2026-08-02T12:00:00.000Z" : null,
    deletedAt: lifecycleStatus === "trashed" ? "2026-08-02T12:00:00.000Z" : null,
    createdAt: "2026-08-02T00:00:00.000Z",
    updatedAt: "2026-08-02T12:00:00.000Z",
  };
}

describe("MyLessonsPage classroom publishing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    vi.mocked(classroomHomeworkService.listHomeworks).mockResolvedValue([]);
    vi.mocked(classroomHomeworkService.createHomework).mockResolvedValue(createdHomework);
    vi.mocked(classroomHomeworkService.updateHomework).mockResolvedValue(createdHomework);
    vi.mocked(classroomNoticeService.listNotices).mockResolvedValue([activeNotice]);
    vi.mocked(classroomNoticeService.createNotice).mockResolvedValue(activeNotice);
    vi.mocked(classroomNoticeService.updateNotice).mockResolvedValue(activeNotice);
    vi.mocked(lessonCoursewareService.listCoursewares).mockResolvedValue([]);
    vi.mocked(lessonCoursewareService.deleteCourseware).mockResolvedValue(undefined);
    vi.mocked(lessonCoursewareService.completeCourseware).mockImplementation(async (id) => courseware(id, "completed"));
    vi.mocked(lessonCoursewareService.restoreCourseware).mockImplementation(async (id) => courseware(id, "active"));
    vi.mocked(uploadFile).mockResolvedValue({
      id: "file-1",
      ownerId: "teacher-1",
      schoolId: "school-1",
      originalName: "函数图像.pdf",
      mimeType: "application/pdf",
      size: 4096,
      createdAt: "2026-08-02T00:00:00.000Z",
      url: "/api/files/file-1",
    });
  });

  it("defaults to the teacher's class and publishes homework immediately", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <MyLessonsPage />
      </MemoryRouter>,
    );

    await user.click(await screen.findByRole("tab", { name: "布置作业" }));
    expect(await screen.findByRole("checkbox", { name: "高一 · 高一（1）班" })).toBeChecked();

    await user.type(screen.getByLabelText("作业内容"), "完成课本第 42 页第 1—6 题");
    await user.click(screen.getByRole("button", { name: "发布作业" }));

    await waitFor(() => {
      expect(classroomHomeworkService.createHomework).toHaveBeenCalledWith(
        "teacher-1",
        "school-1",
        expect.objectContaining({
          content: "完成课本第 42 页第 1—6 题",
          classIds: ["class-1"],
          publishAt: expect.any(String),
        }),
      );
    });
  });

  it("publishes a timed notice and previews the current class display", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <MyLessonsPage />
      </MemoryRouter>,
    );

    expect((await screen.findAllByText("今天放学后进行卫生检查")).length).toBeGreaterThan(0);
    await user.type(screen.getByLabelText("通知内容"), "明天第一节课改到实验室");
    await user.click(screen.getByRole("button", { name: "发送通知" }));

    await waitFor(() => {
      expect(classroomNoticeService.createNotice).toHaveBeenCalledWith(
        "teacher-1",
        "school-1",
        expect.objectContaining({
          content: "明天第一节课改到实验室",
          classIds: ["class-1"],
          startsAt: expect.any(String),
          endsAt: expect.any(String),
        }),
      );
    });
  });

  it("uploads homework attachments and passes stored metadata to the service", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <MyLessonsPage />
      </MemoryRouter>,
    );

    await user.click(await screen.findByRole("tab", { name: "布置作业" }));
    expect(await screen.findByRole("checkbox", { name: "高一 · 高一（1）班" })).toBeChecked();
    const file = new File(["pdf"], "函数图像.pdf", { type: "application/pdf" });
    await user.upload(screen.getByLabelText("选择作业附件"), file);
    expect(screen.getByText("函数图像.pdf")).toBeInTheDocument();

    await user.type(screen.getByLabelText("作业内容"), "阅读附件并完成练习");
    await user.click(screen.getByRole("button", { name: "发布作业" }));

    await waitFor(() => {
      expect(uploadFile).toHaveBeenCalledWith(file);
      expect(classroomHomeworkService.createHomework).toHaveBeenCalledWith(
        "teacher-1",
        "school-1",
        expect.objectContaining({
          content: "阅读附件并完成练习",
          attachments: [{
            id: "file-1",
            name: "函数图像.pdf",
            url: "/api/files/file-1",
            mimeType: "application/pdf",
            size: 4096,
          }],
        }),
      );
    });
  });

  it("edits the current notice instead of creating a duplicate", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <MyLessonsPage />
      </MemoryRouter>,
    );

    await user.click(await screen.findByRole("button", { name: "编辑通知" }));
    const textarea = screen.getByLabelText("通知内容");
    expect(textarea).toHaveValue(activeNotice.content);
    await user.clear(textarea);
    await user.type(textarea, "明天第一节课改到实验室");
    await user.click(screen.getByRole("button", { name: "保存通知修改" }));

    await waitFor(() => {
      expect(classroomNoticeService.updateNotice).toHaveBeenCalledWith(
        "notice-1",
        "teacher-1",
        "school-1",
        expect.objectContaining({
          content: "明天第一节课改到实验室",
          classIds: ["class-1"],
        }),
      );
    });
    expect(classroomNoticeService.createNotice).not.toHaveBeenCalled();
  });

  it("edits the current homework and preserves its stored attachments", async () => {
    const user = userEvent.setup();
    const homeworkWithAttachment: ClassroomHomework = {
      ...createdHomework,
      attachments: [{
        id: "file-existing",
        name: "原作业.pdf",
        url: "/api/files/file-existing",
        mimeType: "application/pdf",
        size: 2048,
      }],
    };
    vi.mocked(classroomHomeworkService.listHomeworks).mockResolvedValue([homeworkWithAttachment]);
    vi.mocked(classroomHomeworkService.updateHomework).mockResolvedValue(homeworkWithAttachment);

    render(
      <MemoryRouter>
        <MyLessonsPage />
      </MemoryRouter>,
    );

    await user.click(await screen.findByRole("button", { name: "编辑作业" }));
    expect(screen.getByRole("tab", { name: "布置作业" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByLabelText("作业内容")).toHaveValue(createdHomework.content);
    expect(screen.getByText("原作业.pdf")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "保存作业修改" }));

    await waitFor(() => {
      expect(classroomHomeworkService.updateHomework).toHaveBeenCalledWith(
        "homework-1",
        "teacher-1",
        "school-1",
        expect.objectContaining({
          attachments: [expect.objectContaining({ id: "file-existing" })],
          classIds: ["class-1"],
        }),
      );
    });
    expect(classroomHomeworkService.createHomework).not.toHaveBeenCalled();
  });

  it("shows assigned class names and moves an active courseware to the completed list", async () => {
    const user = userEvent.setup();
    const activeCourseware = courseware("active-1");
    vi.mocked(lessonCoursewareService.listCoursewares).mockImplementation(async (filter = {}) => {
      if (filter.lifecycleStatus === "active") return [activeCourseware];
      return [];
    });

    render(
      <MemoryRouter>
        <MyLessonsPage />
      </MemoryRouter>,
    );

    await user.click(await screen.findByRole("tab", { name: "我的课件" }));
    expect(await screen.findByText("授课班级：高一 · 高一（1）班")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "已上完 函数课件 active-1" }));

    await waitFor(() => {
      expect(lessonCoursewareService.completeCourseware).toHaveBeenCalledWith("active-1");
    });
  });

  it("shows six completed coursewares by default and restores a trashed courseware", async () => {
    const user = userEvent.setup();
    const completed = Array.from({ length: 7 }, (_, index) => courseware(`completed-${index + 1}`, "completed"));
    const trashed = courseware("trashed-1", "trashed");
    vi.mocked(lessonCoursewareService.listCoursewares).mockImplementation(async (filter = {}) => {
      if (filter.lifecycleStatus === "completed") return completed;
      if (filter.lifecycleStatus === "trashed") return [trashed];
      return [];
    });

    render(
      <MemoryRouter>
        <MyLessonsPage />
      </MemoryRouter>,
    );

    await user.click(await screen.findByRole("tab", { name: "我的课件" }));
    expect(await screen.findByText("已上完课件列表")).toBeInTheDocument();
    expect(screen.getByText("函数课件 completed-6")).toBeInTheDocument();
    expect(screen.queryByText("函数课件 completed-7")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "更多" }));
    expect(await screen.findByText("函数课件 completed-7")).toBeInTheDocument();
    expect(screen.getByText("课件回收站")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "恢复课件 函数课件 trashed-1" }));

    await waitFor(() => {
      expect(lessonCoursewareService.restoreCourseware).toHaveBeenCalledWith("trashed-1");
    });
  });
});
