import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ClassroomLoginPage from "@/pages/auth/ClassroomLoginPage";
import { classService } from "@/services/class";
import { CLASSROOM_DEVICE_TOKEN_KEY, classroomDeviceService } from "@/services/classroomDevice";
import { useAuthStore } from "@/stores/auth";

vi.mock("@/services/class", () => ({ classService: { listClassroomChoices: vi.fn() } }));
vi.mock("@/services/classroomDevice", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/classroomDevice")>();
  return {
    ...actual,
    classroomDeviceService: {
      getDeviceSession: vi.fn(),
      bindDevice: vi.fn(),
    },
  };
});

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/classroom-login"]}>
      <Routes>
        <Route path="/classroom-login" element={<ClassroomLoginPage />} />
        <Route path="/classroom-device" element={<div>设备教室首页</div>} />
        <Route path="/login" element={<div>个人登录</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ClassroomLoginPage device binding", () => {
  const login = vi.fn();
  const logout = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    login.mockResolvedValue(true);
    logout.mockResolvedValue(undefined);
    useAuthStore.setState({
      teacher: null,
      loading: false,
      error: null,
      login,
      logout,
      clearError: vi.fn(),
    });
    vi.mocked(classService.listClassroomChoices).mockResolvedValue([{
      id: "class-1",
      schoolId: "school-1",
      schoolName: "第一中学",
      name: "1班",
      grade: "高一",
    }]);
  });

  it("sends an already-bound machine straight to the classroom without asking for a class", async () => {
    localStorage.setItem(CLASSROOM_DEVICE_TOKEN_KEY, "existing-device-token-value-1234567890");
    vi.mocked(classroomDeviceService.getDeviceSession).mockResolvedValue({} as any);
    renderPage();

    expect(await screen.findByText("设备教室首页")).toBeInTheDocument();
    expect(classService.listClassroomChoices).not.toHaveBeenCalled();
  });

  it("binds a class once with administrator credentials, logs the administrator out, and stores the device credential", async () => {
    vi.mocked(classroomDeviceService.bindDevice).mockResolvedValue({} as any);
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByRole("button", { name: /绑定并进入教室/ })).toBeInTheDocument();
    await user.type(screen.getByLabelText("学校管理员邮箱"), "admin@example.com");
    await user.type(screen.getByLabelText("密码"), "password-123");
    await user.click(screen.getByRole("button", { name: /绑定并进入教室/ }));

    await waitFor(() => expect(classroomDeviceService.bindDevice).toHaveBeenCalledWith(expect.objectContaining({
      classId: "class-1",
      deviceToken: expect.any(String),
      installationId: expect.any(String),
    })));
    expect(login).toHaveBeenCalledWith("admin@example.com", "password-123");
    expect(logout).toHaveBeenCalled();
    expect(localStorage.getItem(CLASSROOM_DEVICE_TOKEN_KEY)).toBeTruthy();
    expect(await screen.findByText("设备教室首页")).toBeInTheDocument();
  });
});
