import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Basket, LessonCourseware, Material, Question, Teacher } from "@/types";

const mocks = vi.hoisted(() => ({
  getCourseware: vi.fn(),
  updateCourseware: vi.fn(),
  publishCourseware: vi.fn(),
  unpublishCourseware: vi.fn(),
  getQuestion: vi.fn(),
  listQuestions: vi.fn(),
  listBaskets: vi.fn(),
  getMaterial: vi.fn(),
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
    unpublishCourseware: mocks.unpublishCourseware,
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
vi.mock("@/services/material", () => ({
  materialService: { getMaterial: mocks.getMaterial },
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
    mocks.unpublishCourseware.mockImplementation(async () => ({ ...courseware, status: "draft" }));
    mocks.getQuestion.mockResolvedValue(null);
    mocks.listQuestions.mockResolvedValue([]);
    mocks.listBaskets.mockResolvedValue([]);
    mocks.getMaterial.mockResolvedValue(null);
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

  it("replaces publish with unpublish for published courseware and allows publishing again after withdrawal", async () => {
    let storedCourseware: LessonCourseware = {
      ...courseware,
      classIds: ["class-1"],
      status: "published",
      publishedAt: "2026-09-14T12:00:00.000Z",
    };
    mocks.getCourseware.mockImplementation(async () => storedCourseware);
    mocks.updateCourseware.mockImplementation(async (_id, patch) => {
      storedCourseware = { ...storedCourseware, ...patch };
      return storedCourseware;
    });
    mocks.unpublishCourseware.mockImplementation(async () => {
      storedCourseware = { ...storedCourseware, status: "draft", publishedAt: undefined };
      return storedCourseware;
    });
    mocks.publishCourseware.mockImplementation(async () => {
      storedCourseware = {
        ...storedCourseware,
        status: "published",
        publishedAt: "2026-09-14T12:05:00.000Z",
      };
      return storedCourseware;
    });

    renderPage(`/my-lessons/${courseware.id}/edit`);

    const unpublishButton = await screen.findByRole("button", { name: "撤回发布" });
    expect(screen.queryByRole("button", { name: "发布到上课" })).not.toBeInTheDocument();

    fireEvent.click(unpublishButton);

    await waitFor(() => {
      expect(mocks.unpublishCourseware).toHaveBeenCalledWith(courseware.id);
      expect(screen.getByRole("button", { name: "发布到上课" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "发布到上课" }));

    await waitFor(() => {
      expect(mocks.publishCourseware).toHaveBeenCalledWith(courseware.id);
      expect(screen.getByRole("button", { name: "撤回发布" })).toBeInTheDocument();
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

  it("inserts basket materials onto the current slide and stores scheduled media playback", async () => {
    const materials = [
      {
        id: "material-image",
        type: "image",
        title: "函数图像",
        content: "",
        fileUrl: "/api/files/function-image",
      },
      {
        id: "material-knowledge",
        type: "knowledgeBlock",
        title: "单调性知识块",
        content: "函数在区间内保持增减趋势。",
      },
      {
        id: "material-audio",
        type: "audio",
        title: "课堂提示音",
        content: "",
        fileUrl: "/api/files/class-audio",
      },
      {
        id: "material-video",
        type: "video",
        title: "函数变化演示",
        content: "",
        fileUrl: "/api/files/function-video",
      },
    ] as Material[];
    mocks.listBaskets.mockResolvedValue([{
      id: "basket-1",
      teacherId: teacher.id,
      name: "默认资源篮",
      questionIds: [],
      materialIds: materials.map((material) => material.id),
    } as Basket]);
    mocks.getMaterial.mockImplementation(async (materialId: string) => (
      materials.find((material) => material.id === materialId) || null
    ));

    renderPage(`/my-lessons/${courseware.id}/edit`);
    expect(await screen.findByRole("textbox", { name: "课件名称" })).toHaveValue(courseware.title);

    for (const material of materials) {
      fireEvent.click(screen.getByRole("button", { name: "素材" }));
      expect(await screen.findByRole("heading", { name: "从资源篮插入素材" })).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: `插入素材：${material.title}` }));
    }

    expect(screen.getByAltText("函数图像")).toHaveAttribute("src", "/api/files/function-image");
    expect(screen.getAllByText(/单调性知识块/).length).toBeGreaterThan(0);
    expect(document.querySelector('audio[src="/api/files/class-audio"]')).not.toBeNull();
    expect(document.querySelector('video[src="/api/files/function-video"]')).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "属性" }));
    const scheduledTime = screen.getByLabelText("预约播放时刻");
    fireEvent.change(scheduledTime, { target: { value: "09:35" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => {
      expect(mocks.updateCourseware).toHaveBeenCalledWith(
        courseware.id,
        expect.objectContaining({
          slides: expect.arrayContaining([
            expect.objectContaining({
              elements: expect.arrayContaining([
                expect.objectContaining({
                  kind: "video",
                  materialId: "material-video",
                  scheduledPlayAt: "09:35",
                }),
              ]),
            }),
          ]),
        }),
      );
    });
  });
});
