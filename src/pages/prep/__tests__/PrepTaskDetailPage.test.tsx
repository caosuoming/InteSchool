import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PrepTaskDetailPage from "@/pages/prep/PrepTaskDetailPage";
import { prepService } from "@/services/prep";
import { organizationService } from "@/services/organization";
import { uploadFile } from "@/services/api";
import { useAuthStore } from "@/stores/auth";
import type { PrepTask, Teacher } from "@/types";

vi.mock("@/services/prep", async () => {
  const actual = await vi.importActual<typeof import("@/services/prep")>("@/services/prep");
  return {
    ...actual,
    prepService: {
      getTask: vi.fn(),
      addWorkflow: vi.fn(),
      updateWorkflow: vi.fn(),
      deleteWorkflow: vi.fn(),
      assignTask: vi.fn(),
      updateAssignment: vi.fn(),
      submitAssignment: vi.fn(),
      saveSubmissionAnnotations: vi.fn(),
    },
  };
});

vi.mock("@/services/organization", () => ({
  organizationService: {
    listTeachers: vi.fn(),
  },
}));

vi.mock("@/services/api", () => ({
  uploadFile: vi.fn(),
  extractStoredFile: vi.fn(),
}));

vi.mock("@/services/lecture", () => ({
  lectureService: { listLectures: vi.fn().mockResolvedValue([]) },
}));

vi.mock("@/services/examPaper", () => ({
  examPaperService: { listPapers: vi.fn().mockResolvedValue([]) },
}));

vi.mock("@/stores/ui", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  },
}));

const teacher: Teacher = {
  id: "teacher-1",
  email: "teacher@example.com",
  name: "王老师",
  avatar: "",
  schoolId: "school-1",
  subject: "数学",
  teachingGrades: ["高一"],
  status: "active",
  role: "teacher",
  roles: ["teacher"],
  subjectGroupIds: ["subject-group-1"],
  prepGroupIds: ["prep-group-1"],
  affiliations: [],
  currentAffiliationId: null,
  createdAt: "2026-08-02T00:00:00.000Z",
};

function createTask(overrides: Partial<PrepTask> = {}): PrepTask {
  return {
    id: "task-1",
    schoolId: "school-1",
    subjectGroupId: "subject-group-1",
    prepGroupId: "prep-group-1",
    title: "函数专题集体备课",
    description: "形成一份函数专题讲义",
    grade: "高一",
    subject: "数学",
    workflows: [{
      id: "workflow-1",
      type: "lecture",
      name: "编写函数讲义",
      order: 1,
      status: "in_progress",
      assigneeIds: [teacher.id],
      createdAt: "2026-08-02T00:00:00.000Z",
      updatedAt: "2026-08-02T00:00:00.000Z",
    }],
    assignments: [{
      id: "assignment-1",
      taskId: "task-1",
      workflowId: "workflow-1",
      teacherId: teacher.id,
      status: "accepted",
      createdAt: "2026-08-02T00:00:00.000Z",
      updatedAt: "2026-08-02T00:00:00.000Z",
    }],
    status: "in_progress",
    createdBy: "teacher-2",
    createdAt: "2026-08-02T00:00:00.000Z",
    updatedAt: "2026-08-02T00:00:00.000Z",
    ...overrides,
  };
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/prep/tasks/task-1"]}>
      <Routes>
        <Route path="/prep/tasks/:id" element={<PrepTaskDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("PrepTaskDetailPage submissions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, "PointerEvent", {
      configurable: true,
      value: MouseEvent,
    });
    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      writable: true,
      value: null,
    });
    Object.defineProperty(HTMLElement.prototype, "requestFullscreen", {
      configurable: true,
      value: vi.fn(function requestFullscreen(this: HTMLElement) {
        Object.defineProperty(document, "fullscreenElement", {
          configurable: true,
          writable: true,
          value: this,
        });
        document.dispatchEvent(new Event("fullscreenchange"));
        return Promise.resolve();
      }),
    });
    Object.defineProperty(document, "exitFullscreen", {
      configurable: true,
      value: vi.fn(() => {
        Object.defineProperty(document, "fullscreenElement", {
          configurable: true,
          writable: true,
          value: null,
        });
        document.dispatchEvent(new Event("fullscreenchange"));
        return Promise.resolve();
      }),
    });
    useAuthStore.setState({ teacher, loading: false, error: null });
    vi.mocked(organizationService.listTeachers).mockResolvedValue([teacher]);
    vi.mocked(prepService.updateAssignment).mockResolvedValue();
    vi.mocked(prepService.submitAssignment).mockResolvedValue({
      id: "submission-1",
      kind: "document",
      title: "函数讲义.docx",
      submittedBy: teacher.id,
      submittedAt: "2026-08-02T01:00:00.000Z",
      updatedAt: "2026-08-02T01:00:00.000Z",
      assets: [],
      annotations: [],
    });
    vi.mocked(prepService.saveSubmissionAnnotations).mockResolvedValue([]);
  });

  it("disables completion until a deliverable is submitted", async () => {
    const task = createTask();
    vi.mocked(prepService.getTask).mockResolvedValue(task);
    vi.mocked(uploadFile).mockResolvedValue({
      id: "file-1",
      ownerId: teacher.id,
      schoolId: teacher.schoolId!,
      originalName: "函数讲义.docx",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      size: 2048,
      createdAt: "2026-08-02T01:00:00.000Z",
      url: "/api/files/file-1",
    });

    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByText("函数专题集体备课")).toBeInTheDocument();
    const completeButton = screen.getByRole("button", { name: "完成任务" });
    expect(completeButton).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "提交成果" }));
    const file = new File(["lesson"], "函数讲义.docx", {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    await user.upload(screen.getByLabelText("选择成果文档"), file);
    const submitButtons = screen.getAllByRole("button", { name: "提交成果" });
    await user.click(submitButtons[submitButtons.length - 1]);

    await waitFor(() => {
      expect(uploadFile).toHaveBeenCalledWith(file);
      expect(prepService.submitAssignment).toHaveBeenCalledWith(
        "task-1",
        "assignment-1",
        {
          kind: "document",
          assets: [{
            id: "file-1",
            name: "函数讲义.docx",
            url: "/api/files/file-1",
            mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            size: 2048,
          }],
        },
        teacher,
      );
    });
  });

  it("opens review tools for completed work before the whole board is completed", async () => {
    const partiallyCompleted = createTask({
      status: "in_progress",
      workflows: [
        {
          ...createTask().workflows[0],
          status: "completed",
        },
        {
          ...createTask().workflows[0],
          id: "workflow-2",
          name: "补充课堂练习",
          order: 2,
          status: "created",
        },
      ],
      assignments: [
        {
          ...createTask().assignments[0],
          status: "completed",
          submission: {
            id: "submission-1",
            kind: "images",
            title: "1 张图片",
            submittedBy: teacher.id,
            submittedAt: "2026-08-02T01:00:00.000Z",
            updatedAt: "2026-08-02T01:00:00.000Z",
            assets: [{
              id: "image-1",
              name: "板书.png",
              url: "/api/files/image-1",
              mimeType: "image/png",
              size: 1024,
            }],
            annotations: [{
              id: "stroke-mine",
              targetId: "image-1",
              tool: "pen",
              color: "black",
              points: [{ x: 0.45, y: 0.5 }, { x: 0.55, y: 0.5 }],
              createdBy: teacher.id,
              createdAt: "2026-08-02T01:01:00.000Z",
            }, {
              id: "stroke-other",
              targetId: "image-1",
              tool: "pen",
              color: "red",
              points: [{ x: 0.2, y: 0.2 }, { x: 0.3, y: 0.2 }],
              createdBy: "teacher-2",
              createdAt: "2026-08-02T01:02:00.000Z",
            }],
          },
        },
        {
          ...createTask().assignments[0],
          id: "assignment-2",
          workflowId: "workflow-2",
          status: "accepted",
        },
      ],
    });
    vi.mocked(prepService.getTask).mockResolvedValue(partiallyCompleted);

    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "预览成果" }));

    expect(screen.getByText("集体备课成果预览")).toBeInTheDocument();
    expect(screen.getByText("共 1 份已完成成果。可顺次查看、批注并全屏展示。")).toBeInTheDocument();
    expect(screen.getByAltText("板书.png")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "黑色笔" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "红色笔" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "蓝色笔" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "黄色荧光笔" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "绿色荧光笔" })).toBeInTheDocument();
    const eraser = screen.getByRole("button", { name: "橡皮" });
    const canvas = screen.getByLabelText("成果批注画布");
    expect(eraser).toBeInTheDocument();
    expect(eraser.compareDocumentPosition(canvas) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    Object.defineProperty(canvas.parentElement, "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        bottom: 1000,
        height: 1000,
        left: 0,
        right: 1000,
        top: 0,
        width: 1000,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }),
    });
    Object.defineProperties(canvas, {
      setPointerCapture: { configurable: true, value: vi.fn() },
      hasPointerCapture: { configurable: true, value: vi.fn(() => true) },
      releasePointerCapture: { configurable: true, value: vi.fn() },
    });
    await user.click(eraser);
    fireEvent.pointerDown(canvas, { clientX: 500, clientY: 500, pointerId: 1 });
    fireEvent.pointerUp(canvas, { clientX: 500, clientY: 500, pointerId: 1 });
    expect(screen.getByText("当前显示 1 条批注，其中 0 条由你添加。")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "保存当前批注" }));
    await waitFor(() => {
      expect(prepService.saveSubmissionAnnotations).toHaveBeenCalledWith(
        "task-1",
        "assignment-1",
        "image-1",
        [],
        teacher,
      );
    });

    await user.click(screen.getByRole("button", { name: "全屏" }));
    expect(HTMLElement.prototype.requestFullscreen).toHaveBeenCalledOnce();
    expect(await screen.findByRole("button", { name: "退出全屏" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "退出全屏" }));
    expect(document.exitFullscreen).toHaveBeenCalledOnce();
    expect(await screen.findByRole("button", { name: "全屏" })).toBeInTheDocument();
  });
});
