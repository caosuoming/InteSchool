import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import LoginPage from "@/pages/auth/LoginPage";
import { authService } from "@/services/auth";
import { schoolService } from "@/services/school";

const authState = vi.hoisted(() => ({
  teacher: null,
  login: vi.fn(),
  register: vi.fn(),
  loading: false,
  error: null,
  clearError: vi.fn(),
}));

vi.mock("@/stores/auth", () => ({
  useAuthStore: () => authState,
}));

vi.mock("@/services/auth", () => ({
  authService: {
    getIdentityContext: vi.fn(),
  },
}));

vi.mock("@/services/school", () => ({
  schoolService: {
    searchSchools: vi.fn(),
  },
}));

function renderLogin(props: Parameters<typeof LoginPage>[0] = {}) {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <Routes>
        <Route path="/" element={<LoginPage {...props} />} />
        <Route path="/login" element={<div>标准个人登录页</div>} />
        <Route path="/classroom-login" element={<div>课堂登录页</div>} />
        <Route path="/prep-login" element={<div>集体研讨登录页</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("LoginPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.teacher = null;
    authState.loading = false;
    authState.error = null;
    authState.login.mockResolvedValue(false);
    authState.register.mockResolvedValue(false);
    vi.mocked(authService.getIdentityContext).mockResolvedValue({ phone: "13800138000", teacher: true, parent: false });
    vi.mocked(schoolService.searchSchools).mockResolvedValue([]);
  });

  it("accepts a phone identifier and shows both quick login entries", async () => {
    const user = userEvent.setup();
    renderLogin();

    await user.type(screen.getByLabelText("邮箱或手机号"), "13800138000");
    await user.type(screen.getByLabelText("密码"), "StrongPass123");
    await user.click(screen.getByRole("button", { name: "登录" }));

    expect(authState.login).toHaveBeenCalledWith("13800138000", "StrongPass123");
    expect(screen.getByRole("button", { name: "我要上课" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "集体研讨" })).toBeInTheDocument();
  });

  it("does not require an email when creating an account", async () => {
    const user = userEvent.setup();
    renderLogin();

    await user.click(screen.getByRole("button", { name: "立即注册" }));

    const email = screen.getByLabelText("邮箱（可选）");
    expect(email).not.toBeRequired();
    expect(email).toHaveAccessibleDescription("可稍后在个人中心绑定，用于忘记密码时找回账号");
  });

  it("submits requested roles for an existing school and shows the pending-review state", async () => {
    const user = userEvent.setup();
    vi.mocked(schoolService.searchSchools).mockResolvedValue([{
      id: "school-1",
      name: "测试中学",
      code: "TEST",
      logo: "测",
      description: "",
      teacherCount: 1,
      studentCount: 0,
      city: "南京",
    }]);
    authState.register.mockResolvedValue("pending");
    renderLogin();

    await user.click(screen.getByRole("button", { name: "立即注册" }));
    await user.type(screen.getByLabelText("姓名"), "王老师");
    await user.type(screen.getByLabelText("手机号"), "13800138000");
    await user.type(screen.getByLabelText("所在学校"), "测试");
    await user.click(await screen.findByRole("button", { name: /测试中学/ }));
    expect(screen.getByText(/已选择：测试中学/)).toBeInTheDocument();

    await user.click(screen.getByRole("checkbox", { name: "高一" }));
    await user.click(screen.getByRole("checkbox", { name: "年级组长" }));
    await user.click(screen.getByRole("checkbox", { name: /同时申请学校管理员权限/ }));
    await user.type(screen.getByLabelText("密码"), "StrongPass123");
    await user.click(screen.getByRole("button", { name: "提交注册申请" }));

    expect(authState.register).toHaveBeenCalledWith(expect.objectContaining({
      phone: "13800138000",
      schoolId: "school-1",
      teachingGrades: ["高一"],
      roles: ["teacher", "gradeLeader"],
      requestSchoolAdmin: true,
    }));
    expect(await screen.findByText(/注册申请已提交/)).toBeInTheDocument();
  });

  it("submits a school-creation request together with the new teacher registration", async () => {
    const user = userEvent.setup();
    authState.register.mockResolvedValue("pending");
    renderLogin();

    await user.click(screen.getByRole("button", { name: "立即注册" }));
    await user.type(screen.getByLabelText("姓名"), "新校教师");
    await user.type(screen.getByLabelText("手机号"), "13900139000");
    await user.type(screen.getByLabelText("所在学校"), "南京新校");
    await user.click(screen.getByRole("button", { name: /没有我的学校，申请新增/ }));
    await user.type(screen.getByLabelText("学校代码"), "NJNEW");
    await user.type(screen.getByLabelText("所在城市"), "南京");
    await user.click(screen.getByRole("checkbox", { name: "高一" }));
    await user.click(screen.getByRole("checkbox", { name: "年级组长" }));
    await user.type(screen.getByLabelText("密码"), "StrongPass123");
    await user.click(screen.getByRole("button", { name: "提交注册申请" }));

    expect(authState.register).toHaveBeenCalledWith(expect.objectContaining({
      phone: "13900139000",
      newSchool: expect.objectContaining({ name: "南京新校", code: "NJNEW", city: "南京" }),
      teachingGrades: ["高一"],
      roles: ["teacher", "gradeLeader"],
    }));
    expect(await screen.findByText(/注册申请已提交/)).toBeInTheDocument();
  });

  it("opens the dedicated collective-preparation login entry in a new tab", async () => {
    const user = userEvent.setup();
    const openSpy = vi.spyOn(window, "open").mockReturnValue(null);
    renderLogin();

    await user.click(screen.getByRole("button", { name: "集体研讨" }));

    expect(openSpy).toHaveBeenCalledWith("/prep-login", "_blank", "noopener,noreferrer");
  });

  it("labels the collective discussion entry and returns to personal login", async () => {
    const user = userEvent.setup();
    renderLogin({ destination: "/prep?entry=collective", loginOnly: true });

    expect(screen.getByRole("heading", { name: "进入集体研讨" })).toBeInTheDocument();
    expect(screen.getByText("使用备课组内任一教师账号登录")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "登录并进入集体研讨" })).toBeInTheDocument();
    expect(screen.queryByText("立即注册")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "我要上课" })).not.toBeInTheDocument();

    const openSpy = vi.spyOn(window, "open").mockReturnValue(null);
    await user.click(screen.getByRole("button", { name: "返回个人登录" }));
    expect(openSpy).toHaveBeenCalledWith("/login", "_blank", "noopener,noreferrer");
  });
});
