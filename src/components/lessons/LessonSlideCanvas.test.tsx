import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
    animationOrder: 2,
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
      animationDelay: "160ms",
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

  it("renders hyperlinks in presentation mode and keeps text selectable in editor mode", async () => {
    const user = userEvent.setup();
    const onSelectElement = vi.fn();
    const linkElement: LessonSlideElement = {
      id: "link-1",
      kind: "text",
      content: "拓展资料",
      href: "https://example.com/resource",
      x: 10,
      y: 15,
      width: 30,
      height: 12,
      fontSize: 28,
      textAlign: "center",
      animation: "rise",
      animationOrder: 2,
    };

    const { rerender } = render(
      <LessonSlideCanvas elements={[linkElement]}>
        <div>基础课件内容</div>
      </LessonSlideCanvas>,
    );

    expect(screen.getByRole("link", { name: "拓展资料" })).toHaveAttribute(
      "href",
      "https://example.com/resource",
    );

    rerender(
      <LessonSlideCanvas
        elements={[linkElement]}
        editable
        onSelectElement={onSelectElement}
        onElementsChange={vi.fn()}
      >
        <div>基础课件内容</div>
      </LessonSlideCanvas>,
    );

    await user.click(screen.getByText("拓展资料"));
    expect(onSelectElement).toHaveBeenCalledWith("link-1");
    expect(screen.getByText("拓展资料").closest(".absolute")).toHaveClass("select-text");
  });

  it("edits text directly on the canvas and commits it on blur", () => {
    const onElementsChange = vi.fn();
    render(
      <LessonSlideCanvas
        elements={elements}
        editable
        selectedElementId="text-1"
        onSelectElement={vi.fn()}
        onElementsChange={onElementsChange}
      >
        <div>基础课件内容</div>
      </LessonSlideCanvas>,
    );

    const editor = screen.getByText("课堂重点");
    expect(editor).toHaveAttribute("contenteditable", "true");
    editor.innerHTML = "直接输入的新内容";
    fireEvent.blur(editor);

    expect(onElementsChange).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({
        id: "text-1",
        content: "直接输入的新内容",
      }),
    ]));
  });
});
