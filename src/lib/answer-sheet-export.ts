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
  Object.assign(host.style, {
    position: "fixed",
    left: "-100000px",
    top: "0",
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
