import { describe, expect, it } from "vitest";
import { isKnowledgeTreeEnabled, knowledgeTreeKinds } from "./knowledge-tree-visibility";
import type { Teacher } from "@/types";

describe("per-user knowledge-tree visibility", () => {
  it("defaults chapter and knowledge on, methods and errors off, including legacy accounts", () => {
    expect(knowledgeTreeKinds.map(({ kind }) => isKnowledgeTreeEnabled(null, kind))).toEqual([true, true, false, false]);
    expect(knowledgeTreeKinds.map(({ kind }) => isKnowledgeTreeEnabled({ id: "legacy" } as Teacher, kind)))
      .toEqual([true, true, false, false]);
  });

  it("respects all explicit preferences independently", () => {
    const teacher = { knowledgeTreeEnabled: { chapter: false, knowledge: false, method: true, error: true } } as Teacher;
    expect(knowledgeTreeKinds.map(({ kind }) => isKnowledgeTreeEnabled(teacher, kind)))
      .toEqual([false, false, true, true]);
  });
});
