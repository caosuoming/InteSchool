import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Basket, LessonCourseware, Question, Teacher } from "@/types";

const mocks = vi.hoisted(() => ({
  getCourseware: vi.fn(),
  updateCourseware: vi.fn(),
  publishCourseware: vi.fn(),
  getQuestion: vi.fn(),
  listQuestions: vi.fn(),
  listBaskets: vi.fn(),
  listMyStudents: vi.fn(),
  listMyClasses: vi.fn(),
  listFollowedStudentIds: vi.fn(),
  getKnowledgeMastery: vi.fn(),
  uploadFile: vi.fn(),
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
    updateCourseware: mocks.updateCourseware,
    publishCourseware: mocks.publishCourseware,
  },
}));
vi.mock("@/services/class", () => ({
  classService: {
    listMyStudents: mocks.listMyStudents,
    listMyClasses: mocks.listMyClasses,
  },
}));
vi.mock("@/services/question", () => ({
  questionService: {
    getQuestion: mocks.getQuestion,
    listQuestions: mocks.listQuestions,
  },
}));
vi.mock("@/services/basket", () => ({
  basketService: { listBaskets: mocks.listBaskets },
}));
vi.mock("@/services/studentInteraction", () => ({
  studentInteractionService: { listFollowedStudentIds: mocks.listFollowedStudentIds },
}));
vi.mock("@/services/analytics", () => ({
  analyticsService: { getKnowledgeMastery: mocks.getKnowledgeMastery },
}));
vi.mock("@/services/api", () => ({
  uploadFile: mocks.uploadFile,
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
    mocks.updateCourseware.mockImplementation(async (_id, patch) => ({ ...courseware, ...patch }));
    mocks.publishCourseware.mockImplementation(async () => ({ ...courseware, status: "published" }));
    mocks.getQuestion.mockResolvedValue(null);
    mocks.listQuestions.mockResolvedValue([]);
    mocks.listBaskets.mockResolvedValue([]);
    mocks.listMyStudents.mockResolvedValue([]);
    mocks.listMyClasses.mockResolvedValue([]);
    mocks.listFollowedStudentIds.mockResolvedValue([]);
    mocks.getKnowledgeMastery.mockResolvedValue([]);
    mocks.uploadFile.mockResolvedValue({ url: "/uploads/pasted.png" });
  });

  it("disables save while clean and can undo unsaved courseware changes", async () => {
    mocks.listMyClasses.mockResolvedValue([{ id: "class-1", type: "school", schoolId: teacher.schoolId, grade: "高一", name: "1班" }]);
    renderPage(`/my-lessons/${courseware.id}/edit`);

    const saveButton = await screen.findByRole("button", { name: "保存" });
    const undoButton = screen.getByRole("button", { name: "撤销" });
    expect(saveButton).toBeDisabled();
    expect(undoButton).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "授课班级" }));
    fireEvent.click(await screen.findByRole("button", { name: "高一 · 1班" }));
    fireEvent.click(screen.getByRole("button", { name: "完成" }));

    expect(saveButton).toBeEnabled();
    expect(undoButton).toBeEnabled();
    fireEvent.click(undoButton);
    expect(saveButton).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "授课班级" }));
    fireEvent.click(await screen.findByRole("button", { name: "高一 · 1班" }));
    fireEvent.click(screen.getByRole("button", { name: "保存班级" }));

    await waitFor(() => {
      expect(mocks.updateCourseware).toHaveBeenCalledWith(
        courseware.id,
        expect.objectContaining({ classIds: ["class-1"] }),
      );
      expect(saveButton).toBeDisabled();
    });
  });

  it("opens linked courseware directly in preview mode when preview=1", async () => {
    renderPage(`/my-lessons/${courseware.id}/edit?preview=1`);

    expect(await screen.findByText("课件预览模式")).toBeInTheDocument();
  });

  it("clears former-school classes and rebinds the lesson to the current school when publishing", async () => {
    const formerSchoolCourseware = {
      ...courseware,
      schoolId: "school-old",
      classIds: ["old-class"],
      status: "published" as const,
    };
    mocks.getCourseware.mockResolvedValue(formerSchoolCourseware);
    mocks.updateCourseware.mockImplementation(async (_id, patch) => ({
      ...formerSchoolCourseware,
      ...patch,
    }));
    mocks.listMyClasses.mockResolvedValue([{
      id: "class-1",
      type: "school",
      schoolId: teacher.schoolId,
      grade: "高一",
      name: "1班",
    }]);

    renderPage(`/my-lessons/${courseware.id}/edit`);

    expect(await screen.findByRole("textbox", { name: "课件名称" })).toHaveValue(courseware.title);
    expect(screen.getByRole("button", { name: "授课班级" })).toBeInTheDocument();
    expect(screen.getByText("草稿")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "授课班级" }));
    fireEvent.click(await screen.findByRole("button", { name: "高一 · 1班" }));
    fireEvent.click(screen.getByRole("button", { name: "完成" }));
    fireEvent.click(screen.getByRole("button", { name: "发布到上课" }));

    await waitFor(() => {
      expect(mocks.updateCourseware).toHaveBeenCalledWith(
        courseware.id,
        expect.objectContaining({
          schoolId: "school-1",
          classIds: ["class-1"],
          status: "draft",
          publishedAt: undefined,
        }),
      );
      expect(mocks.publishCourseware).toHaveBeenCalledWith(courseware.id);
    });
  });

  it("keeps normal courseware navigation in edit mode without the preview query", async () => {
    renderPage(`/my-lessons/${courseware.id}/edit`);

    expect(await screen.findByRole("textbox", { name: "课件名称" })).toHaveValue(courseware.title);
    expect(screen.queryByText("课件预览模式")).not.toBeInTheDocument();
  });

  it("edits the courseware name directly from the top-left toolbar", async () => {
    renderPage(`/my-lessons/${courseware.id}/edit`);

    const titleInput = await screen.findByRole("textbox", { name: "课件名称" });
    const saveButton = screen.getByRole("button", { name: "保存" });
    fireEvent.change(titleInput, { target: { value: "函数课堂版" } });

    expect(titleInput).toHaveValue("函数课堂版");
    expect(saveButton).toBeEnabled();
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(mocks.updateCourseware).toHaveBeenCalledWith(
        courseware.id,
        expect.objectContaining({ title: "函数课堂版" }),
      );
    });
  });

  it("pastes clipboard images directly onto the current slide as free elements", async () => {
    renderPage(`/my-lessons/${courseware.id}/edit`);
    const hint = await screen.findByText(/也可直接粘贴剪贴板图片/);
    const image = new File(["pasted-image"], "clipboard.png", { type: "image/png" });

    fireEvent.paste(hint, {
      clipboardData: {
        files: [image],
        items: [],
      },
    });

    await waitFor(() => {
      expect(mocks.uploadFile).toHaveBeenCalledWith(image);
      expect(screen.getByAltText("clipboard.png")).toHaveAttribute("src", "/uploads/pasted.png");
    });
    expect(screen.getByRole("button", { name: "保存" })).toBeEnabled();
  });

  it("inserts questions only from the teacher resource baskets", async () => {
    const question = {
      id: "question-basket-1",
      type: "single",
      stem: "若 $x^2=4$，则 $x$ 等于？",
      options: ["$2$", "$-2$", "$\\pm2$"],
      answer: "$\\pm2$",
      analysis: "由平方根定义可得。",
    } as unknown as Question;
    mocks.listBaskets.mockResolvedValue([{
      id: "basket-1",
      teacherId: teacher.id,
      name: "默认资源篮",
      questionIds: [question.id],
      materialIds: [],
    } as Basket]);
    mocks.getQuestion.mockImplementation(async (questionId: string) => (
      questionId === question.id ? question : null
    ));

    renderPage(`/my-lessons/${courseware.id}/edit`);
    expect(await screen.findByRole("textbox", { name: "课件名称" })).toHaveValue(courseware.title);

    fireEvent.click(screen.getByRole("button", { name: "题目" }));

    expect(await screen.findByRole("heading", { name: "从资源篮插入题目" })).toBeInTheDocument();
    expect(mocks.listBaskets).toHaveBeenCalledWith(teacher.id);
    expect(mocks.getQuestion).toHaveBeenCalledWith(question.id);
    fireEvent.click(screen.getByRole("button", { name: "插入" }));

    expect(await screen.findByText("第 2 页，共 2 页")).toBeInTheDocument();
    expect(document.querySelector(".katex")).not.toBeNull();
  });
});
