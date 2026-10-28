import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import DashboardPage from "./DashboardPage";
import { lessonCoursewareService } from "@/services/lessonCourseware";
import { examPaperService } from "@/services/examPaper";
import { scannerService } from "@/services/scanner";

vi.mock("@/stores/auth", () => ({
  useAuthStore: () => ({ teacher: {
    id: "teacher1", name: "测试", subject: "数学", schoolId: "school1",
    affiliations: [], roles: [], subjectGroupIds: [],
  } }),
}));
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

beforeEach(() => {
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
