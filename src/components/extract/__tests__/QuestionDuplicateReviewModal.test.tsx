import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  QuestionDuplicateReviewModal,
  type QuestionDuplicateReviewItem,
} from "../QuestionDuplicateReviewModal";

const item: QuestionDuplicateReviewItem = {
  id: "incoming-1",
  similarity: 0.96,
  canMerge: true,
  existing: {
    id: "existing-1",
    teacherId: "teacher-1",
    schoolId: "school-1",
    type: "fillBlank",
    stem: "求 $x^2$ 的值",
    answer: "$x=2$",
    analysis: "代入 $x^2=4$",
    summary: "平方运算",
    chapterIds: [],
    knowledgePointIds: [],
    difficulty: 3,
    recommendation: 3,
    usageCount: 0,
    remark: "",
    isShared: false,
    createdAt: "2026-08-03T00:00:00.000Z",
    updatedAt: "2026-08-03T00:00:00.000Z",
  },
  incoming: {
    stem: "求 $x^3$ 的值",
    options: [],
    answer: "$x=3$",
    analysis: "代入 $x^3=8$",
    summary: "立方运算",
  },
};

describe("QuestionDuplicateReviewModal", () => {
  it("keeps each comparison in two columns and highlights only incoming differences", () => {
    render(
      <QuestionDuplicateReviewModal
        items={[item]}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    const existing = screen.getByRole("group", { name: "相似题 1 库中题" });
    const incoming = screen.getByRole("group", { name: "相似题 1 上传题" });

    expect(existing.parentElement).toHaveClass("md:grid-cols-2");
    expect(existing.parentElement?.children).toHaveLength(2);
    expect(existing.querySelector("mark")).toBeNull();
    expect(incoming.querySelector("mark")).not.toBeNull();
  });

  it("renders formulas without breaking changed formula delimiters", async () => {
    const user = userEvent.setup();
    render(
      <QuestionDuplicateReviewModal
        items={[item]}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    const existing = screen.getByRole("group", { name: "相似题 1 库中题" });
    const incoming = screen.getByRole("group", { name: "相似题 1 上传题" });
    expect(existing.querySelector(".katex")).not.toBeNull();
    expect(incoming.querySelector("mark .katex")).not.toBeNull();
    expect(incoming).not.toHaveTextContent("$x^3$");

    await user.click(screen.getByRole("button", { name: "相似题 1 点击上传题题干展开详情" }));
    expect(screen.getAllByText("答案")).toHaveLength(2);
    expect(screen.getAllByText("保留")).toHaveLength(6);
    expect(document.querySelectorAll(".katex").length).toBeGreaterThan(2);
  });

  it("renders formulas stored inside rich HTML", () => {
    const richItem: QuestionDuplicateReviewItem = {
      ...item,
      existing: {
        ...item.existing,
        stem: "<p>求 $x^2$ 的值</p>",
      },
      incoming: {
        ...item.incoming,
        stem: "<p>求 $x^3$ 的值</p>",
      },
    };

    render(
      <QuestionDuplicateReviewModal
        items={[richItem]}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    const existing = screen.getByRole("group", { name: "相似题 1 库中题" });
    const incoming = screen.getByRole("group", { name: "相似题 1 上传题" });
    expect(existing.querySelector(".katex")).not.toBeNull();
    expect(incoming.querySelector("mark .katex")).not.toBeNull();
    expect(existing).not.toHaveTextContent("<p>");
  });

  it("renders changed document images instead of splitting their markdown syntax", () => {
    const existingImage = "/api/files/existing-file/assets/rId29?officeWidth=121.86&officeHeight=87.67";
    const incomingImage = "/api/files/incoming-file/assets/rId29?officeWidth=121.86&officeHeight=87.67";
    const imageItem: QuestionDuplicateReviewItem = {
      ...item,
      existing: {
        ...item.existing,
        stem: `观察图像：\n![文档图片](${existingImage})\n选择正确结论`,
      },
      incoming: {
        ...item.incoming,
        stem: `观察图像：\n![文档图片](${incomingImage})\n选择正确结论`,
      },
    };

    render(
      <QuestionDuplicateReviewModal
        items={[imageItem]}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    const existing = screen.getByRole("group", { name: "相似题 1 库中题" });
    const incoming = screen.getByRole("group", { name: "相似题 1 上传题" });
    expect(existing.querySelector("img")).toHaveAttribute("src", existingImage);
    expect(incoming.querySelector("mark img")).toHaveAttribute("src", incomingImage);
    expect(incoming).not.toHaveTextContent("![文档图片]");
  });
});
