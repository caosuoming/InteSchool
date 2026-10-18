import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LessonSlideElement } from "@/types";
import { LessonSlideCanvas } from "./LessonSlideCanvas";

vi.mock("@/components/courseware/GeoGebraEmbed", () => ({
  GeoGebraEmbed: ({ fileUrl, title, backgroundColor }: { fileUrl: string; title: string; backgroundColor?: string }) => (
    <div data-testid="embedded-ggb" data-src={fileUrl} style={{ backgroundColor }}>{title}</div>
  ),
}));

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
  it("embeds GeoGebra elements with the current slide background", () => {
    render(
      <LessonSlideCanvas
        elements={[{ id: "ggb-1", kind: "geogebra", src: "/api/ggb", title: "圆", x: 10, y: 10, width: 65, height: 60 }]}
        canvasStyle={{ backgroundColor: "#F1F7FF" }}
      >
        <div>课堂内容</div>
      </LessonSlideCanvas>,
    );
    expect(screen.getByTestId("embedded-ggb")).toHaveStyle({ backgroundColor: "#F1F7FF" });
    expect(screen.getByTestId("embedded-ggb")).toHaveAttribute("data-src", "/api/ggb");
  });

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

  it("plays scheduled media at the configured time in presentation mode", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-14T09:34:30"));
    const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);

    try {
      render(
        <LessonSlideCanvas
          elements={[{
            id: "video-1",
            kind: "video",
            src: "/api/files/video-1",
            title: "函数演示",
            scheduledPlayAt: "09:35",
            x: 10,
            y: 10,
            width: 50,
            height: 40,
          }]}
          editable
          allowTextEditing={false}
          enableScheduledMediaPlayback
        >
          <div />
        </LessonSlideCanvas>,
      );

      expect(screen.getByTitle("函数演示")).toBeInTheDocument();
      expect(play).not.toHaveBeenCalled();
      act(() => vi.advanceTimersByTime(30_000));
      expect(play).toHaveBeenCalledOnce();
    } finally {
      play.mockRestore();
      vi.useRealTimers();
    }
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

  it("converts images embedded in knowledge-block text into movable, resizable elements", () => {
    const onElementsChange = vi.fn();
    const onSelectElement = vi.fn();
    const text: LessonSlideElement = {
      id: "knowledge-text", kind: "text",
      content: '知识文字 <img src="/api/files/embedded.png" alt="图示" /> 和公式 $x^2$',
      x: 10, y: 15, width: 60, height: 30, autoHeight: true,
    };
    const { container, rerender } = render(
      <LessonSlideCanvas elements={[text]} editable onSelectElement={onSelectElement} onElementsChange={onElementsChange}>
        <div />
      </LessonSlideCanvas>,
    );
    const canvas = container.querySelector<HTMLElement>("[data-lesson-slide-canvas]")!;
    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
      left: 0, top: 0, width: 1000, height: 500,
      right: 1000, bottom: 500, x: 0, y: 0, toJSON: () => ({}),
    });
    const embedded = screen.getByAltText("图示");
    vi.spyOn(embedded, "getBoundingClientRect").mockReturnValue({
      left: 320, top: 140, width: 260, height: 150,
      right: 580, bottom: 290, x: 320, y: 140, toJSON: () => ({}),
    });
    fireEvent.click(embedded);
    const updated = onElementsChange.mock.lastCall![0] as LessonSlideElement[];
    expect(updated).toHaveLength(2);
    expect(updated[0]).toMatchObject({ id: "knowledge-text", kind: "text" });
    if (updated[0].kind !== "text") throw Error("Expected text");
    expect(updated[0].content).toContain("$x^2$");
    expect(updated[0].content).not.toContain("embedded.png");
    expect(updated[1]).toMatchObject({
      kind: "image", src: "/api/files/embedded.png", alt: "图示",
      x: 32, width: 26, height: 30,
    });
    expect(updated[1].y).toBeCloseTo(28);
    expect(onSelectElement).toHaveBeenCalledWith(updated[1].id);

    rerender(
      <LessonSlideCanvas elements={updated} editable selectedElementId={updated[1].id}
        onSelectElement={onSelectElement} onElementsChange={onElementsChange}>
        <div />
      </LessonSlideCanvas>,
    );
    const floating = screen.getByAltText("图示").closest<HTMLElement>(".absolute")!;
    expect(floating).toHaveStyle({ left: "32%", top: "28%", width: "26%", height: "30%" });
    fireEvent.pointerDown(floating, { pointerId: 1, clientX: 320, clientY: 140 });
    fireEvent.pointerMove(floating, { pointerId: 1, clientX: 420, clientY: 190 });
    expect(onElementsChange).toHaveBeenLastCalledWith(expect.arrayContaining([
      expect.objectContaining({ id: updated[1].id, x: 42, y: 38 }),
    ]));
    fireEvent.pointerUp(floating, { pointerId: 1 });
    const handle = screen.getByTitle("拖动调整大小");
    fireEvent.pointerDown(handle, { pointerId: 2, clientX: 320, clientY: 140 });
    fireEvent.pointerMove(handle, { pointerId: 2, clientX: 420, clientY: 190 });
    expect(onElementsChange).toHaveBeenLastCalledWith(expect.arrayContaining([
      expect.objectContaining({ id: updated[1].id, width: 36, height: 40 }),
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
