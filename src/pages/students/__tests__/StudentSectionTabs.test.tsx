import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { StudentSectionTabs } from "@/pages/students/StudentSectionTabs";

describe("StudentSectionTabs", () => {
  it("places homework records immediately after student interactions and highlights the tab", () => {
    render(
      <MemoryRouter initialEntries={["/my-students?tab=homework"]}>
        <StudentSectionTabs />
      </MemoryRouter>,
    );

    const labels = screen.getAllByRole("link").map((link) => link.textContent?.trim());
    expect(labels).toEqual(["师生互动", "作业记录", "学生学情", "成绩查询", "档案记录"]);
    expect(screen.getByRole("link", { name: "作业记录" })).toHaveClass("text-gold-600");
  });
});
