import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ClassAudiencePicker } from "./ClassAudiencePicker";
import type { AnyClass } from "@/types";

vi.mock("@/services/school", () => ({
  schoolService: { listSchools: vi.fn().mockResolvedValue([
    { id: "other", name: "外校" }, { id: "home", name: "本校" },
  ]) },
}));

const schoolClass = (id: string, schoolId: string, grade: string): AnyClass => ({
  id, type: "school", schoolId, grade, name: id, studentCount: 20,
  createdBy: "teacher", createdAt: "2026-01-01",
});
const classes: AnyClass[] = [
  schoolClass("授课班", "home", "高一"),
  { id: "个人班", type: "personal", teacherId: "teacher", name: "个人班", description: "", studentIds: [], createdAt: "2026-01-01" },
  schoolClass("同年级班", "home", "高一"),
  schoolClass("其他年级班", "home", "高二"),
  schoolClass("外校班", "other", "高三"),
];

describe("ClassAudiencePicker", () => {
  it("shows own and personal classes directly; collapses broader audiences", () => {
    render(<ClassAudiencePicker classes={classes} schoolId="home" teachingClassIds={["授课班"]} selectedClassIds={[]} onChange={vi.fn()} />);
    expect(screen.getByText("授课班")).toBeVisible();
    expect(screen.getByText("个人班", { selector: "span.block" })).toBeVisible();
    const sections = screen.getAllByText(/所在年级其他班级|本校其他年级班级|平台其他学校的班级/);
    expect(sections).toHaveLength(3);
    expect(sections.every((item) => item.closest("details")?.open === false)).toBe(true);
  });

  it("selects external classes after school and grade choices without replacing other selections", async () => {
    const onChange = vi.fn();
    render(<ClassAudiencePicker classes={classes} schoolId="home" teachingClassIds={["授课班"]} selectedClassIds={["授课班"]} onChange={onChange} />);
    const external = screen.getByText(/平台其他学校的班级/).closest("details")!;
    fireEvent.click(within(external).getByText(/平台其他学校的班级/));
    await waitFor(() => expect(within(external).getByRole("option", { name: "外校" })).toBeInTheDocument());
    fireEvent.change(within(external).getByRole("combobox", { name: "选择学校" }), { target: { value: "other" } });
    fireEvent.change(within(external).getByRole("combobox", { name: "选择年级" }), { target: { value: "高三" } });
    fireEvent.click(within(external).getByRole("checkbox"));
    expect(onChange).toHaveBeenCalledWith(["授课班", "外校班"]);
  });
});
