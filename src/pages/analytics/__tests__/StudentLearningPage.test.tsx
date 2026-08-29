import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import StudentLearningPage from "@/pages/analytics/StudentLearningPage";
import { useAuthStore } from "@/stores/auth";
import { classService } from "@/services/class";
import { settingsService } from "@/services/settings";
import { analyticsService } from "@/services/analytics";
import { knowledgeService } from "@/services/knowledge";
import { questionService } from "@/services/question";
import type { Question, SchoolClass, Teacher } from "@/types";

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
    listKnowledgePoints: vi.fn(),
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

vi.mock("@/services/question", () => ({
  questionService: {
    listQuestions: vi.fn(),
  },
}));

vi.mock("@/components/basket/AddToBasketDropdown", () => ({
  AddToBasketDropdown: ({ resourceId }: { resourceId: string }) => (
    <button type="button">加入资源篮 {resourceId}</button>
  ),
}));

function makeQuestion(id: string, stem: string, chapterIds: string[], knowledgePointIds: string[]): Question {
  return {
    id,
    teacherId: "teacher-1",
    schoolId: "school-1",
    type: "single",
    stem,
    options: ["选项 A", "选项 B"],
    answer: "答案 $x=2$",
    analysis: "解析 $x^2=4$",
    chapterIds,
    knowledgePointIds,
    difficulty: 2,
    recommendation: 3,
    usageCount: 0,
    remark: "",
    isShared: false,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
  };
}

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
    localStorage.clear();
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
      { id: "book-1", schoolId: "school-1", parentId: null, name: "苏教必修第一册", order: 1, level: 0 },
      { id: "chapter-1", schoolId: "school-1", parentId: "book-1", name: "集合章节", order: 1, level: 1 },
      { id: "book-2", schoolId: "school-1", parentId: null, name: "苏教必修第二册", order: 2, level: 0 },
    ]);
    vi.mocked(knowledgeService.listKnowledgePoints).mockResolvedValue([
      { id: "point-root", schoolId: "school-1", parentId: null, name: "集合", order: 1, level: 0 },
      { id: "point-1", schoolId: "school-1", parentId: "point-root", name: "集合的概念", order: 1, level: 1 },
    ]);
    vi.mocked(analyticsService.getKnowledgeMastery).mockResolvedValue([
      {
        knowledgePointId: "point-root",
        knowledgePointName: "集合",
        knowledgePointPath: ["集合"],
        totalAttempts: 0,
        correctCount: 0,
        partialCount: 0,
        wrongCount: 0,
        correctRate: 0,
        masteryLevel: "untrained",
      },
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
    vi.mocked(questionService.listQuestions).mockResolvedValue([]);
  });

  it("defaults directory trees to collapsed and opens placement controls in a draggable directory modal", async () => {
    render(<StudentLearningPage />);

    expect(screen.getByRole("separator", { name: "调整左侧列表宽度" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "折叠左侧列表" }));
    expect(screen.getByRole("button", { name: "展开左侧列表" })).toBeInTheDocument();
    expect(localStorage.getItem("inteschool:student-learning-sidebar-width:collapsed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "展开左侧列表" }));

    fireEvent.click(await screen.findByRole("button", { name: "高一（1）班" }));

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: /章节课训练与掌握情况/ })).toHaveAttribute("aria-selected", "true");
      expect(screen.getByRole("button", { name: "展开章节 苏教必修第一册" })).toBeInTheDocument();
      expect(screen.queryByText("集合章节")).not.toBeInTheDocument();
      expect(analyticsService.getStudentAnswerDetails).toHaveBeenCalledTimes(2);
    });

    fireEvent.click(screen.getByRole("button", { name: "展开章节 苏教必修第一册" }));
    expect(screen.getByText("集合章节")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "查看章节课目录 苏教必修第一册" }));
    expect(screen.getByRole("heading", { name: "苏教必修第一册" })).toBeInTheDocument();
    expect(document.querySelector("[data-modal-drag-handle]")).not.toBeNull();
    expect(screen.getByRole("button", { name: "置顶" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "正常" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "沉底" }));
    expect(localStorage.getItem("inteschool:student-learning:placements:school-1:teacher-1"))
      .toContain('"book-1":"bottom"');
    fireEvent.keyDown(window, { key: "Escape" });

    const chapterRows = screen.getAllByRole("row").map((row) => row.textContent ?? "");
    expect(chapterRows.findIndex((text) => text.includes("苏教必修第二册")))
      .toBeLessThan(chapterRows.findIndex((text) => text.includes("苏教必修第一册")));

    fireEvent.click(screen.getByRole("tab", { name: /知识点训练与掌握情况/ }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "展开知识点 集合" })).toBeInTheDocument();
      expect(screen.queryByText("集合的概念")).not.toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: "展开知识点 集合" }));
    expect(screen.getByTitle("集合\\集合的概念")).toHaveTextContent("集合的概念");

    fireEvent.click(screen.getByRole("button", { name: "查看知识点目录 集合的概念" }));
    expect(screen.getByText("知识点目录题目")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "置顶" }));
    expect(localStorage.getItem("inteschool:student-learning:placements:school-1:teacher-1"))
      .toContain('"point-1":"top"');
    expect(classService.listMyClasses).toHaveBeenCalledWith("school-1", "teacher-1");
  });

  it("shows only the clicked directory's answered and unanswered questions and allows adding both to baskets", async () => {
    const answeredInFirstBook = makeQuestion(
      "q-answered-in",
      "第一册已做：$x^2=4$",
      ["chapter-1"],
      ["point-1"],
    );
    const answeredOutside = makeQuestion(
      "q-answered-out",
      "第二册已做",
      ["book-2"],
      [],
    );
    const unansweredInFirstBook = makeQuestion(
      "q-unanswered-in",
      "第一册未做：$y^2=9$",
      ["chapter-1"],
      ["point-1"],
    );
    const unansweredOutside = makeQuestion(
      "q-unanswered-out",
      "第二册未做",
      ["book-2"],
      [],
    );

    vi.mocked(questionService.listQuestions).mockResolvedValue([
      answeredInFirstBook,
      answeredOutside,
      unansweredInFirstBook,
      unansweredOutside,
    ]);
    vi.mocked(analyticsService.getStudentAnswerDetails).mockResolvedValue([
      {
        record: {
          id: "record-in",
          studentId: "student-1",
          questionId: answeredInFirstBook.id,
          lectureId: "lecture-1",
          isCorrect: true,
          score: "correct",
          answeredAt: "2026-08-20T00:00:00.000Z",
        },
        question: answeredInFirstBook,
        lectureTitle: "第一册练习",
      },
      {
        record: {
          id: "record-out",
          studentId: "student-1",
          questionId: answeredOutside.id,
          lectureId: "lecture-2",
          isCorrect: false,
          score: "wrong",
          answeredAt: "2026-08-19T00:00:00.000Z",
        },
        question: answeredOutside,
        lectureTitle: "第二册练习",
      },
    ]);

    render(<StudentLearningPage />);
    fireEvent.click(await screen.findByRole("button", { name: "高一（1）班" }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "查看章节课目录 苏教必修第一册" })).toBeInTheDocument();
      expect(analyticsService.getStudentAnswerDetails).toHaveBeenCalledTimes(2);
    });

    expect(screen.queryByText(/第一册已做/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "查看章节课目录 苏教必修第一册" }));

    expect(await screen.findByText(/第一册已做/)).toBeInTheDocument();
    expect(screen.queryByText("第二册已做")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "加入资源篮 q-answered-in" })).toBeInTheDocument();
    expect(document.querySelector('[data-latex="x^2=4"]')).not.toBeNull();

    fireEvent.click(screen.getByRole("tab", { name: /未做题/ }));
    expect(await screen.findByText(/第一册未做/)).toBeInTheDocument();
    expect(screen.queryByText("第二册未做")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "加入资源篮 q-unanswered-in" })).toBeInTheDocument();
    expect(document.querySelector('[data-latex="y^2=9"]')).not.toBeNull();

    fireEvent.click(screen.getByRole("tab", { name: /已做题/ }));
    fireEvent.click(screen.getByRole("button", { name: "展开题目详情" }));
    expect(document.querySelector('[data-latex="x=2"]')).not.toBeNull();
  });

});
