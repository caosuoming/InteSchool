import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LessonSlide } from "@/types";
import { getMaximumContrastTextColor } from "@/lib/color-contrast";
import { PresentationMode } from "./PresentationMode";

const slides: LessonSlide[] = [
  {
    id: "slide-1",
    type: "knowledge",
    title: "第一页",
    content: "第一页内容",
    freeformLayout: true,
    elements: [{
      id: "element-1",
      kind: "text",
      content: "第一页内容",
      x: 5,
      y: 5,
      width: 90,
      height: 40,
    }],
  },
  {
    id: "slide-2",
    type: "knowledge",
    title: "第二页",
    content: "第二页内容",
    freeformLayout: true,
    elements: [{
      id: "element-2",
      kind: "text",
      content: "第二页内容",
      x: 5,
      y: 5,
      width: 90,
      height: 40,
    }],
  },
];

const questionSlide: LessonSlide = {
  id: "question-slide",
  type: "question",
  title: "课堂题目",
  questionId: "question-1",
  questionSnapshot: {
    stem: "题干内容",
    type: "single",
    options: ["选项 A", "选项 B"],
    answer: "参考答案",
    analysis: "详细解析",
  },
  relatedQuestionIds: [],
  askableStudentIds: [],
};

beforeEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  Object.defineProperty(window, "PointerEvent", {
    configurable: true,
    value: MouseEvent,
  });
  let fullscreenElement: Element | null = null;
  Object.defineProperty(document, "fullscreenElement", {
    configurable: true,
    get: () => fullscreenElement,
  });
  Object.defineProperty(HTMLElement.prototype, "requestFullscreen", {
    configurable: true,
    value: vi.fn(async () => {
      fullscreenElement = document.documentElement;
      document.dispatchEvent(new Event("fullscreenchange"));
    }),
  });
  Object.defineProperty(document, "exitFullscreen", {
    configurable: true,
    value: vi.fn(async () => {
      fullscreenElement = null;
      document.dispatchEvent(new Event("fullscreenchange"));
    }),
  });
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    drawImage: vi.fn(),
    lineCap: "round",
    lineJoin: "round",
    globalCompositeOperation: "source-over",
    globalAlpha: 1,
    lineWidth: 1,
    strokeStyle: "#000000",
  } as unknown as CanvasRenderingContext2D);
});

describe("PresentationMode", () => {
  it("reveals animation steps before changing pages and groups equal orders", async () => {
    const user = userEvent.setup();
    const animatedSlides: LessonSlide[] = [
      {
        id: "animated-slide",
        type: "knowledge",
        title: "动画页",
        freeformLayout: true,
        elements: [
          {
            id: "first-step",
            kind: "text",
            content: "第一步",
            x: 5,
            y: 5,
            width: 30,
            height: 15,
            enterAnimation: "fade",
            animationOrder: 1,
          },
          {
            id: "second-step-a",
            kind: "text",
            content: "第二步甲",
            x: 5,
            y: 25,
            width: 30,
            height: 15,
            enterAnimation: "rise",
            animationOrder: 2,
          },
          {
            id: "second-step-b",
            kind: "text",
            content: "第二步乙",
            x: 40,
            y: 25,
            width: 30,
            height: 15,
            enterAnimation: "zoom",
            animationOrder: 2,
          },
        ],
      },
      {
        id: "plain-slide",
        type: "knowledge",
        title: "下一张",
        freeformLayout: true,
        elements: [{
          id: "plain-element",
          kind: "text",
          content: "下一张内容",
          x: 5,
          y: 5,
          width: 90,
          height: 40,
        }],
      },
    ];

    render(
      <PresentationMode
        slides={animatedSlides}
        initialIndex={0}
        students={[]}
        relatedQuestionsById={{}}
        onExit={vi.fn()}
      />,
    );

    expect(screen.queryByText("第一步")).not.toBeInTheDocument();
    expect(screen.queryByText("第二步甲")).not.toBeInTheDocument();

    const next = screen.getByRole("button", { name: "左侧下一页" });
    await user.click(next);
    const firstStep = screen.getByText("第一步").closest<HTMLElement>(".absolute");
    expect(firstStep?.style.animation).toContain("lessonElementFade");
    expect(firstStep?.style.animationDelay).toBe("");
    expect(screen.queryByText("第二步甲")).not.toBeInTheDocument();

    await user.click(next);
    expect(screen.getByText("第二步甲")).toBeInTheDocument();
    expect(screen.getByText("第二步乙")).toBeInTheDocument();
    expect(screen.queryByText("下一张内容")).not.toBeInTheDocument();

    await user.click(next);
    expect(screen.getByText("下一张内容")).toBeInTheDocument();
  });

  it("combines page, text, and board colors with automatic maximum contrast", async () => {
    expect(getMaximumContrastTextColor("#ffffff")).toBe("#111827");
    expect(getMaximumContrastTextColor("#111827")).toBe("#ffffff");

    const user = userEvent.setup();
    render(
      <PresentationMode
        slides={slides}
        initialIndex={0}
        students={[]}
        relatedQuestionsById={{}}
        onExit={vi.fn()}
      />,
    );

    const text = screen.getByText("第一页内容");
    const textBox = text.closest<HTMLElement>('[style*="font-size"]');
    const slideCanvas = text.closest<HTMLElement>(".aspect-auto");
    expect(textBox).toHaveStyle({ color: "#111827" });
    expect(textBox?.getAttribute("style")).toContain("background-color: transparent");
    expect(slideCanvas).toHaveStyle({ backgroundColor: "#fffef8" });
    expect(slideCanvas).toHaveClass("h-full", "w-full", "rounded-none", "shadow-none");

    await user.click(screen.getByRole("button", { name: "页面与板书颜色设置" }));
    expect(screen.getByRole("dialog", { name: "颜色设置" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "文字颜色自动对比" })).toHaveAttribute("aria-pressed", "true");

    fireEvent.change(screen.getByLabelText("页面颜色"), { target: { value: "#111827" } });
    expect(slideCanvas).toHaveStyle({ backgroundColor: "#111827" });
    expect(textBox).toHaveStyle({ color: "#ffffff" });

    await user.click(screen.getByRole("button", { name: "自定义文字颜色" }));
    fireEvent.change(screen.getByLabelText("文字颜色"), { target: { value: "#dc2626" } });
    expect(textBox).toHaveStyle({ color: "#dc2626" });

    fireEvent.change(screen.getByLabelText("板书背景颜色"), { target: { value: "#eff6ff" } });
    await user.click(screen.getByRole("button", { name: "关闭颜色设置" }));
    await user.click(screen.getByRole("button", { name: "打开板书" }));
    const writingFrame = screen
      .getByRole("region", { name: "板书 1" })
      .querySelector<HTMLElement>("[data-board-writing-frame]");
    expect(writingFrame).toHaveStyle({ backgroundColor: "#eff6ff" });

    await waitFor(() => {
      expect(localStorage.getItem("inteschool-presentation-color-preferences")).toContain(
        '"boardBackgroundColor":"#eff6ff"',
      );
    });
  });

  it("uses arrow-only mirrored navigation, text resizing, upward pen tips, fullscreen, and formal boards", async () => {
    const user = userEvent.setup();
    const onExit = vi.fn();
    render(
      <PresentationMode
        slides={slides}
        initialIndex={0}
        students={[]}
        relatedQuestionsById={{}}
        onExit={onExit}
      />,
    );

    expect(screen.queryByText("退出预览")).not.toBeInTheDocument();
    expect(screen.queryByText("保存板书")).not.toBeInTheDocument();
    expect(screen.queryByText("临时板书")).not.toBeInTheDocument();
    expect(screen.queryByText("第一页")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "左侧显示内容" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "右侧显示内容" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "左侧提问学生" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "右侧相关题" })).toBeInTheDocument();
    const leftSideRail = screen.getByRole("button", { name: "左侧显示内容" }).closest('[data-presentation-side-controls="left"]');
    const rightSideRail = screen.getByRole("button", { name: "右侧显示内容" }).closest('[data-presentation-side-controls="right"]');
    expect(leftSideRail).toContainElement(
      screen.getByRole("button", { name: "左侧显示内容" }),
    );
    expect(rightSideRail).toContainElement(
      screen.getByRole("button", { name: "右侧显示内容" }),
    );
    expect(leftSideRail).toHaveClass("bottom-[4.25rem]", "left-4");
    expect(rightSideRail).toHaveClass("bottom-[4.25rem]", "right-4");
    expect(screen.getByRole("button", { name: "左侧显示内容" })).toHaveClass("h-10", "w-9");
    expect(screen.getByTestId("presentation-slide-page")).toHaveClass("h-full", "w-full");
    expect(screen.queryByText("上一页")).not.toBeInTheDocument();
    expect(screen.queryByText("下一页")).not.toBeInTheDocument();
    const leftExit = screen.getByRole("button", { name: "左侧下课" });
    const rightExit = screen.getByRole("button", { name: "右侧下课" });
    expect(screen.getByLabelText("左侧翻页控制")).toContainElement(leftExit);
    expect(screen.getByLabelText("右侧翻页控制")).toContainElement(rightExit);
    expect(screen.getByLabelText("右侧翻页控制").lastElementChild).toBe(rightExit);
    expect(screen.getByLabelText("文本与全屏控制")).toHaveClass("bottom-0", "left-full");

    const selectTool = screen.getByRole("button", { name: "选择工具" });
    expect(selectTool).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "放大所选文本" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "缩小所选文本" })).toBeDisabled();
    const slideText = screen.getByText("第一页内容");
    const slideElement = slideText.closest(".absolute") as HTMLElement;
    const textBox = slideElement.querySelector('[style*="font-size"]') as HTMLElement;
    expect(slideElement).toHaveStyle({ width: "90%", height: "40%" });
    expect(textBox).toHaveStyle({ fontSize: "24px" });
    await user.click(slideText);
    expect(slideElement).toHaveClass("ring-2");
    await user.click(screen.getByRole("button", { name: "放大所选文本" }));
    expect(slideElement).toHaveStyle({ height: "44%" });
    expect(Number.parseFloat(slideElement?.style.width || "0")).toBeCloseTo(99);
    expect(textBox).toHaveStyle({ fontSize: "26.4px" });

    const redPen = screen.getByRole("button", { name: "红色画笔" });
    expect(redPen.querySelector('[data-pen-tip="up"]')).toBeInTheDocument();
    await user.click(redPen);
    expect(redPen).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: "设置红色画笔" }));
    expect(screen.getByRole("button", { name: "红色画笔改为#2563eb" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "红色画笔改为#ffffff" })).toBeInTheDocument();
    const penWidth = screen.getByRole("slider", { name: "红色画笔粗细" });
    expect(penWidth).toHaveValue("3");
    fireEvent.change(penWidth, { target: { value: "7" } });
    expect(screen.getByRole("button", { name: "红色画笔" })).toHaveAttribute("title", "红色画笔 · 7px");

    await user.click(screen.getByRole("button", { name: "全屏" }));
    expect(await screen.findByRole("button", { name: "退出全屏" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "退出全屏" }));
    expect(await screen.findByRole("button", { name: "全屏" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "打开板书" }));
    const firstBoard = screen.getByRole("region", { name: "板书 1" });
    expect(firstBoard).toHaveStyle({ left: "0%", width: "100%" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(firstBoard.querySelector('[data-board-divider="center"]')).toHaveClass("left-1/2");
    expect(screen.getByRole("button", { name: "移动板书 1" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /调整板书 1大小/ })).toHaveLength(8);
    expect(screen.getByRole("button", { name: "清空当前板书" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "删除板书 1" })).not.toBeInTheDocument();
    const leftBoardControls = firstBoard.querySelector<HTMLElement>('[data-board-side-controls="left"]');
    const rightBoardControls = firstBoard.querySelector<HTMLElement>('[data-board-side-controls="right"]');
    expect(leftBoardControls).not.toBeNull();
    expect(rightBoardControls).not.toBeNull();
    expect(leftBoardControls).toHaveClass("top-1");
    expect(rightBoardControls).toHaveClass("top-1");
    const addWritingAreaButton = within(leftBoardControls!).getByRole("button", { name: "从左侧在板书 1中新增书写区" });
    const rightAddWritingAreaButton = within(rightBoardControls!).getByRole("button", { name: "从右侧在板书 1中新增书写区" });
    const firstWritingAreaTab = within(leftBoardControls!).getByRole("tab", { name: "从左侧切换到板书 1书写区 1" });
    const rightFirstWritingAreaTab = within(rightBoardControls!).getByRole("tab", { name: "从右侧切换到板书 1书写区 1" });
    expect(addWritingAreaButton).toHaveClass("h-7", "w-7", "bg-transparent");
    expect(rightAddWritingAreaButton).toHaveClass("h-7", "w-7", "bg-transparent");
    expect(firstWritingAreaTab).toHaveClass("h-6", "w-6");
    expect(rightFirstWritingAreaTab).toHaveClass("h-6", "w-6");
    expect(firstWritingAreaTab).toHaveAttribute("aria-selected", "true");
    expect(rightFirstWritingAreaTab).toHaveAttribute("aria-selected", "true");
    await user.click(addWritingAreaButton);
    expect(screen.getAllByRole("region", { name: /板书/ })).toHaveLength(1);
    expect(within(leftBoardControls!).getByRole("tab", { name: "从左侧切换到板书 1书写区 2" })).toHaveAttribute("aria-selected", "true");
    expect(within(rightBoardControls!).getByRole("tab", { name: "从右侧切换到板书 1书写区 2" })).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByRole("region", { name: "板书 2" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "收起板书" }));
    expect(firstBoard).toHaveClass("invisible");

    expect(screen.getByRole("button", { name: "左侧上一页" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "左侧下一页" }));
    expect(screen.getByRole("button", { name: "左侧上一页" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "右侧上一页" })).toBeEnabled();
    expect(screen.getByText("第二页内容")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "右侧下课" }));
    expect(onExit).toHaveBeenCalledOnce();
  });

  it("keeps the slide writable while a board moves and switches independent writing areas", async () => {
    const user = userEvent.setup();
    render(
      <PresentationMode
        slides={slides}
        initialIndex={0}
        students={[]}
        relatedQuestionsById={{}}
        onExit={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "红色画笔" }));
    await user.click(screen.getByRole("button", { name: "打开板书" }));

    const surface = screen.getByTestId("presentation-surface");
    vi.spyOn(surface, "getBoundingClientRect").mockReturnValue({
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

    const firstBoard = screen.getByRole("region", { name: "板书 1" });
    const writingFrame = firstBoard.querySelector<HTMLElement>("[data-board-writing-frame]");
    expect(writingFrame).not.toBeNull();
    expect(Number.parseFloat(writingFrame?.style.width || "0")).toBeGreaterThanOrEqual(100);
    expect(Number.parseFloat(writingFrame?.style.height || "0")).toBeGreaterThan(100);
    expect(writingFrame).toHaveAttribute("data-draggable", "false");

    expect(screen.getByLabelText("课件批注画布")).toHaveClass("pointer-events-auto");
    expect(screen.getByLabelText("板书 1书写区 1")).toHaveClass("pointer-events-auto");
    expect(screen.getByRole("button", { name: "从左侧在板书 1中新增书写区" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "从右侧在板书 1中新增书写区" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "选择工具" }));
    expect(writingFrame).toHaveAttribute("data-draggable", "true");

    const frameLeftBeforeBoardMove = writingFrame?.style.left;
    const moveBoardButton = screen.getByRole("button", { name: "移动板书 1" });
    fireEvent.pointerDown(moveBoardButton, { pointerId: 1, clientX: 200, clientY: 160 });
    fireEvent.pointerMove(moveBoardButton, { pointerId: 1, clientX: -500, clientY: 160 });
    fireEvent.pointerUp(moveBoardButton, { pointerId: 1, clientX: -500, clientY: 160 });
    expect(firstBoard).toHaveStyle({ left: "0%", width: "100%" });
    expect(writingFrame?.style.left).toBe(frameLeftBeforeBoardMove);

    const frameLeftBefore = writingFrame?.style.left;
    fireEvent.pointerDown(writingFrame!, { pointerId: 2, clientX: 200, clientY: 160 });
    fireEvent.pointerMove(writingFrame!, { pointerId: 2, clientX: 350, clientY: 240 });
    fireEvent.pointerUp(writingFrame!, { pointerId: 2, clientX: 350, clientY: 240 });
    expect(writingFrame?.style.left).not.toBe(frameLeftBefore);

    await user.click(screen.getByRole("button", { name: "从左侧在板书 1中新增书写区" }));
    const writingFrames = firstBoard.querySelectorAll<HTMLElement>("[data-board-writing-frame]");
    expect(writingFrames).toHaveLength(2);
    expect(writingFrames[0]).toHaveAttribute("data-active", "false");
    expect(writingFrames[1]).toHaveAttribute("data-active", "true");
    await user.click(screen.getByRole("button", { name: "红色画笔" }));
    expect(screen.getByLabelText("板书 1书写区 1")).toHaveClass("pointer-events-none");
    expect(screen.getByLabelText("板书 1书写区 2")).toHaveClass("pointer-events-auto");

    await user.click(screen.getByRole("tab", { name: "从右侧切换到板书 1书写区 1" }));
    expect(writingFrames[0]).toHaveAttribute("data-active", "true");
    expect(writingFrames[1]).toHaveAttribute("data-active", "false");
    expect(screen.getByLabelText("板书 1书写区 1")).toHaveClass("pointer-events-auto");
    expect(screen.getByLabelText("板书 1书写区 2")).toHaveClass("pointer-events-none");
    expect(screen.getAllByRole("region", { name: /板书/ })).toHaveLength(1);
  });

  it("keeps classroom controls above boards and resizes from every edge and corner", async () => {
    const user = userEvent.setup();
    render(
      <PresentationMode
        slides={slides}
        initialIndex={0}
        students={[]}
        relatedQuestionsById={{}}
        onExit={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "打开板书" }));
    const surface = screen.getByTestId("presentation-surface");
    vi.spyOn(surface, "getBoundingClientRect").mockReturnValue({
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

    const board = screen.getByRole("region", { name: "板书 1" });
    expect(board).toHaveStyle({ zIndex: "60" });
    expect(screen.getByLabelText("书写工具")).toHaveClass("z-[90]");
    expect(screen.getByLabelText("左侧翻页控制")).toHaveClass("z-[90]");
    expect(screen.getByRole("button", { name: "左侧显示内容" }).parentElement?.parentElement).toHaveClass("z-[90]");

    const resizeHandles = board.querySelectorAll<HTMLElement>("[data-board-resize-handle]");
    expect(Array.from(resizeHandles).map((handle) => handle.dataset.boardResizeHandle)).toEqual([
      "n", "ne", "e", "se", "s", "sw", "w", "nw",
    ]);

    const westHandle = screen.getByRole("button", { name: "从左边调整板书 1大小" });
    expect(board).toHaveStyle({ left: "0%", width: "100%" });
    fireEvent.pointerDown(westHandle, { pointerId: 3, clientX: 0, clientY: 300 });
    fireEvent.pointerMove(westHandle, { pointerId: 3, clientX: 100, clientY: 300 });
    fireEvent.pointerUp(westHandle, { pointerId: 3, clientX: 100, clientY: 300 });
    expect(board).toHaveStyle({ left: "10%", width: "90%" });

    const northHandle = screen.getByRole("button", { name: "从上边调整板书 1大小" });
    fireEvent.pointerDown(northHandle, { pointerId: 4, clientX: 400, clientY: 80 });
    fireEvent.pointerMove(northHandle, { pointerId: 4, clientX: 400, clientY: 0 });
    fireEvent.pointerUp(northHandle, { pointerId: 4, clientX: 400, clientY: 0 });
    expect(board).toHaveStyle({ top: "0%", height: "72%" });

    const southEastHandle = screen.getByRole("button", { name: "从右下角调整板书 1大小" });
    fireEvent.pointerDown(southEastHandle, { pointerId: 5, clientX: 840, clientY: 576 });
    fireEvent.pointerMove(southEastHandle, { pointerId: 5, clientX: 940, clientY: 656 });
    fireEvent.pointerUp(southEastHandle, { pointerId: 5, clientX: 940, clientY: 656 });
    expect(board).toHaveStyle({ left: "10%", width: "90%", top: "0%", height: "82%" });
  });

  it("dismisses floating controls outside and configures eraser size without replaying slide animations", async () => {
    const user = userEvent.setup();
    render(
      <PresentationMode
        slides={[{
          id: "animated-slide",
          type: "knowledge",
          title: "动画页",
          freeformLayout: true,
          elements: [{
            id: "animated-text",
            kind: "text",
            content: "不应闪烁",
            x: 10,
            y: 10,
            width: 40,
            height: 20,
            enterAnimation: "fade",
          }],
        }]}
        initialIndex={0}
        students={[]}
        relatedQuestionsById={{}}
        onExit={vi.fn()}
      />,
    );

    const animatedElement = screen.getByText("不应闪烁").closest<HTMLElement>(".absolute");
    expect(animatedElement?.style.animation).toBe("");
    await user.click(screen.getByRole("button", { name: "红色画笔" }));
    expect(animatedElement?.style.animation).toBe("");

    await user.click(screen.getByRole("button", { name: "橡皮擦" }));
    expect(screen.getByRole("button", { name: "设置橡皮擦范围" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "设置橡皮擦范围" }));
    expect(screen.getByRole("button", { name: "橡皮擦范围48" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "橡皮擦范围48" }));
    expect(screen.getByRole("button", { name: "橡皮擦" })).toHaveAttribute("title", "橡皮擦 · 48px");

    await user.click(screen.getByRole("button", { name: "左侧显示内容" }));
    expect(screen.getByRole("group", { name: "显示内容开关" })).toBeInTheDocument();
    fireEvent.pointerDown(screen.getByTestId("presentation-surface"));
    expect(screen.queryByRole("group", { name: "显示内容开关" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "页面与板书颜色设置" }));
    expect(screen.getByRole("dialog", { name: "颜色设置" })).toBeInTheDocument();
    fireEvent.pointerDown(screen.getByTestId("presentation-surface"));
    expect(screen.queryByRole("dialog", { name: "颜色设置" })).not.toBeInTheDocument();
  });

  it("turns legacy knowledge content into a selectable object without showing its title", async () => {
    const user = userEvent.setup();
    render(
      <PresentationMode
        slides={[{
          id: "legacy-knowledge",
          type: "knowledge",
          title: "不应显示的知识块标题",
          content: "可自由调整的知识内容",
        }]}
        initialIndex={0}
        students={[]}
        relatedQuestionsById={{}}
        onExit={vi.fn()}
      />,
    );

    expect(screen.queryByText("不应显示的知识块标题")).not.toBeInTheDocument();
    const content = screen.getByText("可自由调整的知识内容");
    const element = content.closest(".absolute") as HTMLElement;
    expect(element).toHaveStyle({ left: "5%", top: "6%", width: "90%", height: "88%" });
    await user.click(content);
    expect(element).toHaveClass("ring-2");
    expect(screen.getByRole("button", { name: "放大所选文本" })).toBeEnabled();
  });

  it("reveals question options, answers, and analysis from either mirrored display rail", async () => {
    const user = userEvent.setup();
    render(
      <PresentationMode
        slides={[questionSlide]}
        initialIndex={0}
        students={[]}
        relatedQuestionsById={{}}
        onExit={vi.fn()}
      />,
    );

    expect(screen.queryByText("选项 A")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "左侧显示内容" }));
    const displayPanel = screen.getByRole("group", { name: "显示内容开关" });
    expect(displayPanel).toHaveClass("flex", "items-center");
    expect(screen.queryByText("按需显示当前题目的内容。")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "选项" }));
    await user.click(screen.getByRole("button", { name: "答案" }));
    await user.click(screen.getByRole("button", { name: "解析" }));

    expect(screen.getByText("选项 A")).toBeInTheDocument();
    expect(screen.getAllByText("参考答案").length).toBeGreaterThan(0);
    expect(screen.getByText("详细解析")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "右侧显示内容" }));
    expect(screen.getByRole("button", { name: "选项" })).toHaveAttribute("aria-pressed", "true");
  });
});
