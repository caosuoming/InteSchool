import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import QuestionBankPage from "@/pages/question-bank/QuestionBankPage";
import { useAuthStore } from "@/stores/auth";
import { questionService } from "@/services/question";
import { knowledgeService } from "@/services/knowledge";
import { basketService } from "@/services/basket";
import { classService } from "@/services/class";
import { prepService } from "@/services/prep";
import { quotaService } from "@/services/quota";
import { analyticsService } from "@/services/analytics";
import { useTagPrefsStore } from "@/stores/tagPrefs";
import type { Question, Teacher, TreeNode } from "@/types";

vi.mock("@/hooks/useSchoolResourceOptions", () => ({
  useSchoolResourceOptions: () => ({
    gradeOptions: [],
    schoolYearOptions: [],
    semesterOptions: [],
  }),
}));

vi.mock("@/hooks/useQuestionTypeOptions", () => ({
  useQuestionTypeOptions: () => ({
    options: [],
    getLabel: (value: string) => value,
  }),
}));

vi.mock("@/hooks/useQuestionMetadataOptions", () => ({
  useQuestionMetadataOptions: () => ({
    sourceOptions: [],
    categoryOptions: [],
    getSourceLabel: (value: string) => value,
    getCategoryLabel: (value: string) => value,
  }),
}));

vi.mock("@/components/tree/SearchableTree", () => ({
  SearchableTree: ({
    data,
    editable = false,
    onDataChange,
  }: {
    data: TreeNode;
    editable?: boolean;
    onDataChange?: (data: TreeNode) => void;
  }) => (
    <div
      data-testid={`searchable-tree-${data.type}`}
      data-editable={String(editable)}
      data-has-data-change={String(Boolean(onDataChange))}
    >
      目录
    </div>
  ),
}));

vi.mock("@/services/question", () => ({
  questionService: {
    listQuestionPage: vi.fn(),
    listQuestions: vi.fn(),
  },
}));

vi.mock("@/services/knowledge", () => ({
  knowledgeService: {
    getChapterTree: vi.fn(),
    getKnowledgeTree: vi.fn(),
    listChapters: vi.fn(),
    listKnowledgePoints: vi.fn(),
  },
}));

vi.mock("@/services/basket", () => ({
  basketService: {
    listBaskets: vi.fn(),
  },
}));

vi.mock("@/services/class", () => ({
  classService: {
    listMyClasses: vi.fn(),
    listMyStudents: vi.fn(),
  },
}));

vi.mock("@/services/analytics", () => ({
  analyticsService: {
    getSchoolQuestionStats: vi.fn(),
  },
  inferScore: vi.fn(),
}));

vi.mock("@/services/prep", () => ({
  prepService: {
    getUsedQuestionIds: vi.fn(),
  },
}));

vi.mock("@/services/lecture", () => ({
  lectureService: {
    listLectures: vi.fn(),
  },
}));

vi.mock("@/services/examPaper", () => ({
  examPaperService: {
    listPapers: vi.fn(),
  },
}));

vi.mock("@/services/quota", () => ({
  quotaService: {
    getQuota: vi.fn(),
  },
}));

const chapterTree: TreeNode = {
  id: "chapter-root",
  name: "全部章节",
  type: "chapter",
  count: 0,
  children: [],
};

const knowledgeTree: TreeNode = {
  id: "knowledge-root",
  name: "全部知识点",
  type: "knowledge",
  count: 0,
  children: [],
};

describe("QuestionBankPage personal resource scope", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({
      teacher: {
        id: "teacher-1",
        schoolId: "school-2",
      } as Teacher,
      loading: false,
      error: null,
    });

    vi.mocked(questionService.listQuestionPage).mockResolvedValue({ items: [], total: 0 });
    vi.mocked(questionService.listQuestions).mockResolvedValue([]);
    vi.mocked(knowledgeService.getChapterTree).mockResolvedValue(chapterTree);
    vi.mocked(knowledgeService.getKnowledgeTree).mockResolvedValue(knowledgeTree);
    vi.mocked(knowledgeService.listChapters).mockResolvedValue([]);
    vi.mocked(knowledgeService.listKnowledgePoints).mockResolvedValue([]);
    vi.mocked(basketService.listBaskets).mockResolvedValue([]);
    vi.mocked(classService.listMyClasses).mockResolvedValue([]);
    vi.mocked(classService.listMyStudents).mockResolvedValue([]);
    vi.mocked(prepService.getUsedQuestionIds).mockResolvedValue([]);
    vi.mocked(quotaService.getQuota).mockResolvedValue(null as never);
    vi.mocked(analyticsService.getSchoolQuestionStats).mockResolvedValue([]);
    useTagPrefsStore.setState({
      prefs: {
        order: ["type", "difficulty", "recommendation", "remark", "source", "category", "grade", "schoolYear", "usage"],
        hidden: ["source", "category", "grade", "schoolYear"],
      },
    });
  });

  it("keeps the chapter and knowledge directory trees read-only", async () => {
    render(
      <MemoryRouter>
        <QuestionBankPage />
      </MemoryRouter>,
    );

    const chapterDirectory = await screen.findByTestId("searchable-tree-chapter");
    expect(chapterDirectory).toHaveAttribute("data-editable", "false");
    expect(chapterDirectory).toHaveAttribute("data-has-data-change", "false");

    fireEvent.click(screen.getByRole("button", { name: "知识点目录" }));

    const knowledgeDirectory = await screen.findByTestId("searchable-tree-knowledge");
    expect(knowledgeDirectory).toHaveAttribute("data-editable", "false");
    expect(knowledgeDirectory).toHaveAttribute("data-has-data-change", "false");
  });

  it("queries personal questions by teacher while keeping class context on the active school", async () => {
    render(
      <MemoryRouter>
        <QuestionBankPage />
      </MemoryRouter>,
    );

    await waitFor(() => expect(questionService.listQuestionPage).toHaveBeenCalled());

    const filter = vi.mocked(questionService.listQuestionPage).mock.calls[0]?.[0];
    expect(filter).toMatchObject({ teacherId: "teacher-1" });
    expect(filter).not.toHaveProperty("schoolId");

    expect(classService.listMyClasses).toHaveBeenCalledWith("school-2", "teacher-1");
    expect(classService.listMyStudents).toHaveBeenCalledWith("school-2", "teacher-1");
  });

  it("shows active-school score rate, refreshes it after a school switch, and hides it with difficulty", async () => {
    const question: Question = {
      id: "question-shared-history",
      teacherId: "teacher-1",
      schoolId: "school-1",
      type: "short",
      stem: "函数测试题",
      answer: "42",
      analysis: "",
      chapterIds: [],
      knowledgePointIds: [],
      difficulty: 3,
      recommendation: 3,
      usageCount: 0,
      remark: "",
      isShared: false,
      hiddenByExamIds: [],
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-01T00:00:00.000Z",
    };
    vi.mocked(questionService.listQuestionPage).mockResolvedValue({ items: [question], total: 1 });
    vi.mocked(analyticsService.getSchoolQuestionStats).mockImplementation(async (schoolId) => [
      schoolId === "school-3"
        ? { questionId: question.id, scoreRate: 0.25, studentCount: 4 }
        : { questionId: question.id, scoreRate: 0.625, studentCount: 8 },
    ]);

    render(
      <MemoryRouter>
        <QuestionBankPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText(/校得分率 63%/)).toHaveTextContent("校得分率 63%（8人）");
    expect(analyticsService.getSchoolQuestionStats).toHaveBeenCalledWith("school-2", [question.id]);

    act(() => {
      useAuthStore.setState({
        teacher: {
          id: "teacher-1",
          schoolId: "school-3",
        } as Teacher,
      });
    });

    expect(await screen.findByText(/校得分率 25%/)).toHaveTextContent("校得分率 25%（4人）");
    expect(analyticsService.getSchoolQuestionStats).toHaveBeenCalledWith("school-3", [question.id]);

    act(() => {
      useTagPrefsStore.setState((state) => ({
        prefs: {
          ...state.prefs,
          hidden: [...state.prefs.hidden, "difficulty"],
        },
      }));
    });

    await waitFor(() => expect(screen.queryByText(/校得分率/)).not.toBeInTheDocument());
  });
});
