import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import LectureListPage from "./LectureListPage";
import { lectureService } from "@/services/lecture";
import { lessonCoursewareService } from "@/services/lessonCourseware";
import { useAuthStore } from "@/stores/auth";
import { toast } from "@/stores/ui";
import type { Lecture, LessonCourseware, Teacher } from "@/types";

vi.mock("@/services/lecture", () => ({
  lectureService: { listLectures: vi.fn() },
}));
vi.mock("@/services/lessonCourseware", () => ({
  lessonCoursewareService: {
    listCoursewares: vi.fn(),
    getCoursewareBySource: vi.fn(),
    createFromLecture: vi.fn(),
  },
}));
vi.mock("@/services/knowledge", () => ({
  knowledgeService: {
    getChapterTree: vi.fn().mockResolvedValue(null),
    getKnowledgeTree: vi.fn().mockResolvedValue(null),
    listChapters: vi.fn().mockResolvedValue([]),
    listKnowledgePoints: vi.fn().mockResolvedValue([]),
  },
}));
vi.mock("@/stores/ui", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const teacher = { id: "teacher-1", schoolId: "school-1" } as Teacher;
const lecture = {
  id: "lecture-1",
  teacherId: teacher.id,
  schoolId: teacher.schoolId,
  title: "函数专题讲义",
  grade: "高一",
  schoolYear: "2026",
  version: 1,
  status: "published",
  description: "",
  chapterIds: [],
  knowledgePointIds: [],
  classIds: [],
  studentIds: [],
  sections: [],
  createdAt: "2026-11-01T00:00:00Z",
  updatedAt: "2026-11-01T00:00:00Z",
} as Lecture;

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/lectures"]}>
      <Routes>
        <Route path="/lectures" element={<LectureListPage />} />
        <Route path="/my-lessons/:id/edit" element={<div>课件编辑页</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  useAuthStore.setState({ teacher });
  vi.mocked(lectureService.listLectures).mockResolvedValue([lecture]);
  vi.mocked(lessonCoursewareService.listCoursewares).mockResolvedValue([]);
  vi.mocked(lessonCoursewareService.getCoursewareBySource).mockResolvedValue(null);
  vi.mocked(lessonCoursewareService.createFromLecture).mockResolvedValue({
    id: "new-courseware",
  } as LessonCourseware);
});

describe("LectureListPage courseware generation", () => {
  it("creates lesson courseware directly from the handout library", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "发送到我的课件" }));
    await waitFor(() => expect(lessonCoursewareService.createFromLecture).toHaveBeenCalledWith(
      teacher.id, teacher.schoolId, lecture.id,
    ));
    expect(await screen.findByText("课件编辑页")).toBeInTheDocument();
    expect(toast.success).toHaveBeenCalled();
  });

  it("opens an existing lesson instead of generating a duplicate", async () => {
    const existing = {
      id: "existing-courseware", sourceId: lecture.id, lifecycleStatus: "active",
    } as LessonCourseware;
    vi.mocked(lessonCoursewareService.listCoursewares).mockResolvedValue([existing]);
    vi.mocked(lessonCoursewareService.getCoursewareBySource).mockResolvedValue(existing);
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "查看课件" }));
    expect(await screen.findByText("课件编辑页")).toBeInTheDocument();
    expect(lessonCoursewareService.createFromLecture).not.toHaveBeenCalled();
  });

  it("reports generation errors without navigating away", async () => {
    vi.mocked(lessonCoursewareService.createFromLecture).mockRejectedValue(
      new Error("讲义不存在或无权访问"),
    );
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "发送到我的课件" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(
      "发送失败", "讲义不存在或无权访问",
    ));
    expect(screen.getByText("函数专题讲义")).toBeInTheDocument();
  });
});
