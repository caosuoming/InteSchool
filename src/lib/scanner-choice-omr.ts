/**
 * Image-assisted OMR for a teacher-selected strip of printed [A]...[H] choices.
 * This is only a candidate; misalignment, ink bleed or a skewed scan are common.
 * The result must never be used to publish grades without teacher review.
 */
export interface NormalizedScanRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type ChoiceStripDirection = "horizontal" | "vertical";

export interface ChoiceStripAnalysis {
  candidate: string | null;
  inkRatios: number[];
  reason: string;
}

export function analyzeChoiceStrip(
  image: Pick<ImageData, "data" | "width" | "height">,
  rect: NormalizedScanRect,
  count: number,
  direction: ChoiceStripDirection,
): ChoiceStripAnalysis {
  const invalid = (reason: string): ChoiceStripAnalysis => ({ candidate: null, inkRatios: [], reason });
  if (count < 2 || count > 8 || !Number.isInteger(count) || !["horizontal", "vertical"].includes(direction)) {
    return invalid("选项数或排列方向不合法");
  }
  if (image.width < 1 || image.height < 1 || image.data.length !== image.width * image.height * 4
    || !Object.values(rect).every(Number.isFinite) || rect.x < 0 || rect.y < 0
    || rect.width <= 0 || rect.height <= 0 || rect.x + rect.width > 1.00001 || rect.y + rect.height > 1.00001) {
    return invalid("裁剪范围或扫描图像无效");
  }
  const box = {
    x: Math.floor(rect.x * image.width),
    y: Math.floor(rect.y * image.height),
    width: Math.floor(rect.width * image.width),
    height: Math.floor(rect.height * image.height),
  };
  const cellW = direction === "horizontal" ? box.width / count : box.width;
  const cellH = direction === "vertical" ? box.height / count : box.height;
  if (cellW < 9 || cellH < 9) return invalid("涂卡区域过小，无法可靠分析");

  const ratios: number[] = [];
  for (let i = 0; i < count; i++) {
    // Ignore the printed square brackets and most of the surrounding border.
    const cellX = box.x + (direction === "horizontal" ? i * cellW : 0);
    const cellY = box.y + (direction === "vertical" ? i * cellH : 0);
    const x0 = Math.max(0, Math.ceil(cellX + cellW * 0.23));
    const x1 = Math.min(image.width, Math.floor(cellX + cellW * 0.77));
    const y0 = Math.max(0, Math.ceil(cellY + cellH * 0.20));
    const y1 = Math.min(image.height, Math.floor(cellY + cellH * 0.80));
    if (x1 <= x0 || y1 <= y0) return invalid("涂卡区域过小");
    let ink = 0;
    let total = 0;
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const offset = (y * image.width + x) * 4;
        const r = image.data[offset];
        const g = image.data[offset + 1];
        const b = image.data[offset + 2];
        const alpha = image.data[offset + 3];
        if (alpha < 240) continue;
        // Dark pencil/pen or sufficiently saturated red/blue ink.
        if ((r + g + b) / 3 < 130 || (Math.min(r, g, b) < 100 && Math.max(r, g, b) - Math.min(r, g, b) > 75)) ink++;
        total++;
      }
    }
    if (!total) return invalid("无法读取涂卡像素");
    ratios.push(ink / total);
  }

  const baseline = Math.min(...ratios);
  const cutoff = Math.max(0.24, baseline + 0.16);
  const selected = ratios.flatMap((ratio, index) => ratio >= cutoff ? [String.fromCharCode(65 + index)] : []);
  if (!selected.length) return { candidate: null, inkRatios: ratios, reason: "未检测到明显深于其他选项的涂写" };
  if (selected.length === count) return { candidate: null, inkRatios: ratios, reason: "所有选项均较深，无法区分" };
  return {
    candidate: selected.join(""),
    inkRatios: ratios,
    reason: "仅为像素密度候选，需对照原图确认；不可自动评分",
  };
}
