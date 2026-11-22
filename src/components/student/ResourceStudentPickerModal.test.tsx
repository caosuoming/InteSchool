import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ResourceStudentPickerModal } from "./ResourceStudentPickerModal";
import type { AnyClass, ResourceStudentChoice } from "@/types";
import { classService } from "@/services/class";

vi.mock("@/services/class", () => ({
  classService: {
    listAudienceClasses: vi.fn(),
    listMyClasses: vi.fn(),
    listResourceStudentChoices: vi.fn(),
  },
}));
vi.mock("@/services/school", () => ({
  schoolService: { listSchools: vi.fn().mockResolvedValue([
    { id: "school-home", name: "本校" }, { id: "school-external", name: "外校" },
  ]) },
}));

const schoolClass = (id: string, schoolId: string, grade: string): AnyClass => ({
  id, name: id, type: "school", schoolId, grade, studentCount: 1,
  createdAt: "2026-01-01", createdBy: "teacher",
});
const classes: AnyClass[] = [
  schoolClass("任教班", "school-home", "高一"),
  { id: "pc", name: "个人班", type: "personal", teacherId: "teacher",
    studentIds: ["s-personal", "s-own"], description: "", createdAt: "2026-01-01" },
  schoolClass("同年级班", "school-home", "高一"),
  schoolClass("其他年级班", "school-home", "高二"),
  schoolClass("外校班", "school-external", "高三"),
];
const own: ResourceStudentChoice[] = [
  { id: "s-own", name: "任教学生", classId: "任教班", schoolId: "school-home", grade: "高一", studentNo: "1" },
  { id: "s-personal", name: "个人学生", classId: "outside", schoolId: "school-external", grade: "高三" },
  { id: "s-grade", name: "同年级学生", classId: "同年级班", schoolId: "school-home", grade: "高一" },
  { id: "s-school", name: "其他年级学生", classId: "其他年级班", schoolId: "school-home", grade: "高二" },
];
const external: ResourceStudentChoice[] = [
  { id: "s-personal", name: "个人学生", classId: "outside", schoolId: "school-external", grade: "高三" },
  { id: "s-external", name: "外校学生", classId: "外校班", schoolId: "school-external", grade: "高三" },
];

beforeEach(() => {
  vi.mocked(classService.listAudienceClasses).mockResolvedValue(classes);
  vi.mocked(classService.listMyClasses).mockResolvedValue([classes[0], classes[1]]);
  vi.mocked(classService.listResourceStudentChoices).mockImplementation(async (schoolId) =>
    schoolId === "school-external" ? external : own);
});

const props = {
  open: true, onClose: vi.fn(), schoolId: "school-home", teacherId: "teacher",
  teachingGrades: ["高一"], selectedStudentIds: [] as string[], onChange: vi.fn(),
};

describe("ResourceStudentPickerModal", () => {
  it("shows five groups with the first three expanded and the last two collapsed", async () => {
    render(<ResourceStudentPickerModal {...props} />);
    const taught = await screen.findByRole("button", { name: "自己任教的班级和学生" });
    expect(taught).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "个人教学班和学生" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "同年级所有班级和学生" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "全校所有班级和学生" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("button", { name: "平台所有学校的班级和学生" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getAllByRole("checkbox", { name: "选择班级 任教班" })[0]).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "选择班级 其他年级班" })).not.toBeInTheDocument();
  });

  it("selects all students in a class, individual students and avoids duplicates", async () => {
    const onChange = vi.fn();
    const { rerender } = render(<ResourceStudentPickerModal {...props} onChange={onChange} />);
    const classCheckbox = await screen.findAllByRole("checkbox", { name: "选择班级 任教班" }).then((items) => items[0]);
    fireEvent.click(classCheckbox);
    expect(onChange).toHaveBeenLastCalledWith(["s-own"]);
    rerender(<ResourceStudentPickerModal {...props} selectedStudentIds={["s-own"]} onChange={onChange} />);
    fireEvent.click(screen.getAllByRole("button", { name: "展开班级 任教班" })[0]);
    expect(screen.getAllByRole("checkbox", { name: "选择班级 任教班" })[0]).toBeChecked();
    const studentCheckbox = screen.getAllByRole("checkbox", { name: /任教学生/ })[0];
    fireEvent.click(studentCheckbox);
    expect(onChange).toHaveBeenLastCalledWith([]);
    fireEvent.click(screen.getByRole("button", { name: "展开班级 个人班" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "选择班级 个人班" }));
    expect(onChange).toHaveBeenLastCalledWith(["s-own", "s-personal"]);
  });

  it("loads remote students only after selecting a school, and can select remote class/students", async () => {
    const onChange = vi.fn();
    render(<ResourceStudentPickerModal {...props} onChange={onChange} />);
    await screen.findByRole("button", { name: "平台所有学校的班级和学生" });
    expect(classService.listResourceStudentChoices).toHaveBeenCalledWith();
    expect(classService.listResourceStudentChoices).not.toHaveBeenCalledWith("school-external");
    fireEvent.click(screen.getByRole("button", { name: "平台所有学校的班级和学生" }));
    expect(screen.getByRole("option", { name: "本校" })).toBeInTheDocument();
    fireEvent.change(screen.getByRole("combobox", { name: "选择平台学校" }), { target: { value: "school-external" } });
    await waitFor(() => expect(classService.listResourceStudentChoices).toHaveBeenCalledWith("school-external"));
    const outside = await screen.findByRole("checkbox", { name: "选择班级 外校班" });
    await waitFor(() => expect(outside).not.toBeDisabled());
    fireEvent.click(outside);
    expect(onChange).toHaveBeenLastCalledWith(["s-external"]);
    fireEvent.click(screen.getByRole("button", { name: "展开班级 外校班" }));
    expect(within(screen.getByRole("button", { name: "折叠班级 外校班" }).parentElement!.parentElement!).getByText("外校学生")).toBeVisible();
  });
});
