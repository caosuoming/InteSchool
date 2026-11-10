/**
 * Split class-arrangement print pages using their rendered grid row heights.
 * The initial React chunks are estimates: long names, subjects and locations
 * can make a row taller than the estimate, so a fixed number of cards per page
 * is not enough to guarantee that every student reaches the PDF.
 */
export function paginateClassArrangementPages(sources: HTMLElement[], host: HTMLElement): HTMLElement[] {
  const result: HTMLElement[] = [];

  for (const source of sources) {
    const first = source.cloneNode(true) as HTMLElement;
    const firstGrid = first.querySelector<HTMLElement>(".exam-class-arrangement-grid");
    if (!first.classList.contains("exam-class-arrangement-page") || !firstGrid) {
      result.push(first);
      continue;
    }

    // Reserve room for pagination text before measuring. Adding "第 x/y 页"
    // later must not introduce a new wrapped header line and overflow a page.
    const pageLabel = first.querySelector<HTMLElement>(".exam-class-arrangement-header-meta strong");
    if (pageLabel) {
      const base = (pageLabel.textContent || "").replace(/\s*·\s*第\s*\d+\s*\/\s*\d+\s*页\s*$/, "").trim();
      pageLabel.textContent = `${base} · 第 9999/9999 页`;
    }
    const cards = Array.from(firstGrid.children) as HTMLElement[];
    const columns = Math.max(1, Number(first.dataset.columns) || 4);
    firstGrid.replaceChildren();
    result.push(first);
    let current = first;
    let grid = firstGrid;
    host.replaceChildren(current);

    // Grid rows have the height of their tallest student card. Keep each row
    // together so no card gets split or omitted when a PDF page fills up.
    for (let index = 0; index < cards.length; index += columns) {
      const row = cards.slice(index, index + columns);
      grid.append(...row);
      const fits = () => {
        const pageBottom = current.getBoundingClientRect().bottom;
        const paddingBottom = parseFloat(getComputedStyle(current).paddingBottom) || 0;
        const rowBottom = Math.max(...row.map((card) => card.getBoundingClientRect().bottom));
        return rowBottom <= pageBottom - paddingBottom + 0.5;
      };
      if (fits()) continue;
      if (grid.children.length === row.length) {
        throw new Error("单行学生安排已超出纸张高度，无法完整生成 PDF");
      }

      row.forEach((card) => card.remove());
      const next = first.cloneNode(true) as HTMLElement;
      const nextGrid = next.querySelector<HTMLElement>(".exam-class-arrangement-grid");
      if (!nextGrid) throw new Error("班级考场安排缺少内容网格");
      nextGrid.replaceChildren();
      current = next;
      grid = nextGrid;
      host.replaceChildren(current);
      grid.append(...row);
      if (!fits()) throw new Error("单行学生安排已超出纸张高度，无法完整生成 PDF");
      result.push(current);
    }
  }

  // React's provisional page counts may change after measuring real heights.
  // Re-number every class independently, preserving the class/student header.
  const byClass = new Map<string, HTMLElement[]>();
  for (const page of result) {
    if (!page.classList.contains("exam-class-arrangement-page")) continue;
    const classId = page.dataset.classId;
    if (!classId) continue;
    const grouped = byClass.get(classId) || [];
    grouped.push(page);
    byClass.set(classId, grouped);
  }
  for (const pages of byClass.values()) {
    pages.forEach((page, index) => {
      page.dataset.pageIndex = String(index + 1);
      const label = page.querySelector<HTMLElement>(".exam-class-arrangement-header-meta strong");
      if (!label) return;
      const base = (label.textContent || "").replace(/\s*·\s*第\s*\d+\s*\/\s*\d+\s*页\s*$/, "").trim();
      label.textContent = pages.length > 1 ? `${base} · 第 ${index + 1}/${pages.length} 页` : base;
    });
  }

  return result;
}
