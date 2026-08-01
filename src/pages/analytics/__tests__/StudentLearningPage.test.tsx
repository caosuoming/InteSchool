import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import StudentLearningPage from "@/pages/analytics/StudentLearningPage";
import { useAuthStore } from "@/stores/auth";
import { classService } from "@/services/class";
import { settingsService } from "@/services/settings";
import { analyticsService } from "@/services/analytics";
import type { SchoolClass, Teacher } from "@/types";

vi.mock("@/services/class", () => ({
  classService: {
    listSchoolClasses: vi.fn(),
    listPersonalClasses: vi.fn(),
    listStudentsByClass: vi.fn(),
  },
}));

vi.mock("@/services/settings", () => ({
  settingsService: {
    listClassTypes: vi.fn(),
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

    vi.mocked(classService.listSchoolClasses).mockResolvedValue([schoolClass]);
    vi.mocked(classService.listPersonalClasses).mockResolvedValue([]);
    vi.mocked(classService.listStudentsByClass).mockResolvedValue([]);
    vi.mocked(settingsService.listClassTypes).mockResolvedValue([]);
    vi.mocked(analyticsService.getKnowledgeMastery).mockResolvedValue([
      {
        knowledgePointId: "point-1",
        knowledgePointName: "集合的概念",
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

  it("shows knowledge mastery without a chapter toggle or chapter column", async () => {
    render(<StudentLearningPage />);

    fireEvent.click(await screen.findByRole("button", { name: "高一（1）班" }));

    await waitFor(() => {
      expect(screen.getByText("集合的概念")).toBeInTheDocument();
    });
    expect(screen.queryByText("显示章节")).not.toBeInTheDocument();
    expect(screen.queryByText("隐藏章节")).not.toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "所属章节" })).not.toBeInTheDocument();
  });
});
