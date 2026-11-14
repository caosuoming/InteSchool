import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { BoardDocument, TreeNode } from "@/types";
import { BoardChapterTree } from "./BoardChapterTree";
import { chapterBoardCount, chapterOptions } from "./board-chapters";

const leaf = (id: string, name: string, children: TreeNode[] = []): TreeNode =>
  ({ id, name, type: "chapter", count: 0, children });
const tree = leaf("root", "全部章节", [
  leaf("a", "第一章", [leaf("b", "第一节", [leaf("c", "第一课"), leaf("extra", "第四级", [leaf("fifth", "第五级")])])]),
  leaf("d", "第二章"),
]);
const boards = [
  { id: "x", kind: "structure", chapterId: "c", title: "板书甲" },
  { id: "y", kind: "structure", chapterId: "b", title: "板书乙" },
  { id: "z", kind: "structure", chapterId: "d", title: "板书丙" },
  { id: "master", kind: "master", chapterId: "b", title: "总导图" },
] as BoardDocument[];

describe("chapter board catalog", () => {
  it("counts associated structure boards across descendants and limits selection to three levels", () => {
    expect(chapterBoardCount(tree.children[0], boards)).toBe(2);
    expect(chapterBoardCount(tree, boards)).toBe(3);
    expect(chapterOptions(tree).map((item) => item.id)).toEqual(["a", "b", "c", "extra", "d"]);
    expect(chapterOptions(tree).some((item) => item.id === "fifth")).toBe(false);
  });

  it("supports expanding chapters, selecting a category and opening its boards", () => {
    const selectChapter = vi.fn();
    const selectBoard = vi.fn();
    render(<BoardChapterTree tree={tree} boards={boards} selectedChapterId={null}
      activeBoardId="master" onSelectChapter={selectChapter} onSelectBoard={selectBoard} />);
    expect(screen.getAllByLabelText("2 个结构化板书")).toHaveLength(2);
    fireEvent.click(screen.getByText("第一章").closest("button")!);
    expect(selectChapter).toHaveBeenCalledWith("a");
    fireEvent.click(screen.getByText("第一节").closest("button")!);
    fireEvent.click(screen.getByRole("button", { name: "板书乙" }));
    expect(selectBoard).toHaveBeenCalledWith("y");
    expect(screen.queryByText("第五级")).toBeNull();
  });
});
