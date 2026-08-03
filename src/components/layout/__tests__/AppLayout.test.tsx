import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppLayout } from "@/components/layout/AppLayout";
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
});
