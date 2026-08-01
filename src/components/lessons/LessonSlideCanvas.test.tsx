import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { LessonSlideElement } from "@/types";
import { LessonSlideCanvas } from "./LessonSlideCanvas";

const elements: LessonSlideElement[] = [
  {
    id: "text-1",
    kind: "text",
    content: "课堂重点",
    x: 10,
    y: 15,
    width: 30,
    height: 12,
    fontSize: 28,
    textAlign: "center",
    animation: "rise",
  },
  {
    id: "image-1",
    kind: "image",
    src: "/api/files/question-image",
    alt: "函数图像",
    x: 55,
    y: 20,
    width: 35,
    height: 45,
    animation: "fade",
  },
];

describe("LessonSlideCanvas", () => {
  it("renders positioned text and image elements with presentation animations", () => {
    render(
      <LessonSlideCanvas elements={elements}>
        <div>基础课件内容</div>
      </LessonSlideCanvas>,
    );

    expect(screen.getByText("课堂重点")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "函数图像" })).toHaveAttribute(
      "src",
      "/api/files/question-image",
    );
    expect(screen.getByText("课堂重点").closest(".absolute")).toHaveStyle({
      left: "10%",
      top: "15%",
      width: "30%",
      height: "12%",
      animation: "lessonElementRise 460ms cubic-bezier(0.16, 1, 0.3, 1) both",
    });
  });

  it("shows the resize handle only for the selected element in editor mode", () => {
    render(
      <LessonSlideCanvas
        elements={elements}
        editable
        selectedElementId="image-1"
        onSelectElement={vi.fn()}
        onElementsChange={vi.fn()}
      >
        <div>基础课件内容</div>
      </LessonSlideCanvas>,
    );

    expect(screen.getByTitle("拖动调整大小")).toBeInTheDocument();
    expect(screen.getAllByRole("img")).toHaveLength(1);
  });
});
