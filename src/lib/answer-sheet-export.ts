import { ANSWER_SHEET_PAPER_MM, type AnswerSheetPaperSize } from "./answer-sheet";

export async function downloadAnswerSheetPdf(
  pages: HTMLElement[],
  fileName: string,
  paperSize: AnswerSheetPaperSize,
): Promise<void> {
  if (pages.length === 0) throw new Error("暂无可下载的答题卡预览");

  const paper = ANSWER_SHEET_PAPER_MM[paperSize];
  const orientation = paper.width > paper.height ? "landscape" : "portrait";
  const [{ jsPDF }, { default: html2canvas }] = await Promise.all([
    import("jspdf"),
    import("html2canvas"),
  ]);
  const pdf = new jsPDF({
    orientation,
    unit: "mm",
    format: [paper.width, paper.height],
    compress: true,
  });

  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  // SVG foreignObject rasterization requires the clone inside the viewport;
  // keep it behind the application instead of moving it far off-screen.
  Object.assign(host.style, {
    position: "fixed",
    left: "0",
    top: "0",
    zIndex: "-1",
    width: `${paper.width}mm`,
    backgroundColor: "#fff",
    pointerEvents: "none",
  });
  host.style.setProperty(
    "--answer-sheet-stem-font-size",
    getComputedStyle(pages[0]).getPropertyValue("--answer-sheet-stem-font-size"),
  );
  document.body.append(host);

  try {
    if (document.fonts?.ready) await document.fonts.ready;
    const windowWidth = Math.round(paper.width * 96 / 25.4);
    const windowHeight = Math.round(paper.height * 96 / 25.4);

    for (const [index, source] of pages.entries()) {
      if (index > 0) pdf.addPage([paper.width, paper.height], orientation);
      const page = source.cloneNode(true) as HTMLElement;
      page.style.boxShadow = "none";
      page.style.margin = "0";
      page.style.breakAfter = "auto";
      host.replaceChildren(page);
      const canvas = await html2canvas(page, {
        backgroundColor: "#ffffff",
        logging: false,
        scale: 2,
        useCORS: true,
        // Render glyphs and KaTeX fractions with the browser layout engine.
        foreignObjectRendering: true,
        windowWidth,
        windowHeight,
      });
      pdf.addImage(canvas, "PNG", 0, 0, paper.width, paper.height, undefined, "FAST");
    }

    const safeName = fileName.replace(/[\\/:*?"<>|]/g, "_").trim() || "答题卡";
    pdf.save(`${safeName}.pdf`);
  } finally {
    host.remove();
  }
}

export function printAnswerSheet(pages: HTMLElement[], paperSize: AnswerSheetPaperSize): void {
  if (pages.length === 0) throw new Error("暂无可打印的答题卡预览");

  // The surrounding app layout can add blank pages around named paper pages.
  const host = document.createElement("div");
  host.className = "answer-sheet-standalone-print-root";
  host.style.setProperty(
    "--answer-sheet-stem-font-size",
    getComputedStyle(pages[0]).getPropertyValue("--answer-sheet-stem-font-size"),
  );
  for (const source of pages) {
    const page = source.cloneNode(true) as HTMLElement;
    page.style.boxShadow = "none";
    page.style.margin = "0";
    host.append(page);
  }

  const cleanup = () => {
    host.remove();
    document.body.classList.remove("answer-sheet-printing");
    delete document.body.dataset.answerSheetPrintSize;
    window.removeEventListener("afterprint", cleanup);
  };
  document.body.append(host);
  document.body.classList.add("answer-sheet-printing");
  document.body.dataset.answerSheetPrintSize = paperSize;
  window.addEventListener("afterprint", cleanup);
  try {
    window.print();
  } catch (error) {
    cleanup();
    throw error;
  }
}
