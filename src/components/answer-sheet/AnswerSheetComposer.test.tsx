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
    expect(screen.getByTestId("student-number-grid")).not.toHaveTextContent("学号");
    expect(container).toHaveTextContent("[A]");

    fireEvent.change(screen.getByLabelText("学号位数"), { target: { value: "10" } });
    expect(screen.getAllByTestId("student-number-row")).toHaveLength(10);
  });

  it("places class, signature, student number, and QR code in one identity row", () => {
    renderComposer();

    const identityArea = screen.getByTestId("answer-sheet-identity-area");
    const identityFields = screen.getByTestId("answer-sheet-identity-fields");
    const studentNumberColumn = screen.getByTestId("answer-sheet-student-number-column");
    const qrPosition = screen.getByTestId("answer-sheet-qr-position");

    expect(identityArea).toHaveClass("flex");
    expect(identityFields.nextElementSibling).toBe(studentNumberColumn);
    expect(studentNumberColumn.nextElementSibling).toBe(qrPosition);
    expect(studentNumberColumn).toHaveClass("border-l");
    expect(qrPosition).toHaveClass("border-l");
    expect(identityFields).toContainElement(screen.getByLabelText("班级填写区"));
    expect(identityFields).toContainElement(screen.getByLabelText("姓名签名填写区"));
    expect(studentNumberColumn).toContainElement(screen.getByTestId("student-number-grid"));
    expect(identityArea).toContainElement(screen.getByLabelText("试卷答题卡二维码"));
  });

  it("uses exact paper height while editing and joins wide-paper editor pages only in preview", () => {
    const { container } = renderComposer();
    const paper = () => container.querySelector<HTMLElement>(".answer-sheet-paper")!;

    fireEvent.change(screen.getByLabelText("纸张"), { target: { value: "8K" } });
    expect(paper()).toHaveAttribute("data-paper-view", "edit");
    expect(paper()).toHaveAttribute("data-paper-columns", "1");
    expect(paper().style.width).toBe("185mm");
    expect(paper().style.height).toBe("260mm");
    expect(paper()).toHaveClass("overflow-hidden");

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
    expect(paper().style.height).toBe("297mm");

    fireEvent.click(screen.getByRole("button", { name: "预览答题卡" }));
    expect(paper()).toHaveAttribute("data-paper-columns", "2");
    expect(paper().style.width).toBe("420mm");
  });

  it("supports inline and concentrated choice fill areas while keeping choice options visible", () => {
    renderComposer();

    fireEvent.click(screen.getByLabelText("附题干"));
    expect(screen.getAllByTestId("inline-choice-question")).toHaveLength(2);
    expect(screen.queryByTestId("concentrated-choice-area")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("附题干答题区布局"), {
      target: { value: "concentrated" },
    });
    expect(screen.getByTestId("concentrated-choice-area")).toBeInTheDocument();
    expect(screen.queryByTestId("inline-choice-question")).not.toBeInTheDocument();
    expect(screen.getAllByTestId("concentrated-choice-question")).toHaveLength(2);
    expect(screen.getByText("选择题填涂区")).toBeInTheDocument();
    expect(screen.getByText("填空题答题区")).toBeInTheDocument();
    expect(screen.getByTestId("concentrated-fill-area")).toBeInTheDocument();
    expect(screen.getAllByText("4").length).toBeGreaterThan(0);
  });

  it("keeps fill blanks inline with inferred underlines and resizable dashed boxes", () => {
    const { container } = renderComposer({
      questions: [
        { id: "fill-existing", type: "short", stem: "结果为____。", score: 5 },
        { id: "fill-missing", type: "short", stem: "方程的根为。", score: 5 },
      ],
      initialSettings: { mode: "with-questions", choiceLayout: "inline" },
    });

    expect(screen.getAllByTestId("inline-fill-question")).toHaveLength(2);
    expect(screen.queryByTestId("concentrated-fill-area")).not.toBeInTheDocument();
    const blanks = container.querySelectorAll<HTMLElement>(".answer-sheet-inline-blank");
    expect(blanks).toHaveLength(2);
    expect(blanks[0]).toHaveTextContent("____");
    expect(blanks[0]).toHaveAttribute("data-answer-sheet-editable", "true");
    expect(blanks[0].style.resize).toBe("both");
    expect(screen.queryByTestId("fill-answer-region")).not.toBeInTheDocument();
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
    const columnFlow = screen.getByTestId("answer-sheet-column-flow");
    expect(columnFlow.style.columnCount).toBe("3");
    expect(columnFlow).toHaveClass("grid");
    expect(columnFlow.querySelectorAll(".answer-sheet-preview-column")).toHaveLength(3);

    const firstColumnHeader = screen.getByTestId("answer-sheet-first-column-header");
    expect(columnFlow).toContainElement(firstColumnHeader);
    expect(firstColumnHeader).toContainElement(screen.getByLabelText("试卷答题卡二维码"));
    expect(firstColumnHeader).toContainElement(screen.getByLabelText("姓名签名填写区"));
    expect(screen.getByLabelText("姓名签名填写区")).toHaveAttribute("data-signature-history-limit", "10");
  });

  it("moves essay images into the answer box and removes empty stem lines", () => {
    renderComposer({
      questions: [{
        id: "essay-with-image",
        type: "essay",
        stem: '<p>证明下列结论。</p><p><br></p><img src="/figure.png" alt="几何图"><p>&nbsp;</p>',
        score: 12,
      }],
      initialSettings: { mode: "with-questions" },
    });

    const stem = screen.getByTestId("essay-question-stem");
    const answerBox = screen.getByTestId("answer-box");
    const movedImage = answerBox.querySelector<HTMLImageElement>('img[src="/figure.png"]');

    expect(stem).toHaveTextContent("证明下列结论。");
    expect(stem.querySelector("img")).toBeNull();
    expect(stem.querySelectorAll("p")).toHaveLength(1);
    expect(movedImage).not.toBeNull();
    expect(movedImage?.closest(".answer-sheet-essay-image")).toBeInTheDocument();
    expect(movedImage).toHaveAttribute("draggable", "false");
    expect(screen.getByRole("button", { name: "调整第1题第1张图片大小" })).toBeInTheDocument();
  });

  it("renders one resizable answer box with a score cell and lets the teacher choose dashed borders", () => {
    renderComposer();

    const initialBoxes = screen.getAllByTestId("answer-box");
    expect(initialBoxes.length).toBeGreaterThan(0);
    expect(initialBoxes[0].style.resize).toBe("vertical");
    expect(screen.getByLabelText("第3题评分框")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("答题框边线"), { target: { value: "dashed" } });
    expect(screen.getAllByTestId("answer-box")[0]).toHaveAttribute("data-answer-box-style", "dashed");
  });

  it("uses Chinese section numbers and summarizes equal or differing question scores", () => {
    renderComposer({
      questions: [
        { id: "q1", type: "single", stem: "选择一", score: 4 },
        { id: "q2", type: "single", stem: "选择二", score: 4 },
        { id: "q3", type: "essay", stem: "解答一", score: 8 },
        { id: "q4", type: "essay", stem: "解答二", score: 12 },
      ],
    });

    expect(screen.getByText("一、单选题（2题，每题4分）")).toBeInTheDocument();
    expect(screen.getByText("二、解答题（第3题8分，第4题12分）")).toBeInTheDocument();
  });

  it("keeps essay answer boxes wide and saves image positions and sizes for preview", () => {
    vi.stubGlobal("PointerEvent", MouseEvent);
    const onSettingsChange = vi.fn();
    renderComposer({
      questions: [{
        id: "essay-1",
        type: "essay",
        stem: '<p>证明。</p><img src="/figure.png" alt="图">',
        score: 10,
      }],
      initialSettings: { mode: "with-questions" },
      onSettingsChange,
    });

    const answerBox = screen.getByTestId("answer-box");
    expect(answerBox.style.resize).toBe("vertical");
    expect(answerBox.parentElement).not.toHaveClass("pl-7");
    expect(answerBox.closest('[data-answer-sheet-flow-item="question"]')?.firstElementChild).toHaveClass("px-[1mm]");

    Object.defineProperties(answerBox, {
      clientWidth: { configurable: true, value: 480 },
      clientHeight: { configurable: true, value: 350 },
    });
    const image = screen.getByTestId("essay-image");
    Object.defineProperty(image, "offsetHeight", { configurable: true, value: 90 });

    fireEvent.pointerDown(image, { button: 0, pointerId: 1, clientX: 15, clientY: 15 });
    fireEvent.pointerMove(image, { pointerId: 1, clientX: 45, clientY: 55 });
    fireEvent.pointerUp(image, { pointerId: 1 });
    expect(image).toHaveStyle({ left: "38px", top: "50px" });

    const handle = screen.getByRole("button", { name: "调整第1题第1张图片大小" });
    fireEvent.pointerDown(handle, { button: 0, pointerId: 2, clientX: 40, clientY: 40 });
    fireEvent.pointerMove(image, { pointerId: 2, clientX: 100, clientY: 40 });
    fireEvent.pointerUp(image, { pointerId: 2 });
    expect(image).toHaveStyle({ width: "180px" });
    expect(onSettingsChange).toHaveBeenCalledWith(expect.objectContaining({
      essayImageLayouts: { "essay-1": [{ x: 38, y: 50, width: 180 }] },
    }));

    vi.spyOn(answerBox, "getBoundingClientRect").mockReturnValue({ height: 240 } as DOMRect);
    fireEvent.pointerUp(answerBox, { pointerId: 3 });
    expect(onSettingsChange).toHaveBeenCalledWith(expect.objectContaining({
      answerBoxHeights: { "essay-1": 240 },
    }));

    fireEvent.click(screen.getByRole("button", { name: "预览答题卡" }));
    expect(screen.getByTestId("essay-image")).toHaveStyle({ left: "38px", top: "50px", width: "180px" });
    expect(screen.getByTestId("answer-box")).toHaveStyle({ height: "240px", resize: "none" });
    expect(screen.queryByRole("button", { name: "调整第1题第1张图片大小" })).not.toBeInTheDocument();
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
    expect(screen.getByLabelText("附题干答题区布局")).toHaveValue("concentrated");

    fireEvent.change(screen.getByLabelText("纸张"), { target: { value: "8K" } });
    expect(onSettingsChange).toHaveBeenLastCalledWith(expect.objectContaining({
      paperSize: "8K",
      mode: "with-questions",
      studentNumberDigits: 9,
      choiceLayout: "concentrated",
    }));
  });
});
