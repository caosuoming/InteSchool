import { afterEach, describe, expect, it, vi } from "vitest";
import { inspectClassPdfOverflow, layoutClassPdfPages } from "./exam-class-pdf-layout";

function sourcePage(classId: string, count: number, index = 0): HTMLElement {
  const page = document.createElement("section");
  page.className = "exam-class-arrangement-page";
  page.dataset.classId = classId;
  page.dataset.columns = "4";
  page.style.paddingBottom = "7px";
  page.innerHTML = `<header><div class="exam-class-arrangement-header-meta"><strong>${classId} · 10 名学生 · 第 ${index + 1}/2 页</strong></div></header><div class="exam-class-arrangement-grid"></div>`;
  const grid = page.querySelector(".exam-class-arrangement-grid")!;
  for (let i = 0; i < count; i++) {
    const card = document.createElement("article");
    card.className = "exam-class-arrangement-student";
    card.dataset.student = `${classId}-${index}-${i}`;
    grid.append(card);
  }
  return page;
}

function mockBrowserLayout() {
  return vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    if (this.classList.contains("exam-class-arrangement-page")) return new DOMRect(0, 0, 200, 170);
    if (this.classList.contains("exam-class-arrangement-grid")) return new DOMRect(0, 20, 200, 0);
    if (this.classList.contains("exam-class-arrangement-student")) {
      const page = this.closest<HTMLElement>(".exam-class-arrangement-page")!;
      const fontSize = parseFloat(page.style.getPropertyValue("--class-print-font-size")) || 5.45;
      return new DOMRect(0, 20, 45, 60 * fontSize / 5.45);
    }
    return new DOMRect();
  });
}

afterEach(() => vi.restoreAllMocks());

describe("measured A4 class PDF layout", () => {
  it("fills one page when it fits and preserves every student", () => {
    mockBrowserLayout();
    const pages = layoutClassPdfPages([sourcePage("A", 8)], document.createElement("div"), "compress");
    expect(pages).toHaveLength(1);
    expect(pages[0].dataset.pdfFill).toBe("true");
    expect(pages[0].querySelectorAll(".exam-class-arrangement-student")).toHaveLength(8);
    expect(pages[0].querySelector<HTMLElement>(".exam-class-arrangement-grid")?.style.gridTemplateRows).not.toBe("");
  });

  it("detects overflow using the full class and distributes cards evenly over two pages", () => {
    mockBrowserLayout();
    const source = [sourcePage("A", 8, 0), sourcePage("A", 2, 1), sourcePage("B", 2)];
    const host = document.createElement("div");
    expect(inspectClassPdfOverflow(source, host)).toEqual(["A"]);
    const pages = layoutClassPdfPages(source, host, "split");
    expect(pages).toHaveLength(3);
    expect(pages.map((page) => page.querySelectorAll(".exam-class-arrangement-student").length)).toEqual([5, 5, 2]);
    expect(pages.slice(0, 2).map((page) => page.querySelector("strong")?.textContent)).toEqual([
      "A · 10 名学生 · 第 1/2 页", "A · 10 名学生 · 第 2/2 页",
    ]);
    expect(pages.every((page) => page.dataset.pdfFill === "true")).toBe(true);
  });

  it("allows independent page choices for different classes", () => {
    mockBrowserLayout();
    const host = document.createElement("div");
    const pages = layoutClassPdfPages([sourcePage("A", 10), sourcePage("B", 10)], host, {
      A: "compress", B: "split",
    });
    expect(pages.map((page) => [page.dataset.classId, page.querySelectorAll(".exam-class-arrangement-student").length]))
      .toEqual([["A", 10], ["B", 5], ["B", 5]]);
  });

  it("compresses overflow into a page without silently dropping students", () => {
    mockBrowserLayout();
    const pages = layoutClassPdfPages([sourcePage("A", 10)], document.createElement("div"), "compress");
    expect(pages).toHaveLength(1);
    expect(pages[0].querySelectorAll(".exam-class-arrangement-student")).toHaveLength(10);
    expect(parseFloat(pages[0].style.getPropertyValue("--class-print-font-size"))).toBeLessThan(5.05);
  });

  it("rejects content that cannot be fitted at the minimum readable size", () => {
    mockBrowserLayout();
    expect(() => layoutClassPdfPages([sourcePage("A", 200)], document.createElement("div"), "split"))
      .toThrow("无法完整排入2页 A4");
  });
});
