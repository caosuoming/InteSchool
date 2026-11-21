/**
 * Conservative scoring suggestions for teacher-reviewed scan transcriptions.
 * This module does not perform image recognition or publish student grades.
 * Missing/ambiguous marks always remain unscored.
 */
export type ScanGradingKind = "choice" | "fill" | "essay";

export interface ScannerGradingQuestion {
  id: string;
  number: number;
  kind: ScanGradingKind;
  fullScore: number;
}

export interface ScannerGradingEntry {
  questionId: string;
  observedMark: string;
  observedBox: string;
  suggestedScore: number | null;
  reason: string;
  confirmedScore: number | null;
}

export interface ScannerGradingInput {
  questionId: string;
  observedMark: string;
  observedBox?: string;
  confirmedScore?: number | null;
}

function parseScore(text: string): number | null {
  const normalized = text.trim().replace(/[０-９]/g, (digit) => String(digit.charCodeAt(0) - 0xff10))
    .replace("．", ".").replace(/分$/, "").trim();
  if (!/^(?:\d{1,3})(?:\.\d{1,2})?$/.test(normalized)) return null;
  const score = Number(normalized);
  return Number.isFinite(score) ? score : null;
}

function withinScore(score: number, maxScore: number): boolean {
  return Number.isFinite(score) && score >= 0 && score <= maxScore && Math.abs(Math.round(score * 100) - score * 100) < 1e-7;
}

function normalizeOptions(text: string): string | null {
  const normalized = text.trim().toUpperCase().replace(/[\s,，、;；]/g, "");
  if (!/^[A-H]{1,8}$/.test(normalized) || new Set(normalized).size !== normalized.length) return null;
  return [...normalized].sort().join("");
}

export function scoreScanMark(
  kind: ScanGradingKind,
  observedMark: string,
  observedBox: string,
  fullScore: number,
  correctAnswer = "",
): { suggestedScore: number | null; reason: string } {
  if (!Number.isFinite(fullScore) || fullScore <= 0 || fullScore > 1000) {
    return { suggestedScore: null, reason: "题目满分无效，须人工核对" };
  }
  if (kind === "choice") {
    const actual = normalizeOptions(observedMark);
    const expected = normalizeOptions(correctAnswer);
    if (!actual || !expected) return { suggestedScore: null, reason: "选项或标准答案无法确认" };
    return { suggestedScore: actual === expected ? fullScore : 0, reason: "根据教师录入的选项与标准答案比对（待复核）" };
  }
  if (kind === "fill") {
    const normalized = observedMark.trim();
    if (/^(?:×|✕|✖|X|x|\\|❌)$/.test(normalized)) {
      return { suggestedScore: 0, reason: "人工转录的红笔叉号或反斜杠表示错误（待复核）" };
    }
    return { suggestedScore: null, reason: "未发现明确的红笔错误标记，不能据此判断正确" };
  }
  // Right-bottom score box overrides any +N / -N annotation.
  if (observedBox.trim()) {
    const score = parseScore(observedBox);
    return score !== null && withinScore(score, fullScore)
      ? { suggestedScore: score, reason: "以人工转录的右下角分数框为准（待复核）" }
      : { suggestedScore: null, reason: "右下角分数框无法识别或超过满分，禁止回退到加减分" };
  }
  const delta = observedMark.trim().replace(/＋/g, "+").replace(/[－−]/g, "-").replace(/分$/, "").trim();
  if (!/^[+-]\s*\d{1,3}(?:\.\d{1,2})?$/.test(delta)) {
    return { suggestedScore: null, reason: "未获得明确的 +N/-N 红笔批注" };
  }
  const amount = parseScore(delta.slice(1));
  if (amount === null) return { suggestedScore: null, reason: "分值无法识别" };
  const score = delta[0] === "+" ? amount : fullScore - amount;
  return withinScore(score, fullScore)
    ? { suggestedScore: Math.round(score * 100) / 100, reason: "按人工转录的红笔加减分计算（待复核）" }
    : { suggestedScore: null, reason: "红笔加减分超出题目满分，须人工核对" };
}
