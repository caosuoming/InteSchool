import { beforeEach, describe, expect, it, vi } from "vitest";
import { downloadAnswerSheetPdf, printAnswerSheet } from "./answer-sheet-export";
import { ANSWER_SHEET_PAPER_MM, type AnswerSheetPaperSize } from "./answer-sheet";

const mocks = vi.hoisted(() => ({
  construct: vi.fn(),
  addPage: vi.fn(),
  addImage: vi.fn(),
  save: vi.fn(),
  html2canvas: vi.fn(),
}));

vi.mock("jspdf", () => ({
  jsPDF: class {
    constructor(options: unknown) { mocks.construct(options); }
    addPage(...args: unknown[]) { mocks.addPage(...args); }
    addImage(...args: unknown[]) { mocks.addImage(...args); }
    save(...args: unknown[]) { mocks.save(...args); }
  },
}));
vi.mock("html2canvas", () => ({ default: mocks.html2canvas }));

function makePages(count: number): HTMLElement[] {
  const host = document.createElement("div");
  host.style.setProperty("--answer-sheet-stem-font-size", "17px");
  document.body.append(host);
  return Array.from({ length: count }, (_, index) => {
    const page = document.createElement("article");
    page.className = "answer-sheet-paper";
    page.style.boxShadow = "0 3px 6px gray";
    page.textContent = `第${index + 1}页`;
    host.append(page);
    return page;
  });
}

describe("downloadAnswerSheetPdf", () => {
  beforeEach(() => {
    document.body.replaceChildren();
    vi.clearAllMocks();
    mocks.html2canvas.mockResolvedValue(document.createElement("canvas"));
  });

  it.each(["A4", "16K", "A3", "8K"] as AnswerSheetPaperSize[])(
    "renders %s in its physical dimensions and orientation", async (paperSize) => {
      const pages = makePages(2);
      const paper = ANSWER_SHEET_PAPER_MM[paperSize];
      const orientation = paper.width > paper.height ? "landscape" : "portrait";

      mocks.html2canvas.mockImplementation(async (page: HTMLElement) => {
        expect(page.parentElement?.style.left).toBe("0px");
        expect(page.parentElement?.style.zIndex).toBe("-1");
        return document.createElement("canvas");
      });
      await downloadAnswerSheetPdf(pages, "期中/考试:答题卡", paperSize);

      expect(mocks.construct).toHaveBeenCalledWith({
        orientation, unit: "mm", format: [paper.width, paper.height], compress: true,
      });
      expect(mocks.addPage).toHaveBeenCalledExactlyOnceWith([paper.width, paper.height], orientation);
      expect(mocks.html2canvas).toHaveBeenCalledTimes(2);
      expect(mocks.html2canvas).toHaveBeenCalledWith(
        expect.objectContaining({ textContent: "第1页" }),
        expect.objectContaining({
          windowWidth: Math.round(paper.width * 96 / 25.4),
          windowHeight: Math.round(paper.height * 96 / 25.4),
          scale: 2,
          useCORS: true,
          foreignObjectRendering: true,
        }),
      );
      expect(mocks.addImage).toHaveBeenCalledTimes(2);
      expect(mocks.addImage.mock.calls[0].slice(1, 6)).toEqual(["PNG", 0, 0, paper.width, paper.height]);
      expect(mocks.save).toHaveBeenCalledExactlyOnceWith("期中_考试_答题卡.pdf");
      expect(document.querySelectorAll('div[aria-hidden="true"]')).toHaveLength(0);
      expect(pages[0].style.boxShadow).not.toBe("none");
    },
  );

  it.each(["A4", "16K", "A3", "8K"] as AnswerSheetPaperSize[])(
    "prints only the %s preview sheets, without the app shell", (paperSize) => {
      const pages = makePages(2);
      const print = vi.spyOn(window, "print").mockImplementation(() => {
        const host = document.querySelector(".answer-sheet-standalone-print-root");
        expect(host).not.toBeNull();
        expect(document.body).toHaveClass("answer-sheet-printing");
        expect(document.body.dataset.answerSheetPrintSize).toBe(paperSize);
        expect(host?.children).toHaveLength(2);
        expect(host?.querySelectorAll(".answer-sheet-paper")).toHaveLength(2);
        expect(host?.firstElementChild).not.toBe(pages[0]);
        expect(host?.firstElementChild).toHaveTextContent("第1页");
        expect(host?.lastElementChild).toHaveTextContent("第2页");
      });
      try {
        printAnswerSheet(pages, paperSize);
        expect(print).toHaveBeenCalledTimes(1);
        window.dispatchEvent(new Event("afterprint"));
        expect(document.querySelector(".answer-sheet-standalone-print-root")).toBeNull();
        expect(document.body).not.toHaveClass("answer-sheet-printing");
        expect(document.body.dataset.answerSheetPrintSize).toBeUndefined();
        expect(pages).toHaveLength(2);
      } finally {
        print.mockRestore();
      }
    },
  );

  it("cleans up the print host when printing throws", () => {
    const pages = makePages(1);
    const print = vi.spyOn(window, "print").mockImplementation(() => { throw new Error("打印失败"); });
    try {
      expect(() => printAnswerSheet(pages, "A4")).toThrow("打印失败");
      expect(document.querySelector(".answer-sheet-standalone-print-root")).toBeNull();
      expect(document.body).not.toHaveClass("answer-sheet-printing");
    } finally {
      print.mockRestore();
    }
  });

  it("rejects empty previews before creating a PDF", async () => {
    await expect(downloadAnswerSheetPdf([], "空白", "A4")).rejects.toThrow("暂无可下载的答题卡预览");
    expect(mocks.construct).not.toHaveBeenCalled();
  });

  it("cleans up cloned sheets if rendering fails without saving a partial PDF", async () => {
    const pages = makePages(1);
    mocks.html2canvas.mockRejectedValue(new Error("画布失败"));
    await expect(downloadAnswerSheetPdf(pages, "出错", "A4")).rejects.toThrow("画布失败");
    expect(mocks.save).not.toHaveBeenCalled();
    expect(document.querySelectorAll('div[aria-hidden="true"]')).toHaveLength(0);
  });
});
