import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ExamRoomArrangementPage from "@/pages/students/ExamRoomArrangementPage";
import { examArrangementService } from "@/services/examArrangement";
import { useAuthStore } from "@/stores/auth";
import type {
  ExamArrangementContext,
  GradeCohort,
  Teacher,
  TeacherAffiliation,
} from "@/types";

vi.mock("@/services/examArrangement", () => ({
  examArrangementService: {
    listCohorts: vi.fn(),
    getContext: vi.fn(),
    listArrangements: vi.fn(),
    saveArrangement: vi.fn(),
    deleteArrangement: vi.fn(),
  },
}));

const affiliation: TeacherAffiliation = {
  id: "affiliation-1",
  teacherId: "teacher-1",
  schoolId: "school-1",
  schoolName: "测试学校",
  subject: "数学",
  role: "teacher",
  roles: ["gradeLeader"],
  subjectGroupIds: [],
  prepGroupIds: [],
  status: "active",
  isCurrent: true,
  joinedAt: "2026-08-01T00:00:00.000Z",
};

const cohort: GradeCohort = {
  key: "grad-2026",
  label: "2026届高三",
  grade: "高三",
  gradYear: 2026,
  classIds: ["class-1"],
  studentCount: 1,
};

const context: ExamArrangementContext = {
  cohort,
  classes: [{
    id: "class-1",
    type: "school",
    schoolId: "school-1",
    name: "高三（1）班",
    grade: "高三",
    studentCount: 1,
    createdBy: "teacher-1",
    createdAt: "2026-08-01T00:00:00.000Z",
  }],
  students: [{
    id: "student-1",
    name: "张同学",
    studentNo: "001",
    classId: "class-1",
    schoolId: "school-1",
    grade: "高三",
    status: "active",
  }],
};

describe("ExamRoomArrangementPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({
      teacher: {
        id: "teacher-1",
        name: "测试教师",
        schoolId: "school-1",
        subject: "数学",
        role: "teacher",
        roles: ["gradeLeader"],
      } as Teacher,
      loading: false,
      error: null,
      getCurrentAffiliation: () => affiliation,
    });
    vi.mocked(examArrangementService.listCohorts).mockResolvedValue([cohort]);
    vi.mocked(examArrangementService.getContext).mockResolvedValue(context);
    vi.mocked(examArrangementService.listArrangements).mockResolvedValue([]);
  });

  it("asks for a plan name before resetting to a new plan", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <ExamRoomArrangementPage embedded />
      </MemoryRouter>,
    );

    await user.click(await screen.findByRole("button", { name: "新建方案" }));
    expect(screen.getByRole("heading", { name: "新建考场方案" })).toBeInTheDocument();

    const nameInput = screen.getByLabelText("方案名称");
    await user.clear(nameInput);
    expect(screen.getByRole("button", { name: "创建方案" })).toBeDisabled();
    await user.type(nameInput, "高三期末考试");
    await user.click(screen.getByRole("button", { name: "创建方案" }));

    await waitFor(() => {
      expect(screen.queryByRole("heading", { name: "新建考场方案" })).not.toBeInTheDocument();
    });
    expect(screen.getByLabelText("考试名称")).toHaveValue("高三期末考试");
  });

  it("uses the requested arrangement mode labels", async () => {
    render(
      <MemoryRouter>
        <ExamRoomArrangementPage embedded />
      </MemoryRouter>,
    );

    const modeSelect = await screen.findByLabelText("编排方式");
    expect(modeSelect).toHaveDisplayValue("学生固定一个座位");
    expect(screen.getByRole("option", { name: "学生固定一个座位" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "部分单科单独排列" })).toBeInTheDocument();
  });
});
