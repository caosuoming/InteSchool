import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import MyExamsPage from "@/pages/exams/MyExamsPage";
import { examArrangementService } from "@/services/examArrangement";
import { gradeService } from "@/services/grade";
import { quotaService } from "@/services/quota";
import { useAuthStore } from "@/stores/auth";
import type { ExamArrangement, GradeCohort, Teacher, TeacherAffiliation } from "@/types";

vi.mock("@/services/examArrangement", () => ({
  examArrangementService: {
    listArrangements: vi.fn(),
  },
}));

vi.mock("@/services/grade", () => ({
  gradeService: {
    listCohorts: vi.fn(),
    getImportContext: vi.fn(),
    getCohortSettings: vi.fn(),
    listExams: vi.fn(),
  },
}));

vi.mock("@/services/quota", () => ({
  quotaService: {
    getQuota: vi.fn(),
  },
}));

vi.mock("@/pages/students/GradeSettingsEditor", () => ({
  GradeSettingsEditor: ({ section }: { section?: string }) => (
    <div data-testid="grade-settings-editor" data-section={section} />
  ),
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
  studentCount: 40,
};

describe("MyExamsPage", () => {
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
    vi.mocked(gradeService.listCohorts).mockResolvedValue([cohort]);
    vi.mocked(gradeService.getImportContext).mockResolvedValue({
      cohort,
      classes: [],
      students: [],
      teachers: [],
    });
    vi.mocked(gradeService.getCohortSettings).mockResolvedValue(null);
    vi.mocked(gradeService.listExams).mockResolvedValue([]);
    vi.mocked(examArrangementService.listArrangements).mockResolvedValue([]);
    vi.mocked(quotaService.getQuota).mockResolvedValue({
      teacherId: "teacher-1",
      resources: {
        question: { key: "question", used: 0, baseCapacity: 10_000, effectiveDonations: 0, donationBonus: 0, capacity: 10_000, remaining: 10_000 },
        examPaper: { key: "examPaper", used: 0, baseCapacity: 1_000, effectiveDonations: 0, donationBonus: 0, capacity: 1_000, remaining: 1_000 },
        lecture: { key: "lecture", used: 0, baseCapacity: 1_000, effectiveDonations: 0, donationBonus: 0, capacity: 1_000, remaining: 1_000 },
        courseware: { key: "courseware", used: 0, baseCapacity: 1_000, effectiveDonations: 0, donationBonus: 0, capacity: 1_000, remaining: 1_000 },
        material: { key: "material", used: 0, baseCapacity: 1_000, effectiveDonations: 0, donationBonus: 0, capacity: 1_000, remaining: 1_000 },
      },
      exam: {
        examRoom: { key: "examRoom", remaining: 50 },
        invigilation: { key: "invigilation", remaining: 50 },
        gradeStatistics: { key: "gradeStatistics", remaining: 50 },
      },
    });
  });

  it("shows only configurations 1-3 in grade statistics", async () => {
    render(
      <MemoryRouter initialEntries={["/my-exams/grades"]}>
        <MyExamsPage section="grades" />
      </MemoryRouter>,
    );

    expect(await screen.findByTestId("grade-settings-editor")).toHaveAttribute("data-section", "settings");
  });

  it("shows the invigilation tab between room setup and grade statistics", async () => {
    render(
      <MemoryRouter initialEntries={["/my-exams/invigilation"]}>
        <MyExamsPage section="invigilation" />
      </MemoryRouter>,
    );

    expect(await screen.findByText("暂无监考表")).toBeInTheDocument();
    const tabLinks = screen.getAllByRole("link").slice(0, 3);
    expect(tabLinks.map((link) => link.textContent?.trim())).toEqual([
      "考场布置剩余 50 次",
      "监考表剩余 50 次",
      "成绩统计剩余 50 次",
    ]);
    expect(screen.queryByText("成绩处理")).not.toBeInTheDocument();
  });

  it("builds a print-room statistics table from a saved room arrangement", async () => {
    const savedArrangement: ExamArrangement = {
      id: "arrangement-1",
      schoolId: "school-1",
      teacherId: "teacher-1",
      cohortKey: cohort.key,
      cohortLabel: cohort.label,
      name: "高三期中考试",
      examDate: "2026-10-20",
      mode: "combination",
      subjectSetupMode: "selection",
      subjects: ["语文", "数学", "英语", "物理", "化学", "生物"],
      separateSubjects: [],
      rooms: [{ id: "room-1", name: "1考场", number: "1考场", location: "高三1班教室", capacity: 40 }],
      classRules: [],
      studentSubjects: [{ studentId: "student-1", subjects: ["语文", "数学", "英语", "物理", "化学", "生物"] }],
      assignments: [{
        id: "combined:student-1",
        studentId: "student-1",
        studentName: "学生甲",
        studentNo: "001",
        classId: "class-1",
        className: "高三（1）班",
        subjectLabel: "语文 / 数学 / 英语 / 物理 / 化学 / 生物",
        sessionKey: "combined",
        roomId: "room-1",
        roomName: "1考场",
        roomNumber: "1考场",
        roomLocation: "高三1班教室",
        seatNo: 1,
        admissionNo: "20261020010001",
      }],
      createdAt: "2026-08-16T00:00:00.000Z",
      updatedAt: "2026-08-16T00:00:00.000Z",
    };
    vi.mocked(examArrangementService.listArrangements).mockResolvedValue([savedArrangement]);

    render(
      <MemoryRouter initialEntries={[`/my-exams/invigilation?cohort=${cohort.key}`]}>
        <MyExamsPage section="invigilation" />
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: "文印室统计表" })).toBeInTheDocument();
    expect(screen.getByLabelText("选择文印室统计表考试")).toHaveDisplayValue("高三期中考试 · 2026-10-20");
    expect(screen.getByText("高三1班教室")).toBeInTheDocument();
    expect(screen.getByText("物化生")).toBeInTheDocument();
    expect(screen.getByText("语数外")).toBeInTheDocument();
  });
});
