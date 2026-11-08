import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
import type { ExamPaper, Lecture, PersonalClass, Teacher } from "@/types";

vi.mock("@/services/class", () => ({ classService: { listPersonalClasses: vi.fn(), listStudentsByClass: vi.fn(), savePersonalClassChapterSelection: vi.fn() } }));
vi.mock("@/services/knowledge", () => ({ knowledgeService: { getChapterTree: vi.fn(), listKnowledgePoints: vi.fn() } }));
vi.mock("@/services/question", () => ({ questionService: { listQuestions: vi.fn() } }));
vi.mock("@/services/analytics", () => ({ analyticsService: { getKnowledgeMastery: vi.fn(), getStudentAnswerDetails: vi.fn() } }));
vi.mock("@/services/lecture", () => ({ lectureService: { listLectures: vi.fn(), createLecture: vi.fn() } }));
vi.mock("@/services/examPaper", () => ({ examPaperService: { listPapers: vi.fn() } }));
vi.mock("@/services/lessonCourseware", () => ({ lessonCoursewareService: { listCoursewares: vi.fn(), createFromLecture: vi.fn(), createFromExamPaper: vi.fn(), updateCourseware: vi.fn() } }));
vi.mock("@/services/basket", () => ({ basketService: { listBaskets: vi.fn(), addQuestion: vi.fn() } }));
vi.mock("@/services/grade", () => ({ gradeService: { getQueryData: vi.fn() } }));
vi.mock("@/stores/ui", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const personalClass: PersonalClass = {
  id: "pc-1", type: "personal", teacherId: "t-1", name: "个别辅导一班",
  description: "", studentIds: ["st-1"], createdAt: "2026-11-01",
};
const secondClass: PersonalClass = {
  id: "pc-2", type: "personal", teacherId: "t-1", name: "个别辅导二班",
  description: "", studentIds: [], createdAt: "2026-11-02",
};
const homework = {
  id: "paper-1", teacherId: "t-1", schoolId: "sch-1", title: "个人辅导作业",
  classIds: ["pc-1"], managementCategory: "homework", updatedAt: "2026-11-06",
} as ExamPaper;
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
  vi.mocked(knowledgeService.getChapterTree).mockResolvedValue({
    id: "root", name: "全部章节课", type: "chapter", count: 0, children: [
      { id: "ch", name: "数列", type: "chapter", count: 0, children: [
        { id: "child", name: "等比数列", type: "chapter", count: 0, children: [] },
      ] },
      { id: "geometry", name: "几何", type: "chapter", count: 0, children: [] },
    ],
  });
  vi.mocked(classService.savePersonalClassChapterSelection).mockImplementation(async (id, ids) => ({
    ...personalClass, id, tutoringChapterIds: ids,
  }));
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
    fireEvent.click(await screen.findByRole("button", { name: "勾选数列" }));
    await waitFor(() => expect(classService.savePersonalClassChapterSelection).toHaveBeenCalledWith("pc-1", ["ch"]));
    expect(await screen.findByText(/求通项公式/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "生成讲义" }));
    await waitFor(() => expect(lectureService.createLecture).toHaveBeenCalledWith("t-1", "sch-1", expect.objectContaining({
      classIds: ["pc-1"],
      sections: expect.arrayContaining([expect.objectContaining({ questionId: "q1" })]),
    })));
    expect(await screen.findByText("讲义编辑器")).toBeInTheDocument();
  });

  it("restores saved chapter nodes and keeps selections separate for each personal class", async () => {
    vi.mocked(classService.listPersonalClasses).mockResolvedValue([
      { ...personalClass, tutoringChapterIds: ["ch"] },
      { ...personalClass, id: "pc-2", name: "个别辅导二班", tutoringChapterIds: ["geometry"] },
    ]);
    renderPage("prepare");
    expect(await screen.findByRole("button", { name: "取消勾选数列" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "收起数列" }));
    expect(screen.queryByText("等比数列")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "展开数列" }));
    expect(screen.getByText("等比数列")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("个人教学班"), { target: { value: "pc-2" } });
    expect(await screen.findByRole("button", { name: "取消勾选几何" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "勾选数列" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("个人教学班"), { target: { value: "pc-1" } });
    expect(screen.getByRole("button", { name: "取消勾选数列" })).toBeInTheDocument();
    expect(classService.savePersonalClassChapterSelection).not.toHaveBeenCalled();
  });

  it("supports multiple chapter branches and saves each change in sequence", async () => {
    vi.mocked(questionService.listQuestions).mockResolvedValue([
      { id: "q1", teacherId: "t-1", chapterIds: ["child"], knowledgePointIds: ["kp"], stem: "数列题", recommendation: 5 },
      { id: "q2", teacherId: "t-1", chapterIds: ["geometry"], knowledgePointIds: ["kp"], stem: "几何题", recommendation: 4 },
    ] as never);
    renderPage("prepare");
    fireEvent.click(await screen.findByRole("button", { name: "勾选数列" }));
    expect(await screen.findByText("数列题")).toBeInTheDocument();
    expect(screen.queryByText("几何题")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "勾选几何" }));
    expect(await screen.findByText("几何题")).toBeInTheDocument();
    await waitFor(() => expect(classService.savePersonalClassChapterSelection).toHaveBeenLastCalledWith("pc-1", ["ch", "geometry"]));
    expect(knowledgeService.getChapterTree).toHaveBeenCalledWith("t-1", false);
  });

  it("lists all personal-class homework by default and filters by class", async () => {
    vi.mocked(classService.listPersonalClasses).mockResolvedValue([personalClass, secondClass]);
    vi.mocked(examPaperService.listPapers).mockResolvedValue([
      homework,
      { ...homework, id: "paper-2", title: "二班作业", classIds: ["pc-2"] },
      { ...homework, id: "paper-school", title: "普通班作业", classIds: ["school-1"] },
      { ...homework, id: "paper-exam", title: "二班考试", classIds: ["pc-2"], managementCategory: "exam" },
    ]);
    renderPage("materials");
    expect(await screen.findByText("二班作业")).toBeInTheDocument();
    expect(screen.getByText("个人辅导作业")).toBeInTheDocument();
    expect(screen.getByText("数列专题")).toBeInTheDocument();
    expect(screen.queryByText("普通班作业")).not.toBeInTheDocument();
    expect(screen.queryByText("二班考试")).not.toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "操作" })).toBeInTheDocument();
    expect(screen.getByLabelText("筛选班级")).toHaveValue("");
    fireEvent.change(screen.getByLabelText("筛选班级"), { target: { value: "pc-2" } });
    expect(screen.getByText("二班作业")).toBeInTheDocument();
    expect(screen.queryByText("个人辅导作业")).not.toBeInTheDocument();
    expect(screen.queryByText("数列专题")).not.toBeInTheDocument();
  });

  it("pushes homework only to personal classes not yet covered by a lesson deck", async () => {
    vi.mocked(classService.listPersonalClasses).mockResolvedValue([personalClass, secondClass]);
    vi.mocked(examPaperService.listPapers).mockResolvedValue([{ ...homework, classIds: ["pc-1", "pc-2"] }]);
    vi.mocked(lessonCoursewareService.listCoursewares).mockResolvedValue([{
      id: "lc-existing", sourceType: "examPaper", sourceId: homework.id, classIds: ["pc-1"],
      title: "已有的一班作业课件", slides: [], status: "draft",
    } as never]);
    vi.mocked(lessonCoursewareService.createFromExamPaper).mockResolvedValue({
      id: "lc-new", sourceType: "examPaper", sourceId: homework.id, classIds: ["pc-2"],
      title: "二班作业课件", slides: [], status: "draft",
    } as never);
    renderPage("materials");
    const row = (await screen.findByText("个人辅导作业")).closest("tr");
    expect(row).not.toBeNull();
    fireEvent.click(within(row!).getByRole("button", { name: "推送到个别辅导课件" }));
    await waitFor(() => expect(lessonCoursewareService.createFromExamPaper).toHaveBeenCalledWith(
      "t-1", "sch-1", homework.id, [], ["pc-2"],
    ));
    expect(await screen.findByText("二班作业课件")).toBeInTheDocument();
  });

  it("marks homework as pushed when every associated personal class is covered", async () => {
    vi.mocked(examPaperService.listPapers).mockResolvedValue([homework]);
    vi.mocked(lessonCoursewareService.listCoursewares).mockResolvedValue([{
      id: "lc-1", sourceType: "examPaper", sourceId: homework.id, classIds: ["pc-1"],
      title: "个人辅导作业（上课课件）", slides: [], status: "draft",
    } as never]);
    renderPage("materials");
    const row = (await screen.findByText("个人辅导作业")).closest("tr");
    expect(within(row!).getByRole("button", { name: "已推送" })).toBeDisabled();
  });

  it("pushes a personal class lecture as an editable lesson deck", async () => {
    vi.mocked(lessonCoursewareService.createFromLecture).mockResolvedValue({ id: "lc-1", classIds: ["pc-1"], sourceType: "lecture", sourceId: "lec-1", title: "数列专题课件", slides: [], status: "draft" } as never);
    renderPage("materials");
    fireEvent.click(await screen.findByRole("button", { name: "推送到个别辅导课件" }));
    await waitFor(() => expect(lessonCoursewareService.createFromLecture).toHaveBeenCalledWith("t-1", "sch-1", "lec-1", [], ["pc-1"]));
    expect(await screen.findByText("数列专题课件")).toBeInTheDocument();
  });
});
