import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MathText } from "@/components/ui/MathText";

describe("MathText", () => {
  it("normalizes a decomposed not-equal sign in preview text", () => {
    const { container } = render(<MathText>若 x≠y，则两数不同。</MathText>);

    expect(container.textContent).toBe("若 x≠y，则两数不同。");
    expect(container.textContent).not.toContain("\u0338");
  });
});
