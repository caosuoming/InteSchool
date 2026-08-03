import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ResizableSidebarLayout } from "@/components/layout/ResizableSidebarLayout";

const storageKey = "test.directory-width";

describe("ResizableSidebarLayout", () => {
  beforeEach(() => {
    window.localStorage.clear();
    Object.defineProperty(window, "PointerEvent", {
      configurable: true,
      value: MouseEvent,
    });
    Object.defineProperty(HTMLElement.prototype, "setPointerCapture", {
      configurable: true,
      value: vi.fn(),
    });
    Object.defineProperty(HTMLElement.prototype, "hasPointerCapture", {
      configurable: true,
      value: vi.fn(() => true),
    });
    Object.defineProperty(HTMLElement.prototype, "releasePointerCapture", {
      configurable: true,
      value: vi.fn(),
    });
  });

  it("resizes the sidebar by pointer drag and persists the width", () => {
    render(
      <ResizableSidebarLayout
        storageKey={storageKey}
        defaultWidth={320}
        sidebar={<div>目录</div>}
      >
        <div>列表</div>
      </ResizableSidebarLayout>,
    );

    const separator = screen.getByRole("separator", { name: "调整目录宽度" });
    fireEvent.pointerDown(separator, { pointerId: 1, clientX: 320 });
    fireEvent.pointerMove(separator, { pointerId: 1, clientX: 384 });
    fireEvent.pointerUp(separator, { pointerId: 1, clientX: 384 });

    expect(separator).toHaveAttribute("aria-valuenow", "384");
    expect(window.localStorage.getItem(storageKey)).toBe("384");
  });

  it("supports keyboard resizing within its limits", () => {
    render(
      <ResizableSidebarLayout
        storageKey={storageKey}
        defaultWidth={320}
        minWidth={240}
        maxWidth={400}
        sidebar={<div>目录</div>}
      >
        <div>列表</div>
      </ResizableSidebarLayout>,
    );

    const separator = screen.getByRole("separator", { name: "调整目录宽度" });
    fireEvent.keyDown(separator, { key: "ArrowRight" });
    expect(separator).toHaveAttribute("aria-valuenow", "336");

    fireEvent.keyDown(separator, { key: "End" });
    expect(separator).toHaveAttribute("aria-valuenow", "400");

    fireEvent.keyDown(separator, { key: "Home" });
    expect(separator).toHaveAttribute("aria-valuenow", "240");
  });
});
