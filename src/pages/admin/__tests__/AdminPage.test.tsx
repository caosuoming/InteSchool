import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it } from "vitest";
import AdminPage from "@/pages/admin/AdminPage";
import { useAuthStore } from "@/stores/auth";
import type { Teacher, TeacherAffiliation } from "@/types";

function teacherForRole(role: TeacherAffiliation["role"]): Teacher {
  const affiliation: TeacherAffiliation = {
    id: `affiliation-${role}`,
    teacherId: "teacher-1",
    schoolId: "school-1",
    schoolName: "测试学校",
    subject: "数学",
    teachingGrades: ["高一"],
    teachingClassIds: [],
    homeroomClassIds: [],
    status: "active",
    role,
    roles: ["teacher"],
    subjectGroupIds: [],
    prepGroupIds: [],
    isCurrent: true,
    joinedAt: "2026-08-01T00:00:00.000Z",
  };

  return {
    id: "teacher-1",
    email: "teacher@example.com",
    name: "测试教师",
    avatar: "测",
    schoolId: "school-1",
    subject: "数学",
    teachingGrades: ["高一"],
    teachingClassIds: [],
    homeroomClassIds: [],
    status: "active",
    role,
    roles: ["teacher"],
    subjectGroupIds: [],
    prepGroupIds: [],
    affiliations: [affiliation],
    currentAffiliationId: affiliation.id,
    createdAt: "2026-08-01T00:00:00.000Z",
  };
}

function renderForRole(role: TeacherAffiliation["role"]) {
  const teacher = teacherForRole(role);
  const affiliation = teacher.affiliations[0] || null;
  useAuthStore.setState({
    teacher,
    loading: false,
    error: null,
    getCurrentAffiliation: () => affiliation,
  });
  return render(
    <MemoryRouter>
      <AdminPage />
    </MemoryRouter>,
  );
}

describe("AdminPage", () => {
  beforeEach(() => {
    useAuthStore.setState({ teacher: null, loading: false, error: null });
  });

  it("groups school-admin entries by management scope", () => {
    renderForRole("school_admin");

    const personal = screen.getByRole("region", { name: "个人用户管理" });
    expect(within(personal).getByText("知识树管理")).toBeInTheDocument();
    expect(within(personal).getByText("系统设置")).toBeInTheDocument();
    expect(within(personal).queryByText("班级与学生")).not.toBeInTheDocument();

    const school = screen.getByRole("region", { name: "校管理员管理" });
    expect(within(school).getByText("班级与学生")).toBeInTheDocument();
    expect(within(school).getByText("组织架构管理")).toBeInTheDocument();
    expect(within(school).getByText("教师权限申请")).toBeInTheDocument();
    expect(within(school).getByText("教师权限与教学资料")).toBeInTheDocument();
    expect(within(school).getByText("教师入校审核")).toBeInTheDocument();

    const platform = screen.getByRole("region", { name: "平台管理员管理" });
    expect(within(platform).getByText("教师注册管理")).toBeInTheDocument();
    expect(within(platform).getByText("用户与密码管理")).toBeInTheDocument();
    expect(within(platform).queryByText("学校管理员审核")).not.toBeInTheDocument();
    expect(within(platform).queryByText("新增学校审核")).not.toBeInTheDocument();
  });

  it("keeps platform-only review entries in the platform-admin group", () => {
    renderForRole("platform_admin");

    const platform = screen.getByRole("region", { name: "平台管理员管理" });
    expect(within(platform).getByText("教师注册管理")).toBeInTheDocument();
    expect(within(platform).getByText("用户与密码管理")).toBeInTheDocument();
    expect(within(platform).getByText("学校管理员审核")).toBeInTheDocument();
    expect(within(platform).getByText("新增学校审核")).toBeInTheDocument();

    expect(screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent)).toEqual([
      "个人用户管理",
      "校管理员管理",
      "平台管理员管理",
    ]);
  });
});
