import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import MyClassroomsPage from "@/pages/lessons/MyClassroomsPage";
import { classroomDeviceService } from "@/services/classroomDevice";
import { schoolService } from "@/services/school";
import { useAuthStore } from "@/stores/auth";
import type { ClassroomDevice, Teacher, TeacherAffiliation } from "@/types";

vi.mock("@/services/classroomDevice", () => ({
  classroomDeviceService: {
    listManagedDevices: vi.fn(),
    unlockDevice: vi.fn(),
    lockDevice: vi.fn(),
    closeDevice: vi.fn(),
    unbindDevice: vi.fn(),
    updateDeviceSchedule: vi.fn(),
    updateDeviceAccessPolicy: vi.fn(),
  },
}));
vi.mock("@/services/school", () => ({ schoolService: { listSchools: vi.fn() } }));
vi.mock("@/stores/ui", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function affiliation(role: "teacher" | "school_admin" | "platform_admin"): TeacherAffiliation {
  return {
    id: "aff-1",
    teacherId: "teacher-1",
    schoolId: "school-1",
    schoolName: "第一中学",
    subject: "数学",
    status: "active",
    role,
    roles: ["teacher"],
    subjectGroupIds: [],
    prepGroupIds: [],
    isCurrent: true,
    joinedAt: "2026-09-01T00:00:00.000Z",
  };
}

function setTeacher(role: "teacher" | "school_admin" | "platform_admin") {
  const aff = affiliation(role);
  const teacher: Teacher = {
    id: "teacher-1",
    email: "teacher@example.com",
    name: "王老师",
    avatar: "王",
    schoolId: "school-1",
    subject: "数学",
    status: "active",
    role,
    roles: ["teacher"],
    subjectGroupIds: [],
    prepGroupIds: [],
    affiliations: [aff],
    currentAffiliationId: aff.id,
    createdAt: "2026-09-01T00:00:00.000Z",
  };
  useAuthStore.setState({ teacher, loading: false, getCurrentAffiliation: () => aff });
}

function device(permissions: ClassroomDevice["permissions"]): ClassroomDevice {
  return {
    id: "device-1",
    schoolId: "school-1",
    classId: "class-1",
    schoolName: "第一中学",
    className: "1班",
    grade: "高一",
    deviceName: "高一1班一体机",
    installationId: "installation-1",
    boundByTeacherId: "admin",
    boundByTeacherName: "管理员",
    boundAt: "2026-09-01T00:00:00.000Z",
    controlState: "active",
    allowedTimeRanges: [],
    lastSeenAt: new Date().toISOString(),
    currentPage: { path: "/classroom-device", title: "今日作业", updatedAt: new Date().toISOString() },
    updatedAt: new Date().toISOString(),
    effectiveState: "active",
    scheduleAllowsUse: true,
    permissions,
  };
}

describe("MyClassroomsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(schoolService.listSchools).mockResolvedValue([
      { id: "school-1", name: "第一中学", code: "S1", logo: "", description: "", teacherCount: 1, studentCount: 1, city: "南京" },
      { id: "school-2", name: "第二中学", code: "S2", logo: "", description: "", teacherCount: 1, studentCount: 1, city: "南京" },
    ]);
  });

  it("shows an assigned teacher only the view and unlock actions granted by the server", async () => {
    setTeacher("teacher");
    vi.mocked(classroomDeviceService.listManagedDevices).mockResolvedValue([device({
      canView: true,
      canUnlock: true,
      canLock: false,
      canClose: false,
      canUnbind: false,
      canEditSchedule: false,
    })]);
    render(<MyClassroomsPage />);

    expect(await screen.findByText("今日作业")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /解锁/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /锁定/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /关闭页面/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /解绑/ })).not.toBeInTheDocument();
  });

  it("shows school-wide controls and schedule editing to a school administrator", async () => {
    setTeacher("school_admin");
    const managed = device({
      canView: true,
      canUnlock: true,
      canLock: true,
      canClose: true,
      canUnbind: true,
      canEditSchedule: true,
      canEditAccessPolicy: true,
    });
    vi.mocked(classroomDeviceService.listManagedDevices).mockResolvedValue([managed]);
    vi.mocked(classroomDeviceService.updateDeviceAccessPolicy).mockResolvedValue(managed);
    const user = userEvent.setup();
    render(<MyClassroomsPage />);

    expect(await screen.findByRole("button", { name: /锁定本校全部/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^锁定$/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /关闭页面/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /使用时段/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /黑白名单/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /解绑/ })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /黑白名单/ }));
    await user.click(screen.getByRole("button", { name: "添加白名单项目" }));
    await user.type(screen.getByLabelText("网页地址"), "https://school.example.com");
    await user.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(classroomDeviceService.updateDeviceAccessPolicy).toHaveBeenCalledWith(
      "device-1",
      expect.objectContaining({
        whitelist: [expect.objectContaining({ kind: "website", target: "https://school.example.com" })],
      }),
    ));
  });

  it("lets a platform administrator switch schools while exposing unlock/unbind but not lock/close", async () => {
    setTeacher("platform_admin");
    vi.mocked(classroomDeviceService.listManagedDevices).mockResolvedValue([device({
      canView: true,
      canUnlock: true,
      canLock: false,
      canClose: false,
      canUnbind: true,
      canEditSchedule: false,
    })]);
    const user = userEvent.setup();
    render(<MyClassroomsPage />);

    const selector = await screen.findByLabelText("查看学校");
    await user.selectOptions(selector, "school-2");
    await waitFor(() => expect(classroomDeviceService.listManagedDevices).toHaveBeenCalledWith("school-2"));
    expect(screen.getByRole("button", { name: /解锁/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /解绑/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^锁定$/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /关闭页面/ })).not.toBeInTheDocument();
  });
});
