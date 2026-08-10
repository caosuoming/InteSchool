import type { LectureSection } from "@/types";

export interface LectureEditorChildLayoutItem {
  section: LectureSection;
  storage: "child";
  parentId: string;
  childIndex: number;
}

export interface LectureEditorRootLayoutItem {
  section: LectureSection;
  storage: "root";
  rootIndex: number;
}

export type LectureEditorLayoutItem = LectureEditorChildLayoutItem | LectureEditorRootLayoutItem;

export interface LectureEditorChapterGroup {
  chapter: LectureSection;
  rootIndex: number;
  items: LectureEditorLayoutItem[];
}

export interface LectureEditorLayout {
  chapters: LectureEditorChapterGroup[];
  ungrouped: LectureEditorRootLayoutItem[];
}

/**
 * The preview renders root sections in document order. Extracted lectures may
 * therefore store a chapter heading followed by root-level text/questions.
 * The editor should visually keep those following blocks with that chapter,
 * while retaining their real storage location for edit/move/remove actions.
 */
export function buildLectureEditorLayout(
  sections: LectureSection[],
  associateRootBlocksWithChapters = false,
): LectureEditorLayout {
  const chapters: LectureEditorChapterGroup[] = [];
  const ungrouped: LectureEditorRootLayoutItem[] = [];
  let currentChapter: LectureEditorChapterGroup | null = null;

  sections.forEach((section, rootIndex) => {
    if (section.type === "chapter") {
      currentChapter = {
        chapter: section,
        rootIndex,
        items: section.children.map((child, childIndex) => ({
          section: child,
          storage: "child" as const,
          parentId: section.id,
          childIndex,
        })),
      };
      chapters.push(currentChapter);
      return;
    }

    const item: LectureEditorLayoutItem = {
      section,
      storage: "root",
      rootIndex,
    };
    if (associateRootBlocksWithChapters && currentChapter) {
      currentChapter.items.push(item);
    } else {
      ungrouped.push(item);
    }
  });

  return { chapters, ungrouped };
}
