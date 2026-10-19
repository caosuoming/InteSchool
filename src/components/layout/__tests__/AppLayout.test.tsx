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

  it("offers ordinary school teachers a grade-viewing link without management navigation", () => {
    render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <AppLayout><div>页面内容</div></AppLayout>
      </MemoryRouter>,
    );

    expect(screen.getByRole("link", { name: "成绩统计" })).toHaveAttribute("href", "/my-exams/grades");
    expect(screen.queryByRole("link", { name: "我的教务" })).not.toBeInTheDocument();
  });

  it("shows 作业考试 after 我的教学 and before 我的学生", () => {
    const { container } = render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <AppLayout>
          <div>页面内容</div>
        </AppLayout>
      </MemoryRouter>,
    );

    expect(screen.getByRole("link", { name: "我的教学" })).toHaveAttribute("href", "/my-lessons");
    expect(screen.queryByRole("link", { name: "我的上课" })).not.toBeInTheDocument();

    const nav = container.querySelector("nav");
    expect(nav).not.toBeNull();
    const labels = Array.from(nav!.children).map((item) => item.textContent?.trim());
    expect(labels.indexOf("作业考试")).toBe(labels.indexOf("我的教学") + 1);
    expect(labels.indexOf("我的学生")).toBe(labels.indexOf("作业考试") + 1);
    expect(labels.indexOf("我的教室")).toBe(labels.indexOf("我的学生") + 1);
  });

  it("shows both management links when 作业考试 is expanded", () => {
    render(
      <MemoryRouter initialEntries={["/homework-exams/exams"]}>
        <AppLayout><div>页面内容</div></AppLayout>
      </MemoryRouter>,
    );
    expect(screen.getByRole("link", { name: "作业管理" })).toHaveAttribute("href", "/homework-exams/homework");
    expect(screen.getByRole("link", { name: "考试管理" })).toHaveAttribute("href", "/homework-exams/exams");
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
      "排课表",
    ]);
  });

  it("shows 我的教务 immediately after 集智教研", () => {
    const managerAffiliation: TeacherAffiliation = {
      ...affiliation,
      roles: ["gradeLeader"],
    };
    useAuthStore.setState({
      teacher: {
        id: "teacher-1",
        name: "测试教师",
        avatar: "测",
        subject: "数学",
        schoolId: "school-1",
        roles: ["gradeLeader"],
      } as Teacher,
      getAffiliations: () => [managerAffiliation],
      getCurrentAffiliation: () => managerAffiliation,
    });

    const { container } = render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <AppLayout>
          <div>页面内容</div>
        </AppLayout>
      </MemoryRouter>,
    );

    const nav = container.querySelector("nav");
    expect(nav).not.toBeNull();
    const labels = Array.from(nav!.children).map((item) => item.textContent?.trim());
    const prepIndex = labels.indexOf("集智教研");
    const academicsIndex = labels.indexOf("我的教务");

    expect(screen.queryByText("我的考试")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "集智教研" })).toHaveAttribute("href", "/prep");
    expect(screen.queryByRole("link", { name: "集体备课" })).not.toBeInTheDocument();
    expect(prepIndex).toBeGreaterThanOrEqual(0);
    expect(academicsIndex).toBe(prepIndex + 1);
  });
});
