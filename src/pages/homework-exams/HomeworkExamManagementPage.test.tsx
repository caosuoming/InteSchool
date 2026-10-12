import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import HomeworkExamManagementPage from "./HomeworkExamManagementPage";
import { useAuthStore } from "@/stores/auth";
import { classService } from "@/services/class";
import { classroomHomeworkService } from "@/services/classroomHomework";
import { examPublishService } from "@/services/examPublish";
import { homeworkRecordService } from "@/services/homeworkRecord";
import type { ClassroomHomework, ExamPublication, HomeworkClassOverviewRecord, SchoolClass, Teacher } from "@/types";

vi.mock("@/services/class", () => ({ classService: { listSchoolClasses: vi.fn() } }));
vi.mock("@/services/classroomHomework", () => ({ classroomHomeworkService: { listHomeworks: vi.fn() } }));
vi.mock("@/services/examPublish", () => ({ examPublishService: { listPublications: vi.fn() } }));
vi.mock("@/services/homeworkRecord", () => ({ homeworkRecordService: { listClassOverviews: vi.fn() } }));

const one = {
  id: "class-1", type: "school", schoolId: "school-1", grade: "高二", name: "一班",
} as SchoolClass;
const homework: ClassroomHomework = {
  id: "homework-1", title: "函数专题作业", content: "完成第1题", teacherId: "teacher-1", teacherName: "李老师",
  schoolId: "school-1", subject: "数学", classIds: [one.id], assignedDate: "2026-10-12",
  publishAt: "2026-10-12T00:00:00Z", createdAt: "2026-10-11T00:00:00Z", updatedAt: "2026-10-11T00:00:00Z",
};
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
    vi.mocked(classService.listSchoolClasses).mockResolvedValue([one]);
    vi.mocked(classroomHomeworkService.listHomeworks).mockResolvedValue([homework]);
    vi.mocked(homeworkRecordService.listClassOverviews).mockResolvedValue([attendance]);
    vi.mocked(examPublishService.listPublications).mockResolvedValue([
      publication, { ...publication, id: "pub-2", title: "其他人的试卷", publisherId: "teacher-2" },
    ]);
  });

  it("lists each homework with its name, audience, status, and recorded attendance", async () => {
    mount("homework");
    const row = await screen.findByRole("row", { name: /函数专题作业/ });
    expect(within(row).getByText("高二 · 一班")).toBeInTheDocument();
    expect(within(row).getByText("2")).toBeInTheDocument();
    expect(within(row).getByText("1")).toBeInTheDocument();
    expect(within(row).getByRole("link", { name: "编辑" })).toHaveAttribute("href", "/my-lessons?tab=homework&edit=homework-1");
    expect(classroomHomeworkService.listHomeworks).toHaveBeenCalledWith({ schoolId: "school-1", teacherId: "teacher-1" });
    fireEvent.change(screen.getByRole("textbox", { name: "搜索作业" }), { target: { value: "不存在" } });
    expect(screen.getByText("没有符合筛选条件的记录")).toBeInTheDocument();
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
    expect(within(row).getAllByText("—")).toHaveLength(2);
  });
});
