import { describe, expect, it } from "vitest";
import type { Basket, Question } from "@/types";
import { basketsForAudience, selectAssignmentQuestions } from "./assignment-selection";

const q = (id: string, type: string, kp: string): Question => ({
  id, type, knowledgePointIds: [kp], recommendation: 3, usageCount: 0,
}) as Question;

describe("assignment selection", () => {
  it("only exposes baskets assigned to the selected audience", () => {
    const baskets = [
      { id: "matching", classIds: ["class-1"] },
      { id: "another", classIds: ["class-2"] },
      { id: "personal", studentIds: ["student-1"] },
      { id: "unassigned", isDefault: true },
    ] as Basket[];
    expect(basketsForAudience(baskets, ["class-1"], ["student-1"]).map((b) => b.id))
      .toEqual(["matching", "personal"]);
    expect(basketsForAudience(baskets, [], ["student-1"])).toEqual([]);
  });

  it("respects type caps, quotas and exclusions without reusing questions", () => {
    const result = selectAssignmentQuestions({
      questions: [q("w1", "single", "weak"), q("w2", "essay", "weak"), q("u1", "single", "untrained"), q("u2", "essay", "untrained"), q("other", "single", "other")],
      typeCounts: { single: 2, essay: 1 },
      weakKnowledgeIds: new Set(["weak"]),
      untrainedKnowledgeIds: new Set(["untrained"]),
      weakCount: 1,
      untrainedCount: 1,
      excludedIds: new Set(["w2"]),
    });
    expect(result.weakPicked).toBe(1);
    expect(result.untrainedPicked).toBe(1);
    expect(result.questions).toHaveLength(3);
    expect(result.questions.filter((item) => item.type === "single")).toHaveLength(2);
    expect(result.questions.filter((item) => item.type === "essay")).toHaveLength(1);
    expect(new Set(result.questions.map((item) => item.id)).size).toBe(3);
    expect(result.questions.some((item) => item.id === "w2")).toBe(false);
  });

  it("reports shortages rather than filling with duplicate or wrong-type questions", () => {
    const result = selectAssignmentQuestions({
      questions: [q("a", "single", "other")], typeCounts: { single: 1, essay: 2 },
      weakKnowledgeIds: new Set(["weak"]), untrainedKnowledgeIds: new Set(["untrained"]),
      weakCount: 2, untrainedCount: 1, excludedIds: new Set(),
    });
    expect(result.questions.map((item) => item.id)).toEqual(["a"]);
    expect(result.weakPicked).toBe(0);
    expect(result.untrainedPicked).toBe(0);
    expect(result.remaining.essay).toBe(2);
  });
});
