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

  it("lets generated text boxes expand with their content", () => {
    render(
      <LessonSlideCanvas
        elements={[{
          id: "auto-text",
          kind: "text",
          content: "这是一段需要自动扩展文本框高度的较长课堂文本。",
          x: 8,
          y: 10,
          width: 40,
          height: 12,
          fontSize: 30,
          autoHeight: true,
        }]}
      >
        <div />
      </LessonSlideCanvas>,
    );

    const text = screen.getByText(/需要自动扩展文本框高度/);
    expect(text.closest(".absolute")).toHaveStyle({
      height: "auto",
      minHeight: "12%",
    });
    expect(text.parentElement).toHaveClass("overflow-visible");
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

  it("applies imported PPT text formatting without adding a text-box background", () => {
    render(
      <LessonSlideCanvas
        elements={[{
          id: "ppt-text",
          kind: "text",
          content: "导入文字",
          x: 10,
          y: 10,
          width: 40,
          height: 15,
          fontSize: 32,
          fontFamily: "Microsoft YaHei",
          fontWeight: "bold",
          fontStyle: "italic",
          textDecoration: "underline",
          color: "#123456",
          backgroundColor: "transparent",
          padding: 0,
          textAlign: "center",
        }]}
      >
        <div />
      </LessonSlideCanvas>,
    );

    const element = screen.getByText("导入文字").closest(".absolute");
    const text = element?.querySelector<HTMLElement>(":scope > div");
    expect(text).not.toBeNull();
    expect(text?.style.fontSize).toBe("32px");
    expect(text?.style.fontFamily).toBe("Microsoft YaHei");
    expect(text?.style.fontWeight).toBe("bold");
    expect(text?.style.fontStyle).toBe("italic");
    expect(text?.style.textDecoration).toBe("underline");
    expect(text?.style.color).toBe("rgb(18, 52, 86)");
    expect(text?.style.backgroundColor).toBe("transparent");
    expect(text?.style.padding).toBe("0px");
    expect(text?.style.textAlign).toBe("center");
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
    expect(screen.getByLabelText("动画顺序 2")).toHaveTextContent("2");
    expect(screen.queryByLabelText("动画顺序 1")).not.toBeInTheDocument();
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

  it("persists direct text edits on input and focuses a selected text object", async () => {
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
    await waitFor(() => expect(editor).toHaveFocus());
    editor.innerHTML = "课堂重点补充";
    fireEvent.input(editor);

    expect(onElementsChange).toHaveBeenLastCalledWith(expect.arrayContaining([
      expect.objectContaining({ id: "text-1", content: "课堂重点补充" }),
    ]));
  });

  it("keeps imported PPT table cells directly editable", () => {
    const onElementsChange = vi.fn();
    const tableElement: LessonSlideElement = {
      id: "table-1",
      kind: "text",
      content: '<table class="ppt-import-table"><tbody><tr><td>原内容</td></tr></tbody></table>',
      x: 10,
      y: 10,
      width: 60,
      height: 30,
      fontSize: 20,
    };
    const { container } = render(
      <LessonSlideCanvas
        elements={[tableElement]}
        editable
        selectedElementId="table-1"
        onSelectElement={vi.fn()}
        onElementsChange={onElementsChange}
      >
        <div />
      </LessonSlideCanvas>,
    );

    const editor = container.querySelector<HTMLDivElement>("[contenteditable='true']")!;
    const cell = editor.querySelector("td")!;
    cell.textContent = "修改后的内容";
    fireEvent.input(editor);

    expect(onElementsChange).toHaveBeenLastCalledWith([
      expect.objectContaining({
        id: "table-1",
        content: expect.stringContaining("修改后的内容"),
      }),
    ]);
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

  it("allows text and image objects to move beyond the top and bottom edges when enabled", () => {
    const onElementsChange = vi.fn();
    const { container } = render(
      <LessonSlideCanvas
        elements={elements}
        editable
        allowTextEditing={false}
        allowVerticalElementOverflow
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
    const textElement = text.closest<HTMLElement>(".absolute");
    fireEvent.pointerDown(text, { pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(textElement!, { pointerId: 1, clientX: 100, clientY: -300 });
    expect(onElementsChange).toHaveBeenLastCalledWith(expect.arrayContaining([
      expect.objectContaining({ id: "text-1", y: -35 }),
    ]));

    const image = screen.getByAltText("函数图像");
    const imageElement = image.closest<HTMLElement>(".absolute");
    fireEvent.pointerDown(image, { pointerId: 2, clientX: 600, clientY: 200 });
    fireEvent.pointerMove(imageElement!, { pointerId: 2, clientX: 600, clientY: 1000 });
    expect(onElementsChange).toHaveBeenLastCalledWith(expect.arrayContaining([
      expect.objectContaining({ id: "image-1", y: 120 }),
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
