import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { StudentPickerModal } from "./StudentPickerModal";
import type { AnyClass, Student } from "@/types";

const classes = [
  { id: "c1", name: "班级一", type: "school" },
  { id: "c2", name: "自建班级", type: "personal", studentIds: ["s2"] },
] as AnyClass[];
const students = [
  { id: "s1", name: "学生甲", studentNo: "001", classId: "c1" },
  { id: "s2", name: "学生乙", studentNo: "002", classId: "c2" },
] as Student[];

describe("StudentPickerModal", () => {
  it("supports selecting students and filtering by class", () => {
    const onChange = vi.fn();
    const props = { open: true, onClose: vi.fn(), selectedStudentIds: [] as string[], onChange, classes, students };
    const { rerender } = render(<StudentPickerModal {...props} />);
    expect(screen.getByText("学生甲")).toBeInTheDocument();
    expect(screen.getByText("学生乙")).toBeInTheDocument();
    fireEvent.click(screen.getByText("班级一"));
    expect(screen.getByText("学生甲")).toBeInTheDocument();
    expect(screen.queryByText("学生乙")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("学生甲"));
    expect(onChange).toHaveBeenLastCalledWith(["s1"]);
    rerender(<StudentPickerModal {...props} selectedStudentIds={["s1"]} />);
    fireEvent.click(screen.getByRole("button", { name: "清空选择" }));
    expect(onChange).toHaveBeenLastCalledWith([]);
  });

  it("counts multi-student selections and filters personal classes", () => {
    const onChange = vi.fn();
    render(<StudentPickerModal open onClose={vi.fn()} selectedStudentIds={["s1"]} onChange={onChange} classes={classes} students={students} />);
    fireEvent.click(screen.getByText("自建班级"));
    expect(screen.getByText("学生乙")).toBeInTheDocument();
    expect(screen.queryByText("学生甲")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "全选" }));
    expect(onChange).toHaveBeenLastCalledWith(["s1", "s2"]);
  });
});
