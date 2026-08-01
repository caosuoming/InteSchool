import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PrepWorkspacePage from "@/pages/prep/PrepWorkspacePage";
import { prepService } from "@/services/prep";
import { organizationService } from "@/services/organization";
import { useAuthStore } from "@/stores/auth";
import type { PrepTask, Teacher } from "@/types";

vi.mock("@/hooks/useSchoolResourceOptions", () => ({
  useSchoolResourceOptions: () => ({
    gradeOptions: [
      { value: "高一", label: "高一" },
      { value: "高二", label: "高二" },
    ],
  }),
}));

vi.mock("@/services/prep", async () => {
  const actual = await vi.importActual<typeof import("@/services/prep")>("@/services/prep");
  return {
    ...actual,
    prepService: {
      listTasks: vi.fn(),
      createTask: vi.fn(),
      assignTask: vi.fn(),
      updateAssignment: vi.fn(),
    },
  };
});

vi.mock("@/services/organization", () => ({
  organizationService: {
    listTeachers: vi.fn(),
  },
}));

vi.mock("@/stores/ui", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  },
}));

const currentTeacher: Teacher = {
  id: "teacher-1",
  email: "teacher1@example.com",
  name: "王老师",
  avatar: "",
  schoolId: "school-1",
  subject: "数学",
  teachingGrades: ["高一"],
  employeeNo: "T001",
  status: "active",
  role: "teacher",
  roles: ["teacher", "prepLeader"],
  subjectGroupIds: ["subject-group-1"],
  prepGroupIds: ["prep-group-1"],
  affiliations: [
    {
      id: "affiliation-1",
      teacherId: "teacher-1",
      schoolId: "school-1",
      schoolName: "示例中学",
      subject: "数学",
      teachingGrades: ["高一"],
      employeeNo: "T001",
      status: "active",
      role: "teacher",
      roles: ["teacher", "prepLeader"],
      subjectGroupIds: ["subject-group-1"],
      prepGroupIds: ["prep-group-1"],
      isCurrent: true,
      joinedAt: "2026-01-01T00:00:00.000Z",
    },
  ],
  currentAffiliationId: "affiliation-1",
  createdAt: "2026-01-01T00:00:00.000Z",
};

const colleague: Teacher = {
  ...currentTeacher,
  id: "teacher-2",
  email: "teacher2@example.com",
  name: "李老师",
  employeeNo: "T002",
  roles: ["teacher"],
  affiliations: [
    {
      ...currentTeacher.affiliations[0],
      id: "affiliation-2",
      teacherId: "teacher-2",
      employeeNo: "T002",
      roles: ["teacher"],
    },
  ],
  currentAffiliationId: "affiliation-2",
};

const existingBoard: PrepTask = {
  id: "board-1",
  schoolId: "school-1",
  subjectGroupId: "subject-group-1",
  prepGroupId: "prep-group-1",
  title: "高一数学阶段教研",
  description: "分析阶段测试并安排后续教学",
  grade: "高一",
  subject: "数学",
  workflows: [
    {
      id: "workflow-1",
      type: "examAnalysis",
      name: "分析期中试卷",
      description: "整理错题分布",
      order: 1,
      status: "created",
      assigneeIds: ["teacher-1"],
      createdAt: "2026-08-01T00:00:00.000Z",
      updatedAt: "2026-08-01T00:00:00.000Z",
    },
  ],
  assignments: [
    {
      id: "assignment-1",
      taskId: "board-1",
      workflowId: "workflow-1",
      teacherId: "teacher-1",
      status: "pending",
      createdAt: "2026-08-01T00:00:00.000Z",
      updatedAt: "2026-08-01T00:00:00.000Z",
    },
  ],
  status: "created",
  createdBy: "teacher-1",
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
};

function renderPage() {
  return render(
    <MemoryRouter>
      <PrepWorkspacePage />
    </MemoryRouter>,
  );
}

describe("PrepWorkspacePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({
      teacher: currentTeacher,
      loading: false,
      error: null,
    });
    vi.mocked(organizationService.listTeachers).mockResolvedValue([currentTeacher, colleague]);
    vi.mocked(prepService.listTasks).mockResolvedValue([existingBoard]);
    vi.mocked(prepService.updateAssignment).mockResolvedValue();
    vi.mocked(prepService.assignTask).mockResolvedValue([]);
  });

  it("shows assigned work in my todos and advances its status", async () => {
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByText("我的待办")).toBeInTheDocument();
    expect(screen.getAllByText("分析期中试卷")).toHaveLength(2);
    expect(screen.getAllByText("高一数学阶段教研")).toHaveLength(2);
    expect(screen.getAllByText("试卷分析").length).toBeGreaterThan(0);

    await user.click(screen.getByRole("button", { name: "认领" }));

    await waitFor(() => {
      expect(prepService.updateAssignment).toHaveBeenCalledWith(
        "board-1",
        "assignment-1",
        "accepted",
      );
    });
  });

  it("creates a board and assigns each task to selected teachers", async () => {
    const user = userEvent.setup();
    const createdBoard: PrepTask = {
      ...existingBoard,
      id: "board-new",
      title: "高一函数专题备课",
      workflows: [
        {
          ...existingBoard.workflows[0],
          id: "workflow-new",
          type: "literatureReview",
          name: "文献综述",
          assigneeIds: [],
        },
      ],
      assignments: [],
    };
    vi.mocked(prepService.createTask).mockResolvedValue(createdBoard);
    vi.mocked(prepService.listTasks)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([createdBoard]);

    renderPage();
    await screen.findByText("当前没有待办");

    const createButtons = screen.getAllByRole("button", { name: "创建看板" });
    await user.click(createButtons[0]);
    await user.type(screen.getByLabelText("看板标题"), "高一函数专题备课");
    await user.selectOptions(screen.getByLabelText("年级"), "高一");
    await user.selectOptions(screen.getByLabelText("学科"), "数学");
    await user.click(screen.getByRole("button", { name: "文献综述" }));
    await user.click(screen.getByRole("checkbox", { name: "任务1指派给李老师" }));

    const modalCreateButtons = screen.getAllByRole("button", { name: "创建看板" });
    await user.click(modalCreateButtons[modalCreateButtons.length - 1]);

    await waitFor(() => {
      expect(prepService.createTask).toHaveBeenCalledWith(
        "school-1",
        "subject-group-1",
        expect.objectContaining({
          title: "高一函数专题备课",
          grade: "高一",
          subject: "数学",
          prepGroupId: "prep-group-1",
          workflows: [
            expect.objectContaining({
              type: "literatureReview",
              name: "文献综述",
            }),
          ],
        }),
        "teacher-1",
      );
      expect(prepService.assignTask).toHaveBeenCalledWith(
        "board-new",
        "workflow-new",
        ["teacher-2"],
      );
    });
  });
});
