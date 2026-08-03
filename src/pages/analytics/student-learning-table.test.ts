import { describe, expect, it } from "vitest";
import type { KnowledgeMastery } from "@/services/analytics";
import {
  knowledgePointDisplayName,
  orderKnowledgeMasteryRows,
} from "./student-learning-table";

function mastery(
  id: string,
  level: KnowledgeMastery["masteryLevel"],
  attempts: number,
  path?: string[],
): KnowledgeMastery {
  return {
    knowledgePointId: id,
    knowledgePointName: path?.at(-1) ?? id,
    knowledgePointPath: path,
    totalAttempts: attempts,
    correctCount: 0,
    partialCount: 0,
    wrongCount: attempts,
    correctRate: 0,
    masteryLevel: level,
  };
}

describe("student learning knowledge table", () => {
  it("shows only the node name by default and joins ancestors with backslashes on demand", () => {
    const row = mastery("child", "weak", 2, ["函数", "基本初等函数", "指数函数"]);
    expect(knowledgePointDisplayName(row, false)).toBe("指数函数");
    expect(knowledgePointDisplayName(row, true)).toBe("函数\\基本初等函数\\指数函数");
  });

  it("keeps mastery sorting while honoring explicit top and bottom placements", () => {
    const rows = [
      mastery("mastered", "mastered", 10),
      mastery("weak", "weak", 2),
      mastery("basic", "basic", 5),
      mastery("untrained", "untrained", 0),
    ];

    expect(orderKnowledgeMasteryRows(rows, {
      mastered: "top",
      weak: "bottom",
    }).map((row) => row.knowledgePointId)).toEqual([
      "mastered",
      "basic",
      "untrained",
      "weak",
    ]);
  });
});
