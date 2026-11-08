import { describe, expect, it } from "vitest";
import { chapterScope, flattenChapterTree, tutoringSuggestions } from "./individual-tutoring";
import type { Chapter, KnowledgePoint, Question } from "@/types";
import type { KnowledgeMastery } from "@/services/analytics";

const chapter = (id: string, parentId: string | null): Chapter => ({
  id, parentId, schoolId: "s", name: id, order: 0, level: parentId ? 2 : 1,
});
const point = (id: string): KnowledgePoint => ({
  id, schoolId: "s", parentId: null, name: id, order: 0, level: 1,
});
const question = (id: string, chapterId: string, pointId: string, recommendation = 3): Question => ({
  id, chapterIds: [chapterId], knowledgePointIds: [pointId], recommendation,
}) as Question;
const score = (id: string, masteryLevel: KnowledgeMastery["masteryLevel"]): KnowledgeMastery => ({
  knowledgePointId: id, knowledgePointName: id, masteryLevel,
  totalAttempts: masteryLevel === "untrained" ? 0 : 5, correctCount: 0,
  partialCount: 0, wrongCount: 5, correctRate: 0,
});

describe("individual tutoring suggestions", () => {
  const chapters = [chapter("root", null), chapter("child", "root"), chapter("sibling", null)];
  const questions = [
    question("weak-1", "child", "weak", 2),
    question("weak-2", "root", "weak", 5),
    question("trained", "child", "mastered"),
    question("pending", "child", "pending"),
    question("outside", "sibling", "weak"),
  ];
  const points = [point("weak"), point("mastered"), point("pending")];

  it("includes descendants but never sibling chapters", () => {
    expect([...chapterScope(chapters, "root")].sort()).toEqual(["child", "root"]);
    expect(chapterScope(chapters, "missing")).toEqual(new Set(["missing"]));
    expect(chapterScope(chapters, "")).toEqual(new Set());
  });

  it("unions multiple selected chapters and their descendants without leaking siblings", () => {
    expect([...chapterScope(chapters, ["child", "sibling"])].sort()).toEqual(["child", "sibling"]);
    expect([...chapterScope(chapters, ["root", "sibling"])].sort()).toEqual(["child", "root", "sibling"]);
    expect(chapterScope(chapters, [])).toEqual(new Set());
  });

  it("flattens the knowledge-tree chapter directory without including its synthetic root", () => {
    expect(flattenChapterTree({ id: "root", name: "章节课", type: "chapter", count: 0,
      children: [{ id: "a", name: "数列", type: "chapter", count: 0, children: [
        { id: "b", name: "等比", type: "chapter", count: 0, children: [] },
      ] }],
    })).toEqual([{ id: "a", name: "数列", parentId: null }, { id: "b", name: "等比", parentId: "a" }]);
  });

  it("selects only weak or untrained knowledge points and prioritizes weak questions", () => {
    const suggestions = tutoringSuggestions(
      questions, chapterScope(chapters, "root"), points,
      [score("weak", "weak"), score("mastered", "mastered")],
    );
    expect(suggestions.topics.map((item) => [item.id, item.level])).toEqual([
      ["weak", "weak"], ["pending", "untrained"],
    ]);
    expect(suggestions.questions.map((item) => item.id)).toEqual(["weak-2", "weak-1", "pending"]);
  });

  it("produces no recommendations before a chapter is selected", () => {
    expect(tutoringSuggestions(questions, new Set(), points, [])).toEqual({ topics: [], questions: [] });
  });

  it("does not mistake basic mastery for an untrained topic", () => {
    const suggestions = tutoringSuggestions(
      questions, chapterScope(chapters, "child"), points,
      [score("weak", "basic"), score("mastered", "mastered"), score("pending", "untrained")],
    );
    expect(suggestions.questions.map((q) => q.id)).toEqual(["pending"]);
  });
});
