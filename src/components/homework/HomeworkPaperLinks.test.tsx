import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { HomeworkPaperLinks } from "./HomeworkPaperLinks";

const paper = { id: "paper-1", title: "月考卷", originalFileUrl: "/api/files/sample" };

describe("HomeworkPaperLinks", () => {
  it("keeps ordinary navigation for other pages", () => {
    render(<MemoryRouter><HomeworkPaperLinks papers={[paper]} /></MemoryRouter>);
    expect(screen.getByRole("link", { name: "月考卷" })).toHaveAttribute("href", "/resources/preview/paper-1?type=examPaper");
  });

  it("opens a classroom document with temporary ink tools without leaving the lesson", () => {
    render(<MemoryRouter><HomeworkPaperLinks papers={[paper]} classroomPreview /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: "月考卷" }));
    expect(screen.getByRole("dialog", { name: "课堂试卷批注：月考卷" })).toBeInTheDocument();
    expect(screen.getByTitle("试卷：月考卷")).toHaveAttribute("src", "/resources/preview/paper-1?type=examPaper");
    fireEvent.click(screen.getByRole("button", { name: "批注试卷" }));
    expect(screen.getByRole("button", { name: "批注试卷" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.pointerDown(screen.getByLabelText("试卷批注画布"), { button: 0, pointerId: 1, clientX: 20, clientY: 20 });
    expect(screen.getByLabelText("试卷批注画布").querySelectorAll("circle, polyline")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "撤销批注" }));
    expect(screen.getByLabelText("试卷批注画布").querySelectorAll("circle, polyline")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "关闭试卷批注" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
