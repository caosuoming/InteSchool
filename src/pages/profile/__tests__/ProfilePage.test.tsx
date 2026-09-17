import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ProfilePage from "@/pages/profile/ProfilePage";
import { authService } from "@/services/auth";
import { quotaService } from "@/services/quota";
import { useAuthStore } from "@/stores/auth";
import { useSettingsStore } from "@/stores/settings";
import type { Teacher, TeacherAffiliation, UserQuotaSnapshot } from "@/types";

vi.mock("@/services/auth", () => ({
  authService: {
    getMySchoolAdminApplications: vi.fn(),
  },
}));

vi.mock("@/services/quota", () => ({
  quotaService: {
    getQuota: vi.fn(),
    redeemCredits: vi.fn(),
  },
}));

vi.mock("@/services/localResourceBackup", () => ({
  ensureLocalBackupPermission: vi.fn(),
  getLocalBackupSnapshot: vi.fn(() => ({
    running: false,
    state: { directoryName: "", lastCompletedAt: null, lastResult: null },
  })),
  isLocalBackupSupported: vi.fn(() => false),
  loadLocalBackupDirectory: vi.fn(),
  localBackupKey: vi.fn(() => "backup-key"),
  pickLocalBackupDirectory: vi.fn(),
  saveLocalBackupDirectory: vi.fn(),
  startLocalResourceBackup: vi.fn(),
  subscribeLocalBackup: vi.fn(() => () => undefined),
}));

vi.mock("@/stores/ui", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

const affiliation: TeacherAffiliation = {
  id: "affiliation-1",
  teacherId: "teacher-1",
  schoolId: "school-1",
  schoolName: "测试学校",
  subject: "数学",
  teachingGrades: ["高一"],
  teachingClassIds: ["class-1"],
  homeroomClassIds: ["class-2"],
  status: "active",
  role: "school_admin",
  roles: ["principal"],
  subjectGroupIds: [],
  prepGroupIds: [],
  isCurrent: true,
  joinedAt: "2026-08-01T00:00:00.000Z",
};

const quotaSnapshot: UserQuotaSnapshot = {
  teacherId: "teacher-1",
  creditBalance: 5,
  creditSettings: {
    donationCredits: { question: 1, examPaper: 1, lecture: 1, courseware: 1, material: 1 },
    capacityPerCredit: { question: 10, examPaper: 10, lecture: 10, courseware: 10, material: 10 },
  },
  resources: {
    question: { key: "question", used: 2, baseCapacity: 10_000, creditCapacityBonus: 0, effectiveDonations: 0, donationBonus: 0, capacity: 10_000, remaining: 9_998 },
    examPaper: { key: "examPaper", used: 0, baseCapacity: 1_000, creditCapacityBonus: 0, effectiveDonations: 0, donationBonus: 0, capacity: 1_000, remaining: 1_000 },
    lecture: { key: "lecture", used: 0, baseCapacity: 1_000, creditCapacityBonus: 0, effectiveDonations: 0, donationBonus: 0, capacity: 1_000, remaining: 1_000 },
    courseware: { key: "courseware", used: 0, baseCapacity: 1_000, creditCapacityBonus: 0, effectiveDonations: 0, donationBonus: 0, capacity: 1_000, remaining: 1_000 },
    material: { key: "material", used: 0, baseCapacity: 1_000, creditCapacityBonus: 0, effectiveDonations: 0, donationBonus: 0, capacity: 1_000, remaining: 1_000 },
  },
  exam: {
    examRoom: { key: "examRoom", remaining: 50 },
    invigilation: { key: "invigilation", remaining: 50 },
    gradeStatistics: { key: "gradeStatistics", remaining: 50 },
  },
};

const teacher: Teacher = {
  id: "teacher-1",
  email: "teacher@example.com",
  name: "王老师",
  nickname: "王老师",
  avatar: "王",
  schoolId: "school-1",
  subject: "数学",
  teachingGrades: ["高一"],
  teachingClassIds: ["class-1"],
  homeroomClassIds: ["class-2"],
  status: "active",
  role: "school_admin",
  roles: ["principal"],
  subjectGroupIds: [],
  prepGroupIds: [],
  affiliations: [affiliation],
  currentAffiliationId: affiliation.id,
  createdAt: "2026-08-01T00:00:00.000Z",
};

describe("ProfilePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({
      teacher,
      loading: false,
      error: null,
      updateProfile: vi.fn(),
      refresh: vi.fn(),
    });
    vi.mocked(authService.getMySchoolAdminApplications).mockResolvedValue([]);
    vi.mocked(quotaService.getQuota).mockResolvedValue(quotaSnapshot);
    vi.mocked(quotaService.redeemCredits).mockImplementation(async (resourceType, credits) => ({
      ...quotaSnapshot,
      creditBalance: quotaSnapshot.creditBalance - credits,
      resources: {
        ...quotaSnapshot.resources,
        [resourceType]: {
          ...quotaSnapshot.resources[resourceType],
          creditCapacityBonus: credits * quotaSnapshot.creditSettings.capacityPerCredit[resourceType],
          donationBonus: credits * quotaSnapshot.creditSettings.capacityPerCredit[resourceType],
          capacity: quotaSnapshot.resources[resourceType].capacity + credits * quotaSnapshot.creditSettings.capacityPerCredit[resourceType],
          remaining: quotaSnapshot.resources[resourceType].remaining + credits * quotaSnapshot.creditSettings.capacityPerCredit[resourceType],
        },
      },
    }));
    useSettingsStore.setState({ uiScale: "middle", appearanceMode: "light" });
  });

  it("moves display preferences into the personal center", async () => {
    render(
      <MemoryRouter>
        <ProfilePage />
      </MemoryRouter>,
    );

    expect(screen.getByText("显示设置")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "显示版本" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "显示模式" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /中年版/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /浅色/ })).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("button", { name: /暗黑/ }));
    expect(useSettingsStore.getState().appearanceMode).toBe("dark");

    fireEvent.click(screen.getByRole("button", { name: /老年版/ }));
    expect(useSettingsStore.getState().uiScale).toBe("senior");
  });

  it("does not expose teaching or homeroom class assignments in personal information", async () => {
    render(
      <MemoryRouter>
        <ProfilePage />
      </MemoryRouter>,
    );

    expect(screen.getByText("个人与教学资料")).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "任教年级" })).toBeInTheDocument();
    expect(screen.queryByText("任教班级")).not.toBeInTheDocument();
    expect(screen.queryByText("班主任班级")).not.toBeInTheDocument();
    expect(screen.queryByText(/只能由年级组长/)).not.toBeInTheDocument();

    await waitFor(() => {
      expect(authService.getMySchoolAdminApplications).toHaveBeenCalledOnce();
    });
  });

  it("lets the current user redeem credits for a specific resource library", async () => {
    render(
      <MemoryRouter>
        <ProfilePage />
      </MemoryRouter>,
    );

    expect(screen.getByText("积分与资源容量")).toBeInTheDocument();
    await screen.findAllByText("捐赠 1 份：+1 积分");
    const redeemInputs = screen.getAllByLabelText("兑换积分");
    fireEvent.change(redeemInputs[0], { target: { value: "2" } });
    fireEvent.click(screen.getAllByRole("button", { name: "兑换" })[0]);

    await waitFor(() => expect(quotaService.redeemCredits).toHaveBeenCalledWith("question", 2));
    expect(screen.getByText("积分余额").parentElement).toHaveTextContent("3");
    expect(screen.getByText("已通过积分扩容：+20")).toBeInTheDocument();
  });
});
