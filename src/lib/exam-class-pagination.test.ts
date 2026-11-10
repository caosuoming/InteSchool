import { afterEach, describe, expect, it, vi } from "vitest";
import { paginateClassArrangementPages } from "./exam-class-pagination";

function sourcePage(classId: string, count: number, pageIndex = 1): HTMLElement {
  const page = document.createElement("section");
  page.className = "exam-class-arrangement-page";
  page.dataset.classId = classId;
  page.dataset.columns = "4";
  page.dataset.pageIndex = String(pageIndex);
  page.style.paddingBottom = "10px";
  page.innerHTML = `<header class="exam-class-arrangement-header">
    <div class="exam-class-arrangement-header-meta"><strong>高二（1）班 · 12 名学生 · 第 ${pageIndex}/2 页</strong></div>
  </header><div class="exam-class-arrangement-grid"></div>`;
  const grid = page.querySelector(".exam-class-arrangement-grid")!;
  for (let i = 0; i < count; i++) {
    const card = document.createElement("article");
    card.className = "exam-class-arrangement-student";
    card.dataset.student = `${classId}-${pageIndex}-${i}`;
    card.dataset.height = "60";
    grid.append(card);
  }
  return page;
}

// JSDOM has no layout engine. Simulate a 170px page with a 20px header,
// 5px row gaps and real variable-height cards for the pagination contract.
function mockLayout() {
  return vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    if (this.classList.contains("exam-class-arrangement-page")) return new DOMRect(0, 0, 200, 170);
    if (this.classList.contains("exam-class-arrangement-student")) {
      const siblings = Array.from(this.parentElement!.children) as HTMLElement[];
      const row = Math.floor(siblings.indexOf(this) / 4);
      let top = 20;
      for (let i = 0; i < row; i++) {
        top += Math.max(...siblings.slice(i * 4, i * 4 + 4).map((card) => Number(card.dataset.height))) + 5;
      }
      return new DOMRect(0, top, 40, Number(this.dataset.height));
    }
    return new DOMRect();
  });
}

afterEach(() => vi.restoreAllMocks());

describe("paginateClassArrangementPages", () => {
  it("moves complete rows to subsequent pages and preserves every student", () => {
    mockLayout();
    const host = document.createElement("div");
    const source = sourcePage("class-a", 10);
    const pages = paginateClassArrangementPages([source], host);
    expect(pages).toHaveLength(2);
    expect(pages.map((page) => page.querySelectorAll(".exam-class-arrangement-student").length)).toEqual([8, 2]);
    expect(pages.flatMap((page) => [...page.querySelectorAll<HTMLElement>(".exam-class-arrangement-student")]
      .map((card) => card.dataset.student))).toEqual(
      [...source.querySelectorAll<HTMLElement>(".exam-class-arrangement-student")].map((card) => card.dataset.student),
    );
    expect(pages.map((page) => page.dataset.pageIndex)).toEqual(["1", "2"]);
    expect(pages.map((page) => page.querySelector("strong")?.textContent)).toEqual([
      "高二（1）班 · 12 名学生 · 第 1/2 页",
      "高二（1）班 · 12 名学生 · 第 2/2 页",
    ]);
    expect(source.querySelectorAll(".exam-class-arrangement-student")).toHaveLength(10);
  });

  it("re-numbers independently when original chunks split again", () => {
    mockLayout();
    const host = document.createElement("div");
    const pages = paginateClassArrangementPages([
      sourcePage("class-a", 9, 1),
      sourcePage("class-a", 6, 2),
      sourcePage("class-b", 2, 1),
    ], host);
    expect(pages.map((page) => page.querySelectorAll(".exam-class-arrangement-student").length)).toEqual([8, 1, 6, 2]);
    expect(pages.map((page) => page.querySelector("strong")?.textContent)).toEqual([
      "高二（1）班 · 12 名学生 · 第 1/3 页",
      "高二（1）班 · 12 名学生 · 第 2/3 页",
      "高二（1）班 · 12 名学生 · 第 3/3 页",
      "高二（1）班 · 12 名学生",
    ]);
  });

  it("does not change other PDF layouts", () => {
    mockLayout();
    const host = document.createElement("div");
    const deskPage = document.createElement("div");
    deskPage.className = "exam-desk-label-page";
    deskPage.textContent = "桌贴";
    const pages = paginateClassArrangementPages([deskPage], host);
    expect(pages).toHaveLength(1);
    expect(pages[0].textContent).toBe("桌贴");
    expect(pages[0]).not.toBe(deskPage);
  });

  it("rejects a row taller than the usable page instead of silently clipping it", () => {
    mockLayout();
    const host = document.createElement("div");
    const source = sourcePage("class-a", 1);
    source.querySelector<HTMLElement>(".exam-class-arrangement-student")!.dataset.height = "150";
    expect(() => paginateClassArrangementPages([source], host)).toThrow("单行学生安排已超出纸张高度");
  });
});
