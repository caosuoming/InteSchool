import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ChapterMasteryCard } from "./ChapterMasteryCard";
import type { ChapterMastery } from "./student-learning-chapters";

describe("ChapterMasteryCard prerequisites", () => {
  it("shows prerequisite mastery and opens the referenced knowledge point", () => {
    const navigate = vi.fn();
    const mastery: ChapterMastery = {
      id: "c1", chapterId: "c1", chapterName: "函数", parentId: null,
      chapterPath: ["函数"], level: 0, order: 1,
      totalAttempts: 3, correctCount: 2, partialCount: 0, wrongCount: 1,
      correctRate: 2 / 3, masteryLevel: "basic",
    };

    render(
      <ChapterMasteryCard
        mastery={[mastery]}
        placements={{}}
        onDirectoryOpen={vi.fn()}
        chapters={[{
          id: "c1", schoolId: "school-1", parentId: null, name: "函数",
          order: 1, level: 0,
          prerequisites: [{ type: "knowledge", id: "k1" }],
        }]}
        knowledgePoints={[{
          id: "k1", schoolId: "school-1", parentId: null,
          name: "集合", order: 1, level: 0,
        }]}
        masteryLevels={{ "knowledge:k1": "薄弱" }}
        onPrerequisiteOpen={navigate}
      />,
    );
    const link = screen.getByRole("button", { name: "前置知识点 集合" });
    expect(link).toHaveTextContent("薄弱");
    expect(link).toHaveClass("border-dashed");
    fireEvent.click(link);
    expect(navigate).toHaveBeenCalledWith({ type: "knowledge", id: "k1" });
  });
});
