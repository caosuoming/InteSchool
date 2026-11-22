import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { HomeworkContentEditor } from "./HomeworkContentEditor";
import { HomeworkContent } from "./HomeworkContent";
import { homeworkPlainText } from "@/lib/homework-rich-text";

describe("HomeworkContentEditor", () => {
  it("loads a legacy assignment into the editable field", () => {
    render(<HomeworkContentEditor value="旧作业内容" onChange={vi.fn()} onPasteImage={vi.fn()} />);
    expect(screen.getByRole("textbox", { name: "作业内容" })).toHaveTextContent("旧作业内容");
  });

  it("pastes a clipboard image as an attachment without inserting data URLs into content", () => {
    const onPasteImage = vi.fn();
    const onChange = vi.fn();
    render(<HomeworkContentEditor value="" onChange={onChange} onPasteImage={onPasteImage} />);
    const file = new File(["pasted"], "screenshot.png", { type: "image/png" });
    fireEvent.paste(screen.getByRole("textbox", { name: "作业内容" }), {
      clipboardData: { files: [file] },
    });
    expect(onPasteImage).toHaveBeenCalledWith(file);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("serializes formatting and renders it without executing markup", () => {
    const onChange = vi.fn();
    const { rerender } = render(<HomeworkContentEditor value="" onChange={onChange} onPasteImage={vi.fn()} />);
    const editor = screen.getByRole("textbox", { name: "作业内容" });
    editor.innerHTML = '<b>完成题目</b> <span style="color:#ff0000">重要</span><script>alert(1)</script>';
    fireEvent.input(editor);
    const rich = onChange.mock.lastCall[0] as string;
    expect(homeworkPlainText(rich)).toContain("完成题目 重要");
    rerender(<HomeworkContent content={rich} />);
    expect(screen.getByText("完成题目")).toHaveProperty("tagName", "B");
    expect(document.querySelector("script")).toBeNull();
  });
});
