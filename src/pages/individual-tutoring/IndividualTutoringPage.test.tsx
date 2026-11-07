import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import IndividualTutoringPage from "./IndividualTutoringPage";
import { useAuthStore } from "@/stores/auth";
import { classService } from "@/services/class";
import { knowledgeService } from "@/services/knowledge";
import { questionService } from "@/services/question";
import { analyticsService } from "@/services/analytics";
import { lectureService } from "@/services/lecture";
import { examPaperService } from "@/services/examPaper";
import { lessonCoursewareService } from "@/services/lessonCourseware";
import { basketService } from "@/services/basket";
import { gradeService } from "@/services/grade";
import type { Lecture, PersonalClass, Teacher } from "@/types";

vi.mock("@/services/class", () => ({ classService: { listPersonalClasses: vi.fn(), listStudentsByClass: vi.fn() } }));
vi.mock("@/services/knowledge", () => ({ knowledgeService: { listChapters: vi.fn(), listKnowledgePoints: vi.fn() } }));
vi.mock("@/services/question", () => ({ questionService: { listQuestions: vi.fn() } }));
vi.mock("@/services/analytics", () => ({ analyticsService: { getKnowledgeMastery: vi.fn(), getStudentAnswerDetails: vi.fn() } }));
vi.mock("@/services/lecture", () => ({ lectureService: { listLectures: vi.fn(), createLecture: vi.fn() } }));
vi.mock("@/services/examPaper", () => ({ examPaperService: { listPapers: vi.fn() } }));
vi.mock("@/services/lessonCourseware", () => ({ lessonCoursewareService: { listCoursewares: vi.fn(), createFromLecture: vi.fn(), updateCourseware: vi.fn() } }));
vi.mock("@/services/basket", () => ({ basketService: { listBaskets: vi.fn(), addQuestion: vi.fn() } }));
vi.mock("@/services/grade", () => ({ gradeService: { getQueryData: vi.fn() } }));
vi.mock("@/stores/ui", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const personalClass: PersonalClass = {
  id: "pc-1", type: "personal", teacherId: "t-1", name: "个别辅导一班",
  description: "", studentIds: ["st-1"], createdAt: "2026-11-01",
};
const lecture = {
  id: "lec-1", teacherId: "t-1", schoolId: "sch-1", title: "数列专题",
  classIds: ["pc-1"], sections: [{ id: "sec", title: "数列", type: "chapter", content: "", children: [] }],
} as Lecture;

function renderPage(section: string) {
  render(<MemoryRouter initialEntries={[`/individual-tutoring/${section}`]}>
    <Routes>
      <Route path="/individual-tutoring/:section" element={<IndividualTutoringPage />} />
      <Route path="/lectures/:id/edit" element={<div>讲义编辑器</div>} />
    </Routes>
  </MemoryRouter>);
}

beforeEach(() => {
  vi.clearAllMocks();
  useAuthStore.setState({ teacher: { id: "t-1", schoolId: "sch-1" } as Teacher,
    getCurrentAffiliation: () => null });
  vi.mocked(classService.listPersonalClasses).mockResolvedValue([personalClass]);
  vi.mocked(classService.listStudentsByClass).mockResolvedValue([{ id: "st-1", name: "小王", grade: "高一" } as never]);
  vi.mocked(knowledgeService.listChapters).mockResolvedValue([{ id: "ch", schoolId: "sch-1", parentId: null, name: "数列", level: 1, order: 0 }]);
  vi.mocked(knowledgeService.listKnowledgePoints).mockResolvedValue([{ id: "kp", schoolId: "sch-1", parentId: null, name: "等差数列", level: 1, order: 0 }]);
  vi.mocked(questionService.listQuestions).mockResolvedValue([{
    id: "q1", teacherId: "t-1", schoolId: "sch-1", chapterIds: ["ch"], knowledgePointIds: ["kp"], stem: "求通项公式",
    recommendation: 5,
  } as never]);
  vi.mocked(analyticsService.getKnowledgeMastery).mockResolvedValue([{ knowledgePointId: "kp", knowledgePointName: "等差数列", masteryLevel: "weak" } as never]);
  vi.mocked(analyticsService.getStudentAnswerDetails).mockResolvedValue([]);
  vi.mocked(gradeService.getQueryData).mockRejectedValue(new Error("no grades"));
  vi.mocked(lectureService.listLectures).mockResolvedValue([lecture]);
  vi.mocked(examPaperService.listPapers).mockResolvedValue([]);
  vi.mocked(lessonCoursewareService.listCoursewares).mockResolvedValue([]);
  vi.mocked(basketService.listBaskets).mockResolvedValue([{ id: "basket-1", name: "练习篮", questionIds: [] } as never]);
  vi.mocked(basketService.addQuestion).mockResolvedValue(undefined);
  vi.mocked(lectureService.createLecture).mockImplementation(async (_t, _s, input) => ({ ...lecture, ...input, id: "lec-created" } as Lecture));
});

describe("IndividualTutoringPage", () => {
  it("requires an existing personal teaching class", async () => {
    vi.mocked(classService.listPersonalClasses).mockResolvedValue([]);
    renderPage("classes");
    expect(await screen.findByText("暂无个人教学班")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "前往个人教学班管理" })).toBeInTheDocument();
  });

  it("shows the class roster and individual mastery", async () => {
    renderPage("classes");
    fireEvent.click(await screen.findByRole("button", { name: /小王/ }));
    expect(await screen.findByText("等差数列")).toBeInTheDocument();
    expect(screen.getByText("暂无可访问的历史考试成绩")).toBeInTheDocument();
  });

  it("creates a lecture using only the checked suggested questions", async () => {
    renderPage("prepare");
    await screen.findByRole("option", { name: "数列" });
    fireEvent.change(screen.getByLabelText("章节课目录"), { target: { value: "ch" } });
    expect(await screen.findByText(/求通项公式/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "生成讲义" }));
    await waitFor(() => expect(lectureService.createLecture).toHaveBeenCalledWith("t-1", "sch-1", expect.objectContaining({
      classIds: ["pc-1"],
      sections: expect.arrayContaining([expect.objectContaining({ questionId: "q1" })]),
    })));
    expect(await screen.findByText("讲义编辑器")).toBeInTheDocument();
  });

  it("pushes a personal class lecture as an editable lesson deck", async () => {
    vi.mocked(lessonCoursewareService.createFromLecture).mockResolvedValue({ id: "lc-1", classIds: [], sourceType: "lecture", sourceId: "lec-1" } as never);
    vi.mocked(lessonCoursewareService.createFromLecture).mockResolvedValue({ id: "lc-1", classIds: ["pc-1"], sourceType: "lecture", sourceId: "lec-1", title: "数列专题课件", slides: [], status: "draft" } as never);
    renderPage("materials");
    fireEvent.click(await screen.findByRole("button", { name: "推送课件" }));
    await waitFor(() => expect(lessonCoursewareService.createFromLecture).toHaveBeenCalledWith("t-1", "sch-1", "lec-1", [], ["pc-1"]));
    expect(await screen.findByText("数列专题课件")).toBeInTheDocument();
  });
});
