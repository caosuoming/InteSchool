import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import LoginPage from "@/pages/auth/LoginPage";

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
    getRegistrationContext: vi.fn(),
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

  it("opens the dedicated collective-preparation login entry", async () => {
    const user = userEvent.setup();
    renderLogin();

    await user.click(screen.getByRole("button", { name: "集体研讨" }));

    expect(await screen.findByText("集体研讨登录页")).toBeInTheDocument();
  });

  it("labels the collective discussion entry and returns to personal login", async () => {
    const user = userEvent.setup();
    renderLogin({ destination: "/prep?entry=collective", loginOnly: true });

    expect(screen.getByRole("heading", { name: "进入集体研讨" })).toBeInTheDocument();
    expect(screen.getByText("使用备课组内任一教师账号登录")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "登录并进入集体研讨" })).toBeInTheDocument();
    expect(screen.queryByText("立即注册")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "我要上课" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "返回个人登录" }));
    expect(await screen.findByText("标准个人登录页")).toBeInTheDocument();
  });
});
