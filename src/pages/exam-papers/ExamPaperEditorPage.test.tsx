import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ExamPaper, ExamPublication, Question, Teacher, TreeNode } from "@/types";

const mocks = vi.hoisted(() => ({
  getPaper: vi.fn(),
  listPapers: vi.fn(),
  listLectures: vi.fn(),
  updatePaper: vi.fn(),
  markPaperDownloaded: vi.fn(),
  invalidatePaperDownload: vi.fn(),
  invalidateAnswerSheet: vi.fn(),
  duplicatePaper: vi.fn(),
  listQuestions: vi.fn(),
  getQuestion: vi.fn(),
  updateQuestion: vi.fn(),
  addRemark: vi.fn(),
  listBaskets: vi.fn(),
  addQuestion: vi.fn(),
  removeQuestion: vi.fn(),
  listAllClasses: vi.fn(),
  listSchoolClasses: vi.fn(),
  listPersonalClasses: vi.fn(),
  listStudentsByClass: vi.fn(),
  listPublications: vi.fn(),
  listExamPaperTypes: vi.fn(),
  listSettings: vi.fn(),
  getChapterTree: vi.fn(),
  getKnowledgeTree: vi.fn(),
  getMethodTree: vi.fn(),
  getErrorReasonTree: vi.fn(),
  downloadExamPaperDocxVariants: vi.fn(),
  createLessonFromExamPaper: vi.fn(),
  getLessonCoursewareBySource: vi.fn(),
  listAnswerRecordsByStudents: vi.fn(),
  getKnowledgeMastery: vi.fn(),
  listUsedDocumentIds: vi.fn(),
  saveAnswerRecord: vi.fn(),
  batchSaveAnswerRecords: vi.fn(),
  batchSetDocumentQuestionStatus: vi.fn(),
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
    markPaperDownloaded: mocks.markPaperDownloaded,
    invalidatePaperDownload: mocks.invalidatePaperDownload,
    invalidateAnswerSheet: mocks.invalidateAnswerSheet,
    duplicatePaper: mocks.duplicatePaper,
    listPapers: mocks.listPapers,
  },
}));
vi.mock("@/services/question", () => ({
  questionService: {
    listQuestions: mocks.listQuestions,
    getQuestion: mocks.getQuestion,
    updateQuestion: mocks.updateQuestion,
    addRemark: mocks.addRemark,
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
  lectureService: { listLectures: mocks.listLectures },
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
    listStudentsByClass: mocks.listStudentsByClass,
  },
}));
vi.mock("@/services/examPublish", () => ({
  examPublishService: {
    listPublications: mocks.listPublications,
    revokePublication: vi.fn(),
  },
}));
vi.mock("@/services/knowledge", () => ({
  knowledgeService: {
    getKnowledgeTree: mocks.getKnowledgeTree,
    getMethodTree: mocks.getMethodTree,
    getErrorReasonTree: mocks.getErrorReasonTree,
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
  inferScore: (record: { score?: string; isCorrect: boolean }) => record.score || (record.isCorrect ? "correct" : "wrong"),
  analyticsService: {
    getAnsweredQuestionIds: vi.fn().mockResolvedValue(new Set()),
    listAnswerRecordsByStudents: mocks.listAnswerRecordsByStudents,
    getKnowledgeMastery: mocks.getKnowledgeMastery,
    listUsedDocumentIds: mocks.listUsedDocumentIds,
    saveAnswerRecord: mocks.saveAnswerRecord,
    batchSaveAnswerRecords: mocks.batchSaveAnswerRecords,
    batchSetDocumentQuestionStatus: mocks.batchSetDocumentQuestionStatus,
  },
}));
vi.mock("@/lib/docx", () => ({
  downloadExamPaperDocxVariants: mocks.downloadExamPaperDocxVariants,
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

function ExamPaperEditorRouteProbe() {
  return <div>试卷编辑目标页</div>;
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={[`/exam-papers/${paper.id}/preview`]}>
      <Routes>
        <Route path="/exam-papers/:id/preview" element={<ExamPaperEditorPage />} />
        <Route path="/exam-papers/:id" element={<ExamPaperEditorRouteProbe />} />
        <Route path="/my-lessons/:id/edit" element={<CoursewareRouteProbe />} />
        <Route path="/individual-tutoring/coursewares" element={<div>个人上课课件列表</div>} />
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
        <Route path="/individual-tutoring/coursewares" element={<div>个人上课课件列表</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ExamPaperEditorPage preview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getPaper.mockResolvedValue(paper);
    mocks.listPapers.mockResolvedValue([]);
    mocks.listLectures.mockResolvedValue([]);
    mocks.updatePaper.mockImplementation(async (_id, patch) => ({ ...paper, ...patch }));
    mocks.duplicatePaper.mockResolvedValue({ ...paper, id: "paper-copy", isExtractCopy: false });
    mocks.markPaperDownloaded.mockResolvedValue({ ...paper, paperDownloadedAt: "2026-11-07T00:00:00Z" });
    mocks.invalidatePaperDownload.mockResolvedValue({ ...paper, paperDownloadedAt: undefined });
    mocks.invalidateAnswerSheet.mockResolvedValue({ ...paper, answerSheetExportedAt: undefined, hasAnswerSheet: undefined });
    mocks.listQuestions.mockResolvedValue([question]);
    mocks.getQuestion.mockResolvedValue(question);
    mocks.updateQuestion.mockImplementation(async (_id, patch) => ({ ...question, ...patch }));
    mocks.addRemark.mockResolvedValue({
      id: "remark-added",
      content: "新备注",
      createdAt: timestamp,
      updatedAt: timestamp,
    });
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
    mocks.listStudentsByClass.mockResolvedValue([]);
    mocks.listPublications.mockResolvedValue([publication]);
    mocks.listExamPaperTypes.mockResolvedValue([]);
    mocks.listSettings.mockResolvedValue([]);
    mocks.getChapterTree.mockResolvedValue(chapterTree);
    mocks.getKnowledgeTree.mockResolvedValue(knowledgeTree);
    mocks.getMethodTree.mockResolvedValue({ id: "root", name: "全部思想方法", type: "method", count: 0, children: [] });
    mocks.getErrorReasonTree.mockResolvedValue({ id: "root", name: "全部错因", type: "error", count: 0, children: [] });
    mocks.downloadExamPaperDocxVariants.mockResolvedValue(undefined);
    mocks.createLessonFromExamPaper.mockResolvedValue({ id: "lesson-courseware-1" });
    mocks.getLessonCoursewareBySource.mockResolvedValue(null);
    mocks.listAnswerRecordsByStudents.mockResolvedValue([]);
    mocks.getKnowledgeMastery.mockResolvedValue([]);
    mocks.listUsedDocumentIds.mockResolvedValue([]);
    mocks.saveAnswerRecord.mockResolvedValue(null);
    mocks.batchSaveAnswerRecords.mockResolvedValue([]);
    mocks.batchSetDocumentQuestionStatus.mockResolvedValue({ created: 1, cleared: 0, excluded: 0 });
  });

  it("edits and persists decomposed exam-paper document metadata from preview", async () => {
    renderPage();
    await screen.findByTestId("exam-paper-preview");

    fireEvent.click(screen.getByRole("button", { name: "编辑文档属性" }));
    expect(screen.getByRole("heading", { name: "编辑试卷属性" })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("文档名"), { target: { value: "函数单元检测卷" } });
    fireEvent.change(screen.getByLabelText("年级"), { target: { value: "高二" } });
    fireEvent.change(screen.getByLabelText("学年"), { target: { value: "2027-2028" } });
    fireEvent.change(screen.getByLabelText("学期"), { target: { value: "下学期" } });
    const chapterRow = screen.getByText("函数与方程").parentElement;
    expect(chapterRow).not.toBeNull();
    fireEvent.click(chapterRow!.querySelector("button")!);
    fireEvent.click(screen.getByRole("button", { name: "保存文档属性" }));

    await waitFor(() => {
      expect(mocks.updatePaper).toHaveBeenCalledWith(paper.id, {
        title: "函数单元检测卷",
        description: "",
        grade: "高二",
        schoolYear: "2027-2028",
        semester: "下学期",
        chapterIds: ["chapter-1"],
      });
    });
    expect(await screen.findAllByText("函数单元检测卷")).toHaveLength(2);
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
    fireEvent.click(await screen.findByRole("checkbox", { name: "选择第 1 道题" }));
    fireEvent.click(screen.getByRole("button", { name: "添加选中题目" }));

    await waitFor(() => {
      expect(confirmSpy).toHaveBeenCalledWith("是否移除已引用题目？");
      expect(mocks.removeQuestion).toHaveBeenCalledWith(basket.id, secondQuestion.id);
    });
    confirmSpy.mockRestore();
  });

  it("filters question-bank choices by chapter and knowledge directories", async () => {
    mocks.getPaper.mockResolvedValue({
      ...paper,
      isExtractCopy: false,
      contentBlocks: [],
    });
    mocks.listQuestions.mockResolvedValue([question, sameTypeQuestion]);

    renderEditorPage();
    await screen.findByLabelText("文档名");

    fireEvent.click(screen.getAllByRole("button", { name: "添加题目" })[0]);
    fireEvent.click(screen.getAllByRole("button", { name: "题库" }).at(-1)!);

    const chapterSearch = await screen.findByPlaceholderText("搜索章节课...");
    const chapterPanel = chapterSearch.closest(".rounded-lg");
    expect(chapterPanel).not.toBeNull();
    fireEvent.click(within(chapterPanel as HTMLElement).getByText("函数与方程").closest("div")!.querySelector("button")!);

    await waitFor(() => {
      expect(mocks.listQuestions).toHaveBeenCalledWith(expect.objectContaining({
        chapterIds: ["chapter-1"],
      }));
    });

    const knowledgeSearch = screen.getByPlaceholderText("搜索知识点...");
    const knowledgePanel = knowledgeSearch.closest(".rounded-lg");
    expect(knowledgePanel).not.toBeNull();
    fireEvent.click(within(knowledgePanel as HTMLElement).getByText("函数定义域").closest("div")!.querySelector("button")!);

    await waitFor(() => {
      expect(mocks.listQuestions).toHaveBeenCalledWith(expect.objectContaining({
        chapterIds: ["chapter-1"],
        knowledgePointIds: ["knowledge-1"],
      }));
    });
  });

  it("shows the current title first and aligns per-question details beside the paper", async () => {
    renderPage();

    const preview = await screen.findByTestId("exam-paper-preview");
    expect(preview.firstElementChild).toHaveClass("exam-paper-preview-title");
    expect(within(preview.firstElementChild as HTMLElement).getByText("外层试卷标题")).toBeInTheDocument();
    expect(within(preview).queryByText("文档原始标题")).not.toBeInTheDocument();
    expect(screen.queryByText("版面：")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "打印" })).not.toBeInTheDocument();

    const previewQuestion = screen.getByText(question.stem).closest("section");
    expect(previewQuestion).not.toBeNull();
    expect(previewQuestion).not.toHaveClass("border");
    expect(within(previewQuestion as HTMLElement).queryByText("5 分")).not.toBeInTheDocument();
    expect(screen.getByText("实数集").parentElement).not.toHaveClass("border", "rounded");

    const previewControls = screen.getByTestId("exam-paper-preview-details");
    expect(previewControls).toHaveTextContent("显示内容");
    expect(within(previewControls).queryByTestId("document-question-batch-actions")).not.toBeInTheDocument();
    expect(previewControls).toHaveClass("preview-sticky-controls");
    expect(previewControls.parentElement).toHaveClass("preview-sticky-rail");
    expect(previewControls.previousElementSibling).toBeNull();
    expect(screen.queryByText("选择具体学生后可重新设置该题的答题情况")).not.toBeInTheDocument();
    const displayToolbar = within(previewControls).getByRole("toolbar", { name: "题目侧栏显示控制" });
    expect(displayToolbar).toHaveClass("grid", "grid-cols-2");
    const displayButtons = within(displayToolbar).getAllByRole("button");
    expect(displayButtons).toHaveLength(4);
    expect(displayButtons.every((button) => button.classList.contains("w-full"))).toBe(true);
    expect(within(displayToolbar).getByRole("button", { name: "显示名单" })).toBeInTheDocument();

    const batchActions = screen.getByTestId("document-question-batch-actions");
    expect(batchActions).toHaveTextContent("批量操作");
    expect(batchActions).toHaveClass("flex", "flex-wrap");
    expect(batchActions.closest(".preview-sticky-rail")).toBeNull();
    expect(within(batchActions).getByRole("button", { name: "修改章节课" })).toBeInTheDocument();
    expect(within(batchActions).getByRole("button", { name: "新增知识点" })).toBeInTheDocument();
    expect(within(batchActions).getByRole("button", { name: "新增思想方法" })).toBeInTheDocument();
    expect(batchActions.children[1]).toHaveClass("flex", "flex-wrap");
    const batchButtons = within(batchActions).getAllByRole("button");
    expect(batchButtons.every((button) => !button.classList.contains("w-full"))).toBe(true);
    expect(within(batchActions).getByRole("button", { name: "全部设为已做" })).toBeInTheDocument();
    expect(within(batchActions).getByRole("button", { name: "全部设为使用" })).toBeInTheDocument();
    expect(batchButtons).toHaveLength(5);
    expect(preview.closest(".preview-sticky-shell")).not.toBeNull();
    expect(preview.querySelector(".preview-sticky-spacer")).not.toBeNull();
    const questionDetails = screen.getByTestId("exam-question-details-1");
    expect(questionDetails).toHaveTextContent("第 1 题");
    expect(questionDetails).toHaveTextContent("5 分");
    expect(questionDetails).toHaveTextContent("函数定义域");
    expect(questionDetails).not.toHaveTextContent("较易");
    expect(questionDetails).not.toHaveTextContent("高推荐题目");
    expect(questionDetails.parentElement).toHaveClass("exam-paper-preview-right");
    expect(screen.queryByRole("button", { name: "收起信息栏" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "下载" }));
    expect(screen.getByText("学生用卷（无答案）")).toBeInTheDocument();
    expect(screen.getByText("教师用卷（含答案解析）")).toBeInTheDocument();
    expect(screen.getByText("普通用卷（答案解析在最后）")).toBeInTheDocument();
    expect(screen.getByText("纯答案版")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("学生用卷（无答案）"));
    fireEvent.click(screen.getByRole("button", { name: "下载 2 个版本" }));
    await waitFor(() => {
      expect(mocks.downloadExamPaperDocxVariants).toHaveBeenCalledOnce();
    });
    expect(mocks.downloadExamPaperDocxVariants.mock.calls[0][0]).toMatchObject({
      id: paper.id,
      title: paper.title,
      contentBlocks: paper.contentBlocks,
    });
    expect(mocks.downloadExamPaperDocxVariants.mock.calls[0][2]).toEqual(["teacher", "student"]);
  });

  it("applies only checked question numbers to the entire document audience", async () => {
    mocks.getPaper.mockResolvedValue({ ...paper, classIds: ["class-1"] });
    mocks.listStudentsByClass.mockResolvedValue([{
      id: "student-1", classId: "class-1", status: "active", name: "测试学生",
    }]);
    renderPage();
    await screen.findByTestId("exam-paper-preview");
    const button = screen.getByRole("button", { name: "全部设为已做" });
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);
    const group = screen.getByRole("group", { name: "题目编号" });
    expect(within(group).getAllByRole("checkbox")).toHaveLength(1);
    expect(within(group).getByRole("checkbox", { name: "第 1 题" })).toBeChecked();
    fireEvent.click(within(group).getByRole("checkbox", { name: "第 1 题" }));
    fireEvent.click(screen.getByRole("button", { name: "确认设为已做（0 题）" }));
    await waitFor(() => expect(mocks.batchSetDocumentQuestionStatus)
      .toHaveBeenCalledWith(paper.id, [], "done"));
  });

  it("creates an editable copy directly from preview", async () => {
    renderPage();

    const copyButton = await screen.findByRole("button", { name: "创建副本" });
    fireEvent.click(copyButton);

    await waitFor(() => {
      expect(mocks.duplicatePaper).toHaveBeenCalledWith(paper.id);
    });
    expect(await screen.findByText("试卷编辑目标页")).toBeInTheDocument();
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
        thoughtMethodIds: [],
        errorReasonIds: [],
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
    const answeredListToggle = screen.getByRole("button", { name: "显示名单" });
    const basketToggle = screen.getByRole("button", { name: "添加资源篮" });
    expect(propertiesToggle).toHaveAttribute("aria-pressed", "true");
    expect(answerToggle).toHaveAttribute("aria-pressed", "true");
    expect(answeredListToggle).toHaveAttribute("aria-pressed", "true");
    expect(basketToggle).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(answerToggle);
    expect(screen.queryByTestId("exam-question-answer-status-1")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "全部设为已做" })).toBeInTheDocument();

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
    mocks.getPaper.mockResolvedValue({ ...paper, classIds: ["class-1"] });
    renderPage();

    const sendButton = await screen.findByRole("button", { name: "添加到学校上课" });
    await waitFor(() => expect(sendButton).toBeEnabled());
    fireEvent.click(sendButton);

    await waitFor(() => {
      expect(mocks.createLessonFromExamPaper).toHaveBeenCalledWith(
        teacher.id, teacher.schoolId, paper.id, [], undefined, ["class-1"],
      );
    });
    expect(mocks.updatePaper).not.toHaveBeenCalled();
    expect(await screen.findByText("课件编辑页")).toBeInTheDocument();
  });

  it("shows and hides all answers from the preview toolbar", async () => {
    renderPage();

    const preview = await screen.findByTestId("exam-paper-preview");
    expect(within(preview).queryByText("解析：")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "一键显示答案" }));
    expect(within(preview).getByText("解析：")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "收起全部答案" })).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("button", { name: "收起全部答案" }));
    expect(within(preview).queryByText("解析：")).not.toBeInTheDocument();
  });

  it("renames the answer-sheet action after a card has been created", async () => {
    mocks.getPaper.mockResolvedValue({ ...paper, hasAnswerSheet: true });
    renderPage();

    const toolbar = await screen.findByRole("toolbar", { name: "试卷预览操作" });
    expect(within(toolbar).getByRole("button", { name: "预览答题卡" })).toBeInTheDocument();
    expect(within(toolbar).queryByRole("button", { name: "制作答题卡" })).not.toBeInTheDocument();
  });

  it("places preview controls on a second row below the page header", async () => {
    renderPage();

    const toolbar = await screen.findByRole("toolbar", { name: "试卷预览操作" });
    expect(within(toolbar).getByRole("button", { name: "添加使用对象" })).toBeInTheDocument();
    expect(within(toolbar).queryByRole("button", { name: "添加到学校上课" })).not.toBeInTheDocument();
    expect(within(toolbar).getByRole("button", { name: "制作答题卡" })).toBeInTheDocument();
    expect(within(toolbar).queryByRole("button", { name: "发布试卷" })).not.toBeInTheDocument();
    expect(within(toolbar).getByRole("button", { name: "创建副本" })).toBeInTheDocument();
    expect(within(toolbar).getByRole("button", { name: "一键显示答案" })).toBeInTheDocument();
    expect(within(toolbar).getByRole("button", { name: "下载" })).toBeInTheDocument();
    expect(within(toolbar).getByRole("button", { name: "编辑试卷" })).toBeInTheDocument();
    expect(toolbar.previousElementSibling).toContainElement(
      screen.getByRole("heading", { name: paper.title }),
    );
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
    mocks.getPaper.mockResolvedValue({ ...paper, classIds: ["class-1"] });
    renderEditorPage();

    fireEvent.change(await screen.findByLabelText("文档名"), {
      target: { value: "发送前的新标题" },
    });
    fireEvent.click(screen.getByRole("button", { name: "预览" }));
    const sendButton = await screen.findByRole("button", { name: "添加到学校上课" });
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
    mocks.getPaper.mockResolvedValue({ ...paper, classIds: ["class-1"] });
    renderEditorPage();

    fireEvent.change(await screen.findByLabelText("文档名"), {
      target: { value: "编辑状态的新标题" },
    });
    const sendButton = await screen.findByRole("button", { name: "添加到学校上课" });
    await waitFor(() => expect(sendButton).toBeEnabled());
    fireEvent.click(sendButton);

    await waitFor(() => {
      expect(mocks.updatePaper).toHaveBeenCalledWith(
        paper.id,
        expect.objectContaining({ title: "编辑状态的新标题" }),
      );
      expect(mocks.createLessonFromExamPaper).toHaveBeenCalledWith(
        teacher.id, teacher.schoolId, paper.id, [], undefined, ["class-1"],
      );
    });
    expect(mocks.updatePaper.mock.invocationCallOrder[0])
      .toBeLessThan(mocks.createLessonFromExamPaper.mock.invocationCallOrder[0]);
    expect(await screen.findByText("课件编辑页")).toBeInTheDocument();
  });

  it("generates a personal tutoring deck only for the selected personal class", async () => {
    const personalClass = {
      id: "personal-1", type: "personal", teacherId: teacher.id,
      name: "个别辅导班", description: "", studentIds: [], createdAt: timestamp,
    };
    mocks.getPaper.mockResolvedValue({ ...paper, classIds: ["personal-1"] });
    mocks.listAllClasses.mockResolvedValue([personalClass]);
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "添加到个人上课" }));
    await waitFor(() => expect(mocks.createLessonFromExamPaper).toHaveBeenCalledWith(
      teacher.id, teacher.schoolId, paper.id, [], ["personal-1"], undefined,
    ));
    expect(await screen.findByText("个人上课课件列表")).toBeInTheDocument();
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

  it("shows and adds question remarks from the preview answer-status section", async () => {
    const legacyQuestion = { ...question, remark: "已有备注" } as Question;
    const addedRemark = {
      id: "remark-added",
      content: "新备注",
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    mocks.listQuestions.mockResolvedValue([legacyQuestion]);
    mocks.addRemark.mockResolvedValue(addedRemark);
    mocks.getQuestion.mockResolvedValue({
      ...legacyQuestion,
      remark: addedRemark.content,
      remarks: [
        {
          id: "remark-legacy",
          content: legacyQuestion.remark,
          createdAt: timestamp,
          updatedAt: timestamp,
        },
        addedRemark,
      ],
    });

    renderPage();
    const answerStatus = await screen.findByTestId("exam-question-answer-status-1");
    expect(within(answerStatus).getByText("已有备注")).toBeInTheDocument();

    fireEvent.click(within(answerStatus).getByRole("button", { name: "添加备注" }));
    fireEvent.change(await within(answerStatus).findByLabelText("新增题目备注"), {
      target: { value: "新备注" },
    });
    fireEvent.click(within(answerStatus).getByRole("button", { name: "添加" }));

    await waitFor(() => {
      expect(mocks.addRemark).toHaveBeenCalledWith(question.id, "新备注");
      expect(within(answerStatus).getByText("新备注")).toBeInTheDocument();
    });
  });

  it("loads external students from a selected personal class in preview", async () => {
    const personalClass = {
      id: "personal-class-1",
      type: "personal" as const,
      teacherId: teacher.id,
      name: "测试教师的个别辅导班",
      description: "",
      studentIds: ["external-student-1"],
      createdAt: timestamp,
    };
    const externalStudent = {
      id: "external-student-1",
      name: "校外学生",
      studentNo: "EXT-001",
      classId: "",
      schoolId: "",
      grade: "高一",
      isExternal: true,
      externalSchool: "外校",
      status: "active" as const,
    };
    mocks.listAllClasses.mockResolvedValue([personalClass]);
    mocks.listStudentsByClass.mockResolvedValue([externalStudent]);

    renderPage();
    await screen.findByTestId("exam-paper-preview");

    fireEvent.click(screen.getByRole("button", { name: "添加使用对象" }));
    fireEvent.click(screen.getByRole("checkbox"));

    await waitFor(() => {
      expect(mocks.listStudentsByClass).toHaveBeenCalledWith(personalClass.id);
    });
    expect(await screen.findByLabelText("学生")).toHaveTextContent("校外学生 · EXT-001");

    fireEvent.click(screen.getByRole("button", { name: /确定（1 个班级）/ }));
    await waitFor(() => {
      expect(mocks.updatePaper).toHaveBeenCalledWith(paper.id, {
        classIds: [personalClass.id],
        studentIds: [],
      });
    });
  });

  it("edits the only class student's answer state from the preview without selecting the student", async () => {
    mocks.getPaper.mockResolvedValue({ ...paper, classIds: ["class-1"] });
    mocks.listStudentsByClass.mockResolvedValue([{
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

    expect(screen.queryByLabelText("选择学生")).not.toBeInTheDocument();
    fireEvent.change(await screen.findByLabelText("答题情况"), { target: { value: "partial" } });

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

  it("shows existing answers in a toggleable roster when multiple students use the paper", async () => {
    const firstStudent = {
      id: "student-1",
      name: "张同学",
      studentNo: "20260001",
      classId: "class-1",
      schoolId: teacher.schoolId,
      grade: "高一",
      status: "active",
    };
    const secondStudent = {
      ...firstStudent,
      id: "student-2",
      name: "李同学",
      studentNo: "20260002",
    };
    mocks.getPaper.mockResolvedValue({ ...paper, classIds: ["class-1"] });
    mocks.listStudentsByClass.mockResolvedValue([firstStudent, secondStudent]);
    mocks.listAnswerRecordsByStudents.mockResolvedValue([{
      id: "answer-1",
      studentId: firstStudent.id,
      questionId: question.id,
      lectureId: paper.id,
      isCorrect: true,
      score: "correct",
      source: "manual",
      answeredAt: "2026-08-20T02:00:00.000Z",
    }]);

    renderPage();

    const answeredList = await screen.findByTestId("answered-student-list");
    expect(screen.getByLabelText("选择学生")).toBeInTheDocument();
    await waitFor(() => {
      expect(answeredList).toHaveTextContent("张同学 · 20260001");
      expect(answeredList).toHaveTextContent("全对");
    });
    expect(answeredList).not.toHaveTextContent("李同学");

    fireEvent.click(within(answeredList).getByRole("button", { name: "查看张同学答题情况" }));
    expect(screen.getByLabelText("选择学生")).toHaveValue(firstStudent.id);
    expect(screen.getByLabelText("答题情况")).toHaveValue("correct");

    fireEvent.click(screen.getByRole("button", { name: "显示名单" }));
    expect(screen.queryByTestId("answered-student-list")).not.toBeInTheDocument();
  });

  it("disables save while clean and can undo unsaved editor changes", async () => {
    renderEditorPage();

    const saveButton = await screen.findByRole("button", { name: "保存" });
    const undoButton = screen.getByRole("button", { name: "撤销" });
    const titleInput = screen.getByLabelText("文档名");

    expect(saveButton).toBeDisabled();
    expect(undoButton).toBeDisabled();

    fireEvent.change(titleInput, { target: { value: "修改后的试卷标题" } });
    expect(saveButton).toBeEnabled();
    expect(undoButton).toBeEnabled();

    fireEvent.click(undoButton);
    expect(titleInput).toHaveValue(paper.title);
    expect(saveButton).toBeDisabled();

    fireEvent.change(titleInput, { target: { value: "最终试卷标题" } });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(mocks.updatePaper).toHaveBeenCalledWith(
        paper.id,
        expect.objectContaining({ title: "最终试卷标题" }),
      );
      expect(saveButton).toBeDisabled();
    });
  });

  it("places secondary editor actions below the title and removes the subtitle", async () => {
    renderEditorPage();

    await screen.findByLabelText("文档名");
    expect(screen.queryByText("换题、调整顺序、添加题目")).not.toBeInTheDocument();

    const toolbar = screen.getByRole("toolbar", { name: "试卷辅助操作" });
    expect(within(toolbar).getByRole("button", { name: "添加到集体备课" })).toBeInTheDocument();
    expect(within(toolbar).getByRole("button", { name: "制作答题卡" })).toBeInTheDocument();
    expect(within(toolbar).queryByRole("button", { name: "发布试卷" })).not.toBeInTheDocument();
    expect(toolbar.previousElementSibling).toContainElement(
      screen.getByRole("heading", { name: `编辑：${paper.title}` }),
    );
  });

  it("numbers grouped questions continuously in their displayed order", async () => {
    mocks.getPaper.mockResolvedValue({
      ...paper,
      isExtractCopy: false,
      contentBlocks: [],
      questions: [
        paper.questions[0],
        {
          ...paper.questions[0],
          id: "paper-question-2",
          questionId: secondQuestion.id,
          type: secondQuestion.type,
          stem: secondQuestion.stem,
          options: secondQuestion.options,
          answer: secondQuestion.answer,
          analysis: secondQuestion.analysis,
        },
        {
          ...paper.questions[0],
          id: "paper-question-3",
          questionId: sameTypeQuestion.id,
          type: sameTypeQuestion.type,
          stem: sameTypeQuestion.stem,
          options: sameTypeQuestion.options,
          answer: sameTypeQuestion.answer,
          analysis: sameTypeQuestion.analysis,
        },
      ],
      totalScore: 15,
    });
    mocks.listQuestions.mockResolvedValue([question, secondQuestion, sameTypeQuestion]);

    renderEditorPage();

    const secondDetails = await screen.findByTestId("exam-editor-question-details-2");
    expect(secondDetails).toHaveTextContent("第 2 题属性");
    expect(secondDetails).toHaveTextContent("单选");
    expect(screen.getByTestId("exam-editor-question-details-3")).toHaveTextContent("解答");

    const laterSingleRow = screen.getByText(sameTypeQuestion.stem).closest("div.border");
    expect(laterSingleRow).not.toBeNull();
    expect(within(laterSingleRow as HTMLElement).getByText("2.")).toBeInTheDocument();

    const essayRow = screen.getByText(secondQuestion.stem).closest("div.border");
    expect(essayRow).not.toBeNull();
    expect(within(essayRow as HTMLElement).getByText("3.")).toBeInTheDocument();
  });

  it("persists the edited type order and uses it when downloading the paper", async () => {
    const groupedPaper: ExamPaper = {
      ...paper,
      contentBlocks: [],
      isExtractCopy: false,
      layoutMode: "grouped",
      questions: [
        paper.questions[0],
        {
          ...paper.questions[0],
          id: "paper-question-2",
          questionId: secondQuestion.id,
          type: secondQuestion.type,
          stem: secondQuestion.stem,
        },
      ],
    };
    mocks.getPaper.mockResolvedValue(groupedPaper);
    mocks.listQuestions.mockResolvedValue([question, secondQuestion]);
    mocks.updatePaper.mockImplementation(async (_id, patch) => ({ ...groupedPaper, ...patch }));

    renderEditorPage();
    await screen.findByLabelText("文档名");
    fireEvent.click(screen.getAllByTitle("题型上移")[1]);
    fireEvent.change(screen.getByLabelText("单选题题型名称"), { target: { value: "客观选择题" } });
    expect(screen.getByRole("button", { name: "保存" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => {
      expect(mocks.updatePaper).toHaveBeenCalledWith(paper.id, expect.objectContaining({
        questionTypeOrder: expect.arrayContaining(["essay", "single"]),
        questionTypeLabels: { single: "客观选择题" },
      }));
    });
    const savedOrder = mocks.updatePaper.mock.calls.at(-1)![1].questionTypeOrder as string[];
    expect(savedOrder.slice(0, 2)).toEqual(["essay", "single"]);

    fireEvent.click(screen.getByRole("button", { name: "预览" }));
    await screen.findByTestId("exam-paper-preview");
    expect(screen.getByText("二、客观选择题")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "下载" }));
    fireEvent.click(screen.getByLabelText("学生用卷（无答案）"));
    fireEvent.click(screen.getByRole("button", { name: "下载 2 个版本" }));
    await waitFor(() => expect(mocks.downloadExamPaperDocxVariants).toHaveBeenCalledOnce());
    expect(mocks.downloadExamPaperDocxVariants.mock.calls[0][0].questionTypeOrder.slice(0, 2))
      .toEqual(["essay", "single"]);
    expect(mocks.downloadExamPaperDocxVariants.mock.calls[0][0].questionTypeLabels)
      .toEqual({ single: "客观选择题" });
  });

  it("creates an empty project, assigns existing questions, and saves the project structure", async () => {
    const flatPaper = { ...paper, isExtractCopy: false, contentBlocks: [], layoutMode: "flat" as const, projects: [] };
    mocks.getPaper.mockResolvedValue(flatPaper);
    mocks.updatePaper.mockImplementation(async (_id, patch) => ({ ...flatPaper, ...patch }));

    renderEditorPage();
    await screen.findByLabelText("文档名");
    expect(screen.getAllByText("按项目").length).toBeGreaterThan(0);
    expect(screen.queryByLabelText("项目名称 1")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("新项目名称"), { target: { value: "基础练习" } });
    fireEvent.click(screen.getByRole("button", { name: "新建项目" }));
    expect(screen.getByLabelText("项目名称 1")).toHaveValue("基础练习");
    expect(screen.getAllByText("未分组").length).toBeGreaterThan(0);

    const assignSelect = screen.getByLabelText<HTMLSelectElement>("第 1 题所属项目");
    const projectId = within(assignSelect).getByRole<HTMLOptionElement>("option", { name: "基础练习" }).value;
    fireEvent.change(assignSelect, { target: { value: projectId } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(mocks.updatePaper).toHaveBeenCalledWith(paper.id, expect.objectContaining({
      layoutMode: "flat",
      projects: [{ id: projectId, name: "基础练习" }],
      questions: [expect.objectContaining({ projectId })],
    })));
  });

  it("marks only unmarked multiple-choice stems in project editor and preview without changing stored stems", async () => {
    const flatPaper = {
      ...paper, isExtractCopy: false, contentBlocks: [], layoutMode: "flat" as const,
      questions: [
        { ...paper.questions[0], type: "multiple", stem: "选出所有正确答案" },
        { ...paper.questions[0], id: "paper-question-2", type: "multiple", stem: "<p>（多选）选择正确结论</p>" },
        { ...paper.questions[0], id: "paper-question-3", type: "single", stem: "仅选一项" },
      ],
    };
    mocks.getPaper.mockResolvedValue(flatPaper);

    renderEditorPage();
    await screen.findByLabelText("文档名");
    const expectMarkers = () => {
      const missing = screen.getByText("选出所有正确答案").closest(".cursor-pointer");
      const existing = screen.getByText("（多选）选择正确结论").closest(".cursor-pointer");
      const single = screen.getByText("仅选一项").closest(".cursor-pointer");
      expect(missing?.textContent).toContain("（多选）选出所有正确答案");
      expect(missing?.textContent?.match(/（多选）/g)).toHaveLength(1);
      expect(existing?.textContent?.match(/（多选）/g)).toHaveLength(1);
      expect(single).not.toHaveTextContent("（多选）");
    };

    expectMarkers();
    fireEvent.click(screen.getByRole("button", { name: "预览" }));
    await screen.findByTestId("exam-paper-preview");
    expectMarkers();
    expect(mocks.updatePaper).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "编辑试卷" }));
    await screen.findByLabelText("文档名");
    fireEvent.click(screen.getByRole("button", { name: "按题型" }));
    expect(screen.getByText("选出所有正确答案").closest(".cursor-pointer")).not.toHaveTextContent("（多选）");
  });

  it("allows adding questions directly into an empty project", async () => {
    const flatPaper = { ...paper, isExtractCopy: false, contentBlocks: [], layoutMode: "flat" as const,
      questions: [], projects: [{ id: "prj-a", name: "计算题" }] };
    mocks.getPaper.mockResolvedValue(flatPaper);
    mocks.listQuestions.mockResolvedValue([question, secondQuestion]);
    mocks.listBaskets.mockResolvedValue([{
      id: "basket-project", teacherId: teacher.id, name: "项目用题", questionIds: [question.id],
      materialIds: [], createdAt: timestamp, updatedAt: timestamp,
    }]);
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);

    renderEditorPage();
    const heading = await screen.findByLabelText("项目名称 1");
    expect(heading).toHaveValue("计算题");
    fireEvent.click(screen.getAllByRole("button", { name: "添加题目" }).at(-1)!);
    expect(screen.getByLabelText("添加到项目")).toHaveValue("prj-a");
    fireEvent.click(screen.getByRole("button", { name: "资源篮" }));
    fireEvent.click(await screen.findByRole("button", { name: "项目用题 (1)" }));
    fireEvent.click(await screen.findByRole("checkbox", { name: "选择第 1 道题" }));
    fireEvent.click(screen.getByRole("button", { name: "添加选中题目" }));
    await waitFor(() => expect(screen.getByLabelText("第 1 题所属项目")).toHaveValue("prj-a"));
    expect(screen.getByText(question.stem)).toBeInTheDocument();
    confirmSpy.mockRestore();
  });

  it("shows another paper's questions beside the document list and adds multiple selected questions", async () => {
    const draft = { ...paper, isExtractCopy: false, contentBlocks: [], questions: [] };
    const source = {
      ...paper,
      id: "source-paper",
      title: "来源试卷",
      questions: [
        { ...paper.questions[0], id: "source-q1" },
        { ...paper.questions[0], id: "source-q2", questionId: sameTypeQuestion.id, stem: sameTypeQuestion.stem },
        { ...paper.questions[0], id: "source-q3", questionId: undefined, stem: "尚未关联题库的原稿题" },
      ],
    };
    mocks.getPaper.mockResolvedValue(draft);
    mocks.updatePaper.mockImplementation(async (_id, patch) => ({ ...draft, ...patch }));
    mocks.listPapers.mockResolvedValue([draft, source, {
      ...source, id: "source-empty", title: "另一份试卷", questions: [],
    }]);
    mocks.listQuestions.mockResolvedValue([question, sameTypeQuestion]);

    renderEditorPage();
    await screen.findByLabelText("文档名");
    fireEvent.click(screen.getAllByRole("button", { name: "添加题目" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "其它文档" }));
    fireEvent.click(await screen.findByRole("button", { name: /来源试卷/ }));
    expect(screen.getByText("共 3 题，可添加 2 题")).toBeInTheDocument();
    expect(screen.getByText("尚未关联题库的原稿题").closest("label")?.querySelector("input")).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "全选" }));
    expect(screen.getByText("已选择 2 道题目")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /另一份试卷/ }));
    expect(screen.getByText("已选择 0 道题目")).toBeInTheDocument();
    expect(screen.getByText("该文档暂无符合条件的题目")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /来源试卷/ }));
    fireEvent.click(screen.getByRole("button", { name: "全选" }));
    fireEvent.click(screen.getByRole("button", { name: "添加选中题目" }));

    await waitFor(() => expect(screen.getByText(sameTypeQuestion.stem)).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(mocks.updatePaper).toHaveBeenCalledWith(paper.id, expect.objectContaining({
      questions: [
        expect.objectContaining({ questionId: question.id }),
        expect.objectContaining({ questionId: sameTypeQuestion.id }),
      ],
    })));
  });

  it("lists nested lecture questions and adds the selected ones to an exam paper", async () => {
    const draft = { ...paper, isExtractCopy: false, contentBlocks: [], questions: [] };
    mocks.getPaper.mockResolvedValue(draft);
    mocks.updatePaper.mockImplementation(async (_id, patch) => ({ ...draft, ...patch }));
    mocks.listLectures.mockResolvedValue([{
      id: "source-lecture",
      title: "嵌套题目讲义",
      sections: [{
        id: "chapter", type: "chapter", title: "第一章", content: "", children: [{
          id: "knowledge", type: "knowledge", title: "知识点", content: "", children: [{
            id: "nested-q1", type: "question", title: "嵌套第一题", content: "",
            questionId: question.id, children: [],
          }],
        }, {
          id: "nested-q2", type: "question", title: "嵌套第二题", content: "",
          questionId: secondQuestion.id, children: [],
        }],
      }],
    }]);
    mocks.listQuestions.mockResolvedValue([question, secondQuestion]);

    renderEditorPage();
    await screen.findByLabelText("文档名");
    fireEvent.click(screen.getAllByRole("button", { name: "添加题目" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "其它文档" }));
    fireEvent.click(screen.getAllByRole("button", { name: "讲义" }).at(-1)!);
    fireEvent.click(await screen.findByRole("button", { name: /嵌套题目讲义/ }));
    expect(screen.getByText("嵌套第一题")).toBeInTheDocument();
    expect(screen.getByText("嵌套第二题")).toBeInTheDocument();
    expect(screen.getByText("共 2 题，可添加 2 题")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "全选" }));
    fireEvent.click(screen.getByRole("button", { name: "添加选中题目" }));
    await waitFor(() => expect(screen.getByText(secondQuestion.stem)).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(mocks.updatePaper).toHaveBeenCalledWith(paper.id, expect.objectContaining({
      questions: [
        expect.objectContaining({ questionId: question.id }),
        expect.objectContaining({ questionId: secondQuestion.id }),
      ],
    })));
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
    expect(details).toHaveTextContent("第 1 题属性");
    expect(details).toHaveTextContent("单选");
    expect(details).toHaveTextContent("较易");
    expect(details).toHaveTextContent("章节课目录");
    expect(details).toHaveTextContent("知识点目录");
    expect(details).toHaveTextContent("函数定义域");
    expect(within(details).getByLabelText<HTMLInputElement>("题目分值")).toHaveValue(7);
    expect(details.parentElement?.parentElement).toHaveClass("lg:grid-cols-[minmax(0,1fr)_320px]");
    expect(within(details).getByRole("button", { name: "换题" })).toBeInTheDocument();
    expect(within(details).getByRole("button", { name: "编辑第 1 题章节课和知识点" })).toBeInTheDocument();

    fireEvent.click(within(details).getByRole("button", { name: "换题" }));
    expect(within(details).getByRole("button", { name: "属性" })).toBeInTheDocument();
    expect(within(details).getByRole("tab", { name: "同类题" })).toHaveAttribute("aria-selected", "true");
    expect(within(details).queryByLabelText("题目分值")).not.toBeInTheDocument();
    expect(await within(details).findByText("同知识点替换题")).toBeInTheDocument();
    fireEvent.click(within(details).getByRole("button", { name: "替换为：同知识点替换题" }));

    await waitFor(() => {
      expect(screen.queryByText(question.stem)).not.toBeInTheDocument();
    });
    expect(screen.getByText("同知识点替换题")).toBeInTheDocument();
  });

  it("shows audience-specific baskets in manual selection and adds selected questions", async () => {
    mocks.getPaper.mockResolvedValue({ ...paper, isExtractCopy: false, contentBlocks: [], classIds: ["class-1"] });
    mocks.listBaskets.mockResolvedValue([
      { id: "basket-matching", name: "一班题篮", classIds: ["class-1"], studentIds: [], questionIds: [sameTypeQuestion.id] },
      { id: "basket-other", name: "二班题篮", classIds: ["class-2"], studentIds: [], questionIds: [secondQuestion.id] },
    ]);
    mocks.listQuestions.mockResolvedValue([question, sameTypeQuestion, secondQuestion]);
    mocks.listStudentsByClass.mockResolvedValue([{ id: "student-1", classId: "class-1", status: "active", name: "甲" }]);

    renderEditorPage();
    const mode = await screen.findByRole("group", { name: "选题模式" });
    fireEvent.click(within(mode).getByRole("button", { name: "手动选题" }));
    expect(await screen.findByRole("button", { name: /一班题篮/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /二班题篮/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /一班题篮/ }));
    expect(await screen.findByText(sameTypeQuestion.stem)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: "选择第 1 道题" }));
    fireEvent.click(screen.getByRole("button", { name: "添加选中题目（1）" }));
    await waitFor(() => expect(screen.getAllByText("2 题").length).toBeGreaterThan(0));
  });

  it("lists weak knowledge points for the chosen class and exposes auto quotas", async () => {
    mocks.getPaper.mockResolvedValue({ ...paper, isExtractCopy: false, contentBlocks: [], classIds: ["class-1"] });
    mocks.listQuestions.mockResolvedValue([question, sameTypeQuestion]);
    mocks.listStudentsByClass.mockResolvedValue([{ id: "student-1", classId: "class-1", status: "active", name: "甲" }]);
    mocks.getKnowledgeMastery.mockResolvedValue([{
      knowledgePointId: "knowledge-1", knowledgePointName: "函数定义域", totalAttempts: 4,
      correctRate: 0.25, masteryLevel: "weak", correctCount: 1, wrongCount: 3, partialCount: 0,
    }]);

    renderEditorPage();
    const mode = await screen.findByRole("group", { name: "选题模式" });
    fireEvent.click(within(mode).getByRole("button", { name: "手动选题" }));
    fireEvent.click(screen.getByRole("button", { name: "薄弱知识点" }));
    const weakPoint = await screen.findByRole("button", { name: /函数定义域 · 正确率 25%/ });
    fireEvent.click(weakPoint);
    expect(await screen.findByText(sameTypeQuestion.stem)).toBeInTheDocument();
    fireEvent.click(within(mode).getByRole("button", { name: "自动选题" }));
    expect(await screen.findByRole("heading", { name: /AI 自动组卷/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "下一步" }));
    expect(screen.getByLabelText("薄弱项题数")).toHaveValue(3);
    expect(screen.getByLabelText("未练类型题数（未练知识点）")).toHaveValue(3);
  });

  it("locks arrangement after downloading and allows explicit download invalidation", async () => {
    mocks.getPaper.mockResolvedValue({ ...paper, isExtractCopy: false, paperDownloadedAt: "2026-11-07T00:00:00Z" });
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    try {
      renderPage();
      const button = await screen.findByRole("button", { name: "下载作废" });
      fireEvent.click(button);
      await waitFor(() => expect(mocks.invalidatePaperDownload).toHaveBeenCalledWith(paper.id));
      await waitFor(() => expect(screen.queryByRole("button", { name: "下载作废" })).not.toBeInTheDocument());
    } finally {
      confirm.mockRestore();
    }
  });

  it("keeps paper attributes editable after export while blocking arrangement changes", async () => {
    mocks.getPaper.mockResolvedValue({
      ...paper,
      isExtractCopy: false,
      contentBlocks: [],
      paperDownloadedAt: "2026-11-07T00:00:00Z",
    });
    renderEditorPage();
    expect(await screen.findByText(/试卷已下载或答题卡已导出，题目编排已锁定/)).toBeInTheDocument();
    expect(screen.getByLabelText("文档名")).not.toBeDisabled();
    expect(screen.queryByRole("button", { name: "按题型" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "按项目" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "添加题目" })).not.toBeInTheDocument();
  });

  it("reviews generated questions by type and knowledge point, deletes and replaces individual questions", async () => {
    mocks.getPaper.mockResolvedValue({ ...paper, isExtractCopy: false, contentBlocks: [], classIds: [] });
    mocks.getKnowledgeTree.mockResolvedValue({ ...knowledgeTree, children: [
      ...knowledgeTree.children,
      { id: "knowledge-2", name: "函数值域", type: "knowledge", children: [] },
    ] });
    const candidates = Array.from({ length: 7 }, (_, index) => ({
      ...question,
      id: `auto-${index}`,
      stem: `自动选题测试 ${index}`,
      knowledgePointIds: [index % 2 === 0 ? "knowledge-1" : "knowledge-2"],
      recommendation: (index < 5 ? 5 : 1) as Question["recommendation"],
    }));
    mocks.listQuestions.mockResolvedValue([question, ...candidates]);

    renderEditorPage();
    fireEvent.click(await screen.findByRole("button", { name: "AI 自动组卷" }));
    const chapter = await screen.findByText("函数与方程");
    const chapterRow = chapter.closest(".group") as HTMLElement;
    fireEvent.click(within(chapterRow).getByRole("button"));
    fireEvent.click(screen.getByRole("button", { name: "下一步" }));
    fireEvent.click(screen.getByRole("button", { name: "开始智能组卷" }));

    const filters = await screen.findByRole("complementary", { name: "已选题目筛选" });
    const results = screen.getByLabelText("自动选题结果");
    expect(within(results).getAllByRole("button", { name: /删除第/ })).toHaveLength(5);
    expect(within(filters).getByRole("button", { name: /函数定义域/ })).toHaveTextContent("3");
    expect(within(filters).getByRole("button", { name: /函数值域/ })).toHaveTextContent("2");

    fireEvent.click(within(filters).getByRole("button", { name: /函数定义域/ }));
    expect(results).toHaveTextContent("当前显示 3 / 5 题");
    fireEvent.click(within(results).getAllByRole("button", { name: /删除第 \d+ 道题/ })[0]);
    expect(results).toHaveTextContent("当前显示 2 / 4 题");
    expect(within(filters).getByRole("button", { name: /函数定义域/ })).toHaveTextContent("2");

    fireEvent.click(within(results).getAllByRole("button", { name: /更换第 \d+ 道题/ })[0]);
    expect(within(results).getByText("同题型、相近知识点的候选题")).toBeInTheDocument();
    fireEvent.click(within(results).getByRole("button", { name: "替换为：自动选题测试 6" }));
    expect(within(results).getByText("自动选题测试 6")).toBeInTheDocument();
    expect(within(filters).getByRole("button", { name: /函数定义域/ })).toHaveTextContent("2");

    fireEvent.click(screen.getByRole("button", { name: "添加到试卷（4题）" }));
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(mocks.updatePaper).toHaveBeenCalledWith(paper.id, expect.objectContaining({
      questions: expect.arrayContaining([expect.objectContaining({ questionId: "auto-6" })]),
    })));
    const saved = mocks.updatePaper.mock.calls.at(-1)?.[1].questions as Array<{ questionId: string }>;
    expect(saved).toHaveLength(5);
    expect(new Set(saved.map((item) => item.questionId)).size).toBe(5);
  });

  it("locks an already-used paper against further editing", async () => {
    mocks.getPaper.mockResolvedValue({
      ...paper,
      isExtractCopy: false,
      contentBlocks: [],
    });
    mocks.listUsedDocumentIds.mockResolvedValue([paper.id]);

    renderEditorPage();

    expect(await screen.findByText("答题卡已发布，题目和顺序已锁定；仍可修改题目属性、分值和学生使用记录。")).toBeInTheDocument();
    expect(screen.getByLabelText("文档名")).toBeDisabled();
    expect(screen.getByRole("button", { name: "保存" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "添加题目" })).not.toBeInTheDocument();
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
    mocks.listStudentsByClass.mockResolvedValue([]);
    mocks.listPublications.mockResolvedValue([]);
    mocks.listExamPaperTypes.mockResolvedValue([]);
    mocks.listSettings.mockResolvedValue([]);
    mocks.getChapterTree.mockResolvedValue(chapterTree);
    mocks.getKnowledgeTree.mockResolvedValue(knowledgeTree);
    mocks.listAnswerRecordsByStudents.mockResolvedValue([]);
    mocks.getKnowledgeMastery.mockResolvedValue([]);
    mocks.listUsedDocumentIds.mockResolvedValue([]);
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

    const firstDetails = screen.getByTestId("exam-editor-question-details-1");
    expect(firstDetails).toHaveTextContent("第 1 题属性");
    expect(firstDetails.parentElement?.parentElement).toHaveClass("lg:grid-cols-[minmax(0,1fr)_320px]");
    expect(within(firstDetails).getByLabelText("题目分值")).toBe(scoreInputs[0]);
    expect(within(firstDetails).queryByRole("button", { name: "换题" })).not.toBeInTheDocument();
  });
});
