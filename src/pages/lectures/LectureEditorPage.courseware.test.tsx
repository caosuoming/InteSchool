import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Lecture, Teacher, TreeNode } from "@/types";

const mocks = vi.hoisted(() => ({
  getLecture: vi.fn(),
  updateLecture: vi.fn(),
  listLectures: vi.fn(),
  listColumnTemplates: vi.fn(),
  getChapterTree: vi.fn(),
  getKnowledgeTree: vi.fn(),
  listLectureTypes: vi.fn(),
  listAllClasses: vi.fn(),
  listStudentsBySchool: vi.fn(),
  listSchoolClasses: vi.fn(),
  listPersonalClasses: vi.fn(),
  listBaskets: vi.fn(),
  listAnswerRecordsByLecture: vi.fn(),
  listQuestions: vi.fn(),
  getCoursewareBySource: vi.fn(),
  createFromLecture: vi.fn(),
}));

const teacher = {
  id: "teacher-1",
  schoolId: "school-1",
  name: "测试教师",
} as Teacher;

const lecture = {
  id: "lecture-1",
  teacherId: teacher.id,
  schoolId: teacher.schoolId,
  title: "函数专题讲义",
  description: "函数基础",
  chapterIds: [],
  knowledgePointIds: [],
  grade: "高一",
  schoolYear: "2026-2027",
  semester: "上学期",
  classIds: [],
  studentIds: [],
  sections: [],
  version: 1,
  status: "draft",
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
} as Lecture;

const emptyTree = {
  id: "root",
  name: "目录",
  children: [],
} as TreeNode;

vi.mock("@/stores/auth", () => ({
  useAuthStore: () => ({ teacher }),
}));

vi.mock("@/hooks/useSchoolResourceOptions", () => ({
  useSchoolResourceOptions: () => ({
    gradeOptions: [{ value: "高一", label: "高一" }],
    schoolYearOptions: [{ value: "2026-2027", label: "2026-2027" }],
    semesterOptions: [{ value: "上学期", label: "上学期" }],
    defaultGrade: "高一",
    defaultSchoolYear: "2026-2027",
    defaultSemester: "上学期",
    ready: true,
  }),
  includeCurrentOption: (options: unknown[]) => options,
}));

vi.mock("@/services/lecture", () => ({
  lectureService: {
    getLecture: mocks.getLecture,
    updateLecture: mocks.updateLecture,
    listColumnTemplates: mocks.listColumnTemplates,
    listLectures: mocks.listLectures,
    publish: vi.fn().mockResolvedValue(undefined),
  },
}));
vi.mock("@/services/knowledge", () => ({
  knowledgeService: {
    getChapterTree: mocks.getChapterTree,
    getKnowledgeTree: mocks.getKnowledgeTree,
    listChapters: vi.fn().mockResolvedValue([]),
    listKnowledgePoints: vi.fn().mockResolvedValue([]),
  },
}));
vi.mock("@/services/settings", () => ({
  settingsService: { listLectureTypes: mocks.listLectureTypes },
}));
vi.mock("@/services/class", () => ({
  classService: {
    listAllClasses: mocks.listAllClasses,
    listStudentsBySchool: mocks.listStudentsBySchool,
    listSchoolClasses: mocks.listSchoolClasses,
    listPersonalClasses: mocks.listPersonalClasses,
  },
}));
vi.mock("@/services/basket", () => ({
  basketService: {
    listBaskets: mocks.listBaskets,
  },
}));
vi.mock("@/services/analytics", () => ({
  analyticsService: {
    listAnswerRecordsByLecture: mocks.listAnswerRecordsByLecture,
    getAnsweredQuestionIds: vi.fn().mockResolvedValue(new Set()),
  },
  inferScore: vi.fn(),
}));
vi.mock("@/services/lessonCourseware", () => ({
  lessonCoursewareService: {
    getCoursewareBySource: mocks.getCoursewareBySource,
    createFromLecture: mocks.createFromLecture,
  },
}));
vi.mock("@/services/question", () => ({
  questionService: {
    getQuestion: vi.fn().mockResolvedValue(null),
    listQuestions: mocks.listQuestions,
  },
}));
vi.mock("@/services/courseware", () => ({
  coursewareService: { listCoursewares: vi.fn().mockResolvedValue([]) },
}));
vi.mock("@/services/material", () => ({
  materialService: { listMaterials: vi.fn().mockResolvedValue([]) },
}));
vi.mock("@/services/examPaper", () => ({
  examPaperService: { listPapers: vi.fn().mockResolvedValue([]) },
}));
vi.mock("@/services/ai", () => ({
  aiService: { generateKnowledgePoint: vi.fn() },
}));
vi.mock("@/services/prep", () => ({
  prepService: {},
}));

import LectureEditorPage from "./LectureEditorPage";

function CoursewareRouteProbe() {
  const location = useLocation();
  return <div>{location.search === "?preview=1" ? "课件预览页" : "课件编辑页"}</div>;
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={[`/lectures/${lecture.id}/edit`]}>
      <Routes>
        <Route path="/lectures/:id/edit" element={<LectureEditorPage />} />
        <Route path="/my-lessons/:id/edit" element={<CoursewareRouteProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("LectureEditorPage courseware action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getLecture.mockResolvedValue(lecture);
    mocks.updateLecture.mockImplementation(async (_id, patch) => ({ ...lecture, ...patch }));
    mocks.listLectures.mockResolvedValue([]);
    mocks.listColumnTemplates.mockResolvedValue([]);
    mocks.getChapterTree.mockResolvedValue(emptyTree);
    mocks.getKnowledgeTree.mockResolvedValue(emptyTree);
    mocks.listLectureTypes.mockResolvedValue([]);
    mocks.listAllClasses.mockResolvedValue([]);
    mocks.listStudentsBySchool.mockResolvedValue([]);
    mocks.listSchoolClasses.mockResolvedValue([]);
    mocks.listPersonalClasses.mockResolvedValue([]);
    mocks.listBaskets.mockResolvedValue([]);
    mocks.listAnswerRecordsByLecture.mockResolvedValue([]);
    mocks.listQuestions.mockResolvedValue([]);
    mocks.getCoursewareBySource.mockResolvedValue(null);
    mocks.createFromLecture.mockResolvedValue({ id: "lesson-courseware-1" });
  });

  it("disables save while clean and can undo unsaved lecture changes", async () => {
    renderPage();

    const saveButton = await screen.findByRole("button", { name: "保存" });
    const undoButton = screen.getByRole("button", { name: "撤销" });
    const titleInput = screen.getAllByLabelText("标题")[0];

    expect(saveButton).toBeDisabled();
    expect(undoButton).toBeDisabled();

    fireEvent.change(titleInput, { target: { value: "修改后的讲义标题" } });
    expect(saveButton).toBeEnabled();
    expect(undoButton).toBeEnabled();

    fireEvent.click(undoButton);
    expect(titleInput).toHaveValue(lecture.title);
    expect(saveButton).toBeDisabled();

    fireEvent.change(titleInput, { target: { value: "最终讲义标题" } });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(mocks.updateLecture).toHaveBeenCalledWith(
        lecture.id,
        expect.objectContaining({ title: "最终讲义标题" }),
      );
      expect(saveButton).toBeDisabled();
    });
  });

  it("saves current lecture edits before creating courseware from edit mode", async () => {
    const user = userEvent.setup();
    renderPage();

    const sendButton = await screen.findByRole("button", { name: "发送到我的课件" });
    await waitFor(() => expect(sendButton).toBeEnabled());
    await user.click(sendButton);

    await waitFor(() => {
      expect(mocks.updateLecture).toHaveBeenCalledWith(
        lecture.id,
        expect.objectContaining({ title: lecture.title }),
      );
      expect(mocks.createFromLecture).toHaveBeenCalledWith(
        teacher.id,
        teacher.schoolId,
        lecture.id,
      );
    });
    expect(mocks.updateLecture.mock.invocationCallOrder[0])
      .toBeLessThan(mocks.createFromLecture.mock.invocationCallOrder[0]);
    expect(await screen.findByText("课件编辑页")).toBeInTheDocument();
  });

  it("changes the action to courseware and opens an existing courseware in preview", async () => {
    mocks.getCoursewareBySource.mockResolvedValue({ id: "linked-courseware-1" });
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "课件" }));

    expect(await screen.findByText("课件预览页")).toBeInTheDocument();
    expect(mocks.createFromLecture).not.toHaveBeenCalled();
  });

  it("shows another lecture's selectable contents in the right pane", async () => {
    mocks.getLecture.mockResolvedValue({
      ...lecture,
      sections: [
        {
          id: "chapter-current",
          title: "当前栏目",
          type: "chapter",
          content: "",
          children: [],
        },
      ],
    });
    mocks.listLectures.mockResolvedValue([
      {
        ...lecture,
        id: "lecture-2",
        title: "参考讲义",
        sections: [
          {
            id: "chapter-reference",
            title: "参考栏目",
            type: "chapter",
            content: "",
            children: [
              {
                id: "knowledge-reference",
                title: "函数单调性",
                type: "knowledge",
                content: "单调性的定义与判断方法",
                children: [],
              },
            ],
          },
        ],
      },
    ]);

    renderPage();

    const otherLectureButtons = await screen.findAllByRole("button", { name: "其它讲义" });
    fireEvent.click(otherLectureButtons[0]);
    expect(await screen.findByText("选择讲义")).toBeInTheDocument();
    expect(screen.getByText("点击左侧讲义后，在这里选择要添加的知识块或题目")).toBeInTheDocument();

    fireEvent.click(await screen.findByRole("button", { name: "参考讲义" }));

    expect(await screen.findByText("函数单调性")).toBeInTheDocument();
    expect(screen.getByText("单调性的定义与判断方法")).toBeInTheDocument();
    expect(screen.queryByText("点击左侧讲义后，在这里选择要添加的知识块或题目")).not.toBeInTheDocument();
  });
});
