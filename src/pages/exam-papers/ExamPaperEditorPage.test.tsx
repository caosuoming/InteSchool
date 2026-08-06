import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ExamPaper, ExamPublication, Question, Teacher, TreeNode } from "@/types";

const mocks = vi.hoisted(() => ({
  getPaper: vi.fn(),
  updatePaper: vi.fn(),
  listQuestions: vi.fn(),
  listBaskets: vi.fn(),
  removeQuestion: vi.fn(),
  listAllClasses: vi.fn(),
  listSchoolClasses: vi.fn(),
  listPersonalClasses: vi.fn(),
  listStudentsBySchool: vi.fn(),
  listPublications: vi.fn(),
  publishExam: vi.fn(),
  listExamPaperTypes: vi.fn(),
  listSettings: vi.fn(),
  getKnowledgeTree: vi.fn(),
  generateExamPaperDocx: vi.fn(),
}));

const teacher = {
  id: "teacher-1",
  schoolId: "school-1",
  name: "测试教师",
} as Teacher;

vi.mock("@/stores/auth", () => ({
  useAuthStore: () => ({ teacher }),
}));
vi.mock("@/services/examPaper", () => ({
  examPaperService: {
    getPaper: mocks.getPaper,
    updatePaper: mocks.updatePaper,
    listPapers: vi.fn().mockResolvedValue([]),
  },
}));
vi.mock("@/services/question", () => ({
  questionService: {
    listQuestions: mocks.listQuestions,
  },
}));
vi.mock("@/services/basket", () => ({
  basketService: {
    listBaskets: mocks.listBaskets,
    removeQuestion: mocks.removeQuestion,
  },
}));
vi.mock("@/services/lecture", () => ({
  lectureService: { listLectures: vi.fn().mockResolvedValue([]) },
}));
vi.mock("@/services/class", () => ({
  classService: {
    listAllClasses: mocks.listAllClasses,
    listSchoolClasses: mocks.listSchoolClasses,
    listPersonalClasses: mocks.listPersonalClasses,
    listStudentsBySchool: mocks.listStudentsBySchool,
  },
}));
vi.mock("@/services/examPublish", () => ({
  examPublishService: {
    listPublications: mocks.listPublications,
    publishExam: mocks.publishExam,
    revokePublication: vi.fn(),
  },
}));
vi.mock("@/services/knowledge", () => ({
  knowledgeService: {
    getKnowledgeTree: mocks.getKnowledgeTree,
    getChapterTree: vi.fn().mockResolvedValue([]),
  },
}));
vi.mock("@/services/settings", () => ({
  settingsService: {
    listExamPaperTypes: mocks.listExamPaperTypes,
    listSettings: mocks.listSettings,
  },
}));
vi.mock("@/services/analytics", () => ({
  analyticsService: { getAnsweredQuestionIds: vi.fn().mockResolvedValue(new Set()) },
}));
vi.mock("@/lib/docx", () => ({
  generateExamPaperDocx: mocks.generateExamPaperDocx,
}));

import ExamPaperEditorPage from "./ExamPaperEditorPage";

const timestamp = "2026-08-04T00:00:00.000Z";

const question = {
  id: "question-1",
  teacherId: teacher.id,
  schoolId: teacher.schoolId,
  type: "single",
  stem: "函数的定义域是？",
  options: ["实数集", "正实数集"],
  answer: "A",
  analysis: "根据定义判断。",
  chapterIds: [],
  knowledgePointIds: ["knowledge-1"],
  difficulty: 2,
  recommendation: 3,
  usageCount: 0,
  remark: "",
  isShared: false,
  createdAt: timestamp,
  updatedAt: timestamp,
} as Question;

const secondQuestion = {
  ...question,
  id: "question-2",
  type: "essay",
  stem: "第二个项目的附属题目",
  options: undefined,
  answer: "证明略",
  analysis: "使用定义证明。",
} as Question;

const paper = {
  id: "paper-1",
  teacherId: teacher.id,
  schoolId: teacher.schoolId,
  title: "外层试卷标题",
  description: "",
  chapterIds: [],
  knowledgePointIds: ["knowledge-1"],
  grade: "高一",
  schoolYear: "2026-2027",
  semester: "上学期",
  duration: 90,
  totalScore: 5,
  status: "draft",
  isExtractCopy: true,
  questions: [{
    id: "paper-question-1",
    questionId: question.id,
    type: "single",
    stem: question.stem,
    options: question.options,
    answer: question.answer,
    analysis: question.analysis,
    score: 5,
  }],
  contentBlocks: [
    { id: "title-block", type: "documentTitle", content: "文档原始标题" },
    {
      id: "question-block",
      type: "question",
      content: question.stem,
      questionId: question.id,
      examPaperQuestionId: "paper-question-1",
    },
  ],
  createdAt: timestamp,
  updatedAt: timestamp,
} as ExamPaper;

const knowledgeTree = {
  id: "root",
  name: "知识点",
  children: [{
    id: "knowledge-1",
    name: "函数定义域",
    children: [],
  }],
} as TreeNode;

const publication = {
  id: "publication-1",
  examPaperId: paper.id,
  publisherId: teacher.id,
  publisherSchoolId: teacher.schoolId,
  title: paper.title,
  targetType: "schoolClass",
  targetClassIds: ["class-1"],
  targetStudentIds: [],
  targetSchoolIds: [],
  isFormalExam: false,
  hasViewPassword: false,
  questionIds: [question.id],
  status: "active",
  createdAt: timestamp,
  updatedAt: timestamp,
} as ExamPublication;

function renderPage() {
  return render(
    <MemoryRouter initialEntries={[`/exam-papers/${paper.id}/preview`]}>
      <Routes>
        <Route path="/exam-papers/:id/preview" element={<ExamPaperEditorPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

function renderEditorPage() {
  return render(
    <MemoryRouter initialEntries={[`/exam-papers/${paper.id}`]}>
      <Routes>
        <Route path="/exam-papers/:id" element={<ExamPaperEditorPage />} />
        <Route path="/exam-papers/:id/preview" element={<ExamPaperEditorPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ExamPaperEditorPage preview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getPaper.mockResolvedValue(paper);
    mocks.listQuestions.mockResolvedValue([question]);
    mocks.listBaskets.mockResolvedValue([]);
    mocks.removeQuestion.mockResolvedValue(undefined);
    mocks.listAllClasses.mockResolvedValue([{ id: "class-1", name: "高一（1）班" }]);
    mocks.listSchoolClasses.mockResolvedValue([]);
    mocks.listPersonalClasses.mockResolvedValue([]);
    mocks.listStudentsBySchool.mockResolvedValue([]);
    mocks.listPublications.mockResolvedValue([publication]);
    mocks.listExamPaperTypes.mockResolvedValue([]);
    mocks.listSettings.mockResolvedValue([]);
    mocks.getKnowledgeTree.mockResolvedValue(knowledgeTree);
    mocks.generateExamPaperDocx.mockResolvedValue(undefined);
  });

  it("shows the current title first and aligns per-question details beside the paper", async () => {
    renderPage();

    const preview = await screen.findByTestId("exam-paper-preview");
    expect(preview.firstElementChild).toHaveClass("exam-paper-preview-title");
    expect(within(preview.firstElementChild as HTMLElement).getByText("外层试卷标题")).toBeInTheDocument();
    expect(within(preview).queryByText("文档原始标题")).not.toBeInTheDocument();
    expect(screen.queryByText("版面：")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "打印" })).not.toBeInTheDocument();

    expect(screen.getByTestId("exam-paper-preview-details")).toHaveTextContent("题目信息");
    const questionDetails = screen.getByTestId("exam-question-details-1");
    expect(questionDetails).toHaveTextContent("第 1 题");
    expect(questionDetails).toHaveTextContent("较易");
    expect(questionDetails).toHaveTextContent("5 分");
    expect(questionDetails).toHaveTextContent("函数定义域");
    expect(questionDetails.parentElement).toHaveClass("exam-paper-preview-right");
    expect(screen.queryByRole("button", { name: "收起信息栏" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "下载" }));
    await waitFor(() => {
      expect(mocks.generateExamPaperDocx).toHaveBeenCalledOnce();
    });
    expect(mocks.generateExamPaperDocx.mock.calls[0][0]).toMatchObject({
      id: paper.id,
      title: paper.title,
      contentBlocks: paper.contentBlocks,
    });
  });

  it("previews unsaved edits and keeps them when returning to the editor", async () => {
    renderEditorPage();

    const titleInput = await screen.findByLabelText<HTMLInputElement>("文档名");
    fireEvent.change(titleInput, { target: { value: "未保存的新标题" } });
    fireEvent.change(screen.getByLabelText("题目分值"), { target: { value: "9" } });

    fireEvent.click(screen.getByRole("button", { name: "预览" }));

    const preview = await screen.findByTestId("exam-paper-preview");
    expect(within(preview).getByText("未保存的新标题")).toBeInTheDocument();
    expect(screen.getByTestId("exam-question-details-1")).toHaveTextContent("9 分");
    expect(mocks.updatePaper).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "编辑试卷" }));
    expect(await screen.findByDisplayValue("未保存的新标题")).toBeInTheDocument();
    expect(screen.getByLabelText<HTMLInputElement>("题目分值")).toHaveValue(9);
  });

  it("renders formulas in both editor and preview and exposes publishing in the editor", async () => {
    const formulaQuestion = {
      ...question,
      stem: "已知 $x^2=4$，求 $x$。",
      options: ["$x=2$", "$x=\\pm 2$"],
      answer: "$x=\\pm 2$",
      analysis: "由 $x^2=4$ 可得。",
    } as Question;
    mocks.getPaper.mockResolvedValue({
      ...paper,
      isExtractCopy: false,
      contentBlocks: [],
      questions: [{
        ...paper.questions[0],
        stem: formulaQuestion.stem,
        options: formulaQuestion.options,
        answer: formulaQuestion.answer,
        analysis: formulaQuestion.analysis,
      }],
    });
    mocks.listQuestions.mockResolvedValue([formulaQuestion]);

    const { container } = renderEditorPage();
    await screen.findByLabelText("文档名");
    await waitFor(() => expect(container.querySelector(".katex")).toBeInTheDocument());

    const publishButtons = screen.getAllByRole("button", { name: "选择发布对象" });
    fireEvent.click(publishButtons[0]);
    expect(screen.getByText("发布试卷")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "取消" }));

    fireEvent.click(screen.getByRole("button", { name: "预览" }));
    await screen.findByTestId("exam-paper-preview");
    await waitFor(() => expect(container.querySelectorAll(".katex").length).toBeGreaterThan(0));
  });
});

describe("ExamPaperEditorPage structured editor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listBaskets.mockResolvedValue([]);
    mocks.removeQuestion.mockResolvedValue(undefined);
    mocks.listAllClasses.mockResolvedValue([]);
    mocks.listSchoolClasses.mockResolvedValue([]);
    mocks.listPersonalClasses.mockResolvedValue([]);
    mocks.listStudentsBySchool.mockResolvedValue([]);
    mocks.listPublications.mockResolvedValue([]);
    mocks.listExamPaperTypes.mockResolvedValue([]);
    mocks.listSettings.mockResolvedValue([]);
    mocks.getKnowledgeTree.mockResolvedValue(knowledgeTree);

    mocks.getPaper.mockResolvedValue({
      ...paper,
      questions: [
        paper.questions[0],
        {
          id: "paper-question-2",
          questionId: secondQuestion.id,
          type: secondQuestion.type,
          stem: secondQuestion.stem,
          answer: secondQuestion.answer,
          analysis: secondQuestion.analysis,
          score: 8,
        },
      ],
      contentBlocks: [
        { id: "title-block", type: "documentTitle", content: "文档原始标题" },
        { id: "group-1", type: "groupTitle", content: "项目一" },
        {
          id: "question-block-1",
          type: "question",
          content: question.stem,
          questionId: question.id,
          examPaperQuestionId: "paper-question-1",
        },
        { id: "group-2", type: "heading", content: "项目二" },
        {
          id: "question-block-2",
          type: "question",
          content: secondQuestion.stem,
          questionId: secondQuestion.id,
          examPaperQuestionId: "paper-question-2",
        },
      ],
    });
    mocks.listQuestions.mockResolvedValue([question, secondQuestion]);
  });

  it("keeps paper properties and scores editable while locking extracted document structure", async () => {
    renderEditorPage();

    const projectOneInput = await screen.findByDisplayValue<HTMLInputElement>("项目一");
    expect(projectOneInput).toBeDisabled();

    const metadataGrid = screen.getByLabelText("年级").parentElement?.parentElement;
    expect(metadataGrid).toHaveClass("lg:grid-cols-5");
    for (const label of ["学年", "学期", "试卷类型", "考试时长（分钟）"]) {
      expect(screen.getByLabelText(label).parentElement?.parentElement).toBe(metadataGrid);
    }

    expect(screen.getByText(/题目内容、数量和顺序保持原稿结构/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "项目一整体下移" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "添加题目" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "换题" })).not.toBeInTheDocument();

    const scoreInputs = screen.getAllByLabelText<HTMLInputElement>("题目分值");
    expect(scoreInputs).toHaveLength(2);
    expect(scoreInputs.every((input) => !input.disabled)).toBe(true);
  });
});
