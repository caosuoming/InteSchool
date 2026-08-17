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

export interface LectureEditorItemPosition {
  containerId: string | null;
  index: number;
  item: LectureEditorLayoutItem;
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

export function findLectureEditorItem(
  layout: LectureEditorLayout,
  sectionId: string,
): LectureEditorItemPosition | null {
  const ungroupedIndex = layout.ungrouped.findIndex((item) => item.section.id === sectionId);
  if (ungroupedIndex >= 0) {
    return {
      containerId: null,
      index: ungroupedIndex,
      item: layout.ungrouped[ungroupedIndex],
    };
  }

  for (const group of layout.chapters) {
    const itemIndex = group.items.findIndex((item) => item.section.id === sectionId);
    if (itemIndex >= 0) {
      return {
        containerId: group.chapter.id,
        index: itemIndex,
        item: group.items[itemIndex],
      };
    }
  }

  return null;
}

function removeLectureEditorItem(
  sections: LectureSection[],
  position: LectureEditorItemPosition,
): { sections: LectureSection[]; removed: LectureSection } {
  const item = position.item;
  if (item.storage === "root") {
    return {
      sections: sections.filter((_, index) => index !== item.rootIndex),
      removed: item.section,
    };
  }

  return {
    sections: sections.map((section) => section.id === item.parentId
      ? {
          ...section,
          children: section.children.filter((_, index) => index !== item.childIndex),
        }
      : section),
    removed: item.section,
  };
}

/**
 * Move one editable content block to an exact visual position in the lecture
 * editor. Only the moved block changes storage when crossing a root/child
 * boundary; untouched legacy extracted blocks keep their original shape.
 *
 * `targetContainerId === null` means the leading "未归入栏目内容" group.
 * `targetIndex` is the desired index in the final visual container.
 */
export function moveLectureEditorItem(
  sections: LectureSection[],
  sectionId: string,
  targetContainerId: string | null,
  targetIndex: number,
): LectureSection[] {
  const currentLayout = buildLectureEditorLayout(sections, true);
  const source = findLectureEditorItem(currentLayout, sectionId);
  if (!source) return sections;

  if (targetContainerId !== null
    && !currentLayout.chapters.some((group) => group.chapter.id === targetContainerId)) {
    return sections;
  }

  const { sections: withoutSource, removed } = removeLectureEditorItem(sections, source);
  const nextLayout = buildLectureEditorLayout(withoutSource, true);

  if (targetContainerId === null) {
    const targetItems = nextLayout.ungrouped;
    const insertionIndex = Math.max(0, Math.min(targetIndex, targetItems.length));
    const rootIndex = insertionIndex < targetItems.length
      ? targetItems[insertionIndex].rootIndex
      : withoutSource.findIndex((section) => section.type === "chapter");
    const next = [...withoutSource];
    next.splice(rootIndex >= 0 ? rootIndex : next.length, 0, removed);
    return next;
  }

  const targetGroup = nextLayout.chapters.find((group) => group.chapter.id === targetContainerId);
  if (!targetGroup) return sections;

  const insertionIndex = Math.max(0, Math.min(targetIndex, targetGroup.items.length));
  const targetItem = targetGroup.items[insertionIndex];

  if (targetItem?.storage === "child") {
    return withoutSource.map((section) => section.id === targetContainerId
      ? {
          ...section,
          children: [
            ...section.children.slice(0, targetItem.childIndex),
            removed,
            ...section.children.slice(targetItem.childIndex),
          ],
        }
      : section);
  }

  if (targetItem?.storage === "root") {
    const next = [...withoutSource];
    next.splice(targetItem.rootIndex, 0, removed);
    return next;
  }

  const lastRootItem = [...targetGroup.items].reverse().find((item) => item.storage === "root");
  if (lastRootItem?.storage === "root") {
    const next = [...withoutSource];
    next.splice(lastRootItem.rootIndex + 1, 0, removed);
    return next;
  }

  return withoutSource.map((section) => section.id === targetContainerId
    ? { ...section, children: [...section.children, removed] }
    : section);
}
