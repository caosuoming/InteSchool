import { describe, expect, it } from "vitest";
import { isKnowledgeTreeEnabled, knowledgeTreeKinds, knowledgeTreeSubject } from "./knowledge-tree-visibility";
import type { Teacher } from "@/types";

describe("per-user knowledge-tree visibility", () => {
  it("defaults chapter and knowledge on, methods and errors off, including legacy accounts", () => {
    expect(knowledgeTreeKinds.map(({ kind }) => isKnowledgeTreeEnabled(null, kind))).toEqual([true, true, false, false]);
    expect(knowledgeTreeKinds.map(({ kind }) => isKnowledgeTreeEnabled({ id: "legacy" } as Teacher, kind)))
      .toEqual([true, true, false, false]);
  });

  it("keeps legacy preferences for the current subject until the server migrates them", () => {
    const teacher = {
      subject: "英语",
      knowledgeTreeEnabled: { chapter: false, method: true },
      currentAffiliationId: "one",
      affiliations: [{ id: "one", subject: "英语", subjects: ["数学", "英语"], isCurrent: true }],
    } as unknown as Teacher;
    expect(isKnowledgeTreeEnabled(teacher, "chapter")).toBe(false);
    expect(isKnowledgeTreeEnabled(teacher, "method")).toBe(true);
    const migrated = { ...teacher, knowledgeTreeEnabledBySubject: { "英语": { chapter: false, method: true } } };
    const switched = {
      ...migrated,
      affiliations: migrated.affiliations.map((item) => ({ ...item, subject: "数学" })),
    };
    expect(isKnowledgeTreeEnabled(switched, "chapter")).toBe(true);
    expect(isKnowledgeTreeEnabled(switched, "method")).toBe(false);
    expect(isKnowledgeTreeEnabled(migrated, "method")).toBe(true);
  });

  it("shares preferences across schools for the same subject and isolates other subjects", () => {
    const teacher = {
      subject: "数学",
      currentAffiliationId: "math-a",
      affiliations: [
        { id: "math-a", schoolId: "a", subject: "数学", subjects: ["数学", "英语"], isCurrent: true },
        { id: "math-b", schoolId: "b", subject: "数学", subjects: ["数学"], isCurrent: false },
      ],
      knowledgeTreeEnabled: { method: true, chapter: false },
      knowledgeTreeEnabledBySubject: {
        "数学": { chapter: true, error: true },
        "英语": { chapter: false, method: true },
      },
    } as unknown as Teacher;
    expect(knowledgeTreeSubject(teacher)).toBe("数学");
    expect(knowledgeTreeKinds.map(({ kind }) => isKnowledgeTreeEnabled(teacher, kind)))
      .toEqual([true, true, false, true]);

    const schoolB = { ...teacher, currentAffiliationId: "math-b" };
    expect(knowledgeTreeKinds.map(({ kind }) => isKnowledgeTreeEnabled(schoolB, kind)))
      .toEqual([true, true, false, true]);

    const english = {
      ...teacher,
      affiliations: teacher.affiliations.map((affiliation) =>
        affiliation.id === "math-a" ? { ...affiliation, subject: "英语" } : affiliation),
    };
    expect(knowledgeTreeSubject(english)).toBe("英语");
    expect(knowledgeTreeKinds.map(({ kind }) => isKnowledgeTreeEnabled(english, kind)))
      .toEqual([false, true, true, false]);

    const anotherSubject = {
      ...english,
      affiliations: english.affiliations.map((affiliation) =>
        affiliation.id === "math-a" ? { ...affiliation, subject: "物理" } : affiliation),
    };
    expect(knowledgeTreeKinds.map(({ kind }) => isKnowledgeTreeEnabled(anotherSubject, kind)))
      .toEqual([true, true, false, false]);
  });

  it("respects all explicit preferences independently", () => {
    const teacher = { knowledgeTreeEnabled: { chapter: false, knowledge: false, method: true, error: true } } as Teacher;
    expect(knowledgeTreeKinds.map(({ kind }) => isKnowledgeTreeEnabled(teacher, kind)))
      .toEqual([false, false, true, true]);
  });
});
