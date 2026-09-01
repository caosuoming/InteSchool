import { render, waitFor } from "@testing-library/react";
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
import type { Teacher, TreeNode } from "@/types";

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
  SearchableTree: () => <div>目录</div>,
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
  analyticsService: {},
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
});
