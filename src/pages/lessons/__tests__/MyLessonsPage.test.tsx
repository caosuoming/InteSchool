import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import MyLessonsPage from "@/pages/lessons/MyLessonsPage";
import { classService } from "@/services/class";
import { classroomHomeworkService } from "@/services/classroomHomework";
import { classroomNoticeService } from "@/services/classroomNotice";
import { lessonCoursewareService } from "@/services/lessonCourseware";
import { useAuthStore } from "@/stores/auth";
import type { ClassroomHomework, ClassroomNotice, Teacher } from "@/types";

vi.mock("@/services/class", () => ({
  classService: {
    listSchoolClasses: vi.fn(),
  },
}));

vi.mock("@/services/classroomHomework", () => ({
  classroomHomeworkService: {
    listHomeworks: vi.fn(),
    createHomework: vi.fn(),
    deleteHomework: vi.fn(),
  },
}));

vi.mock("@/services/classroomNotice", () => ({
  classroomNoticeService: {
    listNotices: vi.fn(),
    createNotice: vi.fn(),
  },
}));

vi.mock("@/services/lessonCourseware", () => ({
  lessonCoursewareService: {
    listCoursewares: vi.fn(),
    deleteCourseware: vi.fn(),
    publishCourseware: vi.fn(),
    unpublishCourseware: vi.fn(),
  },
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

describe("MyLessonsPage classroom publishing", () => {
  beforeEach(() => {
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
    vi.mocked(classroomNoticeService.listNotices).mockResolvedValue([activeNotice]);
    vi.mocked(classroomNoticeService.createNotice).mockResolvedValue(activeNotice);
    vi.mocked(lessonCoursewareService.listCoursewares).mockResolvedValue([]);
  });

  it("defaults to the teacher's class and publishes homework immediately", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <MyLessonsPage />
      </MemoryRouter>,
    );

    const classCheckboxes = await screen.findAllByRole("checkbox", { name: "高一 · 高一（1）班" });
    expect(classCheckboxes).toHaveLength(2);
    expect(classCheckboxes.every((checkbox) => (checkbox as HTMLInputElement).checked)).toBe(true);

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

    expect(await screen.findByText("今天放学后进行卫生检查")).toBeInTheDocument();
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
});
