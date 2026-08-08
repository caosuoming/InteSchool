import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LessonCourseware, Teacher } from "@/types";

const mocks = vi.hoisted(() => ({
  getCourseware: vi.fn(),
  listMyStudents: vi.fn(),
  listMyClasses: vi.fn(),
}));

const teacher = {
  id: "teacher-1",
  schoolId: "school-1",
  name: "测试教师",
} as Teacher;

const courseware = {
  id: "lesson-courseware-1",
  teacherId: teacher.id,
  schoolId: teacher.schoolId,
  title: "函数专题课件",
  chapterIds: [],
  knowledgePointIds: [],
  grade: "高一",
  schoolYear: "2026-2027",
  semester: "上学期",
  sourceType: "lecture",
  sourceId: "lecture-1",
  slides: [{
    id: "slide-1",
    type: "section",
    title: "函数专题",
    relatedQuestionIds: [],
    askableStudentIds: [],
  }],
  classIds: [],
  status: "draft",
  lifecycleStatus: "active",
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
} as LessonCourseware;

vi.mock("@/stores/auth", () => ({
  useAuthStore: () => ({ teacher }),
}));
vi.mock("@/services/lessonCourseware", () => ({
  lessonCoursewareService: {
    getCourseware: mocks.getCourseware,
  },
}));
vi.mock("@/services/class", () => ({
  classService: {
    listMyStudents: mocks.listMyStudents,
    listMyClasses: mocks.listMyClasses,
  },
}));
vi.mock("@/services/question", () => ({
  questionService: { getQuestion: vi.fn() },
}));
vi.mock("./PresentationMode", () => ({
  PresentationMode: () => <div>课件预览模式</div>,
}));

import LessonEditorPage from "./LessonEditorPage";

function renderPage(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/my-lessons/:id/edit" element={<LessonEditorPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("LessonEditorPage preview query", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCourseware.mockResolvedValue(courseware);
    mocks.listMyStudents.mockResolvedValue([]);
    mocks.listMyClasses.mockResolvedValue([]);
  });

  it("opens linked courseware directly in preview mode when preview=1", async () => {
    renderPage(`/my-lessons/${courseware.id}/edit?preview=1`);

    expect(await screen.findByText("课件预览模式")).toBeInTheDocument();
  });

  it("keeps normal courseware navigation in edit mode without the preview query", async () => {
    renderPage(`/my-lessons/${courseware.id}/edit`);

    expect(await screen.findByText(courseware.title)).toBeInTheDocument();
    expect(screen.queryByText("课件预览模式")).not.toBeInTheDocument();
  });
});
