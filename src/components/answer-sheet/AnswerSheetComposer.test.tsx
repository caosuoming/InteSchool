import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AnswerSheetComposer } from "./AnswerSheetComposer";

const downloadPdfMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock("@/lib/answer-sheet-export", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/answer-sheet-export")>()),
  downloadAnswerSheetPdf: downloadPdfMock,
}));

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
  it("keeps the source order and question numbers even when concentrated answer areas move to the front", () => {
    const { container } = renderComposer({
      questions: [
        { id: "fill", label: "例1", type: "short", stem: "填空", score: 4 },
        { id: "choice1", type: "single", stem: "选择第一", score: 4 },
        { id: "essay", type: "essay", stem: "证明", score: 8 },
        { id: "choice2", type: "single", stem: "选择第二", score: 4 },
      ],
      initialSettings: { mode: "with-questions", choiceLayout: "concentrated" },
    });
    const originalRows = Array.from(container.querySelectorAll('[data-answer-sheet-flow-item="question"]'), (item) => item.textContent || "");
    expect(originalRows.map((row) => [row.includes("填空"), row.includes("选择第一"), row.includes("证明"), row.includes("选择第二")]))
      .toEqual([[true, false, false, false], [false, true, false, false], [false, false, true, false], [false, false, false, true]]);
    expect(originalRows[0]).toContain("例1.");
    expect(originalRows[1]).toContain("2.");
    expect(originalRows[2]).toContain("3.");
    expect(originalRows[3]).toContain("4.");
    const choices = Array.from(container.querySelectorAll('[data-answer-sheet-flow-item="zone-choice"]'), (item) => item.textContent || "");
    expect(choices).toHaveLength(1);
    expect(choices[0]).toContain("2.");
    expect(choices[0]).toContain("4.");
    expect(screen.getAllByTestId("choice-answer-group")).toHaveLength(1);
    expect(container.querySelector('[data-answer-sheet-flow-item="zone-fill"]')).toHaveTextContent("例1.");
  });

  it("shows project names instead of question types for a project-layout answer sheet", () => {
    const { container } = renderComposer({
      sourceLayoutMode: "flat",
      projects: [{ id: "algebra", name: "代数计算" }, { id: "geometry", name: "图形证明" }, { id: "empty", name: "空项目" }],
      questions: [
        { id: "fill1", projectId: "algebra", label: "例1", type: "short", stem: "填空一", score: 4 },
        { id: "multi", projectId: "geometry", type: "multiple", stem: "多选", score: 5 },
        { id: "essay", projectId: "geometry", type: "essay", stem: "证明", score: 8 },
        { id: "single1", projectId: "algebra", type: "single", stem: "单选一", score: 5 },
        { id: "fill2", projectId: "missing", type: "short", stem: "填空二", score: 4 },
        { id: "single2", projectId: "algebra", type: "single", stem: "单选二", score: 5 },
      ],
    });

    const headings = Array.from(container.querySelectorAll('[data-answer-sheet-flow-item="group-heading"]'),
      (node) => node.textContent || "");
    expect(headings.map((heading) => heading.match(/、([^（]+)/)?.[1])).toEqual(["未分组", "代数计算", "图形证明"]);
    expect(headings.join(" ")).not.toMatch(/单选题|多选题|填空题|解答题/);
    const rows = Array.from(container.querySelectorAll('[data-answer-sheet-flow-item="question"]'),
      (node) => node.textContent || "");
    expect(rows).toHaveLength(6);
    expect(rows.map((row) => row.match(/(?:例1|[1-6])\./)?.[0])).toEqual(["5.", "例1.", "4.", "6.", "2.", "3."]);
  });

  it("preserves project sections and question order across inline and concentrated layouts", () => {
    const { container } = renderComposer({
      sourceLayoutMode: "flat",
      projects: [{ id: "practice", name: "综合训练" }],
      questions: [
        { id: "fill1", projectId: "practice", type: "short", stem: "填空第一", score: 4 },
        { id: "multi", projectId: "practice", type: "multiple", stem: "多选第二", score: 5 },
        { id: "essay", projectId: "practice", type: "essay", stem: "解答第三", score: 8 },
        { id: "single", projectId: "practice", type: "single", stem: "单选第四", score: 5 },
        { id: "fill2", projectId: "practice", type: "short", stem: "填空第五", score: 4 },
      ],
      initialSettings: { mode: "with-questions", choiceLayout: "inline" },
    });

    const questionRows = () => Array.from(container.querySelectorAll('[data-answer-sheet-flow-item="question"]'),
      (node) => node.textContent || "");
    const headings = () => Array.from(container.querySelectorAll('[data-answer-sheet-flow-item="group-heading"]'),
      (node) => node.textContent || "");
    expect(questionRows().map((row) => row.match(/(填空第一|多选第二|解答第三|单选第四|填空第五)/)?.[1]))
      .toEqual(["填空第一", "多选第二", "解答第三", "单选第四", "填空第五"]);

    fireEvent.change(screen.getByLabelText("显题干答题区布局"), { target: { value: "concentrated" } });
    expect(questionRows().map((row) => row.match(/(填空第一|多选第二|解答第三|单选第四|填空第五)/)?.[1]))
      .toEqual(["填空第一", "多选第二", "解答第三", "单选第四", "填空第五"]);
    expect(headings()).toHaveLength(1);
    expect(headings()[0]).toContain("综合训练");
    const choiceZones = Array.from(container.querySelectorAll('[data-answer-sheet-flow-item="zone-choice"]'),
      (node) => node.textContent || "");
    expect(choiceZones.join(" ")).toMatch(/2\.[\s\S]*4\./);
    const fillZones = Array.from(container.querySelectorAll('[data-answer-sheet-flow-item="zone-fill"]'),
      (node) => node.textContent || "");
    expect(fillZones).toHaveLength(1);
    expect(fillZones[0]).toContain("1.");
    expect(fillZones[0]).toContain("5.");

    fireEvent.change(screen.getByLabelText("显题干答题区布局"), { target: { value: "inline" } });
    expect(questionRows()[0]).toContain("填空第一");
    expect(headings()[0]).toContain("综合训练");
    expect(container.querySelector('[data-answer-sheet-flow-item="zone-choice"]')).toBeNull();
  });

  it("keeps question-type section titles for grouped papers", () => {
    const { container } = renderComposer({ sourceLayoutMode: "grouped" });
    const headings = Array.from(container.querySelectorAll('[data-answer-sheet-flow-item="group-heading"]'),
      (node) => node.textContent || "");
    expect(headings.map((heading) => heading.match(/、([^（]+)/)?.[1])).toEqual(["单选题", "多选题", "填空题"]);
  });

  it("downloads preview pages as PDF and prints without changing publication status", async () => {
    downloadPdfMock.mockClear();
    const onPublicationChange = vi.fn().mockResolvedValue(undefined);
    const print = vi.spyOn(window, "print").mockImplementation(() => {});
    try {
      const { container, rerender } = renderComposer({
        initialViewMode: "preview",
        initialSettings: { paperSize: "8K" },
        onPublicationChange,
      });
      fireEvent.click(screen.getByRole("button", { name: "下载答题卡" }));
      await waitFor(() => expect(downloadPdfMock).toHaveBeenCalledTimes(1));
      const [pages, name, paperSize] = downloadPdfMock.mock.calls[0];
      expect(pages).toEqual(Array.from(container.querySelectorAll('[data-paper-view="preview"]')));
      expect(pages).toHaveLength(1);
      expect(name).toBe("高一数学期中考试_答题卡");
      expect(paperSize).toBe("8K");
      expect(onPublicationChange).not.toHaveBeenCalled();
      expect(print).not.toHaveBeenCalled();

      fireEvent.click(screen.getByRole("button", { name: "打印答题卡" }));
      expect(print).toHaveBeenCalledTimes(1);
      window.dispatchEvent(new Event("afterprint"));
      expect(onPublicationChange).not.toHaveBeenCalled();
      rerender(<AnswerSheetComposer title="期中" resourceType="exam-paper" resourceId="paper-1" resourceLabel="试卷"
        questions={questions} published initialViewMode="preview" onPublicationChange={onPublicationChange} onBack={vi.fn()} />);
      expect(screen.getByRole("button", { name: "撤回发布" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "编辑答题卡" })).toBeDisabled();
      fireEvent.click(screen.getByRole("button", { name: "撤回发布" }));
      await waitFor(() => expect(onPublicationChange).toHaveBeenCalledWith(false, expect.anything()));
    } finally {
      print.mockRestore();
    }
  });

  it.each(["A4", "16K", "A3", "8K"] as const)(
    "exports %s sheets using the matching preview paper size", async (paperSize) => {
      downloadPdfMock.mockClear();
      renderComposer({ initialViewMode: "preview", initialSettings: { paperSize } });
      fireEvent.click(screen.getByRole("button", { name: "下载答题卡" }));
      await waitFor(() => expect(downloadPdfMock).toHaveBeenCalledWith(
        [expect.objectContaining({ dataset: expect.objectContaining({ paperSize }) })],
        "高一数学期中考试_答题卡",
        paperSize,
      ));
    },
  );

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
    expect(identityFields).toHaveClass("border", "border-ink-900", "flex-1");
    expect(identityFields.nextElementSibling).toBe(studentNumberColumn);
    expect(studentNumberColumn.nextElementSibling).toBe(qrPosition);
    expect(studentNumberColumn).toHaveClass("border", "border-ink-900");
    expect(qrPosition).toHaveClass("border", "border-ink-900");
    expect(identityFields).toContainElement(screen.getByLabelText("班级填写区"));
    expect(identityFields).toContainElement(screen.getByLabelText("姓名签名填写区"));
    expect(studentNumberColumn).toContainElement(screen.getByTestId("student-number-grid"));
    expect(identityArea).toContainElement(screen.getByLabelText("试卷答题卡二维码"));
    expect(identityFields).toHaveClass("flex-1");
    expect(studentNumberColumn).toHaveClass("w-[52mm]");
    expect(qrPosition).toHaveClass("w-[24mm]");
    expect(screen.getByLabelText("姓名签名填写区")).toHaveClass("block", "w-[50mm]", "h-[13mm]", "shrink-0");
    expect(screen.getByTestId("student-number-grid")).toHaveClass("w-[46mm]", "shrink-0");
    expect(screen.getAllByTestId("student-number-row")[0].firstElementChild).toHaveClass("w-[4mm]", "h-[4mm]", "shrink-0");
    expect(screen.getByLabelText("试卷答题卡二维码")).toHaveStyle({ width: "20mm", height: "20mm" });
    expect(screen.getByLabelText("姓名签名填写区").previousElementSibling).toHaveTextContent("姓名：");
  });

  it("fits the 8K three-column identity row and keeps signature width on every paper size", () => {
    const { container } = renderComposer({ initialSettings: { paperSize: "8K", widePaperColumns: 3 } });
    const paper = container.querySelector<HTMLElement>(".answer-sheet-paper")!;
    const area = screen.getByTestId("answer-sheet-identity-area");
    const fields = screen.getByTestId("answer-sheet-identity-fields");
    const student = screen.getByTestId("answer-sheet-student-number-column");
    const qr = screen.getByTestId("answer-sheet-qr-position");

    expect(paper.style.width).toBe("130mm");
    expect(area).toHaveClass("flex", "items-stretch");
    expect(area).not.toHaveClass("flex-col");
    expect(fields).toHaveClass("flex-1", "border");
    expect(student).toHaveClass("w-[49mm]", "border");
    expect(qr).toHaveClass("w-[24mm]", "border");
    expect(fields.nextElementSibling).toBe(student);
    expect(student.nextElementSibling).toBe(qr);
    expect(screen.getByLabelText("姓名签名填写区")).toHaveClass("w-[32mm]");
    expect(screen.getByLabelText("姓名签名填写区").parentElement).toHaveClass("flex-col");
    // Both gaps and fixed student/QR regions leave at least 32 mm for the signature.
    expect((370 - 2 * 8 - 2 * 6) / 3 - 49 - 24 - 3).toBeGreaterThan(34);
    expect(screen.getByTestId("answer-sheet-page-header")).not.toHaveTextContent("高一 · 2026-2027学年");

    fireEvent.change(screen.getByLabelText("纸张"), { target: { value: "A4" } });
    expect(screen.getByLabelText("姓名签名填写区")).toHaveClass("w-[50mm]");
    fireEvent.change(screen.getByLabelText("纸张"), { target: { value: "16K" } });
    expect(screen.getByLabelText("姓名签名填写区")).toHaveClass("w-[50mm]");
    fireEvent.change(screen.getByLabelText("纸张"), { target: { value: "A3" } });
    expect(screen.getByLabelText("姓名签名填写区")).toHaveClass("w-[32mm]");
    fireEvent.click(screen.getByRole("button", { name: "预览答题卡" }));
    expect(screen.getByLabelText("姓名签名填写区")).toHaveClass("w-[32mm]");
  });

  it("controls and persists question stem font size without spacing after question numbers", () => {
    const onSettingsChange = vi.fn();
    const { container } = renderComposer({
      initialSettings: { mode: "with-questions", paperSize: "8K", widePaperColumns: 3 },
      onSettingsChange,
    });
    const fontInput = screen.getByLabelText("题干字号（px）");
    expect(fontInput).toHaveValue(12);
    const stems = container.querySelectorAll(".answer-sheet-question-stem");
    expect(stems.length).toBeGreaterThan(0);
    stems.forEach((stem) => {
      expect(stem.parentElement).toHaveClass("gap-0");
      expect(stem.previousElementSibling).not.toHaveClass("w-7");
    });

    fireEvent.change(fontInput, { target: { value: "16" } });
    expect(onSettingsChange).toHaveBeenLastCalledWith(expect.objectContaining({ stemFontSize: 16 }));
    expect(container.firstElementChild).toHaveStyle({ "--answer-sheet-stem-font-size": "16px" });
    fireEvent.click(screen.getByRole("button", { name: "预览答题卡" }));
    expect(container.firstElementChild).toHaveStyle({ "--answer-sheet-stem-font-size": "16px" });
    expect(container.querySelectorAll(".answer-sheet-question-stem").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "编辑答题卡" }));
    expect(screen.getByLabelText("题干字号（px）")).toHaveValue(16);
    fireEvent.change(screen.getByLabelText("显题干答题区布局"), { target: { value: "concentrated" } });
    expect(screen.getAllByTestId("concentrated-choice-question")[0].querySelector(".answer-sheet-question-stem")?.parentElement).toHaveClass("gap-0");
  });

  it("normalizes legacy and out-of-range stem font settings", () => {
    const { unmount } = renderComposer({ initialSettings: { mode: "with-questions", stemFontSize: 80 } });
    expect(screen.getByLabelText("题干字号（px）")).toHaveValue(20);
    unmount();
    renderComposer({ initialSettings: { mode: "with-questions", stemFontSize: 9 } });
    expect(screen.getByLabelText("题干字号（px）")).toHaveValue(10);
  });

  it("keeps A4 editing at full width and uses single-column editing for 8K/A3", () => {
    const { container } = renderComposer();
    const paper = () => container.querySelector<HTMLElement>(".answer-sheet-paper")!;

    expect(paper()).toHaveAttribute("data-paper-columns", "1");
    expect(screen.getByLabelText("题目栏数")).toHaveValue("1");
    fireEvent.change(screen.getByLabelText("题目栏数"), { target: { value: "2" } });
    expect(paper()).toHaveAttribute("data-paper-columns", "2");
    expect(paper().style.width).toBe("210mm");
    expect(screen.getByTestId("answer-sheet-column-flow").children).toHaveLength(2);
    expect(screen.getByTestId("answer-sheet-column-flow")).not.toContainElement(screen.getByTestId("answer-sheet-page-header"));

    fireEvent.click(screen.getByRole("button", { name: "预览答题卡" }));
    expect(paper()).toHaveAttribute("data-paper-columns", "2");
    expect(paper().style.width).toBe("210mm");
    expect(screen.getByTestId("answer-sheet-page-header")).toContainElement(screen.getByLabelText("试卷答题卡二维码"));

    fireEvent.click(screen.getByRole("button", { name: "编辑答题卡" }));
    fireEvent.change(screen.getByLabelText("纸张"), { target: { value: "8K" } });
    expect(paper()).toHaveAttribute("data-paper-view", "edit");
    expect(paper()).toHaveAttribute("data-paper-columns", "1");
    expect(paper()).toHaveAttribute("data-layout-columns", "2");
    expect(paper().style.width).toBe("190mm");
    expect(paper().style.height).toBe("260mm");
    expect(paper()).toContainElement(screen.getByTestId("answer-sheet-page-header"));
    expect(paper()).toHaveClass("overflow-hidden");
    expect(paper().querySelectorAll(".answer-sheet-preview-column")).toHaveLength(1);
    expect(paper()).toContainElement(screen.getByTestId("answer-sheet-page-header"));

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
    expect(paper()).toHaveAttribute("data-layout-columns", "2");
    expect(paper().style.width).toBe("215mm");
    expect(paper().style.height).toBe("297mm");
    expect(paper()).toContainElement(screen.getByTestId("answer-sheet-page-header"));

    fireEvent.change(screen.getByLabelText("纸张"), { target: { value: "A4" } });
    expect(screen.getByLabelText("题目栏数")).toHaveValue("2");
    expect(paper()).toHaveAttribute("data-paper-columns", "2");

    fireEvent.click(screen.getByRole("button", { name: "预览答题卡" }));
    expect(paper()).toHaveAttribute("data-paper-columns", "2");
    expect(paper().style.width).toBe("210mm");
  });

  it("uses the A4 layout for 16K with correctly sized portrait pages and persistent columns", () => {
    const onSettingsChange = vi.fn();
    const { container } = renderComposer({ onSettingsChange });
    const paper = () => container.querySelector<HTMLElement>(".answer-sheet-paper")!;

    fireEvent.change(screen.getByLabelText("纸张"), { target: { value: "16K" } });
    expect(onSettingsChange).toHaveBeenLastCalledWith(expect.objectContaining({ paperSize: "16K" }));
    expect(paper()).toHaveAttribute("data-paper-size", "16K");
    expect(paper()).toHaveClass("answer-sheet-paper-16k");
    expect(paper().style.width).toBe("185mm");
    expect(paper().style.height).toBe("260mm");
    expect(paper()).toHaveAttribute("data-paper-columns", "1");
    expect(screen.getByLabelText("题目栏数")).toHaveValue("1");
    expect(screen.getByTestId("answer-sheet-page-header")).toContainElement(screen.getByLabelText("试卷答题卡二维码"));
    expect(screen.getByTestId("answer-sheet-identity-fields")).toHaveClass("pt-[4mm]");
    expect(screen.getByLabelText("姓名签名填写区")).toHaveClass("w-[50mm]");

    fireEvent.change(screen.getByLabelText("题目栏数"), { target: { value: "2" } });
    expect(onSettingsChange).toHaveBeenLastCalledWith(expect.objectContaining({ a4Columns: 2 }));
    expect(paper()).toHaveAttribute("data-paper-columns", "2");
    expect(screen.getByTestId("answer-sheet-column-flow").children).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "预览答题卡" }));
    expect(paper().style.width).toBe("185mm");
    expect(paper()).toHaveAttribute("data-paper-columns", "2");
    fireEvent.click(screen.getByRole("button", { name: "编辑答题卡" }));

    fireEvent.change(screen.getByLabelText("纸张"), { target: { value: "A4" } });
    expect(screen.getByLabelText("题目栏数")).toHaveValue("2");
    expect(paper().style.width).toBe("210mm");
    fireEvent.change(screen.getByLabelText("纸张"), { target: { value: "16K" } });
    expect(screen.getByLabelText("题目栏数")).toHaveValue("2");
  });

  it("flows the A4 content left to right without mixing it with the identity header", () => {
    const measurement = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      const height = this.dataset.testid === "answer-sheet-page-header" ? 200
        : this.dataset.answerSheetFlowItem === "question" ? 300
        : this.dataset.answerSheetFlowItem ? 20 : 0;
      return { height } as DOMRect;
    });

    try {
      const { container } = renderComposer({
        initialSettings: { paperSize: "A4", a4Columns: 2 },
        questions: [
          { id: "a", type: "single", stem: "A" },
          { id: "b", type: "single", stem: "B" },
          { id: "c", type: "single", stem: "C" },
          { id: "d", type: "single", stem: "D" },
        ],
      });
      const columns = container.querySelectorAll(".answer-sheet-preview-column");
      expect(columns).toHaveLength(2);
      expect(Array.from(columns[0].querySelectorAll('[data-answer-sheet-flow-item="question"]'))).toHaveLength(2);
      expect(Array.from(columns[1].querySelectorAll('[data-answer-sheet-flow-item="question"]'))).toHaveLength(2);
      expect(columns[0].textContent).toContain("1.");
      expect(columns[0].textContent).toContain("2.");
      expect(columns[0].textContent).not.toContain("3.");
      expect(columns[1].textContent).toContain("3.");
      expect(columns[1].textContent).toContain("4.");
      expect(columns[0]).not.toContainElement(screen.getByTestId("answer-sheet-page-header"));
    } finally {
      measurement.mockRestore();
    }
  });

  it("stitches three separately edited wide-paper columns into one physical preview", () => {
    const measurement = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      const height = this.dataset.testid === "answer-sheet-page-header" ? 200
        : this.dataset.answerSheetFlowItem === "question" ? 600
        : this.dataset.answerSheetFlowItem ? 20 : 0;
      return { height } as DOMRect;
    });

    try {
      const { container } = renderComposer({
        initialSettings: { paperSize: "A3", widePaperColumns: 3 },
      });
      const editor = screen.getByTestId("answer-sheet-editor-pages");
      const editedColumns = container.querySelectorAll<HTMLElement>(".answer-sheet-editor-page");
      expect(editedColumns).toHaveLength(3);
      expect(editedColumns[0]).toContainElement(screen.getByTestId("answer-sheet-page-header"));
      expect(editedColumns[1].querySelector("header")).toBeNull();
      expect(editedColumns[0].style.height).toBe("297mm");
      expect(editedColumns[2].style.height).toBe("297mm");
      expect(editedColumns[0].style.width).toMatch(/^146\.6/);
      expect(editor.querySelectorAll(".answer-sheet-preview-column")).toHaveLength(3);
      expect(Array.from(screen.getAllByTestId("answer-sheet-column-page-number"), (node) => node.textContent)).toEqual(["1", "2", "3"]);
      editedColumns.forEach((column, index) => {
        expect(column).toHaveAttribute("data-paper-columns", "1");
        expect(column).toHaveAttribute("data-editor-page", String(index + 1));
        expect(column.querySelectorAll('[data-answer-sheet-flow-item="question"]')).toHaveLength(1);
      });

      fireEvent.click(screen.getByRole("button", { name: "预览答题卡" }));
      const previewSheets = container.querySelectorAll<HTMLElement>(".answer-sheet-preview-sheet");
      expect(previewSheets).toHaveLength(1);
      expect(previewSheets[0]).toHaveAttribute("data-paper-columns", "3");
      expect(previewSheets[0].style.width).toBe("420mm");
      expect(previewSheets[0].querySelectorAll(".answer-sheet-preview-column")).toHaveLength(3);
      expect(screen.getByTestId("answer-sheet-preview-pages").querySelectorAll('[data-answer-sheet-flow-item="question"]')).toHaveLength(3);
      expect(screen.getAllByTestId("answer-sheet-page-header")).toHaveLength(1);
      expect(Array.from(screen.getAllByTestId("answer-sheet-column-page-number"), (node) => node.textContent)).toEqual(["1", "2", "3"]);

      fireEvent.click(screen.getByRole("button", { name: "编辑答题卡" }));
      expect(container.querySelectorAll(".answer-sheet-editor-page")).toHaveLength(3);
    } finally {
      measurement.mockRestore();
    }
  });

  it("supports inline and concentrated choice fill areas while keeping choice options visible", () => {
    renderComposer();

    fireEvent.click(screen.getByLabelText("显题干"));
    expect(screen.getAllByTestId("inline-choice-question")).toHaveLength(2);
    expect(screen.queryByTestId("concentrated-choice-area")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("显题干答题区布局"), {
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

  it("puts the title, identity area, and QR only on the first wide-paper column", () => {
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
    expect(columnFlow.style.gridTemplateColumns).toBe("repeat(3, minmax(0, 1fr))");
    expect(columnFlow).toHaveClass("grid");
    expect(columnFlow.querySelectorAll(".answer-sheet-preview-column")).toHaveLength(3);

    const pageHeader = screen.getByTestId("answer-sheet-page-header");
    expect(paper).toContainElement(pageHeader);
    expect(columnFlow.firstElementChild).toContainElement(pageHeader);
    expect(columnFlow.children[1].querySelector("header")).toBeNull();
    expect(columnFlow.children[2].querySelector("header")).toBeNull();
    expect(Array.from(screen.getAllByTestId("answer-sheet-column-page-number"), (node) => node.textContent)).toEqual(["1", "2", "3"]);
    expect(pageHeader).toContainElement(screen.getByLabelText("试卷答题卡二维码"));
    expect(pageHeader).toContainElement(screen.getByLabelText("姓名签名填写区"));
    expect(screen.getByTestId("answer-sheet-identity-fields")).toHaveClass("flex-1", "border");
    expect(screen.getByTestId("answer-sheet-identity-area")).not.toHaveClass("flex-col");
    expect(screen.getByTestId("answer-sheet-student-number-column")).toHaveClass("w-[49mm]", "border");
    expect(screen.getByTestId("answer-sheet-student-number-column")).toHaveClass("shrink-0");
    expect(screen.getByTestId("answer-sheet-qr-position")).toHaveClass("w-[24mm]");
    expect(screen.getByLabelText("姓名签名填写区")).toHaveAttribute("data-signature-history-limit", "10");
  });

  it("reserves header height across the first sheet and flows questions onto later sheets", () => {
    const measurement = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      const height = this.dataset.testid === "answer-sheet-page-header" ? 200
        : this.dataset.answerSheetFlowItem === "question" ? 600
        : this.dataset.answerSheetFlowItem ? 20 : 0;
      return { height } as DOMRect;
    });

    try {
      const { container } = renderComposer({ initialSettings: { a4Columns: 2 } });
      const sheets = container.querySelectorAll<HTMLElement>(".answer-sheet-paper");
      expect(sheets).toHaveLength(2);
      expect(screen.getAllByTestId("answer-sheet-page-header")).toHaveLength(1);
      const firstColumns = sheets[0].querySelectorAll(".answer-sheet-preview-column");
      const secondColumns = sheets[1].querySelectorAll(".answer-sheet-preview-column");
      expect(firstColumns).toHaveLength(2);
      expect(firstColumns[0].querySelectorAll('[data-answer-sheet-flow-item="question"]')).toHaveLength(1);
      expect(firstColumns[1].querySelectorAll('[data-answer-sheet-flow-item="question"]')).toHaveLength(1);
      expect(secondColumns[0].querySelectorAll('[data-answer-sheet-flow-item="question"]')).toHaveLength(1);
      expect(sheets[1].querySelector("header")).toBeNull();
    } finally {
      measurement.mockRestore();
    }
  });

  it("reserves the wide header only on the first column and numbers across sheets", () => {
    const measurement = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      const height = this.dataset.testid === "answer-sheet-page-header" ? 200
        : this.dataset.answerSheetFlowItem === "question" ? 420
        : this.dataset.answerSheetFlowItem ? 20 : 0;
      return { height } as DOMRect;
    });

    try {
      const { container } = renderComposer({
        initialViewMode: "preview",
        initialSettings: { paperSize: "8K", widePaperColumns: 2 },
        questions: Array.from({ length: 5 }, (_, index) => ({
          id: `q${index}`, type: "single" as const, stem: String(index),
        })),
      });
      const columns = container.querySelectorAll(".answer-sheet-preview-column");
      expect(columns).toHaveLength(4);
      expect(columns[0].querySelectorAll('[data-answer-sheet-flow-item="question"]')).toHaveLength(1);
      expect(columns[1].querySelectorAll('[data-answer-sheet-flow-item="question"]')).toHaveLength(2);
      expect(columns[2].querySelectorAll('[data-answer-sheet-flow-item="question"]')).toHaveLength(2);
      expect(columns[0]).toContainElement(screen.getByTestId("answer-sheet-page-header"));
      expect(columns[1].querySelector("header")).toBeNull();
      expect(Array.from(screen.getAllByTestId("answer-sheet-column-page-number"), (node) => node.textContent))
        .toEqual(["1", "2", "3", "4"]);
    } finally {
      measurement.mockRestore();
    }
  });

  it("edits shared and per-question spacing and retains it in preview and after reloading", () => {
    const onSettingsChange = vi.fn();
    const { container, unmount } = renderComposer({
      initialSettings: { mode: "with-questions" },
      onSettingsChange,
    });
    const row = (id: string) => container.querySelector<HTMLElement>(`[data-question-id="${id}"]`)!;
    expect(row("q1")).toHaveStyle({ paddingBottom: "12px" });
    fireEvent.change(screen.getByLabelText("统一题后间距（px）"), { target: { value: "14" } });
    expect(row("q1")).toHaveStyle({ paddingBottom: "26px" });
    expect(row("q2")).toHaveStyle({ paddingBottom: "26px" });
    expect(row("q3")).toHaveStyle({ paddingBottom: "26px" });

    fireEvent.change(screen.getByLabelText("调整题号"), { target: { value: "q2" } });
    fireEvent.change(screen.getByLabelText("该题后间距（px）"), { target: { value: "30" } });
    expect(row("q2")).toHaveStyle({ paddingBottom: "42px" });
    expect(row("q1")).toHaveStyle({ paddingBottom: "26px" });
    const saved = onSettingsChange.mock.lastCall?.[0];
    expect(saved).toMatchObject({ questionGapPx: 14, questionGapOverrides: { q2: 30 } });

    fireEvent.click(screen.getByRole("button", { name: "预览答题卡" }));
    expect(row("q2")).toHaveStyle({ paddingBottom: "42px" });
    expect(row("q3")).toHaveStyle({ paddingBottom: "26px" });
    unmount();
    const reloaded = renderComposer({ initialSettings: saved, initialViewMode: "preview" });
    expect(reloaded.container.querySelector('[data-question-id="q2"]')).toHaveStyle({ paddingBottom: "42px" });
    fireEvent.click(screen.getByRole("button", { name: "编辑答题卡" }));
    expect(screen.getByLabelText("统一题后间距（px）")).toHaveValue(14);
    fireEvent.change(screen.getByLabelText("调整题号"), { target: { value: "q2" } });
    expect(screen.getByLabelText("该题后间距（px）")).toHaveValue(30);
    fireEvent.click(screen.getByRole("button", { name: "跟随统一间距" }));
    expect(reloaded.container.querySelector('[data-question-id="q2"]')).toHaveStyle({ paddingBottom: "26px" });
  });

  it("keeps spacing controls exclusive to the show-stem layout and bounds invalid saved values", () => {
    const { container } = renderComposer({
      initialSettings: { mode: "with-questions", questionGapPx: -3, questionGapOverrides: { q2: 1000 } },
    });
    expect(container.querySelector('[data-question-id="q1"]')).toHaveStyle({ paddingBottom: "12px" });
    expect(container.querySelector('[data-question-id="q2"]')).toHaveStyle({ paddingBottom: "132px" });
    fireEvent.click(screen.getByLabelText("不显题干"));
    expect(screen.queryByTestId("answer-sheet-spacing-controls")).not.toBeInTheDocument();
    expect(container.querySelector('[data-question-id="q2"]')!).not.toHaveStyle({ paddingBottom: "132px" });
  });

  it("captures native resize gestures ending outside the fill and essay boxes", () => {
    vi.stubGlobal("PointerEvent", MouseEvent);
    const onSettingsChange = vi.fn();
    renderComposer({
      initialSettings: { mode: "with-questions", choiceLayout: "concentrated" },
      questions: [
        { id: "fill", type: "short", stem: "填空", score: 5 },
        { id: "essay", type: "essay", stem: "解答", score: 10 },
      ],
      onSettingsChange,
    });
    const [fill, essay] = screen.getAllByTestId("answer-box");
    let fillRect = { left: 0, top: 0, right: 200, bottom: 150, width: 200, height: 150 } as DOMRect;
    let essayRect = { left: 0, top: 0, right: 300, bottom: 180, width: 300, height: 180 } as DOMRect;
    vi.spyOn(fill, "getBoundingClientRect").mockImplementation(() => fillRect);
    vi.spyOn(essay, "getBoundingClientRect").mockImplementation(() => essayRect);
    fireEvent.pointerDown(fill, { button: 0, clientX: 195, clientY: 145 });
    fillRect = { ...fillRect, width: 180, height: 130, right: 180, bottom: 130 } as DOMRect;
    fireEvent.pointerUp(window);
    fireEvent.pointerDown(essay, { button: 0, clientX: 295, clientY: 175 });
    essayRect = { ...essayRect, height: 260, bottom: 260 } as DOMRect;
    fireEvent.pointerUp(window);
    expect(onSettingsChange).toHaveBeenLastCalledWith(expect.objectContaining({
      answerBoxHeights: { fill: 130, essay: 260 }, answerBoxWidths: { fill: 180 },
    }));
    fireEvent.click(screen.getByRole("button", { name: "预览答题卡" }));
    const [previewFill, previewEssay] = screen.getAllByTestId("answer-box");
    expect(previewFill).toHaveStyle({ width: "180px", height: "130px", resize: "none" });
    expect(previewEssay).toHaveStyle({ height: "260px", resize: "none" });
  });

  it("persists both width and height when resizing concentrated fill areas", () => {
    const onSettingsChange = vi.fn();
    renderComposer({
      initialSettings: { mode: "with-questions", choiceLayout: "concentrated" },
      onSettingsChange,
    });
    const fillZone = screen.getByTestId("concentrated-fill-area").closest('[data-answer-sheet-flow-item="zone-heading"]')!.nextElementSibling!;
    const box = fillZone.querySelector<HTMLElement>('[data-testid="answer-box"]')!;
    expect(box.style.resize).toBe("both");
    expect(box).toHaveStyle({ maxWidth: "187mm", minWidth: "32mm" });
    vi.spyOn(box, "getBoundingClientRect").mockReturnValue({ width: 220, height: 130 } as DOMRect);
    fireEvent.pointerUp(box);
    expect(onSettingsChange).toHaveBeenCalledWith(expect.objectContaining({
      answerBoxWidths: { q3: 220 },
      answerBoxHeights: { q3: 130 },
    }));

    fireEvent.click(screen.getByRole("button", { name: "预览答题卡" }));
    const savedBox = screen.getByTestId("concentrated-fill-area").closest('[data-answer-sheet-flow-item="zone-heading"]')!.nextElementSibling!
      .querySelector<HTMLElement>('[data-testid="answer-box"]')!;
    expect(savedBox).toHaveStyle({ width: "220px", height: "130px", resize: "none" });
    expect(savedBox.querySelector('[aria-label="第3题评分框"]')).not.toBeInTheDocument();
  });

  it("positions, wraps, and captions images in choice stems, options, and fill questions", () => {
    vi.stubGlobal("PointerEvent", MouseEvent);
    const onSettingsChange = vi.fn();
    renderComposer({
      questions: [
        {
          id: "choice-image", type: "single", score: 5,
          stem: '观察图示 <img src="/stem.png" alt="题干图"> 然后选择',
          options: ['<img src="/option.png" alt="选项图">', "B", "C", "D"],
        },
        { id: "fill-image", type: "short", stem: '填空 ___ <img src="/fill.png" alt="填空图">' },
      ],
      initialSettings: { mode: "with-questions", choiceLayout: "inline" },
      onSettingsChange,
    });

    const stemWrap = screen.getByAltText("题干图").closest("[data-image-index]") as HTMLElement;
    expect(stemWrap).toHaveAttribute("data-wrap", "left");
    expect(stemWrap).toHaveStyle({ marginTop: "4px", marginLeft: "0px" });
    expect(stemWrap.style.left).toBe("");
    expect(stemWrap.style.top).toBe("");
    const stemImage = screen.getByAltText("题干图");
    fireEvent.pointerDown(stemImage, { button: 0, pointerId: 1, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(stemImage, { pointerId: 1, clientX: 36, clientY: 25 });
    fireEvent.pointerUp(stemImage, { pointerId: 1, clientX: 36, clientY: 25 });
    expect(screen.getByAltText("题干图").closest("[data-image-index]")).toHaveStyle({ marginLeft: "26px", marginTop: "19px" });

    fireEvent.input(screen.getByRole("combobox", { name: "第1题题干第1张图片环绕模式" }), { target: { value: "right" } });
    const optionImage = screen.getByAltText("选项图");
    const optionWrap = optionImage.closest("[data-image-index]")!;
    expect(Array.from(optionWrap.querySelector("select")!.options, (option) => option.value)).toEqual(["left", "right"]);
    fireEvent.input(optionWrap.querySelector("select")!, { target: { value: "right" } });
    const fillQuestion = screen.getByAltText("填空图").closest("[data-answer-sheet-question]")!;
    expect(fillQuestion.querySelector(".answer-sheet-inline-blank")).toHaveAttribute("data-answer-sheet-editable", "true");
    const fillInput = screen.getByAltText("填空图").closest("[data-image-index]")!.querySelector("input")!;
    fireEvent.change(fillInput, { target: { value: "图1 函数示意图" } });
    fireEvent.blur(fillInput);
    expect(fillQuestion.querySelector(".answer-sheet-inline-blank")).toHaveAttribute("data-answer-sheet-editable", "true");

    expect(onSettingsChange).toHaveBeenLastCalledWith(expect.objectContaining({
      questionImageLayouts: {
        "choice-image": {
          stem: [{ x: 26, y: 15, wrap: "right", caption: "" }],
          "option-0": [{ x: 0, y: 0, wrap: "right", caption: "" }],
        },
        "fill-image": {
          stem: [{ x: 0, y: 0, wrap: "left", caption: "图1 函数示意图" }],
        },
      },
    }));

    fireEvent.click(screen.getByRole("button", { name: "预览答题卡" }));
    expect(screen.getByAltText("题干图").closest("[data-image-index]")).toHaveAttribute("data-wrap", "right");
    expect(screen.getByAltText("选项图").closest("[data-image-index]")).toHaveAttribute("data-wrap", "right");
    expect(screen.getByText("图1 函数示意图")).toHaveClass("answer-sheet-image-caption");
    expect(screen.queryByRole("combobox", { name: "第1题题干第1张图片环绕模式" })).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "第2题题干第1张图片备注" })).not.toBeInTheDocument();
  });

  it("converts legacy non-wrapping image layouts into text-flow wrapping in editor and preview", () => {
    const { container } = renderComposer({
      questions: [
        { id: "choice", type: "single", stem: '题干 <img src="/inline.png" alt="旧题干图"> 后续文字' },
        { id: "essay", type: "essay", stem: '<p>解答题文字</p><img src="/figure.png" alt="旧解答图">' },
      ],
      initialSettings: {
        mode: "with-questions",
        questionImageLayouts: { choice: { stem: [{ x: 19, y: 14, wrap: "none", caption: "" }] } },
        essayImageLayouts: { essay: [{ x: 8, y: 10, width: 120, wrap: "none" }] },
      },
    });
    const assertFlow = () => {
      const inline = screen.getByAltText("旧题干图").closest<HTMLElement>("[data-image-index]")!;
      const essay = screen.getByAltText("旧解答图").closest<HTMLElement>(".answer-sheet-essay-image")!;
      expect(inline).toHaveAttribute("data-wrap", "left");
      expect(inline).toHaveStyle({ marginLeft: "19px", marginTop: "18px" });
      expect(inline.style.left).toBe("");
      expect(inline.style.top).toBe("");
      expect(essay).toHaveAttribute("data-wrap", "left");
      expect(essay).toHaveStyle({ position: "static", float: "left", marginLeft: "8px", marginTop: "10px" });
    };
    assertFlow();
    expect(container.querySelectorAll('[data-wrap="none"]')).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "预览答题卡" }));
    assertFlow();
  });

  it("keeps right-wrapped images in flow when dragging left and clamps backward movement", () => {
    vi.stubGlobal("PointerEvent", MouseEvent);
    const onSettingsChange = vi.fn();
    renderComposer({
      questions: [{ id: "right-img", type: "short", stem: '图示 <img src="/right.png" alt="靠右图"> 后面的文字' }],
      initialSettings: {
        mode: "with-questions",
        questionImageLayouts: { "right-img": { stem: [{ x: 8, y: 0, wrap: "right", caption: "" }] } },
      },
      onSettingsChange,
    });
    const image = screen.getByAltText("靠右图");
    fireEvent.pointerDown(image, { button: 0, pointerId: 1, clientX: 100, clientY: 10 });
    fireEvent.pointerMove(image, { pointerId: 1, clientX: 80, clientY: -30 });
    const wrapper = image.closest<HTMLElement>("[data-image-index]")!;
    expect(wrapper).toHaveStyle({ marginRight: "28px", marginTop: "4px" });
    expect(wrapper.style.left).toBe("");
    fireEvent.pointerUp(image, { pointerId: 1, clientX: 80, clientY: -30 });
    expect(onSettingsChange).toHaveBeenCalledWith(expect.objectContaining({
      questionImageLayouts: { "right-img": { stem: [{ x: 28, y: 0, wrap: "right", caption: "" }] } },
    }));
  });

  it("loads saved image captions and wrap modes without editing", () => {
    renderComposer({
      questions: [{ id: "q-img", type: "short", stem: '文字 <img src="/saved.png" alt="存档图">' }],
      initialSettings: {
        mode: "with-questions",
        questionImageLayouts: { "q-img": { stem: [{ x: 11, y: 9, wrap: "right", caption: "存档备注" }] } },
      },
      initialViewMode: "preview",
    });
    const wrapper = screen.getByAltText("存档图").closest("[data-image-index]");
    expect(wrapper).toHaveStyle({ marginRight: "11px", marginTop: "13px" });
    expect((wrapper as HTMLElement).style.left).toBe("");
    expect((wrapper as HTMLElement).style.top).toBe("");
    expect(wrapper).toHaveAttribute("data-wrap", "right");
    expect(screen.getByText("存档备注")).toHaveClass("answer-sheet-image-caption");
  });

  it("allows essay image wrapping and centered captions while preserving drag and resize", () => {
    const onSettingsChange = vi.fn();
    renderComposer({
      questions: [{ id: "essay-image", type: "essay", stem: '<img src="/essay.png" alt="解答图">' }],
      initialSettings: { mode: "with-questions" },
      onSettingsChange,
    });
    fireEvent.change(screen.getByRole("combobox", { name: "第1题第1张图片环绕模式" }), { target: { value: "left" } });
    const caption = screen.getByRole("textbox", { name: "第1题第1张图片备注" });
    fireEvent.change(caption, { target: { value: "图2 结构图" } });
    fireEvent.blur(caption);
    expect(onSettingsChange).toHaveBeenLastCalledWith(expect.objectContaining({
      essayImageLayouts: { "essay-image": [{ x: 8, y: 10, width: 120, wrap: "left", caption: "图2 结构图" }] },
    }));
    expect(screen.getByTestId("essay-image")).toHaveStyle({ position: "static", float: "left" });
    expect(Array.from(screen.getByRole("combobox", { name: "第1题第1张图片环绕模式" }).querySelectorAll("option"),
      (option) => option.value)).toEqual(["left", "right"]);
    fireEvent.click(screen.getByRole("button", { name: "预览答题卡" }));
    expect(screen.getByTestId("essay-image")).toHaveAttribute("data-wrap", "left");
    expect(screen.getByText("图2 结构图")).toHaveClass("answer-sheet-image-caption");
    expect(screen.queryByRole("textbox", { name: "第1题第1张图片备注" })).not.toBeInTheDocument();
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
    expect(image).toHaveStyle({ marginLeft: "38px", marginTop: "50px", position: "static", float: "left" });

    const handle = screen.getByRole("button", { name: "调整第1题第1张图片大小" });
    fireEvent.pointerDown(handle, { button: 0, pointerId: 2, clientX: 40, clientY: 40 });
    fireEvent.pointerMove(image, { pointerId: 2, clientX: 100, clientY: 40 });
    fireEvent.pointerUp(image, { pointerId: 2 });
    expect(image).toHaveStyle({ width: "180px" });
    expect(onSettingsChange).toHaveBeenCalledWith(expect.objectContaining({
      essayImageLayouts: { "essay-1": [{ x: 38, y: 50, width: 180, wrap: "left" }] },
    }));

    vi.spyOn(answerBox, "getBoundingClientRect").mockReturnValue({ height: 240 } as DOMRect);
    fireEvent.pointerUp(answerBox, { pointerId: 3 });
    expect(onSettingsChange).toHaveBeenCalledWith(expect.objectContaining({
      answerBoxHeights: { "essay-1": 240 },
    }));

    fireEvent.click(screen.getByRole("button", { name: "预览答题卡" }));
    expect(screen.getByTestId("essay-image")).toHaveStyle({ marginLeft: "38px", marginTop: "50px", width: "180px", position: "static", float: "left" });
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
    expect(screen.getByLabelText("显题干答题区布局")).toHaveValue("concentrated");

    fireEvent.change(screen.getByLabelText("纸张"), { target: { value: "8K" } });
    expect(onSettingsChange).toHaveBeenLastCalledWith(expect.objectContaining({
      paperSize: "8K",
      mode: "with-questions",
      studentNumberDigits: 9,
      choiceLayout: "concentrated",
    }));
  });


  it("keeps fill writing lines anchored to the bottom of resized answer boxes", () => {
    const onSettingsChange = vi.fn();
    const { container } = renderComposer({ onSettingsChange });

    const fillBox = screen.getByLabelText("第3题评分框").closest('[data-testid="answer-box"]')!;
    expect(fillBox.querySelector('[data-testid="fill-answer-rule"]')).toBeInTheDocument();
    expect(container.querySelectorAll('[data-testid="fill-answer-rule"]')).toHaveLength(1);
    expect(fillBox.querySelector('[data-testid="fill-answer-rule"]')).toHaveClass("answer-sheet-fill-rule");

    vi.spyOn(fillBox, "getBoundingClientRect").mockReturnValue({ height: 200, width: 350 } as DOMRect);
    fireEvent.pointerUp(fillBox);
    expect(onSettingsChange).toHaveBeenCalledWith(expect.objectContaining({
      answerBoxHeights: { q3: 200 },
    }));

    fireEvent.click(screen.getByRole("button", { name: "预览答题卡" }));
    expect(screen.getByTestId("fill-answer-rule").closest('[data-testid="answer-box"]'))
      .toHaveStyle({ height: "200px" });
    fireEvent.click(screen.getByRole("button", { name: "编辑答题卡" }));
    fireEvent.click(screen.getByLabelText("显题干"));
    const inlineBlank = container.querySelector(".answer-sheet-inline-blank");
    expect(inlineBlank).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("显题干答题区布局"), {
      target: { value: "concentrated" },
    });
    expect(screen.getAllByTestId("fill-answer-rule")).toHaveLength(1);
  });

  it("adapts choice option rows to measured widths without wrapping each option", () => {
    const measurement = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      return {
        width: this.dataset.testid === "choice-option-layout" ? 150
          : this.dataset.testid === "choice-option" ? 60 : 0,
        height: 0,
      } as DOMRect;
    });
    try {
      const { container } = renderComposer({
        initialSettings: { mode: "with-questions" },
        questions: [questions[0]],
      });

      const rows = screen.getAllByTestId("choice-option-row");
      expect(rows).toHaveLength(2);
      expect(rows[0].querySelectorAll('[data-testid="choice-option"]')).toHaveLength(2);
      expect(rows[1].querySelectorAll('[data-testid="choice-option"]')).toHaveLength(2);
      expect(container.querySelectorAll(".answer-sheet-choice-option-content")).toHaveLength(4);
    } finally {
      measurement.mockRestore();
    }
  });

  it("keeps the signature below the name and identity sections aligned on all paper sizes", () => {
    const { container } = renderComposer();
    for (const paperSize of ["A4", "16K", "8K", "A3"] as const) {
      fireEvent.change(screen.getByLabelText("纸张"), { target: { value: paperSize } });
      const signature = screen.getByLabelText("姓名签名填写区");
      const nameLabel = signature.previousElementSibling;
      expect(nameLabel).toHaveTextContent("姓名：");
      expect(signature.parentElement).toHaveClass("flex-col", "items-start");
      expect(screen.getByTestId("answer-sheet-identity-area").firstElementChild)
        .toBe(screen.getByTestId("answer-sheet-identity-fields"));
      expect(screen.getByTestId("answer-sheet-identity-fields").nextElementSibling)
        .toBe(screen.getByTestId("answer-sheet-student-number-column"));
      expect(container.querySelector('[data-testid="answer-sheet-qr-position"]'))
        .toBe(screen.getByTestId("answer-sheet-student-number-column").nextElementSibling);
    }
  });

  it("moves option controls to the toolbar and preserves each selected question's layout", () => {
    const onSettingsChange = vi.fn();
    const { container } = renderComposer({
      initialSettings: { mode: "with-questions" },
      onSettingsChange,
    });
    const controls = screen.getByTestId("answer-sheet-choice-controls");
    expect(controls).toContainElement(screen.getByLabelText("选择题号"));
    expect(screen.getByLabelText("选择题号")).toHaveValue("q1");
    expect(controls.querySelectorAll("select")).toHaveLength(4);
    expect(screen.getAllByTestId("choice-option-row")[0]).toHaveClass("grid");
    expect(screen.getAllByTestId("choice-option-row")[0]).toHaveStyle({ gridTemplateColumns: "repeat(4, minmax(0, 1fr))" });
    expect(container.querySelector('[data-testid="inline-choice-question"] select')).toBeNull();

    fireEvent.change(screen.getByLabelText("第1题选项B排列方式"), { target: { value: "new-line" } });
    expect(onSettingsChange).toHaveBeenLastCalledWith(expect.objectContaining({
      choiceOptionBreaks: { q1: { 1: "new-line" } },
    }));
    fireEvent.change(screen.getByLabelText("选择题号"), { target: { value: "q2" } });
    expect(screen.getByLabelText("第2题选项B排列方式")).toHaveValue("auto");
    fireEvent.change(screen.getByLabelText("第2题选项D排列方式"), { target: { value: "same-line" } });
    expect(onSettingsChange).toHaveBeenLastCalledWith(expect.objectContaining({
      choiceOptionBreaks: { q1: { 1: "new-line" }, q2: { 3: "same-line" } },
    }));
    fireEvent.change(screen.getByLabelText("选择题号"), { target: { value: "q1" } });
    expect(screen.getByLabelText("第1题选项B排列方式")).toHaveValue("new-line");
    fireEvent.click(screen.getByRole("button", { name: "预览答题卡" }));
    expect(screen.queryByTestId("answer-sheet-choice-controls")).not.toBeInTheDocument();
    expect(screen.getAllByTestId("choice-option-row").length).toBeGreaterThan(2);
  });

  it("defaults concentrated choice fills to horizontal and saves a vertical layout for preview", () => {
    const onSettingsChange = vi.fn();
    renderComposer({
      initialSettings: { mode: "with-questions", choiceLayout: "concentrated" },
      onSettingsChange,
    });
    const direction = screen.getByLabelText("选择题填涂方向");
    expect(direction).toHaveValue("horizontal");
    expect(screen.getAllByTestId("choice-answer-options")).toHaveLength(2);
    expect(screen.getAllByTestId("choice-answer-options")[0]).toHaveClass("flex-1");
    expect(screen.getAllByTestId("choice-answer-options")[0].children).toHaveLength(4);
    expect(screen.getAllByTestId("choice-answer-options")[0].firstElementChild).toHaveClass("flex-1", "text-center");

    fireEvent.change(direction, { target: { value: "vertical" } });
    expect(onSettingsChange).toHaveBeenLastCalledWith(expect.objectContaining({
      concentratedChoiceDirection: "vertical",
    }));
    expect(screen.getAllByTestId("choice-answer-options")[0]).toHaveClass("flex-col");
    expect(screen.getAllByTestId("choice-answer-group")[0]).toHaveClass("justify-between");
    expect(screen.getAllByTestId("choice-answer-group")[0]).toHaveStyle({ width: "16mm" });
    expect(screen.getByTestId("choice-answer-row")).toHaveClass("gap-x-[2mm]", "gap-y-[5mm]");
    expect(screen.getAllByTestId("choice-answer")[0]).toHaveClass("w-[8mm]", "shrink-0");
    expect(screen.getAllByTestId("choice-answer")[0].firstElementChild).toHaveTextContent("1.");
    expect(screen.getAllByTestId("choice-answer")[0].firstElementChild?.nextElementSibling)
      .toHaveAttribute("data-direction", "vertical");
    fireEvent.click(screen.getByRole("button", { name: "预览答题卡" }));
    expect(screen.queryByLabelText("选择题填涂方向")).not.toBeInTheDocument();
    expect(screen.getAllByTestId("choice-answer-options")[0]).toHaveAttribute("data-direction", "vertical");
    fireEvent.click(screen.getByRole("button", { name: "编辑答题卡" }));
    expect(screen.getByLabelText("选择题填涂方向")).toHaveValue("vertical");

    fireEvent.change(screen.getByLabelText("显题干答题区布局"), { target: { value: "inline" } });
    expect(screen.queryByLabelText("选择题填涂方向")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("显题干答题区布局"), { target: { value: "concentrated" } });
    expect(screen.getByLabelText("选择题填涂方向")).toHaveValue("vertical");
  });

  it("groups choices by five, wraps groups to the next row and retains the order in both directions", () => {
    const manyChoices = Array.from({ length: 22 }, (_, index) => ({
      id: "choice-" + index,
      type: "single" as const,
      stem: "题目" + (index + 1),
      options: ["甲", "乙", "丙", "丁"],
      score: 2,
    }));
    const { container } = renderComposer({
      questions: manyChoices,
      initialSettings: { mode: "with-questions", choiceLayout: "concentrated" },
    });
    const groupNumbers = () => screen.getAllByTestId("choice-answer-group").map(
      (group) => Array.from(group.querySelectorAll('[data-testid="choice-answer"]'), (item) => item.firstElementChild?.textContent),
    );
    const rowGroups = () => Array.from(container.querySelectorAll('[data-testid="choice-answer-row"]'), (row) =>
      row.querySelectorAll('[data-testid="choice-answer-group"]').length,
    );

    expect(groupNumbers()).toEqual([
      ["1.", "2.", "3.", "4.", "5."],
      ["6.", "7.", "8.", "9.", "10."],
      ["11.", "12.", "13.", "14.", "15."],
      ["16.", "17.", "18.", "19.", "20."],
      ["21.", "22."],
    ]);
    expect(rowGroups()).toEqual([5]);

    fireEvent.change(screen.getByLabelText("选择题填涂方向"), { target: { value: "vertical" } });
    expect(rowGroups()).toEqual([5]);
    expect(screen.getAllByTestId("choice-answer-group")[0]).toHaveStyle({ width: "40mm" });
    expect(screen.getAllByTestId("choice-answer-group")[4]).toHaveStyle({ width: "16mm" });
    expect(groupNumbers()).toHaveLength(5);
    expect(screen.getAllByTestId("choice-answer-group")[0]).toHaveAttribute("data-direction", "vertical");
    expect(screen.getAllByTestId("choice-answer")[0]).toHaveClass("flex-col");

    fireEvent.change(screen.getByLabelText("题目栏数"), { target: { value: "2" } });
    expect(rowGroups()).toEqual([2, 2, 1]);
    fireEvent.change(screen.getByLabelText("选择题填涂方向"), { target: { value: "horizontal" } });
    expect(rowGroups()).toEqual([2, 2, 1]);
    fireEvent.click(screen.getByRole("button", { name: "预览答题卡" }));
    expect(rowGroups()).toEqual([2, 2, 1]);
    expect(groupNumbers()[4]).toEqual(["21.", "22."]);
  });

  it("provides equal option columns without a score box for concentrated fill blanks", () => {
    const { container } = renderComposer({
      initialSettings: { mode: "with-questions", choiceLayout: "concentrated" },
    });
    const choices = screen.getAllByTestId("choice-option-row");
    expect(choices[0]).toHaveClass("grid");
    expect(choices[0]).toHaveStyle({ gridTemplateColumns: "repeat(4, minmax(0, 1fr))" });

    const fillBox = container.querySelector('[data-answer-sheet-flow-item="zone-fill"] [data-testid="answer-box"]');
    expect(fillBox?.querySelector('[aria-label="第3题评分框"]')).not.toBeInTheDocument();
    expect(fillBox?.querySelector('[data-testid="fill-answer-rule"]')).toHaveStyle({ right: "2mm" });
    fireEvent.click(screen.getByRole("button", { name: "预览答题卡" }));
    expect(container.querySelector('[data-answer-sheet-flow-item="zone-fill"] [aria-label="第3题评分框"]'))
      .not.toBeInTheDocument();
  });

  it("packs concentrated fill answers into available rows and repacks after resizing", () => {
    const fills = Array.from({ length: 5 }, (_, index) => ({
      id: `fill-${index}`, type: "short" as const, stem: `填空${index + 1}`, score: 4,
    }));
    const onSettingsChange = vi.fn();
    const { container } = renderComposer({
      questions: fills,
      initialSettings: { mode: "with-questions", choiceLayout: "concentrated" },
      onSettingsChange,
    });
    const rows = () => Array.from(container.querySelectorAll('[data-testid="concentrated-fill-row"]'));
    const sizes = () => rows().map((row) => row.querySelectorAll('[data-testid="answer-box"]').length);
    expect(sizes()).toEqual([4, 1]);
    expect(rows()[0].textContent).toMatch(/1\.[\s\S]*4\./);

    fireEvent.change(screen.getByLabelText("题目栏数"), { target: { value: "2" } });
    expect(sizes()).toEqual([2, 2, 1]);
    const firstBox = rows()[0].querySelector<HTMLElement>('[data-testid="answer-box"]')!;
    vi.spyOn(firstBox, "getBoundingClientRect").mockReturnValue({ width: 300, height: 90 } as DOMRect);
    fireEvent.pointerUp(firstBox);
    expect(onSettingsChange).toHaveBeenCalledWith(expect.objectContaining({ answerBoxWidths: { "fill-0": 300 } }));
    expect(sizes()).toEqual([1, 2, 2]);

    fireEvent.click(screen.getByRole("button", { name: "预览答题卡" }));
    expect(sizes()).toEqual([1, 2, 2]);
    expect(rows()[0].querySelector('[aria-label="第1题评分框"]')).not.toBeInTheDocument();
  });

  it("saves per-option line break choices and reproduces them in preview", () => {
    const onSettingsChange = vi.fn();
    renderComposer({
      initialSettings: { mode: "with-questions" },
      onSettingsChange,
      questions: [questions[0]],
    });

    expect(screen.getAllByTestId("choice-option-row")).toHaveLength(1);
    const select = screen.getByLabelText("第1题选项B排列方式");
    fireEvent.change(select, { target: { value: "new-line" } });
    expect(screen.getAllByTestId("choice-option-row")).toHaveLength(2);
    expect(onSettingsChange).toHaveBeenLastCalledWith(expect.objectContaining({
      choiceOptionBreaks: { q1: { 1: "new-line" } },
    }));

    fireEvent.click(screen.getByRole("button", { name: "预览答题卡" }));
    expect(screen.getAllByTestId("choice-option-row")).toHaveLength(2);
    expect(screen.queryByLabelText("第1题选项B排列方式")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "编辑答题卡" }));
    expect(screen.getByLabelText("第1题选项B排列方式")).toHaveValue("new-line");
    fireEvent.change(screen.getByLabelText("第1题选项B排列方式"), {
      target: { value: "auto" },
    });
    expect(screen.getAllByTestId("choice-option-row")).toHaveLength(1);
    expect(onSettingsChange).toHaveBeenLastCalledWith(expect.objectContaining({
      choiceOptionBreaks: {},
    }));
  });
});
