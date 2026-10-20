import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import HomeworkExamManagementPage from "./HomeworkExamManagementPage";
import { useAuthStore } from "@/stores/auth";
import { classService } from "@/services/class";
import { extractStoredFile } from "@/services/api";
import { classroomHomeworkService } from "@/services/classroomHomework";
import { examPublishService } from "@/services/examPublish";
import { examPaperService } from "@/services/examPaper";
import { homeworkRecordService } from "@/services/homeworkRecord";
import type { ClassroomHomework, ExamPaper, ExamPublication, HomeworkClassOverviewRecord, PersonalClass, SchoolClass, Teacher, Student } from "@/types";

vi.mock("@/services/class", () => ({ classService: { listAllClasses: vi.fn(), listMyStudents: vi.fn() } }));
vi.mock("@/services/api", () => ({ extractStoredFile: vi.fn() }));
vi.mock("@/services/classroomHomework", () => ({ classroomHomeworkService: { listHomeworks: vi.fn(), updateHomework: vi.fn() } }));
vi.mock("@/services/examPaper", () => ({ examPaperService: { listPapers: vi.fn(), getPaper: vi.fn(), updatePaper: vi.fn() } }));
vi.mock("@/services/examPublish", () => ({ examPublishService: { listPublications: vi.fn() } }));
vi.mock("@/services/homeworkRecord", () => ({ homeworkRecordService: { listClassOverviews: vi.fn() } }));

const one = {
  id: "class-1", type: "school", schoolId: "school-1", grade: "高二", name: "一班",
} as SchoolClass;
const personal = {
  id: "personal-1", type: "personal", teacherId: "teacher-1", name: "周末提高班",
  description: "", studentIds: [], createdAt: "2026-10-01T00:00:00Z",
} as PersonalClass;
const homework: ClassroomHomework = {
  id: "homework-1", title: "函数专题作业", content: "完成第1题", teacherId: "teacher-1", teacherName: "李老师",
  schoolId: "school-1", subject: "数学", classIds: [one.id], assignedDate: "2026-10-12",
  publishAt: "2026-10-12T00:00:00Z", createdAt: "2026-10-11T00:00:00Z", updatedAt: "2026-10-11T00:00:00Z",
};
const paper = {
  id: "paper-1", teacherId: "teacher-1", schoolId: "school-1", title: "资源篮函数练习",
  description: "从资源篮组卷", originalFileName: "函数练习.pdf", classIds: [one.id],
  chapterIds: [], knowledgePointIds: [], grade: "高二", schoolYear: "2026-2027",
  questions: [], totalScore: 0, duration: 45, status: "draft",
  createdAt: "2026-10-10T00:00:00Z", updatedAt: "2026-10-11T00:00:00Z",
} as ExamPaper;
const attendance = {
  id: "record-1", schoolId: "school-1", teacherId: "teacher-1", classId: one.id,
  homeworkDate: "2026-10-12", summary: "", studentIds: ["s1", "s2", "s3"],
  submittedStudentIds: ["s1", "s2"], absentStudentIds: [], attendanceTaken: true,
  createdAt: "2026-10-12T00:00:00Z", updatedAt: "2026-10-12T00:00:00Z",
} as HomeworkClassOverviewRecord;
const publication = {
  id: "pub-1", examPaperId: "paper-1", publisherId: "teacher-1", publisherSchoolId: "school-1",
  title: "期中数学测验", targetType: "schoolClass", targetClassIds: [one.id], targetSchoolIds: [],
  targetStudentIds: [], isFormalExam: true, questionIds: [], status: "active",
  createdAt: "2026-10-10T00:00:00Z", updatedAt: "2026-10-10T00:00:00Z",
} as ExamPublication;

function mount(section: "homework" | "exams") {
  return render(<MemoryRouter initialEntries={[`/homework-exams/${section}`]}><HomeworkExamManagementPage section={section} /></MemoryRouter>);
}

describe("作业考试管理页面", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({
      teacher: { id: "teacher-1", schoolId: "school-1", name: "李老师" } as Teacher,
      getCurrentAffiliation: () => null,
    });
    vi.mocked(classService.listAllClasses).mockResolvedValue([one]);
    vi.mocked(classService.listMyStudents).mockResolvedValue([
      { id: "s1", name: "张三", studentNo: "001" },
      { id: "s2", name: "李四", studentNo: "002" },
      { id: "s3", name: "王五", studentNo: "003" },
    ] as Student[]);
    vi.mocked(classroomHomeworkService.listHomeworks).mockResolvedValue([homework]);
    vi.mocked(homeworkRecordService.listClassOverviews).mockResolvedValue([attendance]);
    vi.mocked(examPaperService.listPapers).mockResolvedValue([paper]);
    vi.mocked(examPaperService.getPaper).mockResolvedValue(paper);
    vi.mocked(examPublishService.listPublications).mockResolvedValue([
      publication, { ...publication, id: "pub-2", title: "其他人的试卷", publisherId: "teacher-2" },
    ]);
  });

  it("offers a standalone blank answer sheet only from exam management", async () => {
    const view = mount("exams");
    expect(await screen.findByRole("link", { name: "制作空白答题卡" })).toHaveAttribute(
      "href", "/homework-exams/exams/blank-answer-sheet",
    );
    view.unmount();
    mount("homework");
    expect(screen.queryByRole("link", { name: "制作空白答题卡" })).not.toBeInTheDocument();
  });

  it("lists each homework with its name, audience, status, and recorded attendance", async () => {
    mount("homework");
    const row = await screen.findByRole("row", { name: /函数专题作业/ });
    expect(within(row).getByText("班级：高二 · 一班")).toBeInTheDocument();
    fireEvent.click(within(row).getByRole("button", { name: "1" }));
    expect(screen.getByText("王五（003）")).toBeInTheDocument();
    expect(screen.queryByText("张三（001）")).not.toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.getByRole("columnheader", { name: "作业名称" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "作业文件名" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "已交" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "出作业" })).toHaveAttribute("href", "/my-resources/exam-papers?create=homework");
    fireEvent.click(within(row).getByRole("button", { name: "编辑" }));
    expect(screen.getByRole("link", { name: "编辑作业内容与附件" })).toHaveAttribute("href", "/my-lessons?tab=homework&edit=homework-1");
    fireEvent.click(screen.getByRole("button", { name: "取消" }));
    expect(classroomHomeworkService.listHomeworks).toHaveBeenCalledWith({ schoolId: "school-1", teacherId: "teacher-1" });
    fireEvent.change(screen.getByRole("textbox", { name: "搜索作业" }), { target: { value: "不存在" } });
    expect(screen.getByText("没有符合筛选条件的记录")).toBeInTheDocument();
  });

  it("keeps the homework title and filename visible while later columns scroll and links to student homework records", async () => {
    mount("homework");
    const tableRegion = await screen.findByRole("region", { name: "作业管理表格，可横向滚动查看后续列" });
    expect(within(tableRegion).getByRole("table")).toHaveClass("min-w-[1600px]", "table-fixed");
    expect(within(tableRegion).getByRole("columnheader", { name: "作业名称" })).toHaveClass("sticky", "left-0");
    expect(within(tableRegion).getByRole("columnheader", { name: "作业文件名" })).toHaveClass("sticky", "left-56");
    expect(within(tableRegion).getByRole("columnheader", { name: "使用对象" })).not.toHaveClass("sticky");
    const homeworkRow = within(tableRegion).getByRole("row", { name: /函数专题作业/ });
    expect(within(homeworkRow).getAllByRole("cell")[0]).toHaveClass("sticky", "left-0");
    expect(within(homeworkRow).getAllByRole("cell")[1]).toHaveClass("sticky", "left-56");
    expect(within(homeworkRow).getByRole("link", { name: "作业记录" })).toHaveAttribute("href", "/my-students?tab=homework");
    const paperRow = within(tableRegion).getByRole("row", { name: /资源篮函数练习/ });
    expect(within(paperRow).getByRole("link", { name: "作业记录" })).toHaveAttribute("href", "/my-students?tab=homework");
  });

  it("does not add homework record actions or frozen columns to exam management", async () => {
    mount("exams");
    const tableRegion = await screen.findByRole("region", { name: "考试管理表格" });
    expect(within(tableRegion).getByRole("table")).toHaveClass("min-w-[1000px]");
    expect(within(tableRegion).getByRole("columnheader", { name: "考试名称" })).not.toHaveClass("sticky");
    expect(within(tableRegion).queryByRole("link", { name: "作业记录" })).not.toBeInTheDocument();
  });

  it("includes library documents and copies with truthful original filenames", async () => {
    vi.mocked(examPaperService.listPapers).mockResolvedValue([
      paper, { ...paper, id: "copy-1", title: "函数练习（副本）", originalFileName: undefined },
    ]);
    mount("homework");
    const first = await screen.findByRole("row", { name: /资源篮函数练习/ });
    expect(within(first).getByRole("link", { name: "函数练习.pdf" })).toHaveAttribute("href", "/exam-papers/paper-1/preview");
    const copied = screen.getByRole("row", { name: /函数练习（副本）/ });
    expect(within(copied).getByRole("link", { name: "函数练习（副本）" })).toHaveAttribute("href", "/exam-papers/copy-1/preview");
    expect(within(copied).getByText("草稿")).toBeInTheDocument();
    expect(examPaperService.listPapers).toHaveBeenCalledWith({ schoolId: "school-1", teacherId: "teacher-1" });
    expect(classService.listAllClasses).toHaveBeenCalledWith("school-1", "teacher-1");
  });

  it("hides uploaded originals and extraction copies, but keeps newly authored papers and ordinary copies", async () => {
    vi.mocked(examPaperService.listPapers).mockResolvedValue([
      { ...paper, id: "uploaded", title: "上传原稿", originalFileUrl: "/api/files/original-1" },
      { ...paper, id: "extracted", title: "拆解稿", originalFileName: undefined, isExtractCopy: true, sourceResourceId: "uploaded" },
      paper,
      { ...paper, id: "duplicate", title: "新建副本", originalFileName: undefined },
    ]);
    mount("homework");
    expect(await screen.findByRole("row", { name: /资源篮函数练习/ })).toBeInTheDocument();
    expect(screen.getByRole("row", { name: /新建副本/ })).toBeInTheDocument();
    expect(screen.queryByText("上传原稿")).not.toBeInTheDocument();
    expect(screen.queryByText("拆解稿")).not.toBeInTheDocument();
  });

  it("renders individual recipients by name and resolves personal class audiences in Chinese", async () => {
    vi.mocked(classService.listAllClasses).mockResolvedValue([one, personal]);
    vi.mocked(examPaperService.listPapers).mockResolvedValue([{
      ...paper, id: "individual", classIds: [], studentIds: ["s2"],
    }, { ...paper, id: "personal-paper", title: "个人班级作业", classIds: [personal.id] }]);
    mount("homework");
    const row = await screen.findByRole("row", { name: /资源篮函数练习/ });
    expect(within(row).getByText("个人：李四")).toBeInTheDocument();
    const personalRow = screen.getByRole("row", { name: /个人班级作业/ });
    expect(within(personalRow).getByText("班级：个人班级 · 周末提高班")).toBeInTheDocument();
    fireEvent.click(within(personalRow).getByRole("button", { name: "编辑" }));
    expect(screen.getByRole("checkbox", { name: "个人班级 · 周末提高班" })).toBeChecked();
  });

  it("keeps original-file documents in exam management when categorized as exams", async () => {
    vi.mocked(examPaperService.listPapers).mockResolvedValue([{
      ...paper, managementCategory: "exam", originalFileUrl: "/api/files/original-1",
    }]);
    mount("exams");
    expect(await screen.findByRole("row", { name: /资源篮函数练习/ })).toBeInTheDocument();
  });

  it("previews classroom homework attachments, including Word documents", async () => {
    vi.mocked(classroomHomeworkService.listHomeworks).mockResolvedValue([{
      ...homework, attachments: [
        { id: "a1", name: "习题.pdf", url: "/api/files/a1", mimeType: "application/pdf", size: 10 },
        { id: "a2", name: "答案.docx", url: "/api/files/a2", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", size: 20 },
      ],
    }]);
    vi.mocked(extractStoredFile).mockResolvedValue({ html: "<p>答案正文</p>" } as Awaited<ReturnType<typeof extractStoredFile>>);
    mount("homework");
    const row = await screen.findByRole("row", { name: /函数专题作业/ });
    fireEvent.click(within(row).getByRole("button", { name: "习题.pdf" }));
    expect(screen.getByTitle("习题.pdf")).toHaveAttribute("src", "/api/files/a1");
    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent.click(within(row).getByRole("button", { name: "答案.docx" }));
    await waitFor(() => expect(extractStoredFile).toHaveBeenCalledWith("/api/files/a2"));
    expect(await screen.findByText("答案正文")).toBeInTheDocument();
  });

  it("omits absent students from the clickable missing-homework roster", async () => {
    vi.mocked(homeworkRecordService.listClassOverviews).mockResolvedValue([{
      ...attendance, absentStudentIds: ["s2"], submittedStudentIds: ["s1"],
    }]);
    mount("homework");
    const row = await screen.findByRole("row", { name: /函数专题作业/ });
    fireEvent.click(within(row).getByRole("button", { name: "1" }));
    expect(screen.getByText("王五（003）")).toBeInTheDocument();
    expect(screen.queryByText("李四（002）")).not.toBeInTheDocument();
  });

  it("shows answer availability and saves only choice answers from the modal", async () => {
    const questions = [
      { id: "q-1", type: "single", stem: "第一题", options: ["甲", "乙", "丙"], answer: "", analysis: "", score: 2 },
      { id: "q-2", type: "multiple", stem: "第二题", options: ["甲", "乙", "丙"], answer: "AC", analysis: "", score: 3 },
      { id: "q-3", type: "short", stem: "第三题", answer: "其他答案", analysis: "", score: 5 },
    ] as ExamPaper["questions"];
    const paperWithChoices = { ...paper, questions };
    vi.mocked(examPaperService.listPapers).mockResolvedValue([paperWithChoices]);
    vi.mocked(examPaperService.getPaper).mockResolvedValue(paperWithChoices);
    vi.mocked(examPaperService.updatePaper).mockImplementation(async (_id, patch) =>
      ({ ...paperWithChoices, ...patch }));
    mount("homework");
    const row = await screen.findByRole("row", { name: /资源篮函数练习/ });
    expect(screen.getByRole("columnheader", { name: "答案" })).toBeInTheDocument();
    const status = within(row).getByRole("button", { name: /选择题答案：无/ });
    expect(status).toHaveTextContent("无");
    fireEvent.click(status);
    expect(await screen.findByRole("heading", { name: /选择题答案 · 资源篮函数练习/ })).toBeInTheDocument();
    expect(screen.getByLabelText("第 1 题答案")).toHaveValue("");
    expect(screen.getByLabelText("第 2 题答案")).toHaveValue("AC");
    expect(screen.queryByLabelText("第 3 题答案")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("第 1 题答案"), { target: { value: "b" } });
    fireEvent.change(screen.getByLabelText("第 2 题答案"), { target: { value: "c,a" } });
    fireEvent.click(screen.getByRole("button", { name: "保存答案" }));
    await waitFor(() => expect(examPaperService.updatePaper).toHaveBeenCalledWith("paper-1", {
      questions: [
        { ...questions[0], answer: "B" },
        { ...questions[1], answer: "AC" },
        questions[2],
      ],
    }));
    await waitFor(() => expect(within(row).getByRole("button", { name: /选择题答案：有/ })).toHaveTextContent("有"));
  });

  it("rejects invalid choice answers without changing the paper", async () => {
    const withChoices = { ...paper, questions: [
      { id: "q-1", type: "single", stem: "只有两个选项", options: ["甲", "乙"], answer: "", analysis: "", score: 2 },
    ] as ExamPaper["questions"] };
    vi.mocked(examPaperService.listPapers).mockResolvedValue([withChoices]);
    vi.mocked(examPaperService.getPaper).mockResolvedValue(withChoices);
    mount("homework");
    const row = await screen.findByRole("row", { name: /资源篮函数练习/ });
    fireEvent.click(within(row).getByRole("button", { name: /选择题答案：无/ }));
    await screen.findByLabelText("第 1 题答案");
    fireEvent.change(screen.getByLabelText("第 1 题答案"), { target: { value: "C" } });
    fireEvent.click(screen.getByRole("button", { name: "保存答案" }));
    expect(examPaperService.updatePaper).not.toHaveBeenCalled();
    expect(screen.getByLabelText("第 1 题答案")).toBeInTheDocument();
  });

  it("displays no answer for classroom homework and empty papers", async () => {
    mount("homework");
    const classroom = await screen.findByRole("row", { name: /函数专题作业/ });
    expect(within(classroom).getByText("无")).toBeInTheDocument();
    expect(within(classroom).queryByRole("button", { name: /选择题答案/ })).not.toBeInTheDocument();
    const paperRow = screen.getByRole("row", { name: /资源篮函数练习/ });
    fireEvent.click(within(paperRow).getByRole("button", { name: /选择题答案：无/ }));
    expect(await screen.findByText("该试卷暂无选择题，请在试卷编辑器中添加题目。")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "保存答案" })).toBeDisabled();
  });

  it("edits document metadata and moves it into exam management without deleting the document", async () => {
    vi.mocked(examPaperService.updatePaper).mockImplementation(async (id, patch) => {
      const updated = { ...paper, ...patch };
      vi.mocked(examPaperService.listPapers).mockResolvedValue([updated]);
      return updated;
    });
    const view = mount("homework");
    const row = await screen.findByRole("row", { name: /资源篮函数练习/ });
    fireEvent.click(within(row).getByRole("button", { name: "编辑" }));
    expect(screen.getByRole("link", { name: "编辑试卷内容" })).toHaveAttribute("href", "/exam-papers/paper-1");
    fireEvent.change(screen.getByLabelText("管理目录"), { target: { value: "exam" } });
    fireEvent.change(screen.getByLabelText("开始日期"), { target: { value: "2026-10-20" } });
    fireEvent.change(screen.getByLabelText("结束日期"), { target: { value: "2026-10-21" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(examPaperService.updatePaper).toHaveBeenCalledWith("paper-1", expect.objectContaining({
      managementCategory: "exam", classIds: ["class-1"], assignedDate: "2026-10-20", assignedEndDate: "2026-10-21",
    })));
    await waitFor(() => expect(screen.queryByText("资源篮函数练习")).not.toBeInTheDocument());
    view.unmount();
    mount("exams");
    const moved = await screen.findByRole("row", { name: /资源篮函数练习/ });
    expect(within(moved).getByText("考试试卷")).toBeInTheDocument();
    expect(within(moved).getByRole("button", { name: "编辑" })).toBeInTheDocument();
  });

  it("moves a classroom homework into exam management while preserving its contents", async () => {
    vi.mocked(classroomHomeworkService.updateHomework).mockImplementation(async (_id, _teacher, _school, input) => {
      const updated = { ...homework, ...input };
      vi.mocked(classroomHomeworkService.listHomeworks).mockResolvedValue([updated]);
      return updated;
    });
    const view = mount("homework");
    const row = await screen.findByRole("row", { name: /函数专题作业/ });
    fireEvent.click(within(row).getByRole("button", { name: "编辑" }));
    fireEvent.change(screen.getByLabelText("管理目录"), { target: { value: "exam" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(classroomHomeworkService.updateHomework).toHaveBeenCalledWith(
      "homework-1", "teacher-1", "school-1",
      expect.objectContaining({ content: "完成第1题", managementCategory: "exam" }),
    ));
    view.unmount();
    mount("exams");
    const moved = await screen.findByRole("row", { name: /函数专题作业/ });
    expect(within(moved).getByText("班级作业")).toBeInTheDocument();
  });

  it("shows only the teacher's publications and links to the original editor", async () => {
    mount("exams");
    const row = await screen.findByRole("row", { name: /期中数学测验/ });
    expect(within(row).getByText("高二 · 一班")).toBeInTheDocument();
    expect(within(row).getByText("正规考试")).toBeInTheDocument();
    expect(within(row).getByRole("link", { name: "查看 / 管理" })).toHaveAttribute("href", "/exam-papers/paper-1");
    expect(screen.queryByText("其他人的试卷")).not.toBeInTheDocument();
    expect(homeworkRecordService.listClassOverviews).not.toHaveBeenCalled();
  });

  it("does not query another school for personal affiliation", async () => {
    useAuthStore.setState({ teacher: { id: "teacher-1", schoolId: null } as Teacher });
    mount("homework");
    await waitFor(() => expect(screen.getByText("请切换到学校身份后查看作业考试。")).toBeInTheDocument());
    expect(classroomHomeworkService.listHomeworks).not.toHaveBeenCalled();
  });

  it("shows unknown attendance instead of fabricated zeroes", async () => {
    vi.mocked(homeworkRecordService.listClassOverviews).mockResolvedValue([]);
    mount("homework");
    const row = await screen.findByRole("row", { name: /函数专题作业/ });
    expect(within(row).getAllByText("—")).toHaveLength(3);
  });
});
