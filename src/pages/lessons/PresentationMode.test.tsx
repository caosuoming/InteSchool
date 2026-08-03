import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LessonSlide } from "@/types";
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

beforeEach(() => {
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
  vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue("data:image/png;base64,");
});

describe("PresentationMode", () => {
  it("shows five bottom drawing presets, color controls, and corner navigation without page thumbnails", async () => {
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

    expect(screen.getByRole("button", { name: "红色画笔" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "蓝色画笔" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "黑色画笔" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "黄色荧光笔" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "绿色荧光笔" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "橡皮擦" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "上一页" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "下一页" })).toBeEnabled();
    expect(screen.queryByText("1 / 2")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "红色画笔" }));
    expect(screen.getByRole("button", { name: "红色画笔" })).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: "更改红色画笔颜色" }));
    expect(screen.getByRole("button", { name: "红色画笔改为#2563eb" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "下一页" }));
    expect(screen.getByRole("button", { name: "上一页" })).toBeEnabled();
    expect(screen.getAllByText("第二页").length).toBeGreaterThan(0);
  });
});
