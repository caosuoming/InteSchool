import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
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

beforeEach(() => {
  Object.defineProperty(window, "PointerEvent", {
    configurable: true,
    value: MouseEvent,
  });
});

describe("LessonSlideCanvas", () => {
  it("scales fixed-size slide content to match the fullscreen reference size", async () => {
    render(
      <LessonSlideCanvas
        elements={elements}
        referenceSize={{ width: 1920, height: 1080 }}
      >
        <div>基础课件内容</div>
      </LessonSlideCanvas>,
    );

    const layer = screen.getByTestId("lesson-slide-content-layer");
    const canvas = layer.parentElement as HTMLDivElement;
    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      width: 960,
      height: 540,
      top: 0,
      right: 960,
      bottom: 540,
      left: 0,
      toJSON: () => ({}),
    });

    fireEvent(window, new Event("resize"));

    await waitFor(() => {
      expect(layer).toHaveStyle({
        width: "200%",
        height: "200%",
        transform: "scale(0.5)",
      });
    });
    expect(canvas).toHaveStyle({ aspectRatio: "1920 / 1080" });
    expect(screen.getByText("课堂重点").closest(".absolute")).toHaveStyle({
      width: "60%",
      height: "24%",
      transform: "scale(0.5)",
    });
  });

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

  it("moves a text object by dragging anywhere on it when text editing is disabled", () => {
    const onElementsChange = vi.fn();
    const { container } = render(
      <LessonSlideCanvas
        elements={elements}
        editable
        allowTextEditing={false}
        onSelectElement={vi.fn()}
        onElementsChange={onElementsChange}
      >
        <div>基础课件内容</div>
      </LessonSlideCanvas>,
    );

    const canvas = container.querySelector<HTMLElement>(".aspect-video");
    vi.spyOn(canvas!, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 1000,
      bottom: 800,
      width: 1000,
      height: 800,
      toJSON: () => ({}),
    });

    const text = screen.getByText("课堂重点");
    const element = text.closest<HTMLElement>(".absolute");
    fireEvent.pointerDown(text, { pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(element!, { pointerId: 1, clientX: 200, clientY: 180 });

    expect(onElementsChange).toHaveBeenLastCalledWith(expect.arrayContaining([
      expect.objectContaining({ id: "text-1", x: 20, y: 25 }),
    ]));
  });

  it("renders formulas while editing and stores compact LaTeX after blur", () => {
    const onElementsChange = vi.fn();
    const formulaElement: LessonSlideElement = {
      id: "formula-1",
      kind: "text",
      content: "集合 $\\{x\\mid 0\\le x<5\\}$",
      x: 10,
      y: 15,
      width: 60,
      height: 16,
      fontSize: 28,
      textAlign: "left",
    };

    const { container } = render(
      <LessonSlideCanvas
        elements={[formulaElement]}
        editable
        selectedElementId="formula-1"
        onSelectElement={vi.fn()}
        onElementsChange={onElementsChange}
      >
        <div>基础课件内容</div>
      </LessonSlideCanvas>,
    );

    const editor = container.querySelector<HTMLElement>("[contenteditable='true']");
    expect(editor?.querySelector(".katex")).not.toBeNull();
    expect(editor?.textContent).not.toContain("$\\{x\\mid 0\\le x<5\\}$");

    fireEvent.blur(editor!);
    expect(onElementsChange).toHaveBeenCalledWith([
      expect.objectContaining({
        id: "formula-1",
        content: "集合 $\\{x\\mid 0\\le x<5\\}$",
      }),
    ]);
  });
});
