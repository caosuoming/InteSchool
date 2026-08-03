import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ProfilePage from "@/pages/profile/ProfilePage";
import { authService } from "@/services/auth";
import { useAuthStore } from "@/stores/auth";
import type { Teacher, TeacherAffiliation } from "@/types";

vi.mock("@/services/auth", () => ({
  authService: {
    getMySchoolAdminApplications: vi.fn(),
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
});
