import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { StudentHomeworkRecordPage } from "@/pages/students/StudentHomeworkRecordPage";
import { classService } from "@/services/class";
import { homeworkRecordService } from "@/services/homeworkRecord";
import { knowledgeService } from "@/services/knowledge";
import { useAuthStore } from "@/stores/auth";
import type { KnowledgePoint, SchoolClass, Student, Teacher, TreeNode } from "@/types";

vi.mock("@/services/class", () => ({
  classService: {
    listMyStudents: vi.fn(),
    listMyClasses: vi.fn(),
  },
}));

vi.mock("@/services/homeworkRecord", () => ({
  homeworkRecordService: {
    listPinnedKnowledgePointIds: vi.fn(),
    setPinnedKnowledgePointIds: vi.fn(),
    listByStudent: vi.fn(),
    setRecord: vi.fn(),
  },
}));

vi.mock("@/services/knowledge", () => ({
  knowledgeService: {
    getKnowledgeTree: vi.fn(),
    listKnowledgePoints: vi.fn(),
  },
}));

vi.mock("@/stores/ui", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const teacher = {
  id: "teacher-1",
  schoolId: "school-1",
} as Teacher;

const classes: SchoolClass[] = [{
  id: "class-1",
  type: "school",
  schoolId: "school-1",
  name: "高一（1）班",
  grade: "高一",
  studentCount: 1,
  createdBy: "admin-1",
  createdAt: "2026-08-01T00:00:00.000Z",
}];

const students: Student[] = [{
  id: "student-1",
  name: "甲同学",
  studentNo: "001",
  classId: "class-1",
  schoolId: "school-1",
  grade: "高一",
  status: "active",
}];

const knowledgePoints: KnowledgePoint[] = [{
  id: "kp-root",
  schoolId: "personal-directory:teacher-1",
  teacherId: "teacher-1",
  parentId: null,
  name: "函数",
  order: 1,
  level: 0,
}, {
  id: "kp-child",
  schoolId: "personal-directory:teacher-1",
  teacherId: "teacher-1",
  parentId: "kp-root",
  name: "单调区间",
  order: 1,
  level: 1,
}];

const knowledgeTree: TreeNode = {
  id: "root",
  name: "全部知识点",
  type: "knowledge",
  count: 0,
  children: [{
    id: "kp-root",
    name: "函数",
    type: "knowledge",
    count: 0,
    children: [{
      id: "kp-child",
      name: "单调区间",
      type: "knowledge",
      count: 0,
      children: [],
    }],
  }],
};

describe("StudentHomeworkRecordPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({ teacher, loading: false, error: null });
    vi.mocked(classService.listMyStudents).mockResolvedValue(students);
    vi.mocked(classService.listMyClasses).mockResolvedValue(classes);
    vi.mocked(knowledgeService.getKnowledgeTree).mockResolvedValue(knowledgeTree);
    vi.mocked(knowledgeService.listKnowledgePoints).mockResolvedValue(knowledgePoints);
    vi.mocked(homeworkRecordService.listPinnedKnowledgePointIds).mockResolvedValue(["kp-child"]);
    vi.mocked(homeworkRecordService.listByStudent).mockResolvedValue([{
      id: "record-1",
      teacherId: "teacher-1",
      schoolId: "school-1",
      studentId: "student-1",
      knowledgePointId: "kp-child",
      status: "done",
      createdAt: "2026-09-05T08:00:00.000Z",
      updatedAt: "2026-09-05T08:00:00.000Z",
    }]);
    vi.mocked(homeworkRecordService.setRecord).mockImplementation(async (input) => ({
      id: "record-1",
      teacherId: "teacher-1",
      schoolId: "school-1",
      studentId: input.studentId,
      knowledgePointId: input.knowledgePointId,
      status: input.status || "done",
      createdAt: "2026-09-05T08:00:00.000Z",
      updatedAt: "2026-09-05T08:01:00.000Z",
    }));
    vi.mocked(homeworkRecordService.setPinnedKnowledgePointIds).mockImplementation(async (ids) => ids);
  });

  it("loads a pinned knowledge point for the selected student and saves status changes", async () => {
    const user = userEvent.setup();
    render(<StudentHomeworkRecordPage />);

    expect(await screen.findByText("单调区间")).toBeInTheDocument();
    expect(screen.getByText(/当前学生：甲同学/)).toBeInTheDocument();

    const done = screen.getByRole("button", { name: "已做" });
    await waitFor(() => {
      expect(done).toHaveAttribute("aria-pressed", "true");
    });

    const partial = screen.getByRole("button", { name: "半对" });
    await user.click(partial);

    await waitFor(() => {
      expect(homeworkRecordService.setRecord).toHaveBeenCalledWith({
        studentId: "student-1",
        knowledgePointId: "kp-child",
        status: "partial",
      });
    });
    expect(partial).toHaveAttribute("aria-pressed", "true");
  });

  it("opens the knowledge directory picker and persists the pinned selection", async () => {
    const user = userEvent.setup();
    render(<StudentHomeworkRecordPage />);

    await screen.findByText("单调区间");
    await user.click(screen.getByRole("button", { name: /固定知识点/ }));
    expect(screen.getByText("知识点目录")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "保存固定" }));
    await waitFor(() => {
      expect(homeworkRecordService.setPinnedKnowledgePointIds).toHaveBeenCalledWith(["kp-child"]);
    });
  });
});
