import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AnswerSheetComposer } from "./AnswerSheetComposer";

const questions = [
  { id: "q1", type: "single" as const, stem: "1+1 等于？", options: ["1", "2", "3", "4"], score: 5 },
  { id: "q2", type: "multiple" as const, stem: "选择偶数", options: ["1", "2", "3", "4"], score: 5 },
  { id: "q3", type: "short" as const, stem: "填写结果", score: 5 },
];

function renderComposer(props: Partial<React.ComponentProps<typeof AnswerSheetComposer>> = {}) {
  return render(
    <AnswerSheetComposer
      title="高一数学期中考试"
      description="高一 · 2026-2027学年 · 90分钟"
      resourceType="exam-paper"
      resourceId="paper-1"
      resourceLabel="试卷"
      totalScore={100}
      questions={questions}
      onBack={vi.fn()}
      {...props}
    />,
  );
}

describe("AnswerSheetComposer", () => {
  it("uses an 8-digit student number by default and renders a real QR code", () => {
    const { container } = renderComposer();

    expect(screen.getByRole("heading", { name: "制作答题卡" })).toBeInTheDocument();
    expect(screen.getByLabelText("试卷答题卡二维码").tagName.toLowerCase()).toBe("svg");
    expect(screen.getAllByTestId("student-number-row")).toHaveLength(8);
    expect(container).toHaveTextContent("[A]");

    fireEvent.change(screen.getByLabelText("学号位数"), { target: { value: "10" } });
    expect(screen.getAllByTestId("student-number-row")).toHaveLength(10);
  });

  it("keeps editing single-column and joins A3/8K halves only in preview", () => {
    const { container } = renderComposer();
    const paper = () => container.querySelector<HTMLElement>(".answer-sheet-paper")!;

    fireEvent.change(screen.getByLabelText("纸张"), { target: { value: "8K" } });
    expect(paper()).toHaveAttribute("data-paper-view", "edit");
    expect(paper()).toHaveAttribute("data-paper-columns", "1");
    expect(paper().style.width).toBe("185mm");
    expect(paper().style.minHeight).toBe("260mm");

    fireEvent.click(screen.getByRole("button", { name: "预览答题卡" }));
    expect(screen.getByRole("heading", { name: "预览答题卡" })).toBeInTheDocument();
    expect(screen.queryByLabelText("纸张")).not.toBeInTheDocument();
    expect(paper()).toHaveAttribute("data-paper-view", "preview");
    expect(paper()).toHaveAttribute("data-paper-columns", "2");
    expect(paper().style.width).toBe("370mm");
    expect(screen.getByRole("button", { name: "打印答题卡" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "编辑答题卡" }));
    fireEvent.change(screen.getByLabelText("纸张"), { target: { value: "A3" } });
    expect(paper()).toHaveAttribute("data-paper-columns", "1");
    expect(paper().style.width).toBe("210mm");
    expect(paper().style.minHeight).toBe("297mm");

    fireEvent.click(screen.getByRole("button", { name: "预览答题卡" }));
    expect(paper()).toHaveAttribute("data-paper-columns", "2");
    expect(paper().style.width).toBe("420mm");
  });

  it("supports inline and concentrated choice fill areas while keeping choice options visible", () => {
    renderComposer();

    fireEvent.click(screen.getByLabelText("附题干"));
    expect(screen.getAllByTestId("inline-choice-question")).toHaveLength(2);
    expect(screen.queryByTestId("concentrated-choice-area")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("附题干选择题填涂方式"), {
      target: { value: "concentrated" },
    });
    expect(screen.getByTestId("concentrated-choice-area")).toBeInTheDocument();
    expect(screen.queryByTestId("inline-choice-question")).not.toBeInTheDocument();
    expect(screen.getAllByTestId("concentrated-choice-question")).toHaveLength(2);
    expect(screen.getByText("选择题填涂区")).toBeInTheDocument();
    expect(screen.getAllByText("4").length).toBeGreaterThan(0);
  });

  it("keeps the title, identity area, and QR code in the first column of a merged wide preview", () => {
    const { container } = renderComposer({
      initialViewMode: "preview",
      initialSettings: { paperSize: "A3", widePaperColumns: 3 },
    });

    expect(screen.getByRole("heading", { name: "预览答题卡" })).toBeInTheDocument();
    expect(screen.queryByLabelText("纸张")).not.toBeInTheDocument();
    const paper = container.querySelector<HTMLElement>(".answer-sheet-paper")!;
    expect(paper).toHaveAttribute("data-paper-columns", "3");
    expect(paper.style.width).toBe("420mm");
    expect(paper.querySelector("main")?.style.columnCount).toBe("3");

    const firstColumnHeader = screen.getByTestId("answer-sheet-first-column-header");
    expect(firstColumnHeader.style.width).toContain("calc(");
    expect(firstColumnHeader.style.width).not.toBe("100%");
    expect(firstColumnHeader).toContainElement(screen.getByLabelText("试卷答题卡二维码"));
    expect(firstColumnHeader).toContainElement(screen.getByLabelText("姓名签名填写区"));
    expect(screen.getByLabelText("姓名签名填写区")).toHaveAttribute("data-signature-history-limit", "10");
  });

  it("renders one resizable answer box with a score cell and lets the teacher choose dashed borders", () => {
    renderComposer();

    const initialBoxes = screen.getAllByTestId("answer-box");
    expect(initialBoxes.length).toBeGreaterThan(0);
    expect(initialBoxes[0].style.resize).toBe("both");
    expect(screen.getByLabelText("第3题评分框")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("答题框边线"), { target: { value: "dashed" } });
    expect(screen.getAllByTestId("answer-box")[0]).toHaveAttribute("data-answer-box-style", "dashed");
  });

  it("loads saved settings and reports subsequent changes", () => {
    const onSettingsChange = vi.fn();
    renderComposer({
      initialSettings: {
        paperSize: "A3",
        mode: "with-questions",
        studentNumberDigits: 9,
        choiceLayout: "concentrated",
      },
      onSettingsChange,
    });

    expect(screen.getByLabelText("纸张")).toHaveValue("A3");
    expect(screen.getByLabelText("学号位数")).toHaveValue(9);
    expect(screen.getByLabelText("附题干选择题填涂方式")).toHaveValue("concentrated");

    fireEvent.change(screen.getByLabelText("纸张"), { target: { value: "8K" } });
    expect(onSettingsChange).toHaveBeenLastCalledWith(expect.objectContaining({
      paperSize: "8K",
      mode: "with-questions",
      studentNumberDigits: 9,
      choiceLayout: "concentrated",
    }));
  });
});
