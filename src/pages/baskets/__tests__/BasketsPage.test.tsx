import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import BasketsPage from "@/pages/baskets/BasketsPage";
import { analyticsService } from "@/services/analytics";
import { basketService } from "@/services/basket";
import { classService } from "@/services/class";
import { knowledgeService } from "@/services/knowledge";
import { questionService } from "@/services/question";
import { useAuthStore } from "@/stores/auth";
import type { Basket, Question, SchoolClass, Student, Teacher } from "@/types";

vi.mock("@/hooks/useSchoolResourceOptions", () => ({
  useSchoolResourceOptions: () => ({
    defaultGrade: "高一",
    defaultSchoolYear: "2026-2027",
    defaultSemester: "上学期",
  }),
}));
vi.mock("@/hooks/useQuestionTypeOptions", () => ({
  useQuestionTypeOptions: () => ({ getLabel: () => "单选题" }),
}));
vi.mock("@/components/ui/MathHtml", () => ({
  MathHtml: ({ children }: { children: string }) => (
    <span data-math-rendered={children.includes("$") ? "true" : "false"}>{children}</span>
  ),
}));
vi.mock("@/services/basket", () => ({
  basketService: {
    listBaskets: vi.fn(),
    createBasket: vi.fn(),
    updateBasket: vi.fn(),
    deleteBasket: vi.fn(),
    setDefaultBasket: vi.fn(),
    removeQuestion: vi.fn(),
  },
}));
vi.mock("@/services/question", () => ({ questionService: { listQuestions: vi.fn() } }));
vi.mock("@/services/lecture", () => ({ lectureService: { createLecture: vi.fn() } }));
vi.mock("@/services/knowledge", () => ({
  knowledgeService: {
    listChapters: vi.fn(),
    listKnowledgePoints: vi.fn(),
  },
}));
vi.mock("@/services/class", () => ({
  classService: {
    listMyClasses: vi.fn(),
    listMyStudents: vi.fn(),
  },
}));
vi.mock("@/services/analytics", () => ({
  analyticsService: {
    listAnswerRecordsByStudents: vi.fn(),
    getKnowledgeMastery: vi.fn(),
  },
}));
vi.mock("@/stores/ui", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

const schoolClass: SchoolClass = {
  id: "class-1",
  type: "school",
  schoolId: "school-1",
  name: "高一（1）班",
  grade: "高一",
  studentCount: 1,
  createdBy: "teacher-1",
  createdAt: "2026-07-01T00:00:00.000Z",
};

const student: Student = {
  id: "student-1",
  name: "张同学",
  studentNo: "20260001",
  classId: schoolClass.id,
  schoolId: "school-1",
  grade: "高一",
  status: "active",
};

const question: Question = {
  id: "question-1",
  teacherId: "teacher-1",
  schoolId: "school-1",
  type: "single",
  stem: "计算 $1+1$。",
  options: ["1", "2"],
  answer: "B",
  analysis: "$1+1=2$。",
  chapterIds: ["chapter-1"],
  knowledgePointIds: ["kp-1"],
  grade: "高一",
  schoolYear: "2026-2027",
  semester: "上学期",
  difficulty: 1,
  recommendation: 3,
  usageCount: 1,
  remark: "",
  isShared: false,
  hiddenByExamIds: [],
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-01T00:00:00.000Z",
};

const basket: Basket = {
  id: "basket-1",
  teacherId: "teacher-1",
  name: "基础练习",
  questionIds: [question.id],
  materialIds: [],
  classIds: [schoolClass.id],
  studentIds: [],
  createdAt: "2026-07-30T00:00:00.000Z",
  updatedAt: "2026-07-30T00:00:00.000Z",
};

describe("BasketsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({
      teacher: { id: "teacher-1", schoolId: "school-1" } as Teacher,
      loading: false,
      error: null,
    });
    vi.mocked(basketService.listBaskets).mockResolvedValue([basket]);
    vi.mocked(questionService.listQuestions).mockResolvedValue([question]);
    vi.mocked(knowledgeService.listChapters).mockResolvedValue([{
      id: "chapter-1",
      schoolId: "school-1",
      parentId: null,
      name: "数与式",
      order: 1,
      level: 0,
      questionCount: 1,
    }]);
    vi.mocked(knowledgeService.listKnowledgePoints).mockResolvedValue([{
      id: "kp-1",
      schoolId: "school-1",
      parentId: null,
      chapterId: "chapter-1",
      name: "整数运算",
      order: 1,
      level: 0,
      questionCount: 1,
    }]);
    vi.mocked(classService.listMyClasses).mockResolvedValue([schoolClass]);
    vi.mocked(classService.listMyStudents).mockResolvedValue([student]);
    vi.mocked(analyticsService.listAnswerRecordsByStudents).mockResolvedValue([{
      id: "answer-1",
      studentId: student.id,
      questionId: question.id,
      lectureId: "lecture-1",
      isCorrect: false,
      answeredAt: "2026-07-29T08:00:00.000Z",
    }]);
    vi.mocked(analyticsService.getKnowledgeMastery).mockResolvedValue([{
      knowledgePointId: "kp-1",
      knowledgePointName: "整数运算",
      totalAttempts: 2,
      correctCount: 1,
      partialCount: 0,
      wrongCount: 1,
      correctRate: 0.5,
      masteryLevel: "basic",
    }]);
    vi.mocked(basketService.updateBasket).mockResolvedValue({
      ...basket,
      classIds: [],
      studentIds: [student.id],
    });
  });

  it("shows target-student usage and mastery, then allows changing the audience", async () => {
    const { container } = render(
      <MemoryRouter>
        <BasketsPage />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "查看详情" }));

    expect(await screen.findByText("所选学生已使用")).toBeInTheDocument();
    expect(screen.getByText(/使用时间：.*2026/)).toBeInTheDocument();
    expect(screen.getByText("基本掌握 50%")).toBeInTheDocument();
    expect(container.querySelector('[data-math-rendered="true"]')).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "调整使用对象" }));
    fireEvent.click(screen.getByRole("button", { name: "清空选择" }));
    fireEvent.click(screen.getByRole("checkbox", { name: /张同学/ }));
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => {
      expect(basketService.updateBasket).toHaveBeenCalledWith(basket.id, {
        classIds: [],
        studentIds: [student.id],
      });
    });
  });
});
