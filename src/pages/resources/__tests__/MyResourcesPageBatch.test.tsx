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
import type { Courseware, ExamPaper, LessonCourseware, Material, Question, Teacher, TreeNode } from "@/types";

const batchQuestion = vi.hoisted(() => ({
  id: "question-1",
  teacherId: "teacher-1",
  schoolId: "school-1",
  type: "single",
  stem: "函数定义题",
  answer: "A",
  analysis: "函数定义",
  chapterIds: ["chapter-existing"],
  knowledgePointIds: ["knowledge-existing"],
  difficulty: 2,
  recommendation: 3,
  usageCount: 0,
  remark: "",
  isShared: false,
  createdAt: "2026-07-30T00:00:00.000Z",
  updatedAt: "2026-07-30T00:00:00.000Z",
}) as Question);

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
  default: ({
    selectedQuestionIds,
    onToggleSelection,
  }: {
    selectedQuestionIds?: Set<string>;
    onToggleSelection?: (question: Question) => void;
  }) => (
    <div>
      题库
      <button type="button" onClick={() => onToggleSelection?.(batchQuestion)}>
        {selectedQuestionIds?.has(batchQuestion.id) ? "取消选择题库题目" : "选择题库题目"}
      </button>
    </div>
  ),
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

const videoMaterial: Material = {
  ...material,
  id: "material-2",
  title: "函数讲解视频",
  type: "video",
};

const pptCourseware: Courseware = {
  id: "courseware-1",
  teacherId: "teacher-1",
  schoolId: "school-1",
  title: "函数 PPT",
  chapterIds: [],
  knowledgePointIds: [],
  grade: "高一",
  schoolYear: "2026-2027",
  semester: "上学期",
  type: "ppt",
  content: "",
  tags: [],
  createdAt: "2026-07-30T00:00:00.000Z",
  updatedAt: "2026-07-30T00:00:00.000Z",
};

const pdfCourseware: Courseware = {
  ...pptCourseware,
  id: "courseware-2",
  title: "函数 PDF",
  type: "pdf",
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

function renderPage(initialTab: "question" | "material" | "courseware" | "examPaper" = "material") {
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
    vi.mocked(donationService.checkDonation).mockResolvedValue({ alreadyDonated: [], conflicts: [] });
    vi.mocked(donationService.donateResources).mockResolvedValue({ created: [], skipped: [] });
    vi.mocked(knowledgeService.getChapterTree).mockResolvedValue(chapterTree);
    vi.mocked(knowledgeService.getKnowledgeTree).mockResolvedValue(knowledgeTree);
    vi.mocked(basketService.listBaskets).mockResolvedValue([]);
    vi.mocked(classService.listMyClasses).mockResolvedValue([]);
    vi.mocked(classService.listMyStudents).mockResolvedValue([]);
  });

  it("filters materials by the existing material types and places the type filter before grade", async () => {
    vi.mocked(materialService.listMaterials).mockResolvedValue([material, videoMaterial]);

    renderPage("material");

    expect(await screen.findByText("函数素材")).toBeInTheDocument();
    expect(screen.getByText("函数讲解视频")).toBeInTheDocument();

    const typeButton = screen.getByRole("button", { name: "素材类型" });
    const gradeButton = screen.getByRole("button", { name: "年级" });
    expect(typeButton.compareDocumentPosition(gradeButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    fireEvent.click(typeButton);
    expect(screen.getByRole("button", { name: "文本" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "视频" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "图片" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "视频" }));
    expect(screen.queryByText("函数素材")).not.toBeInTheDocument();
    expect(screen.getByText("函数讲解视频")).toBeInTheDocument();
  });

  it("filters coursewares by the existing courseware types and places the type filter before grade", async () => {
    vi.mocked(coursewareService.listCoursewares).mockResolvedValue([pptCourseware, pdfCourseware]);

    renderPage("courseware");

    expect(await screen.findByText("函数 PPT")).toBeInTheDocument();
    expect(screen.getByText("函数 PDF")).toBeInTheDocument();

    const typeButton = screen.getByRole("button", { name: "课件类型" });
    const gradeButton = screen.getByRole("button", { name: "年级" });
    expect(typeButton.compareDocumentPosition(gradeButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    fireEvent.click(typeButton);
    expect(screen.getByRole("button", { name: "PPT" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "PDF" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "GeoGebra" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "PDF" }));
    expect(screen.queryByText("函数 PPT")).not.toBeInTheDocument();
    expect(screen.getByText("函数 PDF")).toBeInTheDocument();
  });

  it("does not preload the outer resource libraries when the embedded question bank is active", async () => {
    renderPage("question");

    expect((await screen.findAllByText("题库")).length).toBeGreaterThan(0);
    await new Promise((resolve) => setTimeout(resolve, 350));

    expect(questionService.listQuestions).not.toHaveBeenCalled();
    expect(lectureService.listLectures).not.toHaveBeenCalled();
    expect(examPaperService.listPapers).not.toHaveBeenCalled();
    expect(coursewareService.listCoursewares).not.toHaveBeenCalled();
    expect(materialService.listMaterials).not.toHaveBeenCalled();
    expect(lessonCoursewareService.listCoursewares).not.toHaveBeenCalled();
    expect(knowledgeService.getChapterTree).not.toHaveBeenCalled();
    expect(knowledgeService.getKnowledgeTree).not.toHaveBeenCalled();
    expect(basketService.listBaskets).not.toHaveBeenCalled();
    expect(classService.listMyClasses).not.toHaveBeenCalled();
    expect(classService.listMyStudents).not.toHaveBeenCalled();
  });

  it("lazy-loads the knowledge tree and appends a shared knowledge point to selected questions", async () => {
    vi.mocked(questionService.getQuestion).mockResolvedValue(batchQuestion);
    vi.mocked(questionService.updateQuestion).mockResolvedValue({
      ...batchQuestion,
      knowledgePointIds: ["knowledge-existing", "knowledge-new"],
    });

    renderPage("question");
    fireEvent.click(await screen.findByRole("button", { name: "选择题库题目" }));
    fireEvent.change(screen.getByRole("combobox", { name: "选择批量操作" }), {
      target: { value: "knowledge" },
    });

    await waitFor(() => {
      expect(knowledgeService.getKnowledgeTree).toHaveBeenCalledWith("school-1");
    });
    fireEvent.click(await screen.findByRole("button", { name: "选择知识点" }));
    fireEvent.click(screen.getByRole("button", { name: "确认新增" }));

    await waitFor(() => {
      expect(questionService.updateQuestion).toHaveBeenCalledWith("question-1", {
        knowledgePointIds: ["knowledge-existing", "knowledge-new"],
      });
    });
  });

  it("lazy-loads the chapter tree and appends a shared chapter without replacing question chapters", async () => {
    vi.mocked(questionService.getQuestion).mockResolvedValue(batchQuestion);
    vi.mocked(questionService.updateQuestion).mockResolvedValue({
      ...batchQuestion,
      chapterIds: ["chapter-existing", "chapter-new"],
    });

    renderPage("question");
    fireEvent.click(await screen.findByRole("button", { name: "选择题库题目" }));
    fireEvent.change(screen.getByRole("combobox", { name: "选择批量操作" }), {
      target: { value: "chapter" },
    });

    await waitFor(() => {
      expect(knowledgeService.getChapterTree).toHaveBeenCalledWith("school-1");
    });
    fireEvent.click(await screen.findByRole("button", { name: "选择章节课" }));
    fireEvent.click(screen.getByRole("button", { name: "确认新增" }));

    await waitFor(() => {
      expect(questionService.updateQuestion).toHaveBeenCalledWith("question-1", {
        chapterIds: ["chapter-existing", "chapter-new"],
      });
    });
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

  it("creates an album from two selected exam papers", async () => {
    vi.mocked(examPaperService.listPapers).mockResolvedValue([examPaper, examPaperTwo]);

    renderPage("examPaper");

    fireEvent.click(await screen.findByRole("button", { name: `选择资源：${examPaper.title}` }));
    fireEvent.click(screen.getByRole("button", { name: `选择资源：${examPaperTwo.title}` }));

    const actionSelect = screen.getByRole("combobox", { name: "选择批量操作" });
    expect(screen.getByRole("option", { name: "创建专辑" })).toBeInTheDocument();
    fireEvent.change(actionSelect, { target: { value: "folder" } });

    fireEvent.change(screen.getByRole("textbox", { name: "专辑名称" }), {
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

  it("groups album documents and collapses them from the album name", async () => {
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

    expect(await screen.findByRole("group", { name: "专辑：函数资料" })).toBeInTheDocument();
    expect(screen.queryByText(examPaper.title)).not.toBeInTheDocument();
    expect(screen.queryByText(examPaperTwo.title)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "函数资料" }));

    expect(await screen.findByText(examPaper.title)).toBeInTheDocument();
    expect(screen.getByText(examPaperTwo.title)).toBeInTheDocument();
  });

  it("sorts an unpinned album with standalone documents instead of forcing it first", async () => {
    const standalone: ExamPaper = {
      ...examPaper,
      id: "paper-standalone",
      title: "最新独立试卷",
      createdAt: "2026-08-12T00:00:00.000Z",
      updatedAt: "2026-08-12T00:00:00.000Z",
    };
    vi.mocked(examPaperService.listPapers).mockResolvedValue([examPaper, examPaperTwo, standalone]);
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

    const standaloneTitle = await screen.findByText(standalone.title);
    const album = screen.getByRole("group", { name: "专辑：函数资料" });
    expect(standaloneTitle.compareDocumentPosition(album) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("keeps a pinned album ahead of standalone documents", async () => {
    const standalone: ExamPaper = {
      ...examPaper,
      id: "paper-standalone",
      title: "最新独立试卷",
      createdAt: "2026-08-12T00:00:00.000Z",
      updatedAt: "2026-08-12T00:00:00.000Z",
    };
    vi.mocked(examPaperService.listPapers).mockResolvedValue([examPaper, examPaperTwo, standalone]);
    vi.mocked(resourceFolderService.listFolders).mockResolvedValue([{
      id: "folder-existing",
      teacherId: "teacher-1",
      schoolId: "school-1",
      resourceType: "examPaper",
      name: "函数资料",
      resourceIds: [examPaper.id, examPaperTwo.id],
      pinned: true,
      createdAt: "2026-08-10T00:00:00.000Z",
      updatedAt: "2026-08-10T00:00:00.000Z",
    }]);

    renderPage("examPaper");

    const album = await screen.findByRole("group", { name: "专辑：函数资料" });
    const standaloneTitle = screen.getByText(standalone.title);
    expect(album.compareDocumentPosition(standaloneTitle) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByLabelText("已置顶")).toBeInTheDocument();
  });

  it("donates every album document with the album id", async () => {
    vi.mocked(examPaperService.listPapers).mockResolvedValue([examPaper, examPaperTwo]);
    vi.mocked(resourceFolderService.listFolders).mockResolvedValue([{
      id: "album-existing",
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

    fireEvent.click(await screen.findByTitle("捐赠专辑（含全部文档）"));

    await waitFor(() => {
      expect(donationService.checkDonation).toHaveBeenCalledWith(
        "teacher-1",
        "school-1",
        [
          { resourceType: "examPaper", resourceId: examPaper.id, albumId: "album-existing" },
          { resourceType: "examPaper", resourceId: examPaperTwo.id, albumId: "album-existing" },
        ],
      );
      expect(donationService.donateResources).toHaveBeenCalledWith(
        "teacher-1",
        "school-1",
        [
          { resourceType: "examPaper", resourceId: examPaper.id, albumId: "album-existing" },
          { resourceType: "examPaper", resourceId: examPaperTwo.id, albumId: "album-existing" },
        ],
        [],
      );
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
    expect(screen.getByRole("option", { name: "新增统一章节课" })).toBeInTheDocument();
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
    fireEvent.click(screen.getByRole("button", { name: "选择章节课" }));
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
