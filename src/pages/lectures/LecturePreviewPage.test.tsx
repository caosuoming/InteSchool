import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import LecturePreviewPage from "./LecturePreviewPage";
import { lectureService } from "@/services/lecture";
import { classService } from "@/services/class";
import { questionService } from "@/services/question";
import type { Lecture, Question, SchoolClass, Student } from "@/types";

vi.mock("@/services/lecture", () => ({
  lectureService: { getLecture: vi.fn() },
}));
vi.mock("@/services/class", () => ({
  classService: {
    getClassesByIds: vi.fn(),
    listStudentsByClass: vi.fn(),
    getStudent: vi.fn(),
  },
}));
vi.mock("@/services/question", () => ({
  questionService: { getQuestion: vi.fn() },
}));

const lecture: Lecture = {
  id: "lecture-1",
  teacherId: "teacher-1",
  schoolId: "school-1",
  title: "函数专题讲义",
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
      id: "column-1",
      title: "知识梳理",
      type: "chapter",
      content: "先回顾函数的基本性质。",
      children: [
        {
          id: "knowledge-1",
          title: "单调性",
          type: "knowledge",
          content: "在给定区间内判断函数增减。",
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
  stem: "函数 f(x)=x² 在哪个区间单调递增？",
  options: ["(-∞,0]", "[0,+∞)", "R", "不存在"],
  answer: "B",
  analysis: "二次函数在非负区间单调递增。",
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
    vi.mocked(classService.getStudent).mockResolvedValue(explicitStudent);
    vi.mocked(questionService.getQuestion).mockResolvedValue(question);
  });

  it("renders the property bar and three-column preview workspace", async () => {
    renderPage();

    expect(await screen.findByText("预览：函数专题讲义")).toBeInTheDocument();
    expect(screen.getByText("讲义属性")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "栏目" })).toBeInTheDocument();
    expect(screen.getByText("使用对象")).toBeInTheDocument();
    expect(screen.getByText("高一（1）班")).toBeInTheDocument();
    expect(screen.getByText("张同学")).toBeInTheDocument();
    expect(screen.getByText("李同学")).toBeInTheDocument();
    expect(screen.getByLabelText("纸张大小")).toHaveValue("A4");
  });

  it("switches the middle preview to a selected column", async () => {
    renderPage();
    await screen.findByText("预览：函数专题讲义");

    fireEvent.click(screen.getByRole("button", { name: /例题精讲/ }));

    await waitFor(() => {
      expect(screen.getAllByText("例题精讲").length).toBeGreaterThanOrEqual(2);
    });
    expect(await screen.findByText("函数 f(x)=x² 在哪个区间单调递增？")).toBeInTheDocument();
    expect(screen.queryByText("先回顾函数的基本性质。")).not.toBeInTheDocument();
  });
});
