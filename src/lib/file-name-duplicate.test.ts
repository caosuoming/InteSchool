import { describe, expect, it } from "vitest";
import { fileNameSimilarity, findFileNameDuplicates, normalizeFileName } from "@/lib/file-name-duplicate";

describe("file name duplicate detection", () => {
  it("normalizes case, punctuation, whitespace and extensions", () => {
    expect(normalizeFileName("  高一数学-期中试卷 (1).PDF ")).toBe("高一数学期中试卷1");
    expect(normalizeFileName("Functions_Review.PPTX")).toBe("functionsreview");
  });

  it("treats the same base file name with a different extension as an exact match", () => {
    expect(fileNameSimilarity("函数专题讲义.docx", "函数专题讲义.pdf")).toBe(1);
  });

  it("finds similar names but ignores unrelated files", () => {
    const matches = findFileNameDuplicates("高一数学期中考试试卷.pdf", [
      { id: "same", title: "高一数学期中考试试卷", fileName: "高一数学期中考试试卷.docx" },
      { id: "similar", title: "高一数学期中考试试卷（答案版）" },
      { id: "other", title: "三角函数单元复习" },
    ]);

    expect(matches.map((match) => match.candidate.id)).toEqual(["same", "similar"]);
    expect(matches[0].similarity).toBe(1);
    expect(matches[1].similarity).toBeGreaterThanOrEqual(0.72);
  });
});
