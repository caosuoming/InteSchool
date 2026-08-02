import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QuestionEditor } from "@/components/question/QuestionEditor";
import { knowledgeService } from "@/services/knowledge";
import { useAuthStore } from "@/stores/auth";
import type { Chapter, KnowledgePoint, Question, Teacher, TreeNode } from "@/types";

vi.mock("@/hooks/useSchoolResourceOptions", () => ({
  includeCurrentOption: (options: unknown[]) => options,
  useSchoolResourceOptions: () => ({
    gradeOptions: [{ value: "高一", label: "高一" }],
    schoolYearOptions: [{ value: "2026-2027", label: "2026-2027" }],
    semesterOptions: [{ value: "上学期", label: "上学期" }],
  }),
}));

vi.mock("@/hooks/useQuestionTypeOptions", () => ({
  includeCurrentQuestionType: (options: unknown[]) => options,
  useQuestionTypeOptions: () => ({
    options: [{ value: "single", label: "单选题" }],
  }),
}));

vi.mock("@/services/knowledge", () => ({
  knowledgeService: {
    listChapters: vi.fn(),
    listKnowledgePoints: vi.fn(),
    getChapterTree: vi.fn(),
    getKnowledgeTree: vi.fn(),
  },
}));

vi.mock("@/services/question", () => ({
  questionService: {
    updateQuestion: vi.fn(),
    findSimilarQuestions: vi.fn(),
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

const chapterTree: TreeNode = {
  id: "root",
  name: "全部章节",
  type: "chapter",
  count: 2,
  children: [
    {
      id: "chapter-functions",
      name: "第一章 函数",
      type: "chapter",
      count: 1,
      children: [
        {
          id: "chapter-quadratic",
          name: "二次函数",
          type: "chapter",
          count: 1,
          children: [],
        },
      ],
    },
    {
      id: "chapter-geometry",
      name: "第二章 几何",
      type: "chapter",
      count: 1,
      children: [],
    },
  ],
};

const knowledgeTree: TreeNode = {
  id: "root",
  name: "全部知识点",
  type: "knowledge",
  count: 2,
  children: [
    {
      id: "knowledge-monotonicity",
      name: "函数单调性",
      type: "knowledge",
      count: 1,
      children: [],
    },
    {
      id: "knowledge-vector",
      name: "平面向量",
      type: "knowledge",
      count: 1,
      children: [],
    },
  ],
};

const chapters: Chapter[] = [
  {
    id: "chapter-functions",
    schoolId: "school-1",
    parentId: null,
    name: "第一章 函数",
    order: 1,
    level: 0,
    questionCount: 1,
  },
];

const knowledgePoints: KnowledgePoint[] = [
  {
    id: "knowledge-monotonicity",
    schoolId: "school-1",
    parentId: null,
    chapterId: "chapter-functions",
    name: "函数单调性",
    order: 1,
    level: 0,
    questionCount: 1,
  },
];

const question: Question = {
  id: "question-1",
  teacherId: "teacher-1",
  schoolId: "school-1",
  type: "single",
  stem: "已知函数，求其最值。",
  options: ["1", "2", "3", "4"],
  answer: "B",
  analysis: "利用配方法求解。",
  summary: "注意定义域。",
  chapterIds: [],
  knowledgePointIds: [],
  difficulty: 3,
  recommendation: 4,
  usageCount: 0,
  remark: "",
  sourceType: "manual",
  category: "practice",
  grade: "高一",
  schoolYear: "2026-2027",
  semester: "上学期",
  isShared: false,
  hiddenByExamIds: [],
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
};

describe("QuestionEditor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({
      teacher: { id: "teacher-1", schoolId: "school-1" } as Teacher,
      loading: false,
      error: null,
    });
    vi.mocked(knowledgeService.listChapters).mockResolvedValue(chapters);
    vi.mocked(knowledgeService.listKnowledgePoints).mockResolvedValue(knowledgePoints);
    vi.mocked(knowledgeService.getChapterTree).mockResolvedValue(chapterTree);
    vi.mocked(knowledgeService.getKnowledgeTree).mockResolvedValue(knowledgeTree);
  });

  it("collapses detail fields by default and expands them with one click", async () => {
    render(<QuestionEditor question={question} onSaved={vi.fn()} onCancel={vi.fn()} />);

    expect(screen.queryByPlaceholderText(/请输入答案/)).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/请输入解析/)).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/请输入本题总结/)).not.toBeInTheDocument();

    const stemSection = screen.getByTestId("question-stem-section");
    expect(stemSection).toHaveClass("sticky", "top-0");

    fireEvent.click(screen.getByRole("button", { name: "一键展开答案、解析与总结" }));

    expect(screen.getByPlaceholderText(/请输入答案/)).toBeVisible();
    expect(screen.getByPlaceholderText(/请输入解析/)).toBeVisible();
    expect(screen.getByPlaceholderText(/请输入本题总结/)).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "收起答案" }));
    expect(screen.queryByPlaceholderText(/请输入答案/)).not.toBeInTheDocument();
  });

  it("searches chapter and knowledge directories with highlighted paths", async () => {
    render(<QuestionEditor question={question} onSaved={vi.fn()} onCancel={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText("搜索章节目录...")).toBeInTheDocument();
      expect(screen.getByPlaceholderText("搜索知识点目录...")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText("搜索章节目录..."), {
      target: { value: "二次函数" },
    });

    expect(screen.getByText("第一章 函数")).toBeVisible();
    expect(screen.getByText("二次函数")).toBeVisible();
    expect(screen.queryByText("第二章 几何")).not.toBeInTheDocument();
    expect(screen.getByText("二次函数").closest('[data-search-match="true"]')).not.toBeNull();

    fireEvent.change(screen.getByPlaceholderText("搜索知识点目录..."), {
      target: { value: "单调性" },
    });

    expect(screen.getByText("函数单调性")).toBeVisible();
    expect(screen.queryByText("平面向量")).not.toBeInTheDocument();
  });
});
