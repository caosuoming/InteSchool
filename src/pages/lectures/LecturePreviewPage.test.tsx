import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import LecturePreviewPage from "./LecturePreviewPage";
import { lectureService } from "@/services/lecture";
import { classService } from "@/services/class";
import { questionService } from "@/services/question";
import { analyticsService } from "@/services/analytics";
import type { Lecture, Question, SchoolClass, Student } from "@/types";

vi.mock("@/services/lecture", () => ({
  lectureService: { getLecture: vi.fn(), updateLecture: vi.fn() },
}));
vi.mock("@/services/class", () => ({
  classService: {
    getClassesByIds: vi.fn(),
    listStudentsByClass: vi.fn(),
    listStudentsBySchool: vi.fn(),
    getStudent: vi.fn(),
  },
}));
vi.mock("@/services/question", () => ({
  questionService: { getQuestion: vi.fn() },
}));
vi.mock("@/services/analytics", () => ({
  analyticsService: {
    listAnswerRecordsByLecture: vi.fn(),
    saveAnswerRecord: vi.fn(),
    batchSaveAnswerRecords: vi.fn(),
  },
}));

const lecture: Lecture = {
  id: "lecture-1",
  teacherId: "teacher-1",
  schoolId: "school-1",
  title: "函数专题讲义_2026（拆解版）",
  description: "函数性质与典型例题",
  chapterIds: [],
  knowledgePointIds: [],
  grade: "高一",
  schoolYear: "2026-2027",
  semester: "上学期",
  classIds: ["class-1"],
  studentIds: ["student-2"],
  sections: [
    {
      id: "document-title",
      title: "函数专题讲义",
      type: "chapter",
      content: "",
      children: [],
    },
    {
      id: "column-1",
      title: "知识梳理",
      type: "chapter",
      content: "先回顾函数 $f(x)$ 的基本性质。",
      children: [
        {
          id: "knowledge-1",
          title: "单调性",
          type: "knowledge",
          content: "在给定区间内判断函数的增减，满足 $x>0$。",
          children: [],
        },
      ],
    },
    {
      id: "column-2",
      title: "例题精讲",
      type: "chapter",
      content: "",
      children: [
        {
          id: "question-section-1",
          title: "例题 1",
          type: "question",
          content: "",
          questionId: "question-1",
          children: [],
        },
      ],
    },
  ],
  contentBlocks: [
    {
      id: "block-title",
      type: "documentTitle",
      content: "函数专题讲义",
    },
  ],
  version: 1,
  status: "published",
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
};

const schoolClass: SchoolClass = {
  id: "class-1",
  type: "school",
  schoolId: "school-1",
  name: "高一（1）班",
  grade: "高一",
  studentCount: 1,
  createdBy: "teacher-1",
  createdAt: "2026-08-01T00:00:00.000Z",
};

const classStudent: Student = {
  id: "student-1",
  name: "张同学",
  studentNo: "20260001",
  classId: "class-1",
  schoolId: "school-1",
  grade: "高一",
  status: "active",
};

const explicitStudent: Student = {
  ...classStudent,
  id: "student-2",
  name: "李同学",
  studentNo: "20260002",
};

const question: Question = {
  id: "question-1",
  teacherId: "teacher-1",
  schoolId: "school-1",
  type: "single",
  stem: "函数 $f(x)=x^2$ 在哪个区间单调递增？",
  options: ["$(-\\infty,0]$", "$[0,+\\infty)$", "$\\mathbb{R}$", "不存在"],
  answer: "B",
  analysis: "二次函数 $f(x)=x^2$ 在非负区间单调递增。",
  summary: "函数单调性",
  chapterIds: [],
  knowledgePointIds: [],
  grade: "高一",
  schoolYear: "2026-2027",
  semester: "上学期",
  difficulty: 2,
  recommendation: 4,
  usageCount: 3,
  remark: "",
  isShared: false,
  hiddenByExamIds: [],
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
};

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/lectures/lecture-1/preview"]}>
      <Routes>
        <Route path="/lectures/:id/preview" element={<LecturePreviewPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("LecturePreviewPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(lectureService.getLecture).mockResolvedValue(lecture);
    vi.mocked(classService.getClassesByIds).mockResolvedValue([schoolClass]);
    vi.mocked(classService.listStudentsByClass).mockResolvedValue([classStudent]);
    vi.mocked(classService.listStudentsBySchool).mockResolvedValue([classStudent, explicitStudent]);
    vi.mocked(classService.getStudent).mockResolvedValue(explicitStudent);
    vi.mocked(questionService.getQuestion).mockResolvedValue(question);
    vi.mocked(analyticsService.listAnswerRecordsByLecture).mockResolvedValue([]);
    vi.mocked(analyticsService.saveAnswerRecord).mockResolvedValue(null);
    vi.mocked(analyticsService.batchSaveAnswerRecords).mockResolvedValue([]);
    vi.mocked(lectureService.updateLecture).mockResolvedValue(lecture);
  });

  it("renders a synchronized two-column preview with question metadata", async () => {
    const { container } = renderPage();

    expect(await screen.findByText("预览：函数专题讲义_2026（拆解版）")).toBeInTheDocument();
    expect(screen.getByText("讲义属性")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "栏目" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /整份讲义/ })).not.toBeInTheDocument();
    expect(screen.getByText("使用对象")).toBeInTheDocument();
    expect(screen.getByText("高一（1）班")).toBeInTheDocument();
    expect(screen.getByText("张同学")).toBeInTheDocument();
    expect(screen.getByText("李同学")).toBeInTheDocument();
    expect(screen.getByLabelText("纸张大小")).toHaveValue("A4");

    const paper = screen.getByTestId("lecture-paper");
    expect(paper).toHaveClass("lecture-preview-grid");
    expect(within(paper).queryByText("函数专题讲义_2026（拆解版）")).not.toBeInTheDocument();
    const documentTitle = within(paper).getByText("函数专题讲义");
    expect(documentTitle.closest(".text-center")).not.toBeNull();
    expect(within(paper).queryByText("单调性")).not.toBeInTheDocument();
    expect(within(paper).getByText(/在给定区间内判断函数的增减/)).toBeInTheDocument();
    expect(screen.getByTestId("lecture-preview-details")).toHaveTextContent("题目属性");
    const questionDetails = screen.getByTestId("lecture-question-details-1");
    expect(questionDetails).toHaveTextContent("第 1 题");
    expect(questionDetails).toHaveTextContent("单选");
    expect(questionDetails).toHaveTextContent("较易");
    expect(questionDetails).toHaveTextContent("使用次数3 次");
    expect(questionDetails.parentElement).toHaveClass("lecture-preview-right");

    await waitFor(() => {
      expect(container.querySelectorAll(".katex").length).toBeGreaterThanOrEqual(4);
    });
  });

  it("toggles answer and analysis by clicking the question stem", async () => {
    renderPage();
    await screen.findByText("预览：函数专题讲义_2026（拆解版）");

    const questionStem = await screen.findByRole("button", { name: /显示答案与解析/ });
    const questionDetails = screen.getByTestId("lecture-question-details-1");
    expect(questionDetails).toHaveTextContent("较易");
    expect(questionDetails).toHaveTextContent("单选");
    expect(screen.queryByText("展开答案与解析")).not.toBeInTheDocument();
    expect(screen.queryByText("答案：")).not.toBeInTheDocument();

    fireEvent.click(questionStem);

    expect(screen.getByText("答案：")).toBeInTheDocument();
    expect(screen.getByText("解析：")).toBeInTheDocument();
    expect(questionStem).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(questionStem);
    await waitFor(() => {
      expect(screen.queryByText("答案：")).not.toBeInTheDocument();
    });
  });
});
