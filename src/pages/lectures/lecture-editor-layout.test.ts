import { describe, expect, it } from "vitest";

import type { LectureSection } from "@/types";
import { buildLectureEditorLayout, moveLectureEditorItem } from "./lecture-editor-layout";

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

  it("keeps root blocks ungrouped when compatibility grouping is disabled", () => {
    const sections = [
      section("chapter", "chapter"),
      section("root-text", "text"),
    ];

    const layout = buildLectureEditorLayout(sections);

    expect(layout.chapters[0].items).toEqual([]);
    expect(layout.ungrouped.map((item) => item.section.id)).toEqual(["root-text"]);
  });

  it("groups legacy editable-copy root blocks under the preceding chapter", () => {
    const sections = [
      section("chapter", "chapter"),
      section("root-text", "text"),
      section("root-question", "question"),
    ];

    const layout = buildLectureEditorLayout(sections, true);

    expect(layout.ungrouped).toEqual([]);
    expect(layout.chapters[0].items.map((item) => item.section.id)).toEqual([
      "root-text",
      "root-question",
    ]);
  });
});

describe("moveLectureEditorItem", () => {
  it("moves ungrouped content into a chapter at the requested position", () => {
    const sections = [
      section("preface", "text"),
      section("chapter-a", "chapter", [section("a", "knowledge"), section("b", "question")]),
      section("chapter-b", "chapter"),
    ];

    const moved = moveLectureEditorItem(sections, "preface", "chapter-a", 1);

    expect(moved.map((item) => item.id)).toEqual(["chapter-a", "chapter-b"]);
    expect(moved[0].children.map((item) => item.id)).toEqual(["a", "preface", "b"]);
  });

  it("moves chapter content back to the ungrouped area", () => {
    const sections = [
      section("intro", "text"),
      section("chapter-a", "chapter", [section("a", "knowledge"), section("b", "question")]),
      section("chapter-b", "chapter"),
    ];

    const moved = moveLectureEditorItem(sections, "b", null, 0);

    expect(moved.map((item) => item.id)).toEqual(["b", "intro", "chapter-a", "chapter-b"]);
    expect(moved[2].children.map((item) => item.id)).toEqual(["a"]);
  });

  it("moves content between chapters without changing untouched items", () => {
    const sections = [
      section("chapter-a", "chapter", [section("a", "text"), section("b", "knowledge")]),
      section("chapter-b", "chapter", [section("c", "question"), section("d", "text")]),
    ];

    const moved = moveLectureEditorItem(sections, "b", "chapter-b", 1);

    expect(moved[0].children.map((item) => item.id)).toEqual(["a"]);
    expect(moved[1].children.map((item) => item.id)).toEqual(["c", "b", "d"]);
  });

  it("reorders across the child/root boundary used by legacy extracted lectures", () => {
    const sections = [
      section("chapter-a", "chapter", [section("child", "text")]),
      section("legacy-root", "knowledge"),
      section("chapter-b", "chapter"),
    ];

    const movedRootUp = moveLectureEditorItem(sections, "legacy-root", "chapter-a", 0);
    expect(movedRootUp.map((item) => item.id)).toEqual(["chapter-a", "chapter-b"]);
    expect(movedRootUp[0].children.map((item) => item.id)).toEqual(["legacy-root", "child"]);

    const movedChildDown = moveLectureEditorItem(sections, "child", "chapter-a", 1);
    expect(movedChildDown.map((item) => item.id)).toEqual([
      "chapter-a",
      "legacy-root",
      "child",
      "chapter-b",
    ]);
    expect(movedChildDown[0].children).toEqual([]);
  });
});
