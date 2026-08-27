import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import LecturePreviewPage from "./LecturePreviewPage";
import { lectureService } from "@/services/lecture";
import { classService } from "@/services/class";
import { questionService } from "@/services/question";
import { analyticsService } from "@/services/analytics";
import { lessonCoursewareService } from "@/services/lessonCourseware";
import { knowledgeService } from "@/services/knowledge";
import type { Lecture, Question, SchoolClass, Student } from "@/types";

const basketMocks = vi.hoisted(() => ({
  listBaskets: vi.fn(),
  addQuestion: vi.fn(),
  removeQuestion: vi.fn(),
}));
const documentMocks = vi.hoisted(() => ({
  downloadLectureDocxVariants: vi.fn(),
}));

const teacher = {
  id: "teacher-1",
  schoolId: "school-1",
  name: "测试教师",
};

vi.mock("@/stores/auth", () => ({
  useAuthStore: () => ({ teacher }),
}));

vi.mock("@/services/lecture", () => ({
  lectureService: { getLecture: vi.fn(), updateLecture: vi.fn(), duplicateLecture: vi.fn() },
}));
vi.mock("@/lib/docx", () => ({
  downloadLectureDocxVariants: documentMocks.downloadLectureDocxVariants,
}));
vi.mock("@/services/class", () => ({
  classService: {
    getClassesByIds: vi.fn(),
    listAllClasses: vi.fn(),
    listStudentsByClass: vi.fn(),
    listStudentsBySchool: vi.fn(),
    getStudent: vi.fn(),
  },
}));
vi.mock("@/services/question", () => ({
  questionService: { getQuestion: vi.fn(), updateQuestion: vi.fn(), addRemark: vi.fn() },
}));
vi.mock("@/services/knowledge", () => ({
  knowledgeService: {
    getChapterTree: vi.fn(),
    getKnowledgeTree: vi.fn(),
  },
}));
vi.mock("@/services/analytics", () => ({
  inferScore: (record: { score?: string; isCorrect: boolean }) => record.score || (record.isCorrect ? "correct" : "wrong"),
  analyticsService: {
    listAnswerRecordsByLecture: vi.fn(),
    saveAnswerRecord: vi.fn(),
    batchSaveAnswerRecords: vi.fn(),
  },
}));
vi.mock("@/services/lessonCourseware", () => ({
  lessonCoursewareService: {
    getCoursewareBySource: vi.fn(),
    createFromLecture: vi.fn(),
  },
}));
vi.mock("@/services/basket", () => ({
  basketService: {
    listBaskets: basketMocks.listBaskets,
    addQuestion: basketMocks.addQuestion,
    removeQuestion: basketMocks.removeQuestion,
  },
}));

const lecture: Lecture = {
  id: "lecture-1",
  teacherId: "teacher-1",
  schoolId: "school-1",
  title: "函数专题讲义_2026（拆解版）",
  description: "函数性质与典型例题",
  chapterIds: [],
  knowledgePointIds: [],
  grade: "高一",
  schoolYear: "2026-2027",
  semester: "上学期",
  classIds: ["class-1"],
  studentIds: [],
  sections: [
    {
      id: "document-title",
      title: "函数专题讲义",
      type: "chapter",
      content: "",
      children: [],
    },
    {
      id: "column-1",
      title: "知识梳理",
      type: "chapter",
      content: "先回顾函数 $f(x)$ 的基本性质。",
      children: [
        {
          id: "knowledge-1",
          title: "单调性",
          type: "knowledge",
          content: "在给定区间内判断函数的增减，满足 $x>0$。",
          children: [],
        },
      ],
    },
    {
      id: "column-2",
      title: "例题精讲",
      type: "chapter",
      content: "",
      children: [
        {
          id: "question-section-1",
          title: "例题 1",
          type: "question",
          content: "",
          questionId: "question-1",
          children: [],
        },
      ],
    },
  ],
  contentBlocks: [
    {
      id: "block-title",
      type: "documentTitle",
      content: "函数专题讲义",
    },
  ],
  version: 1,
  status: "published",
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
};

const schoolClass: SchoolClass = {
  id: "class-1",
  type: "school",
  schoolId: "school-1",
  name: "高一（1）班",
  grade: "高一",
  studentCount: 1,
  createdBy: "teacher-1",
  createdAt: "2026-08-01T00:00:00.000Z",
};

const classStudent: Student = {
  id: "student-1",
  name: "张同学",
  studentNo: "20260001",
  classId: "class-1",
  schoolId: "school-1",
  grade: "高一",
  status: "active",
};

const explicitStudent: Student = {
  ...classStudent,
  id: "student-2",
  name: "李同学",
  studentNo: "20260002",
};

const question: Question = {
  id: "question-1",
  teacherId: "teacher-1",
  schoolId: "school-1",
  type: "single",
  stem: "函数 $f(x)=x^2$ 在哪个区间单调递增？",
  options: ["$(-\\infty,0]$", "$[0,+\\infty)$", "$\\mathbb{R}$", "不存在"],
  answer: "B",
  analysis: "二次函数 $f(x)=x^2$ 在非负区间单调递增。",
  summary: "函数单调性",
  chapterIds: [],
  knowledgePointIds: [],
  grade: "高一",
  schoolYear: "2026-2027",
  semester: "上学期",
  difficulty: 2,
  recommendation: 4,
  usageCount: 3,
  remark: "",
  isShared: false,
  hiddenByExamIds: [],
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
};

const chapterTree = {
  id: "root",
  name: "全部章节",
  type: "chapter" as const,
  count: 1,
  children: [{
    id: "chapter-1",
    name: "函数章节",
    type: "chapter" as const,
    count: 1,
    children: [],
  }],
};

const knowledgeTree = {
  id: "root",
  name: "全部知识点",
  type: "knowledge" as const,
  count: 1,
  children: [{
    id: "knowledge-point-1",
    name: "函数单调性",
    type: "knowledge" as const,
    count: 1,
    children: [],
  }],
};

function CoursewareRouteProbe() {
  const location = useLocation();
  return <div>{location.search === "?preview=1" ? "课件预览页" : "课件编辑页"}</div>;
}

function LectureEditorRouteProbe() {
  return <div>讲义编辑页</div>;
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/lectures/lecture-1/preview"]}>
      <Routes>
        <Route path="/lectures/:id/preview" element={<LecturePreviewPage />} />
        <Route path="/lectures/:id/answer-sheet" element={<div>讲义答题卡页</div>} />
        <Route path="/lectures/:id/edit" element={<LectureEditorRouteProbe />} />
        <Route path="/my-lessons/:id/edit" element={<CoursewareRouteProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

function mockOptionWrapping(wrappedColumns: ReadonlySet<number>) {
  const nativeGetComputedStyle = window.getComputedStyle.bind(window);
  const computedStyleSpy = vi.spyOn(window, "getComputedStyle").mockImplementation((element) => {
    if ((element as HTMLElement).hasAttribute("data-lecture-preview-option-content")) {
      return { lineHeight: "20px" } as CSSStyleDeclaration;
    }
    return nativeGetComputedStyle(element);
  });
  const scrollHeightSpy = vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockImplementation(function () {
    const element = this as HTMLElement;
    if (!element.hasAttribute("data-lecture-preview-option-content")) return 0;

    const grid = element.closest('[data-testid="lecture-question-options"]');
    const columns = grid?.classList.contains("grid-cols-4")
      ? 4
      : grid?.classList.contains("grid-cols-2")
        ? 2
        : 1;
    return wrappedColumns.has(columns) ? 40 : 20;
  });

  return () => {
    computedStyleSpy.mockRestore();
    scrollHeightSpy.mockRestore();
  };
}

describe("LecturePreviewPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(lectureService.getLecture).mockResolvedValue(lecture);
    vi.mocked(classService.getClassesByIds).mockResolvedValue([schoolClass]);
    vi.mocked(classService.listAllClasses).mockResolvedValue([schoolClass]);
    vi.mocked(classService.listStudentsByClass).mockResolvedValue([classStudent]);
    vi.mocked(classService.listStudentsBySchool).mockResolvedValue([classStudent, explicitStudent]);
    vi.mocked(classService.getStudent).mockResolvedValue(explicitStudent);
    vi.mocked(questionService.getQuestion).mockResolvedValue(question);
    vi.mocked(questionService.updateQuestion).mockImplementation(async (_id, patch) => ({ ...question, ...patch }));
    vi.mocked(questionService.addRemark).mockResolvedValue({
      id: "remark-added",
      content: "新备注",
      createdAt: "2026-08-01T00:00:00.000Z",
      updatedAt: "2026-08-01T00:00:00.000Z",
    });
    vi.mocked(knowledgeService.getChapterTree).mockResolvedValue(chapterTree);
    vi.mocked(knowledgeService.getKnowledgeTree).mockResolvedValue(knowledgeTree);
    vi.mocked(analyticsService.listAnswerRecordsByLecture).mockResolvedValue([]);
    vi.mocked(analyticsService.saveAnswerRecord).mockResolvedValue(null);
    vi.mocked(analyticsService.batchSaveAnswerRecords).mockResolvedValue([]);
    vi.mocked(lectureService.updateLecture).mockResolvedValue(lecture);
    vi.mocked(lectureService.duplicateLecture).mockResolvedValue({ ...lecture, id: "lecture-copy" });
    documentMocks.downloadLectureDocxVariants.mockResolvedValue(undefined);
    vi.mocked(lessonCoursewareService.getCoursewareBySource).mockResolvedValue(null);
    vi.mocked(lessonCoursewareService.createFromLecture).mockResolvedValue({ id: "lesson-courseware-1" } as any);
    basketMocks.listBaskets.mockResolvedValue([]);
    basketMocks.addQuestion.mockResolvedValue(undefined);
    basketMocks.removeQuestion.mockResolvedValue(undefined);
  });

  it("edits and persists decomposed lecture document metadata from preview", async () => {
    renderPage();
    await screen.findByText("预览：函数专题讲义_2026（拆解版）");

    fireEvent.click(screen.getByRole("button", { name: "编辑文档属性" }));
    expect(screen.getByRole("heading", { name: "编辑讲义属性" })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("文档名"), { target: { value: "函数专题讲义（修订）" } });
    fireEvent.change(screen.getByLabelText("年级"), { target: { value: "高二" } });
    fireEvent.change(screen.getByLabelText("学年"), { target: { value: "2027-2028" } });
    fireEvent.change(screen.getByLabelText("学期"), { target: { value: "下学期" } });
    const chapterRow = (await screen.findByText("函数章节")).parentElement;
    expect(chapterRow).not.toBeNull();
    fireEvent.click(chapterRow!.querySelector("button")!);
    fireEvent.click(screen.getByRole("button", { name: "保存文档属性" }));

    await waitFor(() => {
      expect(lectureService.updateLecture).toHaveBeenCalledWith(lecture.id, {
        title: "函数专题讲义（修订）",
        grade: "高二",
        schoolYear: "2027-2028",
        semester: "下学期",
        chapterIds: ["chapter-1"],
      });
    });
  });

  it("renders a synchronized two-column preview with question metadata", async () => {
    const { container } = renderPage();

    expect(await screen.findByText("预览：函数专题讲义_2026（拆解版）")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "编辑讲义" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "制作答题卡" })).toBeInTheDocument();
    expect(screen.getByText("讲义属性")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "栏目" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /整份讲义/ })).not.toBeInTheDocument();
    expect(screen.getByText("使用对象")).toBeInTheDocument();
    expect(screen.getByText("高一（1）班")).toBeInTheDocument();
    expect(screen.queryByLabelText("选择学生")).not.toBeInTheDocument();
    expect(screen.getByLabelText("学生")).toHaveTextContent("张同学 · 20260001");
    expect(screen.getByLabelText("纸张大小")).toHaveValue("A4");

    const paper = screen.getByTestId("lecture-paper");
    expect(paper).toHaveClass("lecture-preview-grid");
    expect(within(paper).queryByText("函数专题讲义_2026（拆解版）")).not.toBeInTheDocument();
    const documentTitle = within(paper).getByText("函数专题讲义");
    expect(documentTitle.closest(".text-center")).not.toBeNull();
    expect(within(paper).queryByText("单调性")).not.toBeInTheDocument();
    expect(within(paper).getByText(/在给定区间内判断函数的增减/)).toBeInTheDocument();
    const previewControls = screen.getByTestId("lecture-preview-details");
    expect(previewControls).toHaveTextContent("题目属性");
    expect(previewControls).toHaveClass("preview-sticky-controls");
    expect(previewControls.parentElement).toHaveClass("preview-sticky-rail");
    const previewShell = paper.closest(".preview-sticky-shell");
    expect(previewShell).not.toBeNull();
    expect(paper.querySelector(".preview-sticky-spacer")).not.toBeNull();
    const questionDetails = screen.getByTestId("lecture-question-details-1");
    expect(questionDetails).toHaveTextContent("第 1 题");
    expect(questionDetails).toHaveTextContent("单选");
    expect(questionDetails).toHaveTextContent("较易");
    expect(questionDetails).toHaveTextContent("使用次数3 次");
    expect(questionDetails.parentElement).toHaveClass("lecture-preview-right");

    fireEvent.change(screen.getByLabelText("纸张大小"), { target: { value: "8K" } });
    expect(previewShell).toHaveClass("preview-sticky-shell-wide");
    expect(paper).toHaveClass("lecture-preview-8k");

    await waitFor(() => {
      expect(container.querySelectorAll(".katex").length).toBeGreaterThanOrEqual(4);
    });
  });

  it("shows and hides all answers from the preview actions", async () => {
    renderPage();

    const paper = await screen.findByTestId("lecture-paper");
    expect(within(paper).queryByText("解析：")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "一键显示答案" }));
    expect(within(paper).getByText("解析：")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "收起全部答案" })).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("button", { name: "收起全部答案" }));
    expect(within(paper).queryByText("解析：")).not.toBeInTheDocument();
  });

  it("reduces choice options to two columns when four columns wrap and removes option borders", async () => {
    const restoreMeasurements = mockOptionWrapping(new Set([4]));
    try {
      const { container } = renderPage();

      await screen.findByText("预览：函数专题讲义_2026（拆解版）");
      const optionGrid = screen.getByTestId("lecture-question-options");
      await waitFor(() => expect(optionGrid).toHaveClass("grid-cols-2"));
      expect(optionGrid).not.toHaveClass("grid-cols-4");
      expect(Array.from(optionGrid.children)).toHaveLength(4);
      for (const option of Array.from(optionGrid.children)) {
        expect(option).not.toHaveClass("border", "border-ink-100");
      }
      expect(container.querySelectorAll('[data-lecture-preview-option-content]')).toHaveLength(4);
    } finally {
      restoreMeasurements();
    }
  });

  it("reduces choice options to one column when they still wrap in two columns", async () => {
    const restoreMeasurements = mockOptionWrapping(new Set([4, 2]));
    try {
      renderPage();

      await screen.findByText("预览：函数专题讲义_2026（拆解版）");
      const optionGrid = screen.getByTestId("lecture-question-options");
      await waitFor(() => expect(optionGrid).toHaveClass("grid-cols-1"));
      expect(optionGrid).not.toHaveClass("grid-cols-2", "grid-cols-4");
    } finally {
      restoreMeasurements();
    }
  });

  it("downloads the preview and creates an editable lecture copy", async () => {
    renderPage();

    await screen.findByText("预览：函数专题讲义_2026（拆解版）");
    fireEvent.click(screen.getByRole("button", { name: "下载" }));
    expect(screen.getByText("学生用卷（无答案）")).toBeInTheDocument();
    expect(screen.getByText("教师用卷（含答案解析）")).toBeInTheDocument();
    expect(screen.getByText("普通用卷（答案解析在最后）")).toBeInTheDocument();
    expect(screen.getByText("纯答案版")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("普通用卷（答案解析在最后）"));
    fireEvent.click(screen.getByRole("button", { name: "下载 2 个版本" }));
    await waitFor(() => {
      expect(documentMocks.downloadLectureDocxVariants).toHaveBeenCalledWith(
        lecture,
        { [question.id]: question },
        ["teacher", "normal"],
      );
    });

    fireEvent.click(screen.getByRole("button", { name: "创建副本" }));
    await waitFor(() => {
      expect(lectureService.duplicateLecture).toHaveBeenCalledWith(lecture.id);
    });
    expect(await screen.findByText("讲义编辑页")).toBeInTheDocument();
  });

  it("keeps extracted lecture structure preview-only while allowing question property edits", async () => {
    vi.mocked(lectureService.getLecture).mockResolvedValue({
      ...lecture,
      isExtractCopy: true,
      sourceResourceId: "lecture-source-1",
    });

    renderPage();

    await screen.findByText("预览：函数专题讲义_2026（拆解版）");
    expect(screen.queryByRole("button", { name: "编辑讲义" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "编辑第 1 题属性" })).toBeInTheDocument();
  });

  it("keeps the source question label in an extracted lecture preview", async () => {
    vi.mocked(lectureService.getLecture).mockResolvedValue({
      ...lecture,
      isExtractCopy: true,
      sourceResourceId: "lecture-source-1",
      sections: lecture.sections.map((section) => ({
        ...section,
        children: section.children.map((child) => (
          child.type === "question" ? { ...child, customLabel: "例1" } : child
        )),
      })),
    });

    renderPage();

    await screen.findByText("预览：函数专题讲义_2026（拆解版）");
    expect(screen.getByText("例1")).toBeInTheDocument();
    expect(screen.queryByText("1.")).not.toBeInTheDocument();
  });

  it("toggles answer and analysis by clicking the question stem", async () => {
    renderPage();
    await screen.findByText("预览：函数专题讲义_2026（拆解版）");

    const questionStem = await screen.findByRole("button", { name: /显示答案与解析/ });
    const questionDetails = screen.getByTestId("lecture-question-details-1");
    expect(questionDetails).toHaveTextContent("较易");
    expect(questionDetails).toHaveTextContent("单选");
    expect(screen.queryByText("展开答案与解析")).not.toBeInTheDocument();
    expect(screen.queryByText("答案：")).not.toBeInTheDocument();

    const correctOption = screen.getByText("B.").parentElement!;
    expect(correctOption).not.toHaveClass("border");

    fireEvent.click(questionStem);

    expect(screen.getByText("答案：")).toBeInTheDocument();
    expect(screen.getByText("解析：")).toBeInTheDocument();
    expect(questionStem).toHaveAttribute("aria-expanded", "true");
    expect(correctOption).not.toHaveClass("border");
    expect(correctOption).toHaveClass("bg-emerald-50/40");

    fireEvent.click(questionStem);
    await waitFor(() => {
      expect(screen.queryByText("答案：")).not.toBeInTheDocument();
    });
  });

  it("edits a question's properties from preview", async () => {
    renderPage();
    await screen.findByText("预览：函数专题讲义_2026（拆解版）");

    fireEvent.click(screen.getByRole("button", { name: "编辑第 1 题属性" }));
    expect(screen.getByRole("heading", { name: "编辑题目属性" })).toBeInTheDocument();
    expect(screen.getByText("章节目录")).toBeInTheDocument();
    expect(screen.getByText("知识点目录")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("题型"), { target: { value: "essay" } });
    fireEvent.change(screen.getByLabelText("难度"), { target: { value: "4" } });
    fireEvent.change(screen.getByLabelText("推荐程度"), { target: { value: "5" } });
    fireEvent.change(screen.getByLabelText("学期"), { target: { value: "下学期" } });

    const chapterRow = screen.getByText("函数章节").parentElement;
    const knowledgeRow = screen.getByText("函数单调性").parentElement;
    expect(chapterRow).not.toBeNull();
    expect(knowledgeRow).not.toBeNull();
    fireEvent.click(chapterRow!.querySelector("button")!);
    fireEvent.click(knowledgeRow!.querySelector("button")!);
    fireEvent.click(screen.getByRole("button", { name: "保存属性" }));

    await waitFor(() => {
      expect(questionService.updateQuestion).toHaveBeenCalledWith(question.id, {
        type: "essay",
        difficulty: 4,
        recommendation: 5,
        grade: "高一",
        schoolYear: "2026-2027",
        semester: "下学期",
        category: "",
        sourceType: "",
        chapterIds: ["chapter-1"],
        knowledgePointIds: ["knowledge-point-1"],
      });
    });
    const details = screen.getByTestId("lecture-question-details-1");
    expect(details).toHaveTextContent("解答");
    expect(details).toHaveTextContent("较难");
    expect(details).toHaveTextContent("5 / 5");
    expect(details).toHaveTextContent("1 项");
  });

  it("edits document usage by class only", async () => {
    renderPage();
    await screen.findByText("预览：函数专题讲义_2026（拆解版）");

    fireEvent.click(screen.getByRole("button", { name: /高一（1）班/ }));
    expect(screen.getByRole("heading", { name: "添加使用对象" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox")).toBeChecked();
    expect(screen.queryByText("李同学")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: /确定（0 个班级）/ }));
    await waitFor(() => {
      expect(lectureService.updateLecture).toHaveBeenCalledWith(lecture.id, {
        classIds: [],
        studentIds: [],
      });
    });
  });

  it("shows and adds question remarks in the answer-status section", async () => {
    const legacyQuestion = { ...question, remark: "讲义已有备注" } as Question;
    const addedRemark = {
      id: "remark-added",
      content: "讲义新备注",
      createdAt: "2026-08-01T00:00:00.000Z",
      updatedAt: "2026-08-01T00:00:00.000Z",
    };
    vi.mocked(questionService.getQuestion)
      .mockResolvedValueOnce(legacyQuestion)
      .mockResolvedValue({
        ...legacyQuestion,
        remark: addedRemark.content,
        remarks: [
          {
            id: "remark-legacy",
            content: legacyQuestion.remark,
            createdAt: legacyQuestion.updatedAt,
            updatedAt: legacyQuestion.updatedAt,
          },
          addedRemark,
        ],
      });
    vi.mocked(questionService.addRemark).mockResolvedValue(addedRemark);

    renderPage();
    const questionDetails = await screen.findByTestId("lecture-question-details-1");
    expect(within(questionDetails).getAllByText("讲义已有备注").length).toBeGreaterThan(0);

    fireEvent.click(within(questionDetails).getByRole("button", { name: "添加备注" }));
    fireEvent.change(within(questionDetails).getByLabelText("新增题目备注"), {
      target: { value: "讲义新备注" },
    });
    fireEvent.click(within(questionDetails).getByRole("button", { name: "添加" }));

    await waitFor(() => {
      expect(questionService.addRemark).toHaveBeenCalledWith(question.id, "讲义新备注");
      expect(within(questionDetails).getAllByText("讲义新备注").length).toBeGreaterThan(0);
    });
  });

  it("shows and updates the only student's existing answer without selecting the student", async () => {
    vi.mocked(analyticsService.listAnswerRecordsByLecture).mockResolvedValue([{
      id: "answer-1",
      studentId: classStudent.id,
      questionId: question.id,
      lectureId: lecture.id,
      isCorrect: false,
      score: "wrong",
      source: "manual",
      answeredAt: "2026-08-20T02:00:00.000Z",
    }]);

    renderPage();
    await screen.findByText("预览：函数专题讲义_2026（拆解版）");

    expect(screen.queryByLabelText("选择学生")).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText("答题情况")).toHaveValue("wrong"));
    fireEvent.change(screen.getByLabelText("答题情况"), { target: { value: "correct" } });

    await waitFor(() => {
      expect(analyticsService.saveAnswerRecord).toHaveBeenCalledWith({
        studentId: classStudent.id,
        questionId: question.id,
        lectureId: lecture.id,
        score: "correct",
        source: "manual",
      });
    });
  });

  it("shows existing answers in a toggleable roster when multiple students use the lecture", async () => {
    vi.mocked(classService.listStudentsByClass).mockResolvedValue([classStudent, explicitStudent]);
    vi.mocked(analyticsService.listAnswerRecordsByLecture).mockResolvedValue([{
      id: "answer-1",
      studentId: classStudent.id,
      questionId: question.id,
      lectureId: lecture.id,
      isCorrect: false,
      score: "partial",
      source: "manual",
      answeredAt: "2026-08-20T02:00:00.000Z",
    }]);

    renderPage();

    const answeredList = await screen.findByTestId("answered-student-list");
    expect(screen.getByLabelText("选择学生")).toBeInTheDocument();
    expect(answeredList).toHaveTextContent("张同学 · 20260001");
    expect(answeredList).toHaveTextContent("半对");
    expect(answeredList).not.toHaveTextContent("李同学");

    fireEvent.click(within(answeredList).getByRole("button", { name: "查看张同学答题情况" }));
    expect(screen.getByLabelText("选择学生")).toHaveValue(classStudent.id);
    expect(screen.getByLabelText("答题情况")).toHaveValue("partial");

    fireEvent.click(screen.getByRole("button", { name: "显示已答题名单" }));
    expect(screen.queryByTestId("answered-student-list")).not.toBeInTheDocument();
  });

  it("controls which per-question sidebar sections are visible", async () => {
    renderPage();
    await screen.findByTestId("lecture-question-details-1");

    const propertiesToggle = screen.getByRole("button", { name: "题目属性" });
    const answerToggle = screen.getByRole("button", { name: "答题情况" });
    const answeredListToggle = screen.getByRole("button", { name: "显示已答题名单" });
    const basketToggle = screen.getByRole("button", { name: "添加资源篮" });
    expect(propertiesToggle).toHaveAttribute("aria-pressed", "true");
    expect(answerToggle).toHaveAttribute("aria-pressed", "true");
    expect(answeredListToggle).toHaveAttribute("aria-pressed", "true");
    expect(basketToggle).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(answerToggle);
    expect(screen.queryByLabelText("选择学生")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "全部设为使用" })).not.toBeInTheDocument();

    fireEvent.click(propertiesToggle);
    expect(screen.queryByTestId("lecture-question-properties-1")).not.toBeInTheDocument();

    fireEvent.click(basketToggle);
    expect(screen.queryByTestId("lecture-question-details-1")).not.toBeInTheDocument();
  });

  it("adds a lecture question to the default basket from the preview sidebar", async () => {
    basketMocks.listBaskets.mockResolvedValue([{
      id: "basket-default",
      teacherId: teacher.id,
      name: "默认资源篮",
      isDefault: true,
      questionIds: [],
      materialIds: [],
      createdAt: "2026-08-01T00:00:00.000Z",
      updatedAt: "2026-08-01T00:00:00.000Z",
    }]);

    renderPage();

    const addButton = await screen.findByRole("button", { name: "加入试题篮" });
    await waitFor(() => expect(addButton).toBeEnabled());
    fireEvent.click(addButton);

    await waitFor(() => {
      expect(basketMocks.addQuestion).toHaveBeenCalledWith("basket-default", question.id);
    });
  });

  it("sends a previewed lecture to my courseware and opens the editor", async () => {
    renderPage();

    const sendButton = await screen.findByRole("button", { name: "发送到我的课件" });
    await waitFor(() => expect(sendButton).toBeEnabled());
    fireEvent.click(sendButton);

    await waitFor(() => {
      expect(lessonCoursewareService.createFromLecture).toHaveBeenCalledWith(
        teacher.id,
        teacher.schoolId,
        lecture.id,
      );
    });
    expect(await screen.findByText("课件编辑页")).toBeInTheDocument();
  });

  it("opens an existing lecture courseware in preview without creating another", async () => {
    vi.mocked(lessonCoursewareService.getCoursewareBySource).mockResolvedValue({
      id: "linked-lesson-courseware",
    } as any);
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "课件" }));

    expect(await screen.findByText("课件预览页")).toBeInTheDocument();
    expect(lessonCoursewareService.createFromLecture).not.toHaveBeenCalled();
    expect(lessonCoursewareService.getCoursewareBySource).toHaveBeenCalledWith(
      teacher.id,
      teacher.schoolId,
      "lecture",
      lecture.id,
    );
  });

});
