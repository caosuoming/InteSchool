import { describe, expect, it } from "vitest";

import type { Question } from "@/types";
import { groupRelatedQuestions } from "./related-question-groups";

const baseQuestion = {
  id: "source",
  knowledgePointIds: ["k1", "k2"],
  recommendation: 3,
  usageCount: 0,
  updatedAt: "2026-09-01T00:00:00.000Z",
} as Question;

function question(id: string, knowledgePointIds: string[], recommendation = 3): Question {
  return {
    ...baseQuestion,
    id,
    knowledgePointIds,
    recommendation,
  } as Question;
}

describe("groupRelatedQuestions", () => {
  it("separates proper subsets, exact matches, and proper supersets", () => {
    const groups = groupRelatedQuestions(baseQuestion, [
      question("foundation", ["k1"]),
      question("same", ["k2", "k1"]),
      question("extension", ["k1", "k2", "k3"]),
      question("overlap-only", ["k2", "k3"]),
      question("empty", []),
    ]);

    expect(groups.foundation.map((item) => item.id)).toEqual(["foundation"]);
    expect(groups.same.map((item) => item.id)).toEqual(["same"]);
    expect(groups.extension.map((item) => item.id)).toEqual(["extension"]);
  });

  it("excludes document questions and ranks recommendations first", () => {
    const groups = groupRelatedQuestions(
      baseQuestion,
      [
        question("same-low", ["k1", "k2"], 1),
        question("same-high", ["k1", "k2"], 5),
        question("already-used", ["k1", "k2"], 4),
      ],
      new Set(["already-used"]),
    );

    expect(groups.same.map((item) => item.id)).toEqual(["same-high", "same-low"]);
  });

  it("does not classify candidates when the source has no knowledge points", () => {
    const groups = groupRelatedQuestions(
      { ...baseQuestion, knowledgePointIds: [] } as Question,
      [question("candidate", ["k1"])],
    );

    expect(groups).toEqual({ foundation: [], same: [], extension: [] });
  });
});
