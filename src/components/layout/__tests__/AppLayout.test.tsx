import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppLayout } from "@/components/layout/AppLayout";
import { shareService } from "@/services/share";
import { useAuthStore } from "@/stores/auth";
import { useUIStore } from "@/stores/ui";
import type { Teacher, TeacherAffiliation } from "@/types";

vi.mock("@/services/share", () => ({
  shareService: {
    getDonationPrivileges: vi.fn().mockResolvedValue({
      isTopContributor: false,
      rank: null,
    }),
  },
}));

const affiliation: TeacherAffiliation = {
  id: "affiliation-1",
  teacherId: "teacher-1",
  schoolId: "school-1",
  schoolName: "测试学校",
  subject: "数学",
  role: "teacher",
  roles: ["teacher"],
  subjectGroupIds: [],
  prepGroupIds: [],
  status: "active",
  isCurrent: true,
  joinedAt: "2026-08-01T00:00:00.000Z",
};

describe("AppLayout", () => {
  beforeEach(() => {
    vi.mocked(shareService.getDonationPrivileges).mockResolvedValue({
      donationCount: 0,
      rank: null,
      isTopContributor: false,
      canManagePlatformSettings: false,
      canManageAllSubjects: false,
      moderatedSubjects: [],
    });
    useUIStore.setState({ sidebarCollapsed: false, toasts: [] });
    useAuthStore.setState({
      teacher: {
        id: "teacher-1",
        name: "测试教师",
        avatar: "测",
        subject: "数学",
        schoolId: "school-1",
        roles: ["teacher"],
      } as Teacher,
      loading: false,
      error: null,
      getAffiliations: () => [affiliation],
      getCurrentAffiliation: () => affiliation,
    });
  });

  it("does not expose personal classes in the primary sidebar", () => {
    render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <AppLayout>
          <div>页面内容</div>
        </AppLayout>
      </MemoryRouter>,
    );

    expect(screen.getByRole("link", { name: "我的学生" })).toBeInTheDocument();
    expect(screen.queryByText("个人教学班")).not.toBeInTheDocument();
  });

  it("shows the three exam sections in the requested order", () => {
    const managerAffiliation: TeacherAffiliation = {
      ...affiliation,
      role: "teacher",
      roles: ["gradeLeader"],
    };
    useAuthStore.setState({
      teacher: {
        id: "teacher-1",
        name: "测试教师",
        avatar: "测",
        subject: "数学",
        schoolId: "school-1",
        role: "teacher",
        roles: ["gradeLeader"],
      } as Teacher,
      getAffiliations: () => [managerAffiliation],
      getCurrentAffiliation: () => managerAffiliation,
    });

    render(
      <MemoryRouter initialEntries={["/my-exams/rooms"]}>
        <AppLayout>
          <div>页面内容</div>
        </AppLayout>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByTitle("展开"));
    const examLinks = screen.getAllByRole("link").filter((link) =>
      link.getAttribute("href")?.startsWith("/my-exams/"),
    );

    expect(examLinks.map((link) => link.textContent?.trim())).toEqual([
      "考场布置",
      "监考表",
      "成绩统计",
    ]);
  });
});
