import { describe, expect, it } from "vitest";
import type { ExamPaperQuestion } from "@/types";
import { getProjectSections } from "./project-sections";

const question = (id: string, projectId?: string) => ({ id, projectId }) as ExamPaperQuestion;

describe("getProjectSections", () => {
  it("does not invent default projects and preserves ordinary flat question order", () => {
    const sections = getProjectSections([question("b"), question("a")], []);
    expect(sections).toHaveLength(1);
    expect(sections[0].project).toBeNull();
    expect(sections[0].questions.map((item) => item.id)).toEqual(["b", "a"]);
    expect(getProjectSections([], [])).toEqual([]);
  });

  it("keeps empty projects and places orphaned questions in ungrouped", () => {
    const projects = [{ id: "p1", name: "基础" }, { id: "p2", name: "提高" }];
    const sections = getProjectSections([
      question("a", "p2"), question("b", "deleted"), question("c", "p2"), question("d"),
    ], projects);
    expect(sections.map((section) => section.project?.name || "未分组")).toEqual(["未分组", "基础", "提高"]);
    expect(sections.map((section) => section.questions.map((item) => item.id))).toEqual([
      ["b", "d"], [], ["a", "c"],
    ]);
  });
});
