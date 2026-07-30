import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { WpsFormulaEditor } from "../WpsFormulaEditor";

describe("WpsFormulaEditor", () => {
  it("renders stored dollar-delimited formulas when the editor opens", () => {
    const { container } = render(
      <WpsFormulaEditor
        initialHtml="已知 $x^2=1$，求 x。"
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    const editor = container.querySelector<HTMLElement>("[contenteditable='true']");
    const formula = editor?.querySelector<HTMLElement>(".katex-formula");

    expect(formula).toHaveAttribute("data-latex", "x^2=1");
    expect(editor?.textContent).not.toContain("$x^2=1$");
  });
});
