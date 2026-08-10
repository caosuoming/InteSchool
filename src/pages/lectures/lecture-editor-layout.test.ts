import { describe, expect, it } from "vitest";

import type { LectureSection } from "@/types";
import { buildLectureEditorLayout } from "./lecture-editor-layout";

function section(
  id: string,
  type: LectureSection["type"],
  children: LectureSection[] = [],
): LectureSection {
  return {
    id,
    title: id,
    type,
    content: `${id}-content`,
    children,
  };
}

describe("buildLectureEditorLayout", () => {
  it("keeps flat extracted blocks under the preceding chapter in document order", () => {
    const sections = [
      section("chapter-3", "chapter"),
      section("summary", "knowledge"),
      section("chapter-4", "chapter"),
      section("question-1", "question"),
    ];

    const layout = buildLectureEditorLayout(sections, true);

    expect(layout.ungrouped).toEqual([]);
    expect(layout.chapters.map((group) => ({
      id: group.chapter.id,
      items: group.items.map((item) => item.section.id),
    }))).toEqual([
      { id: "chapter-3", items: ["summary"] },
      { id: "chapter-4", items: ["question-1"] },
    ]);
    expect(layout.chapters[0].items[0]).toMatchObject({
      storage: "root",
      rootIndex: 1,
    });
  });

  it("retains actual child storage and leaves only leading root blocks ungrouped", () => {
    const nested = section("nested", "text");
    const sections = [
      section("preface", "text"),
      section("chapter", "chapter", [nested]),
      section("following-root", "knowledge"),
    ];

    const layout = buildLectureEditorLayout(sections, true);

    expect(layout.ungrouped.map((item) => item.section.id)).toEqual(["preface"]);
    expect(layout.chapters[0].items).toEqual([
      expect.objectContaining({
        section: nested,
        storage: "child",
        parentId: "chapter",
        childIndex: 0,
      }),
      expect.objectContaining({
        section: sections[2],
        storage: "root",
        rootIndex: 2,
      }),
    ]);
  });

  it("keeps root blocks ungrouped for normal editable lectures", () => {
    const sections = [
      section("chapter", "chapter"),
      section("root-text", "text"),
    ];

    const layout = buildLectureEditorLayout(sections);

    expect(layout.chapters[0].items).toEqual([]);
    expect(layout.ungrouped.map((item) => item.section.id)).toEqual(["root-text"]);
  });
});
