import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import MyResourcesPage from "@/pages/resources/MyResourcesPage";
import { useAuthStore } from "@/stores/auth";
import { basketService } from "@/services/basket";
import { classService } from "@/services/class";
import { coursewareService } from "@/services/courseware";
import { donationService } from "@/services/donation";
import { examPaperService } from "@/services/examPaper";
import { knowledgeService } from "@/services/knowledge";
import { lectureService } from "@/services/lecture";
import { materialService } from "@/services/material";
import { questionService } from "@/services/question";
import type { Material, Teacher, TreeNode } from "@/types";

vi.mock("@/hooks/useSchoolResourceOptions", () => ({
  useSchoolResourceOptions: () => ({
    gradeOptions: [],
    schoolYearOptions: [],
    semesterOptions: [],
    defaultGrade: "高一",
    defaultSchoolYear: "2026-2027",
    defaultSemester: "上学期",
    ready: true,
  }),
}));
vi.mock("@/hooks/useQuestionTypeOptions", () => ({
  useQuestionTypeOptions: () => ({ getLabel: (value: string) => value }),
}));
vi.mock("@/pages/question-bank/QuestionBankPage", () => ({
  default: () => <div>题库</div>,
}));
vi.mock("@/components/ui/MathHtml", () => ({
  MathHtml: ({ children, className }: { children: string; className?: string }) => (
    <span className={className}>{children}</span>
  ),
}));
vi.mock("@/components/tree/SearchableTree", () => ({
  SearchableTree: ({ title, onCheck }: { title: string; onCheck?: (ids: string[]) => void }) => (
    <button type="button" onClick={() => onCheck?.([title === "选择章节" ? "chapter-new" : "knowledge-new"])}>
      {title}
    </button>
  ),
}));

vi.mock("@/services/question", () => ({
  questionService: {
    listQuestions: vi.fn(),
    getQuestion: vi.fn(),
    updateQuestion: vi.fn(),
    deleteQuestion: vi.fn(),
  },
}));
vi.mock("@/services/examPaper", () => ({
  examPaperService: {
    listPapers: vi.fn(),
    getPaper: vi.fn(),
    updatePaper: vi.fn(),
    deletePaper: vi.fn(),
  },
}));
vi.mock("@/services/lecture", () => ({
  lectureService: {
    listLectures: vi.fn(),
    getLecture: vi.fn(),
    updateLecture: vi.fn(),
    deleteLecture: vi.fn(),
  },
}));
vi.mock("@/services/courseware", () => ({
  coursewareService: {
    listCoursewares: vi.fn(),
    getCourseware: vi.fn(),
    updateCourseware: vi.fn(),
    deleteCourseware: vi.fn(),
  },
}));
vi.mock("@/services/material", () => ({
  materialService: {
    listMaterials: vi.fn(),
    getMaterial: vi.fn(),
    updateMaterial: vi.fn(),
    deleteMaterial: vi.fn(),
  },
}));
vi.mock("@/services/donation", () => ({
  donationService: {
    listTeacherDonations: vi.fn(),
    checkDonation: vi.fn(),
    donateResources: vi.fn(),
  },
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
  basketService: { listBaskets: vi.fn() },
}));
vi.mock("@/services/class", () => ({
  classService: {
    listMyClasses: vi.fn(),
    listMyStudents: vi.fn(),
  },
}));
vi.mock("@/services/analytics", () => ({
  analyticsService: {},
}));
vi.mock("@/services/share", () => ({ shareService: {} }));
vi.mock("@/stores/ui", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  },
}));

const material: Material = {
  id: "material-1",
  teacherId: "teacher-1",
  schoolId: "school-1",
  title: "函数素材",
  description: "用于课堂讲解",
  chapterIds: ["chapter-existing"],
  knowledgePointIds: ["knowledge-existing"],
  grade: "高一",
  schoolYear: "2026-2027",
  semester: "上学期",
  type: "text",
  content: "函数定义",
  tags: [],
  createdAt: "2026-07-30T00:00:00.000Z",
  updatedAt: "2026-07-30T00:00:00.000Z",
};

const chapterTree: TreeNode = {
  id: "chapter-root",
  name: "全部章节",
  type: "chapter",
  count: 1,
  children: [],
};

const knowledgeTree: TreeNode = {
  id: "knowledge-root",
  name: "全部知识点",
  type: "knowledge",
  count: 1,
  children: [],
};

function renderPage() {
  return render(
    <MemoryRouter>
      <MyResourcesPage initialTab="material" />
    </MemoryRouter>,
  );
}

describe("MyResourcesPage batch actions", () => {
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

    vi.mocked(questionService.listQuestions).mockResolvedValue([]);
    vi.mocked(examPaperService.listPapers).mockResolvedValue([]);
    vi.mocked(lectureService.listLectures).mockResolvedValue([]);
    vi.mocked(coursewareService.listCoursewares).mockResolvedValue([]);
    vi.mocked(materialService.listMaterials).mockResolvedValue([material]);
    vi.mocked(materialService.getMaterial).mockResolvedValue(material);
    vi.mocked(materialService.updateMaterial).mockResolvedValue(material);
    vi.mocked(materialService.deleteMaterial).mockResolvedValue(undefined);
    vi.mocked(donationService.listTeacherDonations).mockResolvedValue([]);
    vi.mocked(knowledgeService.getChapterTree).mockResolvedValue(chapterTree);
    vi.mocked(knowledgeService.getKnowledgeTree).mockResolvedValue(knowledgeTree);
    vi.mocked(basketService.listBaskets).mockResolvedValue([]);
    vi.mocked(classService.listMyClasses).mockResolvedValue([]);
    vi.mocked(classService.listMyStudents).mockResolvedValue([]);
  });

  it("shows the floating panel only after selecting a resource", async () => {
    renderPage();

    expect(screen.queryByRole("region", { name: "批量操作" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "上传资源" })).not.toBeInTheDocument();

    fireEvent.click(await screen.findByTitle("选择资源"));

    const panel = screen.getByRole("region", { name: "批量操作" });
    expect(panel).toHaveTextContent("已选择 1 个资源");
    expect(screen.getByRole("button", { name: "批量删除" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "捐赠到平台" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "新增统一章节" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "新增统一知识点" })).toBeInTheDocument();

    fireEvent.click(screen.getByTitle("清空选择"));
    expect(screen.queryByRole("region", { name: "批量操作" })).not.toBeInTheDocument();
  });

  it("appends a shared chapter without removing existing chapter ids", async () => {
    renderPage();
    fireEvent.click(await screen.findByTitle("选择资源"));
    fireEvent.click(screen.getByRole("button", { name: "新增统一章节" }));
    fireEvent.click(screen.getByRole("button", { name: "选择章节" }));
    fireEvent.click(screen.getByRole("button", { name: "确认新增" }));

    await waitFor(() => {
      expect(materialService.updateMaterial).toHaveBeenCalledWith("material-1", {
        chapterIds: ["chapter-existing", "chapter-new"],
      });
    });
  });

  it("deletes all selected resources and clears the panel", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderPage();
    fireEvent.click(await screen.findByTitle("选择资源"));
    fireEvent.click(screen.getByRole("button", { name: "批量删除" }));

    await waitFor(() => {
      expect(materialService.deleteMaterial).toHaveBeenCalledWith("material-1");
      expect(screen.queryByRole("region", { name: "批量操作" })).not.toBeInTheDocument();
    });
  });
});
