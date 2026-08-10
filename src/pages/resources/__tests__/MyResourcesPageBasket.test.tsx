import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import MyResourcesPage from "@/pages/resources/MyResourcesPage";
import { useAuthStore } from "@/stores/auth";
import { analyticsService } from "@/services/analytics";
import { basketService } from "@/services/basket";
import { classService } from "@/services/class";
import { coursewareService } from "@/services/courseware";
import { donationService } from "@/services/donation";
import { examPaperService } from "@/services/examPaper";
import { knowledgeService } from "@/services/knowledge";
import { lectureService } from "@/services/lecture";
import { materialService } from "@/services/material";
import { questionService } from "@/services/question";
import { reflectionService } from "@/services/reflection";
import type {
  AnswerRecord,
  Basket,
  Courseware,
  ExamPaper,
  Lecture,
  Material,
  Question,
  SchoolClass,
  Student,
  Teacher,
  TreeNode,
} from "@/types";

vi.mock("@/hooks/useSchoolResourceOptions", () => ({
  useSchoolResourceOptions: () => ({
    gradeOptions: [],
    schoolYearOptions: [],
    semesterOptions: [],
    defaultGrade: "",
    defaultSchoolYear: "",
    defaultSemester: "上学期",
    ready: true,
  }),
}));
vi.mock("@/hooks/useQuestionTypeOptions", () => ({
  useQuestionTypeOptions: () => ({
    options: [
      { value: "single", label: "单选题" },
      { value: "essay", label: "解答题" },
    ],
    getLabel: (value: string) => value === "single" ? "单选题" : value === "essay" ? "解答题" : value,
  }),
}));
vi.mock("@/components/ui/MathHtml", () => ({
  MathHtml: ({ children, className }: { children: string; className?: string }) => (
    <span className={className} data-math-rendered={children.includes("$") ? "true" : "false"}>
      {children}
    </span>
  ),
}));
vi.mock("@/pages/question-bank/QuestionBankPage", () => ({
  default: () => <div>题库</div>,
}));

vi.mock("@/services/question", () => ({
  questionService: { listQuestions: vi.fn() },
}));
vi.mock("@/services/examPaper", () => ({
  examPaperService: {
    listPapers: vi.fn().mockResolvedValue([]),
    createPaper: vi.fn(),
  },
}));
vi.mock("@/services/courseware", () => ({
  coursewareService: { listCoursewares: vi.fn().mockResolvedValue([]) },
}));
vi.mock("@/services/material", () => ({
  materialService: { listMaterials: vi.fn() },
}));
vi.mock("@/services/lecture", () => ({
  lectureService: {
    listLectures: vi.fn().mockResolvedValue([]),
    createLecture: vi.fn(),
  },
}));
vi.mock("@/services/lessonCourseware", () => ({
  lessonCoursewareService: { listCoursewares: vi.fn().mockResolvedValue([]) },
}));
vi.mock("@/services/share", () => ({ shareService: {} }));
vi.mock("@/services/donation", () => ({
  donationService: { listTeacherDonations: vi.fn().mockResolvedValue([]) },
}));
vi.mock("@/services/resourceFolder", () => ({
  resourceFolderService: { listFolders: vi.fn().mockResolvedValue([]) },
}));
vi.mock("@/services/knowledge", () => ({
  knowledgeService: {
    getChapterTree: vi.fn(),
    getKnowledgeTree: vi.fn(),
  },
}));
vi.mock("@/services/reflection", () => ({
  reflectionService: { listByTeacher: vi.fn().mockResolvedValue([]) },
}));
vi.mock("@/services/class", () => ({
  classService: {
    listMyClasses: vi.fn(),
    listMyStudents: vi.fn(),
  },
}));
vi.mock("@/services/analytics", () => ({
  analyticsService: {
    listAnswerRecordsByStudents: vi.fn(),
    getKnowledgeMastery: vi.fn(),
  },
}));
vi.mock("@/services/basket", () => ({
  basketService: {
    listBaskets: vi.fn(),
    getBasket: vi.fn(),
    createBasket: vi.fn(),
    updateBasket: vi.fn(),
    deleteBasket: vi.fn(),
    setDefaultBasket: vi.fn(),
    removeQuestion: vi.fn(),
    removeMaterial: vi.fn(),
  },
}));
vi.mock("@/stores/ui", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  },
}));

const emptyTree: TreeNode = {
  id: "root",
  name: "全部",
  type: "chapter",
  count: 0,
  children: [],
};

const classOne: SchoolClass = {
  id: "class-1",
  type: "school",
  schoolId: "school-1",
  name: "高一（1）班",
  grade: "高一",
  studentCount: 1,
  createdBy: "teacher-1",
  createdAt: "2026-07-01T00:00:00.000Z",
};

const studentOne: Student = {
  id: "student-1",
  name: "张同学",
  studentNo: "20260001",
  classId: classOne.id,
  schoolId: "school-1",
  grade: "高一",
  status: "active",
};

const createdBasket: Basket = {
  id: "basket-1",
  teacherId: "teacher-1",
  name: "复习资料",
  questionIds: [],
  materialIds: [],
  classIds: [classOne.id],
  studentIds: [],
  createdAt: "2026-07-30T00:00:00.000Z",
  updatedAt: "2026-07-30T00:00:00.000Z",
};

const basketQuestion: Question = {
  id: "question-1",
  teacherId: "teacher-1",
  schoolId: "school-1",
  type: "single",
  stem: "已知 $x^2=4$，求正数 $x$。",
  options: ["1", "2", "3", "4"],
  answer: "B",
  analysis: "$x=2$。",
  summary: "平方根",
  chapterIds: ["chapter-1"],
  knowledgePointIds: ["kp-1"],
  grade: "高一",
  schoolYear: "2026-2027",
  semester: "上学期",
  difficulty: 2,
  recommendation: 4,
  usageCount: 1,
  remark: "",
  isShared: false,
  hiddenByExamIds: [],
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-01T00:00:00.000Z",
};

const ggbCourseware: Courseware = {
  id: "courseware-ggb",
  teacherId: "teacher-1",
  schoolId: "school-1",
  title: "函数图像",
  chapterIds: [],
  knowledgePointIds: [],
  grade: "高一",
  schoolYear: "2026-2027",
  semester: "上学期",
  type: "ggb",
  content: "GeoGebra 课件",
  tags: [],
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-01T00:00:00.000Z",
};

const pdfCourseware: Courseware = {
  ...ggbCourseware,
  id: "courseware-pdf",
  title: "函数讲义 PDF",
  type: "pdf",
  content: "PDF 课件",
};

const basketMaterial: Material = {
  id: "material-1",
  teacherId: "teacher-1",
  schoolId: "school-1",
  title: "平方根知识块",
  chapterIds: ["chapter-1"],
  knowledgePointIds: ["kp-1"],
  grade: "高一",
  schoolYear: "2026-2027",
  semester: "上学期",
  type: "knowledgeBlock",
  content: "平方根的定义与性质。",
  tags: [],
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-01T00:00:00.000Z",
};

const answerRecord: AnswerRecord = {
  id: "answer-1",
  studentId: studentOne.id,
  questionId: basketQuestion.id,
  lectureId: "lecture-1",
  isCorrect: false,
  score: "wrong",
  source: "manual",
  answeredAt: "2026-07-29T08:30:00.000Z",
};

describe("MyResourcesPage resource basket", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({
      teacher: {
        id: "teacher-1",
        schoolId: "school-1",
      } as Teacher,
      loading: false,
      error: null,
    });

    vi.mocked(knowledgeService.getChapterTree).mockResolvedValue(emptyTree);
    vi.mocked(knowledgeService.getKnowledgeTree).mockResolvedValue({
      ...emptyTree,
      type: "knowledge",
      children: [{
        id: "kp-1",
        name: "平方根",
        type: "knowledge",
        count: 1,
        children: [],
      }],
    });
    vi.mocked(classService.listMyClasses).mockResolvedValue([classOne]);
    vi.mocked(classService.listMyStudents).mockResolvedValue([studentOne]);
    vi.mocked(questionService.listQuestions).mockResolvedValue([]);
    vi.mocked(coursewareService.listCoursewares).mockResolvedValue([]);
    vi.mocked(materialService.listMaterials).mockResolvedValue([]);
    vi.mocked(donationService.listTeacherDonations).mockResolvedValue([]);
    vi.mocked(reflectionService.listByTeacher).mockResolvedValue([]);
    vi.mocked(analyticsService.listAnswerRecordsByStudents).mockResolvedValue([]);
    vi.mocked(analyticsService.getKnowledgeMastery).mockResolvedValue([]);
    vi.mocked(basketService.listBaskets).mockResolvedValue([]);
    vi.mocked(basketService.getBasket).mockResolvedValue(null);
  });

  it("creates a basket with its selected class audience", async () => {
    let resolveCreate!: (basket: Basket) => void;
    vi.mocked(basketService.createBasket).mockImplementation(
      () => new Promise((resolve) => { resolveCreate = resolve; }),
    );

    render(
      <MemoryRouter>
        <MyResourcesPage initialTab="basket" />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByTitle("新建资源篮"));

    const nameInput = screen.getByLabelText("资源篮名称");
    const createButton = screen.getByRole("button", { name: "创建" });

    expect(createButton).toBeDisabled();
    fireEvent.change(nameInput, { target: { value: "复习资料" } });
    fireEvent.click(await screen.findByRole("button", { name: "选择班级 高一（1）班" }));
    expect(createButton).toBeEnabled();

    fireEvent.click(createButton);

    expect(createButton).toBeDisabled();
    expect(createButton.querySelector(".animate-spin")).toBeInTheDocument();
    expect(basketService.createBasket).toHaveBeenCalledWith(
      "teacher-1",
      "复习资料",
      undefined,
      false,
      { classIds: [classOne.id], studentIds: [] },
    );

    await act(async () => {
      resolveCreate(createdBasket);
    });

    await waitFor(() => {
      expect(screen.queryByRole("heading", { name: "新建资源篮" })).not.toBeInTheDocument();
    });
  });

  it("shows basket questions, usage dates, mastery, and rendered formulas for the audience", async () => {
    const populatedBasket: Basket = {
      ...createdBasket,
      name: "函数训练",
      questionIds: [basketQuestion.id],
    };
    vi.mocked(basketService.listBaskets).mockResolvedValue([populatedBasket]);
    vi.mocked(basketService.getBasket).mockResolvedValue(populatedBasket);
    vi.mocked(questionService.listQuestions).mockImplementation(async (filter) =>
      filter.ids?.includes(basketQuestion.id) ? [basketQuestion] : [],
    );
    vi.mocked(analyticsService.listAnswerRecordsByStudents).mockResolvedValue([answerRecord]);
    vi.mocked(analyticsService.getKnowledgeMastery).mockResolvedValue([{
      knowledgePointId: "kp-1",
      knowledgePointName: "平方根",
      totalAttempts: 4,
      correctCount: 1,
      partialCount: 0,
      wrongCount: 3,
      correctRate: 0.25,
      masteryLevel: "weak",
    }]);

    const { container } = render(
      <MemoryRouter>
        <MyResourcesPage initialTab="basket" />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByText("函数训练"));

    expect(await screen.findByText("所选学生已使用")).toBeInTheDocument();
    expect(screen.getByText(/使用时间：.*2026/)).toBeInTheDocument();
    expect(screen.getByText("薄弱 25%")).toBeInTheDocument();
    expect(screen.getByText("平方根")).toBeInTheDocument();
    expect(container.querySelector('[data-math-rendered="true"]')).not.toBeNull();
    expect(screen.getByTestId("basket-question-list")).toHaveClass("grid", "grid-cols-1");
    expect(screen.getByTestId(`basket-question-options-${basketQuestion.id}`)).toHaveClass(
      "grid",
      "grid-cols-4",
      "gap-x-4",
    );

    expect(screen.queryByText("答案")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTitle("查看完整答案、解析、总结和板书"));
    expect(screen.getByText("答案")).toBeInTheDocument();
    expect(screen.getByText("解析")).toBeInTheDocument();
    expect(screen.getByText("总结")).toBeInTheDocument();
    expect(screen.getByText("B")).toBeInTheDocument();

    const singleTypeFilter = screen.getByRole("checkbox", { name: "单选题" });
    expect(singleTypeFilter).toBeChecked();
    fireEvent.click(singleTypeFilter);
    expect(await screen.findByText("题目（0/1）")).toBeInTheDocument();
    expect(screen.queryByTitle("查看完整答案、解析、总结和板书")).not.toBeInTheDocument();
    fireEvent.click(singleTypeFilter);
    expect(await screen.findByTitle("查看完整答案、解析、总结和板书")).toBeInTheDocument();

    expect(analyticsService.listAnswerRecordsByStudents).toHaveBeenCalledWith([studentOne.id]);
    expect(analyticsService.getKnowledgeMastery).toHaveBeenCalledWith([studentOne.id], "school-1");
  });

  it("removes questions and materials from the selected basket", async () => {
    const populatedBasket: Basket = {
      ...createdBasket,
      questionIds: [basketQuestion.id],
      materialIds: [basketMaterial.id],
    };
    vi.mocked(basketService.listBaskets).mockResolvedValue([populatedBasket]);
    vi.mocked(basketService.getBasket).mockResolvedValue(populatedBasket);
    vi.mocked(basketService.removeQuestion).mockResolvedValue();
    vi.mocked(basketService.removeMaterial).mockResolvedValue();
    vi.mocked(questionService.listQuestions).mockImplementation(async (filter) =>
      filter.ids?.includes(basketQuestion.id) ? [basketQuestion] : [],
    );
    vi.mocked(materialService.listMaterials).mockImplementation(async (filter) =>
      filter.ids?.includes(basketMaterial.id) ? [basketMaterial] : [],
    );

    render(
      <MemoryRouter>
        <MyResourcesPage initialTab="basket" />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByText("复习资料"));

    fireEvent.click(await screen.findByRole("button", { name: "从资源篮移除题目" }));
    await waitFor(() => {
      expect(basketService.removeQuestion).toHaveBeenCalledWith(populatedBasket.id, basketQuestion.id);
    });
    expect(screen.queryByTitle("查看完整答案、解析、总结和板书")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "从资源篮移除素材" }));
    await waitFor(() => {
      expect(basketService.removeMaterial).toHaveBeenCalledWith(populatedBasket.id, basketMaterial.id);
    });
    expect(await screen.findByText("资源篮为空")).toBeInTheDocument();
  });

  it("only shows the basket action for GeoGebra courseware", async () => {
    vi.mocked(coursewareService.listCoursewares).mockResolvedValue([ggbCourseware, pdfCourseware]);
    vi.mocked(basketService.listBaskets).mockResolvedValue([{ ...createdBasket, isDefault: true }]);

    render(
      <MemoryRouter>
        <MyResourcesPage initialTab="courseware" />
      </MemoryRouter>,
    );

    expect(await screen.findByText(ggbCourseware.title)).toBeInTheDocument();
    expect(screen.getByText(pdfCourseware.title)).toBeInTheDocument();
    expect(await screen.findAllByTitle(`点击加入「${createdBasket.name}」`)).toHaveLength(1);
    expect(screen.getAllByTitle("加入文件夹")).toHaveLength(2);
  });

  it("asks to remove referenced questions after generating a lecture and removes them when confirmed", async () => {
    const populatedBasket: Basket = {
      ...createdBasket,
      questionIds: [basketQuestion.id],
    };
    vi.mocked(basketService.listBaskets).mockResolvedValue([populatedBasket]);
    vi.mocked(basketService.getBasket).mockResolvedValue(populatedBasket);
    vi.mocked(questionService.listQuestions).mockImplementation(async (filter) =>
      filter.ids?.includes(basketQuestion.id) ? [basketQuestion] : [],
    );
    vi.mocked(lectureService.createLecture).mockImplementation(async (teacherId, schoolId, input) => ({
      ...input,
      id: "lecture-created",
      teacherId,
      schoolId,
      version: 1,
      status: "draft",
      createdAt: "2026-08-06T00:00:00.000Z",
      updatedAt: "2026-08-06T00:00:00.000Z",
    } satisfies Lecture));
    vi.mocked(basketService.removeQuestion).mockResolvedValue();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

    render(
      <MemoryRouter>
        <MyResourcesPage initialTab="basket" />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByText(createdBasket.name));
    fireEvent.click(await screen.findByRole("checkbox", { name: `选择题目：${basketQuestion.stem}` }));
    fireEvent.click(screen.getByRole("button", { name: "生成讲义" }));

    await waitFor(() => {
      expect(lectureService.createLecture).toHaveBeenCalledOnce();
      expect(confirmSpy).toHaveBeenCalledWith("是否移除已引用题目？");
      expect(basketService.removeQuestion).toHaveBeenCalledWith(populatedBasket.id, basketQuestion.id);
    });
    confirmSpy.mockRestore();
  });

  it("asks about removal after generating an exam paper and keeps questions when declined", async () => {
    const populatedBasket: Basket = {
      ...createdBasket,
      questionIds: [basketQuestion.id],
    };
    vi.mocked(basketService.listBaskets).mockResolvedValue([populatedBasket]);
    vi.mocked(basketService.getBasket).mockResolvedValue(populatedBasket);
    vi.mocked(questionService.listQuestions).mockImplementation(async (filter) =>
      filter.ids?.includes(basketQuestion.id) ? [basketQuestion] : [],
    );
    vi.mocked(examPaperService.createPaper).mockImplementation(async (teacherId, schoolId, input) => ({
      ...input,
      id: "exam-created",
      teacherId,
      schoolId,
      status: input.status || "draft",
      createdAt: "2026-08-06T00:00:00.000Z",
      updatedAt: "2026-08-06T00:00:00.000Z",
    } satisfies ExamPaper));
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);

    render(
      <MemoryRouter>
        <MyResourcesPage initialTab="basket" />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByText(createdBasket.name));
    fireEvent.click(await screen.findByRole("checkbox", { name: `选择题目：${basketQuestion.stem}` }));
    fireEvent.click(screen.getByRole("button", { name: "生成试卷" }));

    await waitFor(() => {
      expect(examPaperService.createPaper).toHaveBeenCalledOnce();
      expect(confirmSpy).toHaveBeenCalledWith("是否移除已引用题目？");
    });
    expect(basketService.removeQuestion).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it("updates the audience from an opened basket", async () => {
    vi.mocked(basketService.listBaskets).mockResolvedValue([createdBasket]);
    vi.mocked(basketService.getBasket).mockResolvedValue(createdBasket);
    vi.mocked(basketService.updateBasket).mockResolvedValue({
      ...createdBasket,
      classIds: [],
      studentIds: [studentOne.id],
    });

    render(
      <MemoryRouter>
        <MyResourcesPage initialTab="basket" />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByText("复习资料"));
    fireEvent.click(await screen.findByRole("button", { name: "调整使用对象" }));
    fireEvent.click(screen.getByRole("button", { name: "清空选择" }));
    fireEvent.click(screen.getByRole("checkbox", { name: /张同学/ }));
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => {
      expect(basketService.updateBasket).toHaveBeenCalledWith(createdBasket.id, {
        classIds: [],
        studentIds: [studentOne.id],
      });
    });
  });
});
