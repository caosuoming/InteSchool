import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { paginateClassArrangementPages } from "./exam-class-pagination";

const MM_TO_PT = 72 / 25.4;
const PX_TO_PT = 72 / 96;

function printStyles(): string {
  const rules: string[] = [];
  const visit = (items: CSSRuleList, inPrint = false) => {
    for (const rule of Array.from(items)) {
      if (rule instanceof CSSMediaRule) {
        if (rule.conditionText.includes("print")) visit(rule.cssRules, true);
      } else if (rule instanceof CSSStyleRule && inPrint) {
        rules.push(rule.cssText);
      }
    }
  };
  for (const sheet of Array.from(document.styleSheets)) {
    try { visit(sheet.cssRules); } catch { /* Ignore third-party stylesheets. */ }
  }
  return rules.join("\n");
}

function color(value: string) {
  const match = value.match(/^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/);
  if (!match || /rgba\([^)]*,\s*0(?:\.0+)?\s*\)/.test(value)) return null;
  return rgb(Number(match[1]) / 255, Number(match[2]) / 255, Number(match[3]) / 255);
}

/** Preserve text, rules and backgrounds as PDF operators rather than a bitmap. */
export async function saveVectorExamPdf(pages: HTMLElement[], filename: string, widthMm: number, heightMm: number) {
  const fontResponse = await fetch(`${import.meta.env.BASE_URL}fonts/NotoSansCJKsc-Regular.otf`);
  if (!fontResponse.ok) throw new Error("无法加载 PDF 中文字体");
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  // fontkit's CFF/OpenType subsetting produces a PDF that loses Chinese glyphs
  // in MuPDF. Embed the original CJK font program for reliable printing.
  const font = await pdf.embedFont(await fontResponse.arrayBuffer(), { subset: false });
  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  Object.assign(host.style, { position: "fixed", left: "-100000px", top: "0", width: `${widthMm}mm`, background: "white", pointerEvents: "none" });
  const style = document.createElement("style");
  style.textContent = printStyles();
  document.head.append(style);
  document.body.append(host);
  try {
    if (document.fonts?.ready) await document.fonts.ready;
    // Measure actual card heights before committing to physical PDF pages.
    const paginatedPages = paginateClassArrangementPages(pages, host);
    for (const clone of paginatedPages) {
      clone.style.breakAfter = "auto";
      host.replaceChildren(clone);
      const root = clone.getBoundingClientRect();
      const page = pdf.addPage([widthMm * MM_TO_PT, heightMm * MM_TO_PT]);
      const scaleX = page.getWidth() / root.width;
      const scaleY = page.getHeight() / root.height;
      const drawRect = (rect: DOMRect, fill: ReturnType<typeof rgb>) => {
        const x = (rect.left - root.left) * scaleX;
        const y = page.getHeight() - (rect.bottom - root.top) * scaleY;
        if (rect.width <= 0 || rect.height <= 0) return;
        page.drawRectangle({ x, y, width: rect.width * scaleX, height: rect.height * scaleY,
          color: fill });
      };
      const walker = document.createTreeWalker(clone, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
      let node: Node | null = clone;
      while (node) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          const el = node as HTMLElement;
          const computed = getComputedStyle(el);
          if (computed.display !== "none" && computed.visibility !== "hidden") {
            const rect = el.getBoundingClientRect();
            const background = color(computed.backgroundColor);
            if (background) drawRect(rect, background);
            for (const side of ["top", "bottom", "left", "right"] as const) {
              const thickness = parseFloat(computed.getPropertyValue(`border-${side}-width`));
              const border = color(computed.getPropertyValue(`border-${side}-color`));
              if (thickness > 0 && border && computed.getPropertyValue(`border-${side}-style`) !== "none") {
                const edge = side === "top" ? new DOMRect(rect.left, rect.top, rect.width, thickness)
                  : side === "bottom" ? new DOMRect(rect.left, rect.bottom - thickness, rect.width, thickness)
                    : side === "left" ? new DOMRect(rect.left, rect.top, thickness, rect.height)
                      : new DOMRect(rect.right - thickness, rect.top, thickness, rect.height);
                drawRect(edge, border);
              }
            }
          }
        } else if (node.nodeType === Node.TEXT_NODE && node.textContent?.trim()) {
          const parent = node.parentElement;
          if (parent) {
            const computed = getComputedStyle(parent);
            if (computed.display !== "none" && computed.visibility !== "hidden") {
              const textColor = color(computed.color) || rgb(0, 0, 0);
              const fontSize = parseFloat(computed.fontSize) * PX_TO_PT;
              const text = node.textContent;
              // Character ranges retain flex alignment, wrapping and inline formatting.
              for (let i = 0; i < text.length; i++) {
                if (/\s/.test(text[i])) continue;
                const range = document.createRange();
                range.setStart(node, i); range.setEnd(node, i + 1);
                const rect = range.getBoundingClientRect();
                if (!rect.width || !rect.height) continue;
                const x = (rect.left - root.left) * scaleX;
                const y = page.getHeight() - (rect.bottom - root.top) * scaleY + (rect.height * scaleY - fontSize) * 0.22;
                page.drawText(text[i], { x, y, font, size: fontSize, color: textColor });
              }
            }
          }
        }
        node = walker.nextNode();
      }
    }
    const blob = new Blob([new Uint8Array(await pdf.save())], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url; anchor.download = `${filename.replace(/[\\/:*?"<>|]/g, "_").trim() || "考场安排"}.pdf`;
    document.body.append(anchor); anchor.click(); anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } finally {
    host.remove(); style.remove();
  }
}
