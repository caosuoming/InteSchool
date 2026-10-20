import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SchoolClass, Student } from "@/types";
import { uploadFile } from "@/services/api";
import { homeworkRecordService } from "@/services/homeworkRecord";
import { ClassHomeworkOverview } from "./ClassHomeworkOverview";

vi.mock("@/services/api", () => ({ uploadFile: vi.fn() }));
vi.mock("@/services/homeworkRecord", () => ({ homeworkRecordService: {
  getClassOverview: vi.fn(), listClassOverviews: vi.fn(), saveClassOverview: vi.fn(),
} }));
vi.mock("@/services/classroomHomework", () => ({ classroomHomeworkService: { listHomeworks: vi.fn().mockResolvedValue([]) } }));
vi.mock("@/stores/ui", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const classInfo: SchoolClass = {
  id: "class-1", type: "school", schoolId: "school-1", name: "一班", grade: "高一",
  studentCount: 2, status: "active", createdBy: "admin", createdAt: "2026-01-01T00:00:00.000Z",
};
const students = [{ id: "student-1", name: "甲同学" }, { id: "student-2", name: "乙同学" }] as Student[];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(homeworkRecordService.getClassOverview).mockResolvedValue(null);
  vi.mocked(homeworkRecordService.listClassOverviews).mockResolvedValue([]);
  vi.mocked(homeworkRecordService.saveClassOverview).mockImplementation(async (input) => ({
    id: "record-1", teacherId: "teacher-1", schoolId: "school-1", classId: input.classId,
    homeworkDate: input.homeworkDate, summary: input.summary || "", studentIds: students.map((item) => item.id),
    submittedStudentIds: input.submittedStudentIds || [], absentStudentIds: input.absentStudentIds || [],
    attendanceTaken: input.attendanceTaken || false, images: input.images,
    createdAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-01T00:00:00.000Z",
  }));
});

describe("ClassHomeworkOverview", () => {
  it("autosaves the last state after consecutive attendance changes", async () => {
    let release!: () => void;
    const first = new Promise<void>((resolve) => { release = resolve; });
    let calls = 0;
    const save = vi.mocked(homeworkRecordService.saveClassOverview);
    const original = save.getMockImplementation()!;
    save.mockImplementation(async (input) => {
      if (++calls === 1) await first;
      return original(input);
    });
    const user = userEvent.setup();
    render(<ClassHomeworkOverview classInfo={classInfo} students={students} teacherId="teacher-1" />);
    await screen.findByText("作业点名");
    await user.click(screen.getByRole("checkbox", { name: "甲同学已交作业" }));
    await user.click(screen.getByRole("checkbox", { name: "甲同学请假" }));
    expect(save).toHaveBeenCalledTimes(1);
    release();
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    expect(save).toHaveBeenLastCalledWith(expect.objectContaining({
      submittedStudentIds: [], absentStudentIds: ["student-1"], attendanceTaken: true,
    }));
    await waitFor(() => expect(screen.getByText(/作业点名已自动保存/)).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "保存作业点名" })).not.toBeInTheDocument();
  });

  it("moves submitted students to the end without changing the relative order of others", async () => {
    const user = userEvent.setup();
    render(<ClassHomeworkOverview classInfo={classInfo} students={students} teacherId="teacher-1" />);
    await screen.findByText("作业点名");
    const order = () => screen.getAllByRole("checkbox", { name: /已交作业$/ })
      .map((node) => node.getAttribute("aria-label"));
    expect(order()).toEqual(["甲同学已交作业", "乙同学已交作业"]);
    await user.click(screen.getByRole("checkbox", { name: "甲同学已交作业" }));
    expect(order()).toEqual(["乙同学已交作业", "甲同学已交作业"]);
    await user.click(screen.getByRole("checkbox", { name: "甲同学已交作业" }));
    expect(order()).toEqual(["甲同学已交作业", "乙同学已交作业"]);
  });

  it("pastes images without focusing an editor, saves category and note, and allows recategorizing", async () => {
    vi.mocked(uploadFile).mockResolvedValue({
      id: "img-1", ownerId: "teacher-1", schoolId: "school-1", originalName: "截图.png",
      mimeType: "image/png", size: 100, createdAt: "2026-10-01T00:00:00.000Z", url: "/api/files/img-1",
    });
    const user = userEvent.setup();
    render(<ClassHomeworkOverview classInfo={classInfo} students={students} teacherId="teacher-1" />);
    const poor = await screen.findByRole("textbox", { name: "粘贴糟糕作业图片" });
    await user.click(poor);
    const file = new File(["image"], "截图.png", { type: "image/png" });
    fireEvent.paste(document.body, { clipboardData: { items: [{ kind: "file", type: "image/png", getAsFile: () => file }] } });
    await waitFor(() => expect(homeworkRecordService.saveClassOverview).toHaveBeenCalledWith(expect.objectContaining({
      images: [{ id: "img-1", name: "截图.png", url: "/api/files/img-1", mimeType: "image/png", size: 100,
        category: "poor", note: "" }],
    })));
    expect(await screen.findByRole("link", { name: "截图.png" })).toHaveAttribute("href", "/api/files/img-1");

    await user.type(screen.getByRole("textbox", { name: "截图.png备注" }), "需要订正");
    await user.click(screen.getByRole("button", { name: "保存备注" }));
    await waitFor(() => expect(homeworkRecordService.saveClassOverview).toHaveBeenLastCalledWith(expect.objectContaining({
      images: [expect.objectContaining({ category: "poor", note: "需要订正" })],
    })));
    await user.click(screen.getByRole("button", { name: "将截图.png移至优秀作业" }));
    await waitFor(() => expect(homeworkRecordService.saveClassOverview).toHaveBeenLastCalledWith(expect.objectContaining({
      images: [expect.objectContaining({ category: "excellent", note: "需要订正" })],
    })));
  });

  it("does not hijack image paste while typing in the homework summary", async () => {
    render(<ClassHomeworkOverview classInfo={classInfo} students={students} teacherId="teacher-1" />);
    const summary = await screen.findByRole("textbox", { name: "当天作业概况" });
    fireEvent.paste(summary, { clipboardData: { items: [{ kind: "file", type: "image/png",
      getAsFile: () => new File(["image"], "截图.png", { type: "image/png" }) }] } });
    expect(uploadFile).not.toHaveBeenCalled();
  });
});
