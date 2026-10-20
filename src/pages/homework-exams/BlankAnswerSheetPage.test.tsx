import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import BlankAnswerSheetPage from "./BlankAnswerSheetPage";

function mount() {
  return render(<MemoryRouter><BlankAnswerSheetPage /></MemoryRouter>);
}

describe("独立空白答题卡制作", () => {
  it("generates a printable sheet without any exam record", () => {
    const { container } = mount();
    expect(screen.getByRole("heading", { name: "制作空白答题卡" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "返回考试管理" })).toHaveAttribute("href", "/homework-exams/exams");
    expect(screen.getByText(/17 题 · 满分 106 分/)).toBeInTheDocument();
    expect(screen.getAllByLabelText("条形码粘贴区").length).toBeGreaterThan(0);
    expect(container.querySelectorAll("[data-question-number]")).toHaveLength(17);
    expect(screen.getAllByTestId("blank-sheet-page").length).toBeGreaterThanOrEqual(1);
  });

  it("updates counts, total score, and section numbering", () => {
    const { container } = mount();
    fireEvent.change(screen.getByRole("spinbutton", { name: "单项选择题题量" }), { target: { value: "3" } });
    fireEvent.change(screen.getByRole("spinbutton", { name: "单项选择题每题分值" }), { target: { value: "2" } });
    expect(screen.getByText(/9 题 · 满分 57 分/)).toBeInTheDocument();
    const numbers = Array.from(container.querySelectorAll("[data-question-number]")).map((node) => node.getAttribute("data-question-number"));
    expect(numbers).toEqual(Array.from({ length: 9 }, (_, i) => String(i + 1)));
  });

  it("switches barcode to exam-number bubbles, toggles instructions and A3", () => {
    mount();
    fireEvent.click(screen.getByRole("radio", { name: "学号填涂区" }));
    expect(screen.getAllByLabelText("8位学号填涂区").length).toBeGreaterThan(0);
    fireEvent.change(screen.getByLabelText("学号位数"), { target: { value: "6" } });
    expect(screen.getAllByLabelText("6位学号填涂区").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("checkbox", { name: "显示注意事项" }));
    expect(screen.queryByLabelText("注意事项内容")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("纸张规格"), { target: { value: "A3-3" } });
    expect(screen.getAllByTestId("blank-sheet-page")[0]).toHaveClass("blank-sheet-paper-a3");
    expect(within(screen.getAllByTestId("blank-sheet-page")[0]).queryByText("注意事项")).not.toBeInTheDocument();
  });

  it("supports 8K three columns, vertical choice groups, and per-question essay sizes", () => {
    const { container } = mount();
    fireEvent.change(screen.getByLabelText("纸张规格"), { target: { value: "8K-3" } });
    expect(screen.getAllByTestId("blank-sheet-page")[0].querySelectorAll(".blank-sheet-column")).toHaveLength(3);
    fireEvent.change(screen.getByLabelText("选择题排列方向"), { target: { value: "vertical" } });
    expect(container.querySelector(".blank-sheet-choice-groups.vertical")).toBeInTheDocument();
    fireEvent.click(screen.getByText("逐题设置解答题书写区域"));
    fireEvent.change(screen.getByRole("spinbutton", { name: "第 15 题（毫米）" }), { target: { value: "125" } });
    expect(container.querySelector('[data-question-number="15"].blank-sheet-essay-box')).toHaveStyle({ height: "125mm" });
    expect(container.querySelector('[data-question-number="16"].blank-sheet-essay-box')).toHaveStyle({ height: "65mm" });
  });

  it("omits front-matter and instructional notices on the reverse side", () => {
    const { container } = mount();
    fireEvent.change(screen.getByLabelText("解答题默认答题区高度（毫米）"), { target: { value: "150" } });
    fireEvent.change(screen.getByLabelText("解答题题量"), { target: { value: "9" } });
    const pages = screen.getAllByTestId("blank-sheet-page");
    expect(pages.length).toBeGreaterThanOrEqual(2);
    expect(pages[0]).toHaveAttribute("data-side", "front");
    expect(pages[1]).toHaveAttribute("data-side", "back");
    expect(within(pages[0]).getByTestId("blank-sheet-identity")).toBeInTheDocument();
    expect(within(pages[1]).queryByTestId("blank-sheet-identity")).not.toBeInTheDocument();
    expect(within(pages[1]).queryByText("注意事项")).not.toBeInTheDocument();
    expect(pages[1].querySelector(".blank-sheet-column-warning")).not.toBeInTheDocument();
    expect(pages[1].querySelector(".blank-sheet-column-footer")).not.toBeInTheDocument();
    expect(container.querySelectorAll(".blank-sheet-essay-box")).toHaveLength(9);
  });

  it("prints and restores defaults", () => {
    const print = vi.spyOn(window, "print").mockImplementation(() => {});
    mount();
    fireEvent.click(screen.getByRole("button", { name: "打印" }));
    expect(print).toHaveBeenCalledOnce();
    fireEvent.change(screen.getByLabelText("单项选择题题量"), { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: "恢复默认" }));
    expect(screen.getByLabelText("单项选择题题量")).toHaveValue(11);
  });
});
