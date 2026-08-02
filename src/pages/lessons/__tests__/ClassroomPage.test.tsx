import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ClassroomPage from "@/pages/lessons/ClassroomPage";
import { classService } from "@/services/class";
import { classroomHomeworkService } from "@/services/classroomHomework";
import { lessonCoursewareService } from "@/services/lessonCourseware";
import { useAuthStore } from "@/stores/auth";
import type { ClassroomHomework, LessonCourseware, Teacher } from "@/types";

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

vi.mock("@/services/lessonCourseware", () => ({
  lessonCoursewareService: {
    listCoursewares: vi.fn(),
  },
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
    vi.mocked(classService.listStudentsByClass).mockResolvedValue([]);
    vi.mocked(classroomHomeworkService.listHomeworks).mockResolvedValue([mathHomework]);
    vi.mocked(lessonCoursewareService.listCoursewares).mockResolvedValue([lesson]);
  });

  it("shows homework in full-screen subject cards and keeps display preferences locally", async () => {
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByText("完成课本第 42 页第 1—6 题")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^作业/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^上课/ })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "放大作业字体" }));
    await waitFor(() => {
      expect(localStorage.getItem("inteschool-classroom-preferences:class-1")).toContain('"fontSize":32');
    });

    await user.click(screen.getByRole("button", { name: "隐藏" }));
    expect(screen.getByRole("button", { name: /继续查看/ })).toBeInTheDocument();
    expect(localStorage.getItem("inteschool-classroom-preferences:class-1")).toContain("数学");
  });

  it("switches to the lesson tab and displays published courseware", async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByText("完成课本第 42 页第 1—6 题");
    await user.click(screen.getByRole("button", { name: /^上课/ }));

    expect(await screen.findByText("函数图像")).toBeInTheDocument();
    expect(screen.getByText("全屏上课")).toBeInTheDocument();
  });
});
