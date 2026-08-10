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
import { lessonCoursewareService } from "@/services/lessonCourseware";
import { materialService } from "@/services/material";
import { questionService } from "@/services/question";
import { resourceFolderService } from "@/services/resourceFolder";
import { shareService } from "@/services/share";
import type { ExamPaper, LessonCourseware, Material, Teacher, TreeNode } from "@/types";

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
  SearchableTree: ({
    title,
    onCheck,
    onReset,
    showTitle = true,
  }: {
    title: string;
    onCheck?: (ids: string[]) => void;
    onReset?: () => void;
    showTitle?: boolean;
  }) => (
    <div>
      <button
        type="button"
        aria-label={title.endsWith("目录") ? `勾选${title}` : undefined}
        onClick={() => onCheck?.([title.includes("章节") ? "chapter-new" : "knowledge-new"])}
      >
        {showTitle ? title : "选择"}
      </button>
      {onReset && (
        <button type="button" aria-label={`重置${title}`} onClick={onReset}>
          重置
        </button>
      )}
    </div>
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
vi.mock("@/services/lessonCourseware", () => ({
  lessonCoursewareService: { listCoursewares: vi.fn().mockResolvedValue([]) },
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
vi.mock("@/services/share", () => ({
  shareService: {
    createShare: vi.fn(),
  },
}));
vi.mock("@/services/resourceFolder", () => ({
  resourceFolderService: {
    listFolders: vi.fn(),
    createFolder: vi.fn(),
    updateFolder: vi.fn(),
    deleteFolder: vi.fn(),
    moveResources: vi.fn(),
    removeResource: vi.fn(),
    reorderResources: vi.fn(),
    removeResourceFromAll: vi.fn(),
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

const examPaper: ExamPaper = {
  id: "paper-1",
  teacherId: "teacher-1",
  schoolId: "school-1",
  title: "函数单元测验",
  chapterIds: [],
  knowledgePointIds: [],
  grade: "高一",
  schoolYear: "2026-2027",
  semester: "上学期",
  duration: 45,
  totalScore: 100,
  questions: [],
  status: "draft",
  createdAt: "2026-07-30T00:00:00.000Z",
  updatedAt: "2026-07-30T00:00:00.000Z",
};

const examPaperTwo: ExamPaper = {
  ...examPaper,
  id: "paper-2",
  title: "函数综合测验",
  createdAt: "2026-07-31T00:00:00.000Z",
  updatedAt: "2026-07-31T00:00:00.000Z",
};

const completedLesson: LessonCourseware = {
  id: "lesson-1",
  teacherId: "teacher-1",
  schoolId: "school-1",
  title: "函数单元测验（上课课件）",
  chapterIds: [],
  knowledgePointIds: [],
  grade: "高一",
  schoolYear: "2026-2027",
  semester: "上学期",
  sourceType: "examPaper",
  sourceId: examPaper.id,
  sourceTitle: examPaper.title,
  slides: [],
  classIds: ["class-1"],
  status: "draft",
  lifecycleStatus: "completed",
  completedAt: "2026-07-30T10:00:00.000Z",
  createdAt: "2026-07-30T00:00:00.000Z",
  updatedAt: "2026-07-30T10:00:00.000Z",
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

function renderPage(initialTab: "material" | "examPaper" = "material") {
  return render(
    <MemoryRouter>
      <MyResourcesPage initialTab={initialTab} />
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
    vi.mocked(lessonCoursewareService.listCoursewares).mockResolvedValue([]);
    vi.mocked(coursewareService.listCoursewares).mockResolvedValue([]);
    vi.mocked(materialService.listMaterials).mockResolvedValue([material]);
    vi.mocked(materialService.getMaterial).mockResolvedValue(material);
    vi.mocked(materialService.updateMaterial).mockResolvedValue(material);
    vi.mocked(materialService.deleteMaterial).mockResolvedValue(undefined);
    vi.mocked(shareService.createShare).mockResolvedValue({} as never);
    vi.mocked(resourceFolderService.listFolders).mockResolvedValue([]);
    vi.mocked(resourceFolderService.createFolder).mockImplementation(async (
      teacherId,
      schoolId,
      resourceType,
      name,
      resourceIds,
    ) => ({
      id: "folder-1",
      teacherId,
      schoolId,
      resourceType,
      name,
      resourceIds,
      pinned: false,
      createdAt: "2026-08-10T00:00:00.000Z",
      updatedAt: "2026-08-10T00:00:00.000Z",
    }));
    vi.mocked(donationService.listTeacherDonations).mockResolvedValue([]);
    vi.mocked(knowledgeService.getChapterTree).mockResolvedValue(chapterTree);
    vi.mocked(knowledgeService.getKnowledgeTree).mockResolvedValue(knowledgeTree);
    vi.mocked(basketService.listBaskets).mockResolvedValue([]);
    vi.mocked(classService.listMyClasses).mockResolvedValue([]);
    vi.mocked(classService.listMyStudents).mockResolvedValue([]);
  });

  it("marks an exam paper when its linked lesson has been completed", async () => {
    vi.mocked(examPaperService.listPapers).mockResolvedValue([examPaper]);
    vi.mocked(lessonCoursewareService.listCoursewares).mockResolvedValue([completedLesson]);

    renderPage("examPaper");

    expect(await screen.findByText(examPaper.title)).toBeInTheDocument();
    expect(screen.getByText("已上课")).toBeInTheDocument();
    expect(lessonCoursewareService.listCoursewares).toHaveBeenCalledWith(expect.objectContaining({
      teacherId: "teacher-1",
      schoolId: "school-1",
      lifecycleStatus: "completed",
    }));
  });

  it("creates a folder from two selected exam papers", async () => {
    vi.mocked(examPaperService.listPapers).mockResolvedValue([examPaper, examPaperTwo]);

    renderPage("examPaper");

    fireEvent.click(await screen.findByRole("button", { name: `选择资源：${examPaper.title}` }));
    fireEvent.click(screen.getByRole("button", { name: `选择资源：${examPaperTwo.title}` }));

    const actionSelect = screen.getByRole("combobox", { name: "选择批量操作" });
    expect(screen.getByRole("option", { name: "创建文件夹" })).toBeInTheDocument();
    fireEvent.change(actionSelect, { target: { value: "folder" } });

    fireEvent.change(screen.getByRole("textbox", { name: "文件夹名称" }), {
      target: { value: "函数单元资料" },
    });
    fireEvent.click(screen.getByRole("button", { name: "创建" }));

    await waitFor(() => {
      expect(resourceFolderService.createFolder).toHaveBeenCalledWith(
        "teacher-1",
        "school-1",
        "examPaper",
        "函数单元资料",
        ["paper-1", "paper-2"],
      );
    });
    expect(screen.queryByRole("region", { name: "批量操作" })).not.toBeInTheDocument();
  });

  it("groups folder documents and collapses them from the folder name", async () => {
    vi.mocked(examPaperService.listPapers).mockResolvedValue([examPaper, examPaperTwo]);
    vi.mocked(resourceFolderService.listFolders).mockResolvedValue([{
      id: "folder-existing",
      teacherId: "teacher-1",
      schoolId: "school-1",
      resourceType: "examPaper",
      name: "函数资料",
      resourceIds: [examPaper.id, examPaperTwo.id],
      pinned: false,
      createdAt: "2026-08-10T00:00:00.000Z",
      updatedAt: "2026-08-10T00:00:00.000Z",
    }]);

    renderPage("examPaper");

    expect(await screen.findByRole("group", { name: "文件夹：函数资料" })).toBeInTheDocument();
    expect(screen.getByText(examPaper.title)).toBeInTheDocument();
    expect(screen.getByText(examPaperTwo.title)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "函数资料" }));

    await waitFor(() => {
      expect(screen.queryByText(examPaper.title)).not.toBeInTheDocument();
      expect(screen.queryByText(examPaperTwo.title)).not.toBeInTheDocument();
    });
  });

  it("shows the floating panel only after selecting a resource", async () => {
    renderPage();

    expect(screen.queryByRole("region", { name: "批量操作" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "上传资源" })).not.toBeInTheDocument();

    fireEvent.click(await screen.findByTitle("选择资源"));

    const panel = screen.getByRole("region", { name: "批量操作" });
    expect(panel).toHaveTextContent("取消批量选择");
    const actionSelect = screen.getByRole("combobox", { name: "选择批量操作" });
    expect(actionSelect).toHaveTextContent("批量操作（1）");
    expect(screen.getByRole("option", { name: "批量分享" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "批量删除" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "捐赠到平台" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "新增统一章节" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "新增统一知识点" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "取消批量选择" }));
    expect(screen.queryByRole("region", { name: "批量操作" })).not.toBeInTheDocument();
  });

  it("marks selected directory tabs and resets both directory selections together", async () => {
    renderPage();

    expect(await screen.findByRole("button", { name: "章节课" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "知识点" })).toBeInTheDocument();
    expect(screen.queryByText("章节课目录")).not.toBeInTheDocument();

    fireEvent.click(await screen.findByRole("button", { name: "勾选章节课目录" }));
    expect(screen.getByLabelText("章节课目录已有勾选")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "知识点" }));
    expect(screen.queryByText("知识点目录")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "勾选知识点目录" }));
    expect(screen.getByLabelText("章节课目录已有勾选")).toBeInTheDocument();
    expect(screen.getByLabelText("知识点目录已有勾选")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "重置知识点目录" }));
    expect(screen.queryByLabelText("章节课目录已有勾选")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("知识点目录已有勾选")).not.toBeInTheDocument();
  });

  it("appends a shared chapter without removing existing chapter ids", async () => {
    renderPage();
    fireEvent.click(await screen.findByTitle("选择资源"));
    fireEvent.change(screen.getByRole("combobox", { name: "选择批量操作" }), {
      target: { value: "chapter" },
    });
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
    fireEvent.change(screen.getByRole("combobox", { name: "选择批量操作" }), {
      target: { value: "delete" },
    });

    await waitFor(() => {
      expect(materialService.deleteMaterial).toHaveBeenCalledWith("material-1");
      expect(screen.queryByRole("region", { name: "批量操作" })).not.toBeInTheDocument();
    });
  });

  it("creates one copyable link for the selected resources", async () => {
    renderPage();
    fireEvent.click(await screen.findByTitle("选择资源"));
    fireEvent.change(screen.getByRole("combobox", { name: "选择批量操作" }), {
      target: { value: "share" },
    });

    await waitFor(() => {
      expect(shareService.createShare).toHaveBeenCalledWith(expect.objectContaining({
        fromTeacherId: "teacher-1",
        fromSchoolId: "school-1",
        scope: "public",
        resourceType: "material",
        resourceId: "material-1",
        resourceTitle: "函数素材",
        batchId: expect.stringMatching(/^batch-share-/),
      }));
    });

    expect((screen.getByRole("textbox", { name: "批量分享链接" }) as HTMLInputElement).value)
      .toMatch(/\/shared-resources\/batch-share-/);
    expect(screen.getByRole("button", { name: "复制链接" })).toBeInTheDocument();
  });
});
