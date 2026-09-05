import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ClassroomPage from "@/pages/lessons/ClassroomPage";
import { CLASSROOM_DEVICE_TOKEN_KEY, classroomDeviceService } from "@/services/classroomDevice";
import type { ClassroomDeviceSnapshot } from "@/types";

vi.mock("html2canvas", () => ({ default: vi.fn().mockRejectedValue(new Error("capture unavailable in test")) }));
vi.mock("@/services/class", () => ({ classService: { listSchoolClasses: vi.fn(), listStudentsByClass: vi.fn() } }));
vi.mock("@/services/classroomHomework", () => ({ classroomHomeworkService: { listHomeworks: vi.fn() } }));
vi.mock("@/services/classroomNotice", () => ({ classroomNoticeService: { listNotices: vi.fn() } }));
vi.mock("@/services/lessonCourseware", () => ({ lessonCoursewareService: { listCoursewares: vi.fn() } }));
vi.mock("@/services/classroomDevice", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/classroomDevice")>();
  return {
    ...actual,
    classroomDeviceService: {
      getClassroomSnapshot: vi.fn(),
      reportHeartbeat: vi.fn(),
    },
  };
});
vi.mock("@/stores/ui", () => ({ toast: { error: vi.fn() } }));

const classroom = {
  id: "class-1",
  type: "school" as const,
  schoolId: "school-1",
  name: "高一（1）班",
  grade: "高一",
  studentCount: 40,
  status: "active" as const,
  createdBy: "admin",
  createdAt: "2026-09-01T00:00:00.000Z",
};

const classroomTwo = {
  ...classroom,
  id: "class-2",
  name: "高一（2）班",
};

function snapshot(state: "active" | "locked" | "closed" = "active"): ClassroomDeviceSnapshot {
  return {
    classroom,
    device: {
      id: "device-1",
      schoolId: "school-1",
      classId: classroom.id,
      schoolName: "第一中学",
      className: classroom.name,
      grade: classroom.grade,
      deviceName: "高一1班一体机",
      installationId: "installation-1",
      boundByTeacherId: "admin",
      boundByTeacherName: "管理员",
      boundAt: "2026-09-01T00:00:00.000Z",
      controlState: state,
      allowedTimeRanges: [],
      updatedAt: "2026-09-01T00:00:00.000Z",
      effectiveState: state,
      scheduleAllowsUse: true,
    },
    lessons: [],
    homeworks: [{
      id: "homework-1",
      teacherId: "teacher-1",
      teacherName: "王老师",
      schoolId: "school-1",
      subject: "数学",
      content: "完成函数练习",
      classIds: [classroom.id],
      assignedDate: new Date().toISOString().slice(0, 10),
      publishAt: "2026-09-01T00:00:00.000Z",
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-01T00:00:00.000Z",
    }],
    homeworkHistory: [],
    notices: [],
    students: [],
  };
}

function renderDevicePage() {
  return render(
    <MemoryRouter initialEntries={["/classroom-device"]}>
      <Routes>
        <Route path="/classroom-device" element={<ClassroomPage deviceMode />} />
        <Route path="/classroom-login" element={<div>绑定页</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ClassroomPage device mode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    localStorage.setItem(CLASSROOM_DEVICE_TOKEN_KEY, "test-device-token-value-1234567890");
  });

  it("loads the bound class without an authenticated teacher and reports the current page", async () => {
    const data = snapshot();
    vi.mocked(classroomDeviceService.getClassroomSnapshot).mockResolvedValue(data);
    vi.mocked(classroomDeviceService.reportHeartbeat).mockResolvedValue(data.device);
    renderDevicePage();

    expect(await screen.findByText("完成函数练习")).toBeInTheDocument();
    expect(screen.getByTitle("高一 · 高一（1）班")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "退出教室" })).not.toBeInTheDocument();
    await waitFor(() => expect(classroomDeviceService.reportHeartbeat).toHaveBeenCalled());
  });

  it("interrupts the classroom UI with the remote lock screen", async () => {
    const data = snapshot("locked");
    data.device.accessPolicy = {
      blacklist: [],
      whitelist: [{ id: "school-site", kind: "website", target: "https://school.example.com/", label: "学校网站" }],
    };
    vi.mocked(classroomDeviceService.getClassroomSnapshot).mockResolvedValue(data);
    vi.mocked(classroomDeviceService.reportHeartbeat).mockResolvedValue(data.device);
    renderDevicePage();

    expect(await screen.findByText("教室一体机已锁定")).toBeInTheDocument();
    expect(screen.getByText(/任课教师可在个人账号的“我的教室”中远程解锁/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /学校网站/ })).toHaveAttribute("href", "https://school.example.com/");
  });

  it("lets a public classroom switch the active class from the top-left selector", async () => {
    const first = snapshot();
    first.device.publicClassroom = true;
    first.device.className = "公共班级";
    first.device.grade = "公共教室";
    first.availableClassrooms = [classroom, classroomTwo];
    const second = { ...first, classroom: classroomTwo };
    vi.mocked(classroomDeviceService.getClassroomSnapshot).mockImplementation(async (_token, classId) => (
      classId === "class-2" ? second : first
    ));
    vi.mocked(classroomDeviceService.reportHeartbeat).mockResolvedValue(first.device);
    const user = userEvent.setup();
    renderDevicePage();

    const selector = await screen.findByRole("combobox");
    expect(selector).toHaveValue("class-1");
    await user.selectOptions(selector, "class-2");
    await waitFor(() => expect(classroomDeviceService.getClassroomSnapshot).toHaveBeenCalledWith(
      "test-device-token-value-1234567890",
      "class-2",
    ));
    expect(selector).toHaveValue("class-2");
  });
});
