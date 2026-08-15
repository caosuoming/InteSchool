import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import StudentLearningPage from "@/pages/analytics/StudentLearningPage";
import { useAuthStore } from "@/stores/auth";
import { classService } from "@/services/class";
import { settingsService } from "@/services/settings";
import { analyticsService } from "@/services/analytics";
import { knowledgeService } from "@/services/knowledge";
import type { SchoolClass, Teacher } from "@/types";

vi.mock("@/services/class", () => ({
  classService: {
    listMyClasses: vi.fn(),
    listStudentsByClass: vi.fn(),
  },
}));

vi.mock("@/services/settings", () => ({
  settingsService: {
    listClassTypes: vi.fn(),
  },
}));

vi.mock("@/services/knowledge", () => ({
  knowledgeService: {
    listChapters: vi.fn(),
  },
}));

vi.mock("@/services/analytics", () => ({
  analyticsService: {
    getKnowledgeMastery: vi.fn(),
    getStudentAnswerDetails: vi.fn(),
    getSameGradeTypeAverage: vi.fn(),
    getPrevGradeBestClass: vi.fn(),
    getClassAverageMastery: vi.fn(),
  },
}));

const schoolClass: SchoolClass = {
  id: "class-1",
  type: "school",
  schoolId: "school-1",
  name: "高一（1）班",
  grade: "高一",
  studentCount: 0,
  createdBy: "teacher-1",
  createdAt: "2026-08-01T00:00:00.000Z",
};

describe("StudentLearningPage", () => {
  beforeEach(() => {
    useAuthStore.setState({
      teacher: {
        id: "teacher-1",
        schoolId: "school-1",
      } as Teacher,
      loading: false,
      error: null,
    });

    vi.mocked(classService.listMyClasses).mockResolvedValue([schoolClass]);
    vi.mocked(classService.listStudentsByClass).mockResolvedValue([]);
    vi.mocked(settingsService.listClassTypes).mockResolvedValue([]);
    vi.mocked(knowledgeService.listChapters).mockResolvedValue([
      { id: "chapter-1", schoolId: "school-1", parentId: null, name: "集合章节", order: 1, level: 0 },
    ]);
    vi.mocked(analyticsService.getKnowledgeMastery).mockResolvedValue([
      {
        knowledgePointId: "point-1",
        knowledgePointName: "集合的概念",
        knowledgePointPath: ["集合", "集合的概念"],
        totalAttempts: 2,
        correctCount: 1,
        partialCount: 0,
        wrongCount: 1,
        correctRate: 0.5,
        masteryLevel: "weak",
      },
    ]);
    vi.mocked(analyticsService.getStudentAnswerDetails).mockResolvedValue([]);
    vi.mocked(analyticsService.getSameGradeTypeAverage).mockResolvedValue([]);
    vi.mocked(analyticsService.getPrevGradeBestClass).mockResolvedValue(null);
    vi.mocked(analyticsService.getClassAverageMastery).mockResolvedValue([]);
  });

  it("supports resizable navigation, parent paths, and floating row actions", async () => {
    render(<StudentLearningPage />);

    expect(screen.getByRole("separator", { name: "调整左侧列表宽度" })).toBeInTheDocument();
    fireEvent.click(await screen.findByRole("button", { name: "高一（1）班" }));

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: /章节课训练与掌握情况/ })).toHaveAttribute("aria-selected", "true");
      expect(screen.getByText("集合章节")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("tab", { name: /知识点训练与掌握情况/ }));
    expect(await screen.findByText("集合的概念")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "显示知识点的父节点" }));
    expect(await screen.findByText("集合\\集合的概念")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("checkbox", { name: "选择知识点 集合\\集合的概念" }));
    expect(screen.getByRole("toolbar", { name: "知识点排序操作" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "置顶" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "沉底" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "置顶" }));
    expect(screen.queryByRole("toolbar", { name: "知识点排序操作" })).not.toBeInTheDocument();
    expect(classService.listMyClasses).toHaveBeenCalledWith("school-1", "teacher-1");
  });
});
