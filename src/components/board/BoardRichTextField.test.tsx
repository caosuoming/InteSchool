import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BoardRichTextField } from "./BoardRichTextField";

describe("board rich-text editing", () => {
  it("pastes a clipboard image into the editable content and keeps it after sanitization", async () => {
    const onChange = vi.fn();
    render(<BoardRichTextField label="节点富文本" onChange={onChange} />);
    const field = screen.getByRole("textbox", { name: "节点富文本" });
    const file = new File([new Uint8Array([137, 80, 78, 71])], "picture.png", { type: "image/png" });
    fireEvent.paste(field, { clipboardData: { files: [file] } });
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(expect.stringContaining("data:image/png;base64,")));
    expect(field.querySelector("img")?.getAttribute("alt")).toBe("粘贴图片");
  });

  it("does not insert an oversized clipboard image", () => {
    const onChange = vi.fn();
    render(<BoardRichTextField label="节点富文本" onChange={onChange} />);
    const field = screen.getByRole("textbox", { name: "节点富文本" });
    const file = new File([new Uint8Array(280001)], "huge.png", { type: "image/png" });
    fireEvent.paste(field, { clipboardData: { files: [file] } });
    expect(field.querySelector("img")).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });
});
