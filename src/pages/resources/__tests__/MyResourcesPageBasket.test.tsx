import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import MyResourcesPage from "@/pages/resources/MyResourcesPage";
import { useAuthStore } from "@/stores/auth";
import { basketService } from "@/services/basket";
import { knowledgeService } from "@/services/knowledge";
import type { Basket, Teacher, TreeNode } from "@/types";

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

vi.mock("@/services/question", () => ({
  questionService: { listQuestions: vi.fn().mockResolvedValue([]) },
}));
vi.mock("@/services/examPaper", () => ({
  examPaperService: { listPapers: vi.fn().mockResolvedValue([]) },
}));
vi.mock("@/services/courseware", () => ({
  coursewareService: { listCoursewares: vi.fn().mockResolvedValue([]) },
}));
vi.mock("@/services/material", () => ({
  materialService: { listMaterials: vi.fn().mockResolvedValue([]) },
}));
vi.mock("@/services/lecture", () => ({
  lectureService: { listLectures: vi.fn().mockResolvedValue([]) },
}));
vi.mock("@/services/share", () => ({ shareService: {} }));
vi.mock("@/services/donation", () => ({
  donationService: { listTeacherDonations: vi.fn().mockResolvedValue([]) },
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
vi.mock("@/services/basket", () => ({
  basketService: {
    listBaskets: vi.fn(),
    getBasket: vi.fn(),
    createBasket: vi.fn(),
    deleteBasket: vi.fn(),
    setDefaultBasket: vi.fn(),
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

const createdBasket: Basket = {
  id: "basket-1",
  teacherId: "teacher-1",
  name: "复习资料",
  questionIds: [],
  materialIds: [],
  createdAt: "2026-07-30T00:00:00.000Z",
  updatedAt: "2026-07-30T00:00:00.000Z",
};

describe("MyResourcesPage resource basket creation", () => {
  beforeEach(() => {
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
    });
    vi.mocked(basketService.listBaskets).mockResolvedValue([]);
  });

  it("keeps the create button usable until the request starts", async () => {
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
    expect(createButton).toBeEnabled();
    expect(createButton.querySelector(".animate-spin")).not.toBeInTheDocument();

    fireEvent.click(createButton);

    expect(createButton).toBeDisabled();
    expect(createButton.querySelector(".animate-spin")).toBeInTheDocument();
    expect(basketService.createBasket).toHaveBeenCalledWith("teacher-1", "复习资料");

    resolveCreate(createdBasket);

    await waitFor(() => {
      expect(screen.queryByRole("heading", { name: "新建资源篮" })).not.toBeInTheDocument();
    });
  });
});
