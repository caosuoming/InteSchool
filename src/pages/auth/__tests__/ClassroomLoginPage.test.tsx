import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ClassroomLoginPage from "@/pages/auth/ClassroomLoginPage";
import { classService } from "@/services/class";
import { CLASSROOM_DEVICE_TOKEN_KEY, classroomDeviceService } from "@/services/classroomDevice";
import { schoolService } from "@/services/school";

vi.mock("@/services/class", () => ({ classService: { listClassroomChoices: vi.fn() } }));
vi.mock("@/services/school", () => ({ schoolService: { listSchools: vi.fn() } }));
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
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    vi.mocked(schoolService.listSchools).mockResolvedValue([
      {
        id: "school-1",
        name: "第一中学",
        code: "S1",
        logo: "",
        description: "",
        teacherCount: 0,
        studentCount: 0,
        city: "南京",
      },
      {
        id: "school-2",
        name: "第二中学",
        code: "S2",
        logo: "",
        description: "",
        teacherCount: 0,
        studentCount: 0,
        city: "苏州",
      },
    ]);
    vi.mocked(classService.listClassroomChoices).mockResolvedValue([
      {
        id: "class-1",
        schoolId: "school-1",
        schoolName: "第一中学",
        name: "1班",
        grade: "高一",
      },
      {
        id: "class-2",
        schoolId: "school-2",
        schoolName: "第二中学",
        name: "2班",
        grade: "高二",
      },
    ]);
  });

  it("sends an already-bound machine straight to the classroom without loading choices", async () => {
    localStorage.setItem(CLASSROOM_DEVICE_TOKEN_KEY, "existing-device-token-value-1234567890");
    vi.mocked(classroomDeviceService.getDeviceSession).mockResolvedValue({} as any);
    renderPage();

    expect(await screen.findByText("设备教室首页")).toBeInTheDocument();
    expect(schoolService.listSchools).not.toHaveBeenCalled();
    expect(classService.listClassroomChoices).not.toHaveBeenCalled();
  });

  it("binds the selected school and class without asking for teacher credentials", async () => {
    vi.mocked(classroomDeviceService.bindDevice).mockResolvedValue({} as any);
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByRole("button", { name: "绑定" })).toBeInTheDocument();
    expect(screen.queryByLabelText("账号邮箱")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("密码")).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("学校"), "school-1");
    await user.selectOptions(screen.getByLabelText("班级"), "class-1");
    await user.click(screen.getByRole("button", { name: "绑定" }));

    await waitFor(() => expect(classroomDeviceService.bindDevice).toHaveBeenCalledWith(expect.objectContaining({
      schoolId: "school-1",
      classId: "class-1",
      deviceToken: expect.any(String),
      installationId: expect.any(String),
    })));
    expect(localStorage.getItem(CLASSROOM_DEVICE_TOKEN_KEY)).toBeTruthy();
    expect(await screen.findByText("设备教室首页")).toBeInTheDocument();
  });

  it("offers public classroom as a class choice and binds it to the selected school", async () => {
    vi.mocked(classroomDeviceService.bindDevice).mockResolvedValue({} as any);
    const user = userEvent.setup();
    renderPage();

    await screen.findByRole("button", { name: "绑定" });
    await user.selectOptions(screen.getByLabelText("学校"), "school-1");
    await user.selectOptions(screen.getByLabelText("班级"), "__public_classroom__");
    await user.click(screen.getByRole("button", { name: "绑定" }));

    await waitFor(() => expect(classroomDeviceService.bindDevice).toHaveBeenCalledWith(expect.objectContaining({
      schoolId: "school-1",
      publicClassroom: true,
      deviceToken: expect.any(String),
      installationId: expect.any(String),
    })));
  });

  it("shows only classes from the selected school", async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByRole("button", { name: "绑定" });
    await user.selectOptions(screen.getByLabelText("学校"), "school-1");
    expect(screen.getByRole("option", { name: "公共教室" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "高一 · 1班" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "高二 · 2班" })).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("学校"), "school-2");
    expect(screen.getByRole("option", { name: "高二 · 2班" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "高一 · 1班" })).not.toBeInTheDocument();
  });
});
