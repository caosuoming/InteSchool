import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ExamPaper, ExamPublication, Question, Teacher, TreeNode } from "@/types";

const mocks = vi.hoisted(() => ({
  getPaper: vi.fn(),
  updatePaper: vi.fn(),
  listQuestions: vi.fn(),
  updateQuestion: vi.fn(),
  listBaskets: vi.fn(),
  addQuestion: vi.fn(),
  removeQuestion: vi.fn(),
  listAllClasses: vi.fn(),
  listSchoolClasses: vi.fn(),
  listPersonalClasses: vi.fn(),
  listStudentsBySchool: vi.fn(),
  listPublications: vi.fn(),
  publishExam: vi.fn(),
  listExamPaperTypes: vi.fn(),
  listSettings: vi.fn(),
  getChapterTree: vi.fn(),
  getKnowledgeTree: vi.fn(),
  generateExamPaperDocx: vi.fn(),
  createLessonFromExamPaper: vi.fn(),
  getLessonCoursewareBySource: vi.fn(),
  listAnswerRecordsByStudents: vi.fn(),
  saveAnswerRecord: vi.fn(),
  batchSaveAnswerRecords: vi.fn(),
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
    updateQuestion: mocks.updateQuestion,
  },
}));
vi.mock("@/services/basket", () => ({
  basketService: {
    listBaskets: mocks.listBaskets,
    addQuestion: mocks.addQuestion,
    removeQuestion: mocks.removeQuestion,
  },
}));
vi.mock("@/services/lecture", () => ({
  lectureService: { listLectures: vi.fn().mockResolvedValue([]) },
}));
vi.mock("@/services/lessonCourseware", () => ({
  lessonCoursewareService: {
    createFromExamPaper: mocks.createLessonFromExamPaper,
    getCoursewareBySource: mocks.getLessonCoursewareBySource,
  },
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
    getChapterTree: mocks.getChapterTree,
  },
}));
vi.mock("@/services/settings", () => ({
  settingsService: {
    listExamPaperTypes: mocks.listExamPaperTypes,
    listSettings: mocks.listSettings,
  },
}));
vi.mock("@/services/analytics", () => ({
  analyticsService: {
    getAnsweredQuestionIds: vi.fn().mockResolvedValue(new Set()),
    listAnswerRecordsByStudents: mocks.listAnswerRecordsByStudents,
    saveAnswerRecord: mocks.saveAnswerRecord,
    batchSaveAnswerRecords: mocks.batchSaveAnswerRecords,
  },
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

const sameTypeQuestion = {
  ...question,
  id: "question-3",
  stem: "函数值域是？",
  answer: "B",
  recommendation: 4,
} as Question;

const relatedReplacementQuestion = {
  ...question,
  id: "question-related",
  stem: "同知识点替换题",
  answer: "A",
  recommendation: 5,
  usageCount: 8,
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
  classIds: [],
  studentIds: [],
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

const chapterTree = {
  id: "root",
  name: "章节课",
  children: [{
    id: "chapter-1",
    name: "函数与方程",
    type: "chapter",
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

function CoursewareRouteProbe() {
  const location = useLocation();
  return <div>{location.search === "?preview=1" ? "课件预览页" : "课件编辑页"}</div>;
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={[`/exam-papers/${paper.id}/preview`]}>
      <Routes>
        <Route path="/exam-papers/:id/preview" element={<ExamPaperEditorPage />} />
        <Route path="/my-lessons/:id/edit" element={<CoursewareRouteProbe />} />
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
        <Route path="/my-lessons/:id/edit" element={<CoursewareRouteProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ExamPaperEditorPage preview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getPaper.mockResolvedValue(paper);
    mocks.updatePaper.mockImplementation(async (_id, patch) => ({ ...paper, ...patch }));
    mocks.listQuestions.mockResolvedValue([question]);
    mocks.updateQuestion.mockImplementation(async (_id, patch) => ({ ...question, ...patch }));
    mocks.listBaskets.mockResolvedValue([]);
    mocks.addQuestion.mockResolvedValue(undefined);
    mocks.removeQuestion.mockResolvedValue(undefined);
    mocks.listAllClasses.mockResolvedValue([{
      id: "class-1",
      type: "school",
      schoolId: teacher.schoolId,
      name: "高一（1）班",
      grade: "高一",
      studentCount: 1,
      createdBy: teacher.id,
      createdAt: timestamp,
    }]);
    mocks.listSchoolClasses.mockResolvedValue([]);
    mocks.listPersonalClasses.mockResolvedValue([]);
    mocks.listStudentsBySchool.mockResolvedValue([]);
    mocks.listPublications.mockResolvedValue([publication]);
    mocks.listExamPaperTypes.mockResolvedValue([]);
    mocks.listSettings.mockResolvedValue([]);
    mocks.getChapterTree.mockResolvedValue(chapterTree);
    mocks.getKnowledgeTree.mockResolvedValue(knowledgeTree);
    mocks.generateExamPaperDocx.mockResolvedValue(undefined);
    mocks.createLessonFromExamPaper.mockResolvedValue({ id: "lesson-courseware-1" });
    mocks.getLessonCoursewareBySource.mockResolvedValue(null);
    mocks.listAnswerRecordsByStudents.mockResolvedValue([]);
    mocks.saveAnswerRecord.mockResolvedValue(null);
    mocks.batchSaveAnswerRecords.mockResolvedValue([]);
  });

  it("removes a basket question after adding it to the paper when confirmed", async () => {
    const basket = {
      id: "basket-1",
      teacherId: teacher.id,
      name: "复习篮",
      questionIds: [secondQuestion.id],
      materialIds: [],
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    mocks.getPaper.mockResolvedValue({
      ...paper,
      isExtractCopy: false,
      contentBlocks: [],
    });
    mocks.listQuestions.mockResolvedValue([question, secondQuestion]);
    mocks.listBaskets.mockResolvedValue([basket]);
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

    renderEditorPage();
    await screen.findByLabelText("文档名");

    fireEvent.click(screen.getAllByRole("button", { name: "添加题目" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "资源篮" }));
    fireEvent.click(await screen.findByRole("button", { name: "复习篮 (1)" }));
    fireEvent.click(await screen.findByText(secondQuestion.stem));
    fireEvent.click(screen.getByRole("button", { name: "添加选中题目" }));

    await waitFor(() => {
      expect(confirmSpy).toHaveBeenCalledWith("是否移除已引用题目？");
      expect(mocks.removeQuestion).toHaveBeenCalledWith(basket.id, secondQuestion.id);
    });
    confirmSpy.mockRestore();
  });

  it("shows the current title first and aligns per-question details beside the paper", async () => {
    renderPage();

    const preview = await screen.findByTestId("exam-paper-preview");
    expect(preview.firstElementChild).toHaveClass("exam-paper-preview-title");
    expect(within(preview.firstElementChild as HTMLElement).getByText("外层试卷标题")).toBeInTheDocument();
    expect(within(preview).queryByText("文档原始标题")).not.toBeInTheDocument();
    expect(screen.queryByText("版面：")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "打印" })).not.toBeInTheDocument();

    const previewControls = screen.getByTestId("exam-paper-preview-details");
    expect(previewControls).toHaveTextContent("题目信息");
    expect(previewControls).toHaveClass("preview-sticky-controls");
    expect(previewControls.parentElement).toHaveClass("preview-sticky-rail");
    expect(preview.closest(".preview-sticky-shell")).not.toBeNull();
    expect(preview.querySelector(".preview-sticky-spacer")).not.toBeNull();
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

  it("edits a preview question's chapter course and knowledge-point catalogs", async () => {
    renderPage();

    const details = await screen.findByTestId("exam-question-details-1");
    expect(details).toHaveTextContent("暂无关联章节课");
    expect(details).toHaveTextContent("函数定义域");

    fireEvent.click(screen.getByRole("button", { name: "编辑第 1 题章节课和知识点" }));
    expect(await screen.findByRole("heading", { name: "编辑第 1 题章节课和知识点" })).toBeInTheDocument();

    const chapterRow = screen.getByTitle("函数与方程").parentElement as HTMLElement;
    fireEvent.click(within(chapterRow).getByRole("button"));
    const knowledgeRow = screen.getByTitle("函数定义域").parentElement as HTMLElement;
    fireEvent.click(within(knowledgeRow).getByRole("button"));
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => {
      expect(mocks.updateQuestion).toHaveBeenCalledWith(question.id, {
        chapterIds: ["chapter-1"],
        knowledgePointIds: [],
      });
    });
    expect(details).toHaveTextContent("函数与方程");
    expect(details).toHaveTextContent("暂无关联知识点");
  });

  it("controls which per-question sidebar sections are visible", async () => {
    renderPage();
    await screen.findByTestId("exam-question-details-1");

    const propertiesToggle = screen.getByRole("button", { name: "题目属性" });
    const answerToggle = screen.getByRole("button", { name: "答题情况" });
    const basketToggle = screen.getByRole("button", { name: "添加资源篮" });
    expect(propertiesToggle).toHaveAttribute("aria-pressed", "true");
    expect(answerToggle).toHaveAttribute("aria-pressed", "true");
    expect(basketToggle).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(answerToggle);
    expect(screen.queryByTestId("exam-question-answer-status-1")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "全部设为使用" })).not.toBeInTheDocument();

    fireEvent.click(propertiesToggle);
    expect(screen.queryByTestId("exam-question-properties-1")).not.toBeInTheDocument();

    fireEvent.click(basketToggle);
    expect(screen.queryByTestId("exam-question-details-1")).not.toBeInTheDocument();
  });

  it("edits and persists a question score directly from preview properties", async () => {
    renderPage();

    const details = await screen.findByTestId("exam-question-details-1");
    fireEvent.click(within(details).getByRole("button", { name: "编辑第 1 题分值" }));
    const scoreInput = within(details).getByLabelText("第 1 题分值");
    fireEvent.change(scoreInput, { target: { value: "8" } });
    fireEvent.click(within(details).getByRole("button", { name: "保存" }));

    await waitFor(() => {
      expect(mocks.updatePaper).toHaveBeenCalledWith(paper.id, {
        questions: [{ ...paper.questions[0], score: 8 }],
        totalScore: 8,
      });
    });
    expect(details).toHaveTextContent("8 分");
  });

  it("quick-adds to the default basket and uses the arrow for other baskets", async () => {
    const defaultBasket = {
      id: "basket-default",
      teacherId: teacher.id,
      name: "默认资源篮",
      isDefault: true,
      questionIds: [],
      materialIds: [],
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const otherBasket = {
      ...defaultBasket,
      id: "basket-other",
      name: "拓展篮",
      isDefault: false,
    };
    mocks.listBaskets.mockResolvedValue([defaultBasket, otherBasket]);

    renderPage();

    const quickAddButton = await screen.findByRole("button", { name: "加入试题篮" });
    await waitFor(() => expect(quickAddButton).toBeEnabled());
    fireEvent.click(quickAddButton);
    await waitFor(() => {
      expect(mocks.addQuestion).toHaveBeenCalledWith(defaultBasket.id, question.id);
    });

    fireEvent.click(screen.getByRole("button", { name: "选择其它资源篮" }));
    fireEvent.click(await screen.findByRole("button", { name: /拓展篮/ }));
    await waitFor(() => {
      expect(mocks.addQuestion).toHaveBeenCalledWith(otherBasket.id, question.id);
    });
  });

  it("persists class-only usage changes made directly in preview", async () => {
    renderPage();
    await screen.findByTestId("exam-paper-preview");

    fireEvent.click(screen.getByRole("button", { name: "添加使用对象" }));
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: /确定（1 个班级）/ }));

    await waitFor(() => {
      expect(mocks.updatePaper).toHaveBeenCalledWith(paper.id, {
        classIds: ["class-1"],
        studentIds: [],
      });
    });
  });

  it("sends a previewed paper to my courseware and opens the courseware editor", async () => {
    renderPage();

    const sendButton = await screen.findByRole("button", { name: "发送到我的课件" });
    await waitFor(() => expect(sendButton).toBeEnabled());
    fireEvent.click(sendButton);

    await waitFor(() => {
      expect(mocks.createLessonFromExamPaper).toHaveBeenCalledWith(
        teacher.id,
        teacher.schoolId,
        paper.id,
      );
    });
    expect(mocks.updatePaper).not.toHaveBeenCalled();
    expect(await screen.findByText("课件编辑页")).toBeInTheDocument();
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

  it("persists an unsaved preview before sending it to my courseware", async () => {
    renderEditorPage();

    fireEvent.change(await screen.findByLabelText("文档名"), {
      target: { value: "发送前的新标题" },
    });
    fireEvent.click(screen.getByRole("button", { name: "预览" }));
    const sendButton = await screen.findByRole("button", { name: "发送到我的课件" });
    await waitFor(() => expect(sendButton).toBeEnabled());
    fireEvent.click(sendButton);

    await waitFor(() => {
      expect(mocks.updatePaper).toHaveBeenCalledWith(
        paper.id,
        expect.objectContaining({ title: "发送前的新标题" }),
      );
      expect(mocks.createLessonFromExamPaper).toHaveBeenCalledOnce();
    });
    expect(mocks.updatePaper.mock.invocationCallOrder[0])
      .toBeLessThan(mocks.createLessonFromExamPaper.mock.invocationCallOrder[0]);
  });

  it("sends directly from edit mode after saving current changes", async () => {
    renderEditorPage();

    fireEvent.change(await screen.findByLabelText("文档名"), {
      target: { value: "编辑状态的新标题" },
    });
    const sendButton = await screen.findByRole("button", { name: "发送到我的课件" });
    await waitFor(() => expect(sendButton).toBeEnabled());
    fireEvent.click(sendButton);

    await waitFor(() => {
      expect(mocks.updatePaper).toHaveBeenCalledWith(
        paper.id,
        expect.objectContaining({ title: "编辑状态的新标题" }),
      );
      expect(mocks.createLessonFromExamPaper).toHaveBeenCalledWith(
        teacher.id,
        teacher.schoolId,
        paper.id,
      );
    });
    expect(mocks.updatePaper.mock.invocationCallOrder[0])
      .toBeLessThan(mocks.createLessonFromExamPaper.mock.invocationCallOrder[0]);
    expect(await screen.findByText("课件编辑页")).toBeInTheDocument();
  });

  it("opens an existing linked courseware in preview without creating a duplicate", async () => {
    mocks.getLessonCoursewareBySource.mockResolvedValue({ id: "linked-courseware-1" });
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "课件" }));

    expect(await screen.findByText("课件预览页")).toBeInTheDocument();
    expect(mocks.createLessonFromExamPaper).not.toHaveBeenCalled();
    expect(mocks.getLessonCoursewareBySource).toHaveBeenCalledWith(
      teacher.id,
      teacher.schoolId,
      "examPaper",
      paper.id,
    );
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

    const audienceButton = screen.getAllByRole("button", { name: "添加使用对象" })[0];
    fireEvent.click(audienceButton);
    expect(screen.getByText("使用对象按班级设置；具体学生的答题情况可在预览中逐题调整。")).toBeInTheDocument();
    expect(screen.getByText("高一（1）班")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: /确定（1 个班级）/ }));

    fireEvent.click(screen.getByRole("button", { name: "预览" }));
    await screen.findByTestId("exam-paper-preview");
    await waitFor(() => expect(container.querySelectorAll(".katex").length).toBeGreaterThan(0));
  });

  it("edits one class student's answer state from the preview", async () => {
    mocks.getPaper.mockResolvedValue({ ...paper, classIds: ["class-1"] });
    mocks.listStudentsBySchool.mockResolvedValue([{
      id: "student-1",
      name: "张同学",
      studentNo: "20260001",
      classId: "class-1",
      schoolId: teacher.schoolId,
      grade: "高一",
      status: "active",
    }]);

    renderPage();
    await screen.findByTestId("exam-paper-preview");

    fireEvent.change(screen.getByLabelText("选择学生"), { target: { value: "student-1" } });
    fireEvent.change(screen.getByLabelText("答题情况"), { target: { value: "partial" } });

    await waitFor(() => {
      expect(mocks.saveAnswerRecord).toHaveBeenCalledWith({
        studentId: "student-1",
        questionId: question.id,
        lectureId: paper.id,
        score: "partial",
        source: "manual",
      });
    });
  });

  it("places secondary editor actions below the title and removes the subtitle", async () => {
    renderEditorPage();

    await screen.findByLabelText("文档名");
    expect(screen.queryByText("换题、调整顺序、添加题目")).not.toBeInTheDocument();

    const toolbar = screen.getByRole("toolbar", { name: "试卷辅助操作" });
    expect(within(toolbar).getByRole("button", { name: "添加到集体备课" })).toBeInTheDocument();
    expect(within(toolbar).getByRole("button", { name: "制作答题卡" })).toBeInTheDocument();
    expect(within(toolbar).getByRole("button", { name: "发布试卷" })).toBeInTheDocument();
    expect(toolbar.previousElementSibling).toContainElement(
      screen.getByRole("heading", { name: `编辑：${paper.title}` }),
    );
  });

  it("supports grouped score changes and aligned catalog-related controls in the editor", async () => {
    mocks.getPaper.mockResolvedValue({
      ...paper,
      isExtractCopy: false,
      contentBlocks: [],
      questions: [
        paper.questions[0],
        {
          ...paper.questions[0],
          id: "paper-question-2",
          questionId: sameTypeQuestion.id,
          stem: sameTypeQuestion.stem,
          options: sameTypeQuestion.options,
          answer: sameTypeQuestion.answer,
          analysis: sameTypeQuestion.analysis,
          score: 3,
        },
      ],
      totalScore: 8,
    });
    mocks.listQuestions.mockResolvedValue([question, sameTypeQuestion, relatedReplacementQuestion]);

    renderEditorPage();

    const groupedScore = await screen.findByLabelText<HTMLInputElement>("一、单选题统一分值");
    expect(groupedScore).toHaveAttribute("placeholder", "混合");
    fireEvent.change(groupedScore, { target: { value: "7" } });
    expect(screen.getAllByText("14 分").length).toBeGreaterThan(0);

    expect(screen.queryByText("展开答案与解析")).not.toBeInTheDocument();
    const firstOptionRow = screen.getAllByText("A.")[0].parentElement as HTMLElement;
    expect(firstOptionRow).not.toHaveClass("border");

    const details = screen.getByTestId("exam-editor-question-details-1");
    expect(details).toHaveTextContent("章节课目录");
    expect(details).toHaveTextContent("知识点目录");
    expect(details).toHaveTextContent("函数定义域");
    expect(within(details).getByRole("button", { name: "编辑第 1 题章节课和知识点" })).toBeInTheDocument();

    fireEvent.click(within(details).getByRole("button", { name: "相关题" }));
    const related = await screen.findByTestId("exam-editor-related-questions-1");
    expect(within(related).getByText("同知识点替换题")).toBeInTheDocument();
    fireEvent.click(within(related).getByRole("button", { name: "用相关题 1 替换第 1 题" }));

    await waitFor(() => {
      expect(screen.queryByText(question.stem)).not.toBeInTheDocument();
    });
    expect(screen.getByText("同知识点替换题")).toBeInTheDocument();
  });
});

describe("ExamPaperEditorPage structured editor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listBaskets.mockResolvedValue([]);
    mocks.addQuestion.mockResolvedValue(undefined);
    mocks.removeQuestion.mockResolvedValue(undefined);
    mocks.listAllClasses.mockResolvedValue([]);
    mocks.listSchoolClasses.mockResolvedValue([]);
    mocks.listPersonalClasses.mockResolvedValue([]);
    mocks.listStudentsBySchool.mockResolvedValue([]);
    mocks.listPublications.mockResolvedValue([]);
    mocks.listExamPaperTypes.mockResolvedValue([]);
    mocks.listSettings.mockResolvedValue([]);
    mocks.getChapterTree.mockResolvedValue(chapterTree);
    mocks.getKnowledgeTree.mockResolvedValue(knowledgeTree);
    mocks.listAnswerRecordsByStudents.mockResolvedValue([]);
    mocks.saveAnswerRecord.mockResolvedValue(null);
    mocks.batchSaveAnswerRecords.mockResolvedValue([]);
    mocks.getLessonCoursewareBySource.mockResolvedValue(null);

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
    mocks.updateQuestion.mockImplementation(async (_id, patch) => ({ ...question, ...patch }));
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
