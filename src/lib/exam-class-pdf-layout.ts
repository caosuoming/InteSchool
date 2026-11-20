/** Physical A4 layout of complete class pages, measured in the browser before PDF drawing. */
export type ClassPdfLayoutMode = "compress" | "split";
export type ClassPdfLayoutSelection = ClassPdfLayoutMode | Record<string, ClassPdfLayoutMode>;

type ClassPages = { id: string; page: HTMLElement; cards: HTMLElement[] };

function collectClassPages(sources: HTMLElement[]): ClassPages[] {
  const classes = new Map<string, ClassPages>();
  for (const source of sources) {
    if (!source.classList.contains("exam-class-arrangement-page")) continue;
    const id = source.dataset.classId || "class";
    const clone = source.cloneNode(true) as HTMLElement;
    const cards = [...clone.querySelectorAll<HTMLElement>(".exam-class-arrangement-student")];
    const existing = classes.get(id);
    if (existing) existing.cards.push(...cards);
    else classes.set(id, { id, page: clone, cards });
  }
  return [...classes.values()];
}

function makePage(source: HTMLElement, cards: HTMLElement[]): HTMLElement {
  const page = source.cloneNode(true) as HTMLElement;
  const grid = page.querySelector<HTMLElement>(".exam-class-arrangement-grid");
  if (!grid) throw new Error("班级考场安排缺少内容网格");
  grid.replaceChildren(...cards.map((card) => card.cloneNode(true)));
  page.style.breakAfter = "auto";
  page.style.overflow = "hidden";
  return page;
}

function fitPage(page: HTMLElement, host: HTMLElement, allowCompression: boolean): boolean {
  const grid = page.querySelector<HTMLElement>(".exam-class-arrangement-grid");
  if (!grid) return false;
  const cards = [...grid.querySelectorAll<HTMLElement>(":scope > .exam-class-arrangement-student")];
  const columns = Math.max(1, Number(page.dataset.columns) || 4);
  const rows = Math.ceil(cards.length / columns);
  if (!rows) return true;
  host.replaceChildren(page);
  // Try real CSS dimensions instead of assuming a fixed card/row count.
  // Choose the largest readable font that fits the *measured* row content.
  // Sparse classes get larger text; dense classes progressively shrink it.
  // Keep inspection at normal text sizes so the overflow dialog still appears.
  const sizes = allowCompression
    ? [...Array.from({ length: 29 }, (_, index) => +(12.5 - index * 0.25).toFixed(2)), 5.45, 5.05, 4.7, 4.4, 4.1, 3.8]
    : [5.45, 5.05];
  for (const fontSize of sizes) {
    const condensed = fontSize < 5.05;
    page.dataset.density = fontSize < 5.45 ? "compact" : "normal";
    page.style.setProperty("--class-print-font-size", `${fontSize}pt`);
    page.style.setProperty("--class-print-gap", `${condensed ? Math.max(0.45, fontSize / 6) : 1.35}mm`);
    page.style.removeProperty("display");
    grid.style.removeProperty("flex");
    grid.style.removeProperty("height");
    grid.style.removeProperty("min-height");
    grid.style.removeProperty("grid-template-rows");
    grid.style.gridAutoRows = "max-content";
    grid.style.alignItems = "start";
    grid.style.alignContent = "start";
    for (const card of cards) {
      card.style.padding = condensed ? "0.5mm" : "0.95mm";
      card.style.justifyContent = "flex-start";
    }
    const rowHeights: number[] = [];
    for (let index = 0; index < cards.length; index += columns) {
      rowHeights.push(Math.max(...cards.slice(index, index + columns).map((card) => card.getBoundingClientRect().height)));
    }
    const rect = page.getBoundingClientRect();
    const gridRect = grid.getBoundingClientRect();
    const available = rect.bottom - (parseFloat(getComputedStyle(page).paddingBottom) || 0) - gridRect.top;
    const rowGap = parseFloat(getComputedStyle(grid).rowGap) || 0;
    const required = rowHeights.reduce((sum, height) => sum + height, 0) + rowGap * (rows - 1);
    if (available <= 0 || required > available + 0.5) continue;

    // Give every row an equal share of the remaining free height, on top of
    // its actual measured content height; no card is clipped by an equal-height grid.
    const sparePerRow = Math.max(0, (available - required) / rows);
    grid.style.gridTemplateRows = rowHeights.map((height) => `${height + sparePerRow}px`).join(" ");
    grid.style.gridAutoRows = "auto";
    grid.style.alignItems = "stretch";
    for (const card of cards) card.style.justifyContent = "space-evenly";
    // Large sheets must never lose information silently.
    if (cards.some((card) => card.scrollHeight > card.clientHeight + 2)) continue;
    page.dataset.pdfFill = "true";
    return true;
  }
  return false;
}

/** Returns class IDs whose entire content does not fit an ordinary A4 page. */
export function inspectClassPdfOverflow(sources: HTMLElement[], host: HTMLElement): string[] {
  const overflowing: string[] = [];
  for (const group of collectClassPages(sources)) {
    if (!fitPage(makePage(group.page, group.cards), host, false)) overflowing.push(group.id);
  }
  return overflowing;
}

/** Produce exactly one or two fitted A4 pages per class, without dropping cards. */
export function layoutClassPdfPages(
  sources: HTMLElement[], host: HTMLElement, selection: ClassPdfLayoutSelection,
): HTMLElement[] {
  const overflowing = new Set(inspectClassPdfOverflow(sources, host));
  const result: HTMLElement[] = [];
  for (const group of collectClassPages(sources)) {
    const mode = typeof selection === "string" ? selection : selection[group.id] || "compress";
    const chunks = mode === "split" && overflowing.has(group.id)
      ? [group.cards.slice(0, Math.ceil(group.cards.length / 2)), group.cards.slice(Math.ceil(group.cards.length / 2))]
      : [group.cards];
    for (const [index, chunk] of chunks.entries()) {
      const page = makePage(group.page, chunk);
      const title = page.querySelector<HTMLElement>(".exam-class-arrangement-header-meta strong");
      if (title) {
        const base = (title.textContent || "").replace(/\s*·\s*第\s*\d+\s*\/\s*\d+\s*页\s*$/, "").trim();
        title.textContent = chunks.length > 1 ? `${base} · 第 ${index + 1}/${chunks.length} 页` : base;
      }
      page.dataset.pageIndex = String(index + 1);
      if (!fitPage(page, host, true)) {
        const className = title?.textContent?.split(" · ")[0] || group.id;
        throw new Error(`${className}内容过多，无法完整排入${chunks.length}页 A4，请选择两页或调整考试安排`);
      }
      result.push(page);
    }
  }
  return result;
}
