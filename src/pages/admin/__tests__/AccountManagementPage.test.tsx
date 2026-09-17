import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AccountManagementPage from "@/pages/admin/AccountManagementPage";
import { authService } from "@/services/auth";
import { organizationService } from "@/services/organization";
import { schoolService } from "@/services/school";
import { quotaService } from "@/services/quota";
import { useAuthStore } from "@/stores/auth";
import type { PlatformCreditSettings, School, Teacher, TeacherAffiliation, UserQuotaSnapshot } from "@/types";

vi.mock("@/services/auth", () => ({
  authService: {
    resetTeacherPassword: vi.fn(),
    getCurrentAffiliation: vi.fn(),
  },
}));

vi.mock("@/services/organization", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/organization")>();
  return {
    ...actual,
    organizationService: {
      ...actual.organizationService,
      listTeachers: vi.fn(),
      setTeacherSchoolRole: vi.fn(),
    },
  };
});

vi.mock("@/services/school", () => ({
  schoolService: { listSchools: vi.fn() },
}));

vi.mock("@/services/quota", () => ({
  quotaService: {
    getQuota: vi.fn(),
    updateQuota: vi.fn(),
    getCreditSettings: vi.fn(),
    updateCreditSettings: vi.fn(),
    grantCredits: vi.fn(),
  },
}));

vi.mock("@/stores/ui", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

const schools: School[] = [
  { id: "school-1", name: "甲校", code: "A", logo: "甲", description: "", teacherCount: 2, studentCount: 0, city: "南京" },
  { id: "school-2", name: "乙校", code: "B", logo: "乙", description: "", teacherCount: 1, studentCount: 0, city: "上海" },
];

function affiliation(teacherId: string, schoolId: string, role: TeacherAffiliation["role"]): TeacherAffiliation {
  return {
    id: `${teacherId}-${schoolId}`,
    teacherId,
    schoolId,
    schoolName: schools.find((school) => school.id === schoolId)?.name || schoolId,
    subject: "数学",
    status: "active",
    role,
    roles: ["teacher"],
    subjectGroupIds: [],
    prepGroupIds: [],
    isCurrent: true,
    joinedAt: "2026-08-01T00:00:00.000Z",
  };
}

function teacher(id: string, name: string, schoolId: string, role: TeacherAffiliation["role"]): Teacher {
  const current = affiliation(id, schoolId, role);
  return {
    id,
    email: `${id}@example.com`,
    name,
    avatar: name[0],
    schoolId,
    subject: "数学",
    status: "active",
    role,
    roles: ["teacher"],
    subjectGroupIds: [],
    prepGroupIds: [],
    affiliations: [current],
    currentAffiliationId: current.id,
    createdAt: "2026-08-01T00:00:00.000Z",
  };
}

const creditSettings: PlatformCreditSettings = {
  donationCredits: { question: 1, examPaper: 1, lecture: 1, courseware: 1, material: 1 },
  capacityPerCredit: { question: 10, examPaper: 10, lecture: 10, courseware: 10, material: 10 },
};

function quotaSnapshot(teacherId: string, creditBalance = 0): UserQuotaSnapshot {
  const resource = (key: keyof PlatformCreditSettings["donationCredits"], capacity: number) => ({
    key,
    used: 0,
    baseCapacity: capacity,
    creditCapacityBonus: 0,
    effectiveDonations: 0,
    donationBonus: 0,
    capacity,
    remaining: capacity,
  });
  return {
    teacherId,
    creditBalance,
    creditSettings,
    resources: {
      question: resource("question", 10_000),
      examPaper: resource("examPaper", 1_000),
      lecture: resource("lecture", 1_000),
      courseware: resource("courseware", 1_000),
      material: resource("material", 1_000),
    },
    exam: {
      examRoom: { key: "examRoom", remaining: 50 },
      invigilation: { key: "invigilation", remaining: 50 },
      gradeStatistics: { key: "gradeStatistics", remaining: 50 },
    },
  };
}

function setCurrent(current: Teacher) {
  useAuthStore.setState({ teacher: current, loading: false, error: null });
  vi.mocked(authService.getCurrentAffiliation).mockReturnValue(current.affiliations[0] || null);
}

describe("AccountManagementPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(schoolService.listSchools).mockResolvedValue(schools);
    vi.mocked(organizationService.setTeacherSchoolRole).mockResolvedValue(undefined);
    vi.mocked(authService.resetTeacherPassword).mockResolvedValue({ password: "RandomPass_12345" });
    vi.mocked(quotaService.getCreditSettings).mockResolvedValue(creditSettings);
    vi.mocked(quotaService.getQuota).mockImplementation(async (teacherId) => quotaSnapshot(teacherId, 3));
    vi.mocked(quotaService.updateCreditSettings).mockImplementation(async (settings) => settings);
    vi.mocked(quotaService.updateQuota).mockImplementation(async (teacherId) => quotaSnapshot(teacherId, 3));
    vi.mocked(quotaService.grantCredits).mockImplementation(async (teacherId, amount) => quotaSnapshot(teacherId, 3 + amount));
  });

  it("lets a school administrator randomly reset a local teacher password", async () => {
    const admin = teacher("admin", "校管理员", "school-1", "school_admin");
    const target = teacher("teacher-1", "王老师", "school-1", "teacher");
    setCurrent(admin);
    vi.mocked(organizationService.listTeachers).mockResolvedValue([admin, target]);
    const user = userEvent.setup();

    render(<AccountManagementPage />);

    expect(await screen.findByText("王老师")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "重置密码" }));
    await user.click(screen.getByRole("button", { name: "随机重置" }));

    await waitFor(() => expect(authService.resetTeacherPassword).toHaveBeenCalledWith("teacher-1", undefined));
    expect(await screen.findByText("RandomPass_12345")).toBeInTheDocument();
  });

  it("lets a platform administrator select a school and assign its school administrator", async () => {
    const platform = teacher("platform", "平台管理员", "school-1", "platform_admin");
    const schoolOneTeacher = teacher("teacher-1", "甲校教师", "school-1", "teacher");
    const schoolTwoTeacher = teacher("teacher-2", "乙校教师", "school-2", "teacher");
    setCurrent(platform);
    vi.mocked(organizationService.listTeachers).mockImplementation(async (schoolId) => (
      schoolId === "school-2" ? [schoolTwoTeacher] : [platform, schoolOneTeacher]
    ));
    const user = userEvent.setup();

    render(<AccountManagementPage />);

    const schoolSelect = await screen.findByLabelText("学校");
    await user.selectOptions(schoolSelect, "school-2");
    expect(await screen.findByText("乙校教师")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "设为校管理员" }));

    await waitFor(() => expect(organizationService.setTeacherSchoolRole)
      .toHaveBeenCalledWith("teacher-2", "school-2", "school_admin"));
  });

  it("lets a platform administrator configure credit rates and gift credits to a teacher", async () => {
    const platform = teacher("platform", "平台管理员", "school-1", "platform_admin");
    const target = teacher("teacher-1", "甲校教师", "school-1", "teacher");
    setCurrent(platform);
    vi.mocked(organizationService.listTeachers).mockResolvedValue([platform, target]);
    const user = userEvent.setup();

    render(<AccountManagementPage />);

    expect(await screen.findByText("积分换算规则")).toBeInTheDocument();
    const donationInputs = screen.getAllByLabelText("每份捐赠奖励积分");
    await user.clear(donationInputs[0]);
    await user.type(donationInputs[0], "3");
    await user.click(screen.getByRole("button", { name: "保存规则" }));
    await waitFor(() => expect(quotaService.updateCreditSettings).toHaveBeenCalledWith(expect.objectContaining({
      donationCredits: expect.objectContaining({ question: 3 }),
    })));

    const quotaButtons = await screen.findAllByRole("button", { name: "积分与用量" });
    await user.click(quotaButtons[1]);
    const grantInput = await screen.findByLabelText("赠送积分");
    await user.clear(grantInput);
    await user.type(grantInput, "7");
    await user.click(screen.getByRole("button", { name: "赠送" }));
    await waitFor(() => expect(quotaService.grantCredits).toHaveBeenCalledWith("teacher-1", 7));
    expect(await screen.findByText(/当前余额/)).toHaveTextContent("10");
  });
});
