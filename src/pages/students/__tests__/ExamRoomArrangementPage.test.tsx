import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ExamRoomArrangementPage from "@/pages/students/ExamRoomArrangementPage";
import { examArrangementService } from "@/services/examArrangement";
import { useAuthStore } from "@/stores/auth";
import type {
  ExamArrangement,
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
    subjectSelection: "物化生",
    status: "active",
  }],
  previousGradeRanks: { "student-1": 1 },
};

const savedArrangement: ExamArrangement = {
  id: "arrangement-1",
  schoolId: "school-1",
  teacherId: "teacher-1",
  cohortKey: cohort.key,
  cohortLabel: cohort.label,
  name: "第一次模拟考试",
  examDate: "2026-05-10",
  mode: "combination",
  subjectSetupMode: "selection",
  subjects: ["语文", "数学", "英语", "物理", "化学", "生物"],
  selectionSubjects: { 物化生: ["语文", "数学", "英语", "物理", "化学", "生物"] },
  separateSubjects: ["物理"],
  seatOrder: "previousRank",
  rooms: [{
    id: "room-1",
    name: "高三（1）班",
    number: "高三（1）班",
    location: "教学楼 301",
    capacity: 30,
  }],
  classRules: [{
    classId: "class-1",
    defaultSubjects: ["语文", "数学", "英语", "物理", "化学", "生物"],
    subjectRoomIds: {
      语文: ["room-1"],
      数学: ["room-1"],
      英语: ["room-1"],
      物理: ["room-1"],
      化学: ["room-1"],
      生物: ["room-1"],
    },
  }],
  studentSubjects: [{
    studentId: "student-1",
    subjects: ["语文", "数学", "英语", "物理", "化学", "生物"],
    absent: false,
  }],
  assignments: [{
    id: "combined:student-1",
    studentId: "student-1",
    studentName: "张同学",
    studentNo: "001",
    classId: "class-1",
    className: "高三（1）班",
    subjectLabel: "语文 / 数学 / 英语 / 化学 / 生物",
    sessionKey: "combined",
    roomId: "room-1",
    roomName: "高三（1）班",
    roomNumber: "高三（1）班",
    roomLocation: "教学楼 301",
    seatNo: 1,
    admissionNo: "20260510010001",
  }],
  createdAt: "2026-05-01T00:00:00.000Z",
  updatedAt: "2026-05-01T00:00:00.000Z",
};

function renderPage() {
  return render(
    <MemoryRouter>
      <ExamRoomArrangementPage embedded />
    </MemoryRouter>,
  );
}

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

  it("asks for an exam name before creating a new arrangement", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "新建方案" }));
    expect(screen.getByRole("heading", { name: "新建考场安排" })).toBeInTheDocument();

    const nameInput = screen.getAllByLabelText("考试名称").at(-1);
    expect(nameInput).toBeDefined();
    await user.clear(nameInput!);
    expect(screen.getByRole("button", { name: "创建方案" })).toBeDisabled();
    await user.type(nameInput!, "高三期末考试");
    await user.click(screen.getByRole("button", { name: "创建方案" }));

    await waitFor(() => {
      expect(screen.queryByRole("heading", { name: "新建考场安排" })).not.toBeInTheDocument();
    });
    expect(screen.getByLabelText("考试名称")).toHaveValue("高三期末考试");
  });

  it("shows the new arrangement option, subject setup modes, and editable room defaults", async () => {
    const user = userEvent.setup();
    renderPage();

    const arrangementSelect = await screen.findByLabelText("选择考场安排");
    expect(arrangementSelect).toHaveDisplayValue("新建考场安排");
    expect(screen.getAllByRole("option")[1]).toHaveTextContent("新建考场安排");

    const selectionMode = screen.getByRole("radio", { name: /语数外 \+ 选科/ });
    expect(selectionMode).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText("物化生")).toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: /所有学科/ }));
    expect(screen.getByRole("radio", { name: /所有学科/ })).toHaveAttribute("aria-checked", "true");

    expect(screen.getByLabelText("考场号")).toHaveValue("1考场");
    expect(screen.getByLabelText("考场位置")).toHaveValue("高三1班教室");
    expect(screen.getByLabelText("考场可安排人数")).toHaveValue(1);
    expect(screen.getByText("实际考试组合人数")).toBeInTheDocument();
    expect(screen.getByText("考试组合对应考场")).toBeInTheDocument();

    await user.clear(screen.getByLabelText("批量考场容量"));
    await user.type(screen.getByLabelText("批量考场容量"), "32");
    await user.click(screen.getByRole("button", { name: "批量设置容量" }));
    expect(screen.getByLabelText("考场可安排人数")).toHaveValue(32);
  });

  it("allows an individual student to be marked absent", async () => {
    const user = userEvent.setup();
    renderPage();

    const absent = await screen.findByLabelText("张同学弃考");
    expect(absent).not.toBeChecked();
    await user.click(absent);
    expect(absent).toBeChecked();
  });

  it("summarizes and reuses a saved arrangement without overwriting it", async () => {
    const user = userEvent.setup();
    vi.mocked(examArrangementService.listArrangements).mockResolvedValue([savedArrangement]);
    renderPage();

    const arrangementSelect = await screen.findByLabelText("选择考场安排");
    await user.selectOptions(arrangementSelect, savedArrangement.id);

    expect((await screen.findAllByText("第一次模拟考试")).length).toBeGreaterThan(0);
    expect(screen.getByText(/按上次名次排/)).toBeInTheDocument();
    expect(screen.getByText(/弃考 0 人/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "复用此考场安排" }));
    expect(screen.getByLabelText("考试名称")).toHaveValue("第一次模拟考试（复用）");
    expect(arrangementSelect).toHaveValue("new");
  });
});
