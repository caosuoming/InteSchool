import { fireEvent, render, screen } from "@testing-library/react";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { DraggableModalSurface } from "../DraggableModalSurface";

class TestPointerEvent extends MouseEvent {
  pointerId: number;

  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init);
    this.pointerId = init.pointerId ?? 0;
  }
}

beforeAll(() => {
  vi.stubGlobal("PointerEvent", TestPointerEvent);
});

afterAll(() => {
  vi.unstubAllGlobals();
});

describe("DraggableModalSurface", () => {
  it("moves freely from a drag handle, including past the viewport edge", () => {
    render(
      <DraggableModalSurface data-testid="surface">
        <div data-modal-drag-handle data-testid="handle">标题</div>
      </DraggableModalSurface>,
    );

    const surface = screen.getByTestId("surface");
    const handle = screen.getByTestId("handle");

    fireEvent.pointerDown(handle, { pointerId: 1, button: 0, clientX: 120, clientY: 80 });
    fireEvent.pointerMove(surface, { pointerId: 1, clientX: -40, clientY: -30 });

    expect(surface.style.translate).toBe("-160px -110px");
  });

  it("does not start dragging from an ignored control inside the handle", () => {
    render(
      <DraggableModalSurface data-testid="surface">
        <div data-modal-drag-handle>
          <button data-modal-drag-ignore type="button">关闭</button>
        </div>
      </DraggableModalSurface>,
    );

    const surface = screen.getByTestId("surface");
    const closeButton = screen.getByRole("button", { name: "关闭" });

    fireEvent.pointerDown(closeButton, { pointerId: 2, button: 0, clientX: 20, clientY: 20 });
    fireEvent.pointerMove(surface, { pointerId: 2, clientX: 80, clientY: 100 });

    expect(surface.style.translate).toBe("0px 0px");
  });
});
