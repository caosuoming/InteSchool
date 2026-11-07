import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import userEvent from "@testing-library/user-event";
import { dashboardTodoService } from "@/services/dashboardTodo";
import { aiService } from "@/services/ai";
import DashboardPage from "./DashboardPage";
import { lessonCoursewareService } from "@/services/lessonCourseware";
import { examPaperService } from "@/services/examPaper";
import { scannerService } from "@/services/scanner";

vi.mock("@/stores/auth", () => {
  const teacher = {
    id: "teacher1", name: "测试", subject: "数学", schoolId: "school1",
    affiliations: [], roles: [], subjectGroupIds: [],
  };
  return { useAuthStore: () => ({ teacher }) };
});
vi.mock("@/hooks/useSchoolResourceOptions", () => ({ useSchoolResourceOptions: () => ({ gradeOptions: [] }) }));
vi.mock("@/lib/roster-permissions", () => ({ canManageSchoolRoster: () => false }));
vi.mock("@/services/question", () => ({ questionService: { listQuestions: vi.fn(async () => []) } }));
vi.mock("@/services/lecture", () => ({ lectureService: { listLectures: vi.fn(async () => []) } }));
vi.mock("@/services/basket", () => ({ basketService: { listBaskets: vi.fn(async () => []) } }));
vi.mock("@/services/ai", () => ({ aiService: { listDocuments: vi.fn(async () => []) } }));
vi.mock("@/services/class", () => ({ classService: {
  listSchoolClasses: vi.fn(async () => []), listPersonalClasses: vi.fn(async () => []),
} }));
vi.mock("@/services/share", () => ({ shareService: { listCorrectionTodos: vi.fn(async () => []) } }));
vi.mock("@/services/prep", () => ({ prepService: { listTasks: vi.fn(async () => []) }, taskTypeLabels: {}, taskStatusLabels: {} }));
vi.mock("@/services/lessonCourseware", () => ({ lessonCoursewareService: { listCoursewares: vi.fn() } }));
vi.mock("@/services/examPaper", () => ({ examPaperService: { listPapers: vi.fn() } }));
vi.mock("@/services/scanner", () => ({ scannerService: { listPages: vi.fn() } }));
vi.mock("@/services/dashboardTodo", () => ({ dashboardTodoService: { listTodoRecords: vi.fn(), setTodoStatus: vi.fn() } }));

beforeEach(() => {
  vi.mocked(dashboardTodoService.listTodoRecords).mockReset().mockResolvedValue([]);
  vi.mocked(dashboardTodoService.setTodoStatus).mockReset();
  vi.mocked(aiService.listDocuments).mockReset().mockResolvedValue([]);
  vi.mocked(lessonCoursewareService.listCoursewares).mockReset().mockResolvedValue([]);
  vi.mocked(examPaperService.listPapers).mockReset().mockResolvedValue([]);
  vi.mocked(scannerService.listPages).mockReset().mockResolvedValue([]);
});

describe("DashboardPage pending work", () => {
  it("loads and displays editable coursewares and unscanned homework, with correct count", async () => {
    vi.mocked(lessonCoursewareService.listCoursewares).mockResolvedValue([{
      id: "courseware1", teacherId: "teacher1", schoolId: "school1", title: "课件A",
      status: "draft", lifecycleStatus: "active", updatedAt: new Date().toISOString(),
    }] as never);
    vi.mocked(examPaperService.listPapers).mockResolvedValue([{
      id: "paper1", teacherId: "teacher1", schoolId: "school1", title: "作业B",
      status: "published", assignedDate: "2026-10-28", answerSheetPublishedAt: "2026-10-28",
    }] as never);
    render(<MemoryRouter><DashboardPage /></MemoryRouter>);
    expect(await screen.findByText("课件A")).toBeInTheDocument();
    expect(screen.getByText("作业B")).toBeInTheDocument();
    expect(screen.getByText("2 项待处理")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /课件A/ })).toHaveAttribute("href", "/my-lessons/courseware1/edit");
    expect(screen.getByRole("link", { name: /作业B/ })).toHaveAttribute("href", "/homework-exams/homework");
    expect(lessonCoursewareService.listCoursewares).toHaveBeenCalledWith({
      schoolId: "school1", teacherId: "teacher1", lifecycleStatus: "active",
    });
  });

  it("does not claim all tasks are done when scan lookup fails", async () => {
    vi.mocked(scannerService.listPages).mockRejectedValue(new Error("scan unavailable"));
    render(<MemoryRouter><DashboardPage /></MemoryRouter>);
    expect(await screen.findByText("扫描待办暂时无法加载，请刷新重试。")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("0 项待处理")).toBeInTheDocument());
    expect(screen.queryByText("暂无待办事项，一切就绪")).not.toBeInTheDocument();
  });
});

describe("DashboardPage todo status", () => {
  it("moves a pending task to completed and keeps it after reloading", async () => {
    const user = userEvent.setup();
    vi.mocked(aiService.listDocuments).mockResolvedValue([{
      id: "document1", teacherId: "teacher1", fileName: "待处理文档.pdf", status: "recognized",
    }] as never);
    const archived = {
      id: "teacher1:document:document1", teacherId: "teacher1", type: "document" as const,
      resourceId: "document1", title: "待处理文档.pdf", detail: "AI 识别完成，等待您确认入库",
      href: "/import", status: "completed" as const, updatedAt: "2026-11-07T10:00:00.000Z",
    };
    vi.mocked(dashboardTodoService.setTodoStatus).mockResolvedValue(archived);
    const view = render(<MemoryRouter><DashboardPage /></MemoryRouter>);
    expect(await screen.findByText("待处理文档.pdf")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "将待处理文档.pdf标记为已完成" }));
    await waitFor(() => expect(dashboardTodoService.setTodoStatus).toHaveBeenCalledWith(
      "teacher1", expect.objectContaining({ type: "document", resourceId: "document1", status: "completed" }),
    ));
    expect(await screen.findByText("0 项待处理")).toBeInTheDocument();
    expect(screen.getByText("待处理文档.pdf")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "将待处理文档.pdf标记为已完成" })).not.toBeInTheDocument();
    view.unmount();

    vi.mocked(dashboardTodoService.listTodoRecords).mockResolvedValue([archived]);
    render(<MemoryRouter><DashboardPage /></MemoryRouter>);
    expect(await screen.findByText("0 项待处理")).toBeInTheDocument();
    expect(screen.getByText("待处理文档.pdf")).toBeInTheDocument();
  });

  it("cancels a task and shows at most three archived records until expanded", async () => {
    const user = userEvent.setup();
    vi.mocked(lessonCoursewareService.listCoursewares).mockResolvedValue([{
      id: "cw1", teacherId: "teacher1", schoolId: "school1", title: "待取消课件",
      status: "draft", lifecycleStatus: "active", updatedAt: "2026-11-07T08:00:00.000Z",
    }] as never);
    const archived = Array.from({ length: 5 }, (_, i) => ({
      id: `teacher1:lecture:old${i}`, teacherId: "teacher1", type: "lecture" as const,
      resourceId: `old${i}`, title: `归档任务${i}`, detail: "草稿",
      href: "/lectures", status: "completed" as const, updatedAt: `2026-11-0${i + 1}T10:00:00Z`,
    }));
    vi.mocked(dashboardTodoService.listTodoRecords).mockResolvedValue(archived);
    vi.mocked(dashboardTodoService.setTodoStatus).mockImplementation(async (_teacherId, input) => ({
      ...input, id: `teacher1:${input.type}:${input.resourceId}`, teacherId: "teacher1",
      updatedAt: "2026-11-07T10:00:00Z",
    }));
    render(<MemoryRouter><DashboardPage /></MemoryRouter>);
    expect(await screen.findByText("5 项")).toBeInTheDocument();
    expect(screen.getAllByText(/^归档任务/)).toHaveLength(3);
    await user.click(screen.getByRole("button", { name: "更多（2）" }));
    expect(screen.getAllByText(/^归档任务/)).toHaveLength(5);
    await user.click(screen.getByRole("button", { name: "收起" }));
    expect(screen.getAllByText(/^归档任务/)).toHaveLength(3);

    await user.click(screen.getByRole("button", { name: "取消待取消课件" }));
    await waitFor(() => expect(screen.getByText("0 项待处理")).toBeInTheDocument());
    expect(screen.getByText("待取消课件")).toBeInTheDocument();
    expect(screen.getByText("1 项")).toBeInTheDocument();
  });
});
