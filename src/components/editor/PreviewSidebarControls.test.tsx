import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PreviewSidebarControls } from "./PreviewSidebarControls";

describe("preview sidebar visibility controls", () => {
  it("limits the four paper-preview buttons to half the former width", () => {
    const { container } = render(<PreviewSidebarControls
      value={{ properties: true, answerStatus: true, answeredList: true, basket: true }}
      onChange={vi.fn()}
    />);
    expect(container.querySelector('[role="toolbar"]')).toHaveClass("max-w-[16rem]", "grid-cols-2");
    expect(screen.getAllByRole("button")).toHaveLength(4);
  });
});
