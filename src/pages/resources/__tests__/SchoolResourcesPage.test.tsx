import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SchoolResourcesPage from "@/pages/resources/SchoolResourcesPage";
import { useAuthStore } from "@/stores/auth";
import { authService } from "@/services/auth";
import { schoolBackupService } from "@/services/schoolBackup";
import type { ExamPaper, Question, SchoolResourceBackup, Teacher, TreeNode } from "@/types";

vi.mock("@/hooks/useSchoolResourceOptions", () => ({
  includeCurrentOption: (options: Array<{ value: string; label: string }>) => options,
  useSchoolResourceOptions: () => ({
    gradeOptions: [],
    schoolYearOptions: [],
    semesterOptions: [
      { value: "上学期", label: "上学期" },
      { value: "下学期", label: "下学期" },
    ],
  }),
}));

vi.mock("@/components/tree/SearchableTree", () => ({
  SearchableTree: () => <div data-testid="school-tree" />,
}));

vi.mock("@/components/tree/TreeView", () => ({
  TreeView: () => <div data-testid="edit-tree" />,
}));

vi.mock("@/components/ui/MathHtml", () => ({
  MathHtml: ({ children, className }: { children: string; className?: string }) => (
    <span className={className} data-math-rendered={children.includes("$") ? "true" : "false"}>
      {children}
    </span>
  ),
}));

vi.mock("@/services/auth", () => ({
  authService: {
    listTeachers: vi.fn(),
  },
}));

vi.mock("@/services/schoolBackup", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/schoolBackup")>();
  return {
    ...actual,
    schoolBackupService: {
      listBackups: vi.fn(),
      getChapterTree: vi.fn(),
      getKnowledgeTree: vi.fn(),
      saveAsOwnResource: vi.fn(),
      updateBackupProperties: vi.fn(),
      deleteBackup: vi.fn(),
    },
  };
});

vi.mock("@/stores/ui", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  },
}));

const timestamp = "2026-08-06T12:00:00.000Z";
const teacherSelf = {
  id: "teacher-self",
  name: "当前教师",
  schoolId: "school-1",
  role: "teacher",
  roles: [],
  subject: "数学",
  affiliations: [],
} as Teacher;
const teacherProvider = {
  id: "teacher-provider",
  name: "资源提供者",
  schoolId: "school-1",
  role: "teacher",
  roles: [],
  subject: "数学",
  affiliations: [],
} as Teacher;

const question: Question = {
  id: "question-1",
  teacherId: teacherProvider.id,
  schoolId: "school-1",
  type: "essay",
  stem: "已知函数 $f(x)=x^2$，这是必须完整展示的长题干后半部分，不能被校本资源标题截断。",
  answer: "$f'(x)=2x$",
  analysis: "根据幂函数求导公式可得。",
  summary: "注意幂函数求导。",
  chapterIds: [],
  knowledgePointIds: [],
  difficulty: 3,
  recommendation: 4,
  usageCount: 0,
  remark: "",
  isShared: true,
  createdAt: timestamp,
  updatedAt: timestamp,
};

const paper: ExamPaper = {
  id: "paper-1",
  teacherId: teacherProvider.id,
  schoolId: "school-1",
  title: "函数单元试卷",
  description: "校本试卷预览",
  chapterIds: [],
  knowledgePointIds: [],
  grade: "高一",
  schoolYear: "2026-2027",
  semester: "上学期",
  duration: 60,
  totalScore: 10,
  questions: [{
    id: "paper-question-1",
    stem: "求 $f(x)=x^2$ 的导数。",
    answer: "$2x$",
    analysis: "使用幂函数求导。",
    score: 10,
    type: "essay",
  }],
  status: "published",
  createdAt: timestamp,
  updatedAt: timestamp,
};

function backup(
  id: string,
  resourceType: SchoolResourceBackup["resourceType"],
  title: string,
  snapshot: Question | ExamPaper,
): SchoolResourceBackup {
  return {
    id,
    schoolId: "school-1",
    resourceType,
    sourceResourceId: snapshot.id,
    title,
    description: resourceType === "examPaper" ? paper.description : undefined,
    contentSnapshot: JSON.stringify(snapshot),
    fromTeacherId: teacherProvider.id,
    backupReason: "跨班级发布",
    targetClassIds: ["class-2"],
    chapterIds: [],
    knowledgePointIds: [],
    grade: "高一",
    schoolYear: "2026-2027",
    semester: "上学期",
    meta: {},
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

const backups = [
  backup("backup-question", "question", question.stem.slice(0, 24), question),
  backup("backup-paper", "examPaper", paper.title, paper),
];

const emptyTree: TreeNode = {
  id: "root",
  name: "全部",
  type: "chapter",
  count: 0,
  children: [],
};

function renderPage() {
  return render(
    <MemoryRouter>
      <SchoolResourcesPage />
    </MemoryRouter>,
  );
}

describe("SchoolResourcesPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({ teacher: teacherSelf, loading: false, error: null });
    vi.mocked(authService.listTeachers).mockResolvedValue([teacherSelf, teacherProvider]);
    vi.mocked(schoolBackupService.listBackups).mockResolvedValue(backups);
    vi.mocked(schoolBackupService.getChapterTree).mockResolvedValue(emptyTree);
    vi.mocked(schoolBackupService.getKnowledgeTree).mockResolvedValue({
      ...emptyTree,
      type: "knowledge",
    });
    vi.mocked(schoolBackupService.saveAsOwnResource).mockResolvedValue({
      newResourceId: "copy-1",
      resourceType: "question",
      deduplicated: false,
    });
  });

  it("shows the complete question snapshot and expands answer and analysis", async () => {
    const user = userEvent.setup();
    renderPage();

    const fullStem = await screen.findByText(/不能被校本资源标题截断/);
    expect(fullStem).not.toHaveClass("line-clamp-2");
    expect(fullStem).toHaveAttribute("data-math-rendered", "true");

    await user.click(screen.getByRole("button", { name: "展开题目详情" }));
    expect(screen.getByText("答案")).toBeInTheDocument();
    expect(screen.getByText("解析")).toBeInTheDocument();
    expect(screen.getByText("根据幂函数求导公式可得。")).toBeInTheDocument();
  });

  it("previews a paper and allows a non-provider to save it", async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByText(/不能被校本资源标题截断/);
    await user.click(screen.getByRole("button", { name: `预览试卷：${paper.title}` }));

    expect(screen.getByText("试卷 · 校本资源预览")).toBeInTheDocument();
    expect(screen.getByText("求 $f(x)=x^2$ 的导数。")).toBeInTheDocument();
    const saveButton = screen.getByRole("button", { name: "另存到我的资源" });
    expect(saveButton).toBeEnabled();

    vi.mocked(schoolBackupService.saveAsOwnResource).mockResolvedValue({
      newResourceId: "paper-copy",
      resourceType: "examPaper",
      deduplicated: false,
    });
    await user.click(saveButton);
    await waitFor(() => {
      expect(schoolBackupService.saveAsOwnResource).toHaveBeenCalledWith(
        "backup-paper",
        teacherSelf,
      );
    });
  });

  it("disables save-as for the original provider", async () => {
    useAuthStore.setState({ teacher: teacherProvider, loading: false, error: null });
    renderPage();

    await screen.findByText(/不能被校本资源标题截断/);
    const providerButtons = screen.getAllByRole("button", { name: "本人提供的资源" });
    expect(providerButtons).toHaveLength(2);
    providerButtons.forEach((button) => expect(button).toBeDisabled());
    expect(schoolBackupService.saveAsOwnResource).not.toHaveBeenCalled();
  });
});
