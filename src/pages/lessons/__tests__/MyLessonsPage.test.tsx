import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
import { defaultTeacherScheduleTimeRanges } from "@/lib/teacher-schedule";

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
    getLessonSchedule: vi.fn(),
    saveLessonSchedule: vi.fn(),
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
  status: "draft" | "published" = "draft",
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
    status,
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
    vi.mocked(lessonCoursewareService.getLessonSchedule).mockResolvedValue({
      entries: [],
      timeRanges: defaultTeacherScheduleTimeRanges(),
    });
    vi.mocked(lessonCoursewareService.saveLessonSchedule).mockImplementation(async (entries, timeRanges) => ({
      entries,
      timeRanges,
    }));
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

  it("orders the lesson tabs, defaults to courseware, and saves the weekly schedule", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <MyLessonsPage />
      </MemoryRouter>,
    );

    const tabs = await screen.findAllByRole("tab");
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      "我的课件",
      "我的课表",
      "我的作业",
      "班级通知",
    ]);
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");

    await user.click(screen.getByRole("tab", { name: "我的课表" }));
    expect(await screen.findByRole("columnheader", { name: "时间区间" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "星期六" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "星期日" })).toBeInTheDocument();
    expect(screen.getByRole("rowheader", { name: "早早读" })).toBeInTheDocument();
    expect(screen.getByRole("rowheader", { name: "早读" })).toBeInTheDocument();
    expect(screen.getByRole("rowheader", { name: "午间练" })).toBeInTheDocument();
    expect(screen.getByRole("rowheader", { name: "晚四" })).toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: "编辑课表" }));
    await user.selectOptions(screen.getByLabelText("星期一 第1节"), "class-1");
    await user.selectOptions(screen.getByLabelText("星期六 单周 第1节"), "class-1");
    fireEvent.change(screen.getByLabelText("第 1 节 开始时间"), {
      target: { value: "08:00" },
    });
    await user.click(screen.getByRole("button", { name: "保存课表" }));

    await waitFor(() => {
      expect(lessonCoursewareService.saveLessonSchedule).toHaveBeenCalledWith(
        [
          { day: 1, period: 1, weekParity: "all", classId: "class-1" },
          { day: 6, period: 1, weekParity: "odd", classId: "class-1" },
        ],
        expect.arrayContaining([
          { period: 1, startTime: "08:00", endTime: "08:35" },
          { period: -2, startTime: "06:40", endTime: "07:10" },
          { period: 12, startTime: "21:05", endTime: "21:50" },
        ]),
      );
    });
  });

  it("defaults to the teacher's class and publishes homework immediately", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <MyLessonsPage />
      </MemoryRouter>,
    );

    await user.click(await screen.findByRole("tab", { name: "我的作业" }));
    await user.click(screen.getByLabelText("发布班级下拉选择"));
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
    await user.click(screen.getByRole("tab", { name: "班级通知" }));
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

    await user.click(await screen.findByRole("tab", { name: "我的作业" }));
    await user.click(screen.getByLabelText("发布班级下拉选择"));
    expect(await screen.findByRole("checkbox", { name: "高一 · 高一（1）班" })).toBeChecked();
    const file = new File(["pdf"], "函数图像.pdf", { type: "application/pdf" });
    await user.upload(screen.getByLabelText("选择作业附件"), file);

    await waitFor(() => {
      expect(uploadFile).toHaveBeenCalledWith(file);
    });
    const previewButton = await screen.findByTitle("预览 函数图像.pdf");
    expect(classroomHomeworkService.createHomework).not.toHaveBeenCalled();
    await user.click(previewButton);
    expect(await screen.findByTitle("函数图像.pdf")).toBeInTheDocument();
    await user.keyboard("{Escape}");

    await user.type(screen.getByLabelText("作业内容"), "阅读附件并完成练习");
    await user.click(screen.getByRole("button", { name: "发布作业" }));

    await waitFor(() => {
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
    expect(screen.getByRole("tab", { name: "我的作业" })).toHaveAttribute("aria-selected", "true");
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

  it("groups active coursewares by status and marks a published courseware as taught", async () => {
    const user = userEvent.setup();
    const publishedCourseware = courseware("published-1", "active", "published");
    const editableCourseware = courseware("editable-1");
    vi.mocked(lessonCoursewareService.listCoursewares).mockImplementation(async (filter = {}) => {
      if (filter.lifecycleStatus === "active") return [publishedCourseware, editableCourseware];
      return [];
    });

    render(
      <MemoryRouter>
        <MyLessonsPage />
      </MemoryRouter>,
    );

    await user.click(await screen.findByRole("tab", { name: "我的课件" }));
    expect(await screen.findByRole("heading", { name: "已发布课件" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "待编辑课件" })).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("搜索课件标题...")).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue("全部状态")).not.toBeInTheDocument();
    expect(screen.getAllByText("授课班级：高一 · 高一（1）班")).toHaveLength(2);
    expect(screen.queryByRole("button", { name: "已上课 函数课件 editable-1" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "撤回" }));
    await waitFor(() => {
      expect(lessonCoursewareService.unpublishCourseware).toHaveBeenCalledWith("published-1");
    });

    await user.click(screen.getByRole("button", { name: "已上课 函数课件 published-1" }));
    await waitFor(() => {
      expect(lessonCoursewareService.completeCourseware).toHaveBeenCalledWith("published-1");
    });
  });

  it("keeps former-school coursewares in My Lessons and treats them as needing republish", async () => {
    const oldCourseware = {
      ...courseware("old-school"),
      schoolId: "school-old",
      classIds: ["old-class"],
      status: "published" as const,
    };
    vi.mocked(lessonCoursewareService.listCoursewares).mockImplementation(async (filter = {}) => {
      if (filter.lifecycleStatus === "active") return [oldCourseware];
      return [];
    });

    render(
      <MemoryRouter>
        <MyLessonsPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText("函数课件 old-school")).toBeInTheDocument();
    expect(screen.getByText("待重新发布")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "待编辑课件" })).toBeInTheDocument();
    expect(screen.getByText("尚未选择授课班级")).toBeInTheDocument();

    const activeCall = vi.mocked(lessonCoursewareService.listCoursewares).mock.calls
      .map(([filter]) => filter)
      .find((filter) => filter?.lifecycleStatus === "active");
    expect(activeCall).toMatchObject({ teacherId: "teacher-1", lifecycleStatus: "active" });
    expect(activeCall).not.toHaveProperty("schoolId");
  });

  it("shows six taught coursewares by default, previews them, and restores lifecycle groups", async () => {
    const user = userEvent.setup();
    const completed = Array.from({ length: 7 }, (_, index) => courseware(`completed-${index + 1}`, "completed"));
    const trashed = Array.from({ length: 7 }, (_, index) => courseware(`trashed-${index + 1}`, "trashed"));
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    vi.mocked(lessonCoursewareService.listCoursewares).mockImplementation(async (filter = {}) => {
      if (filter.lifecycleStatus === "completed") return completed;
      if (filter.lifecycleStatus === "trashed") return trashed;
      return [];
    });

    render(
      <MemoryRouter>
        <MyLessonsPage />
      </MemoryRouter>,
    );

    await user.click(await screen.findByRole("tab", { name: "我的课件" }));
    expect(await screen.findByText("已上课课件")).toBeInTheDocument();
    expect(screen.getByText("函数课件 completed-6")).toBeInTheDocument();
    expect(screen.queryByText("函数课件 completed-7")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "查看课件 函数课件 completed-1" }));
    expect(openSpy).toHaveBeenCalledWith(
      "/my-lessons/completed-1/edit?preview=1",
      "_blank",
      "noopener,noreferrer",
    );
    await user.click(screen.getByRole("button", { name: "恢复课件 函数课件 completed-1" }));
    await waitFor(() => {
      expect(lessonCoursewareService.restoreCourseware).toHaveBeenCalledWith("completed-1");
    });

    const completedSection = screen.getByRole("heading", { name: "已上课课件" }).closest("section");
    expect(completedSection).not.toBeNull();
    await user.click(within(completedSection!).getByRole("button", { name: "更多" }));
    expect(await screen.findByText("函数课件 completed-7")).toBeInTheDocument();

    const trashHeading = screen.getByRole("heading", { name: "课件回收站" });
    const trashSection = trashHeading.closest("section");
    expect(trashSection).not.toBeNull();
    expect(within(trashSection!).getByText("函数课件 trashed-6")).toBeInTheDocument();
    expect(within(trashSection!).queryByText("函数课件 trashed-7")).not.toBeInTheDocument();
    await user.click(within(trashSection!).getByRole("button", { name: "更多" }));
    expect(await within(trashSection!).findByText("函数课件 trashed-7")).toBeInTheDocument();
    await user.click(within(trashSection!).getByRole("button", { name: "恢复课件 函数课件 trashed-1" }));

    await waitFor(() => {
      expect(lessonCoursewareService.restoreCourseware).toHaveBeenCalledWith("trashed-1");
    });
    openSpy.mockRestore();
  });
});
