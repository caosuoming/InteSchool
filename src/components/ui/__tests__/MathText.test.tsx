import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MathText } from "@/components/ui/MathText";

describe("MathText", () => {
  it("normalizes a decomposed not-equal sign in preview text", () => {
    const { container } = render(<MathText>若 x≠y，则两数不同。</MathText>);

    expect(container.textContent).toBe("若 x≠y，则两数不同。");
    expect(container.textContent).not.toContain("\u0338");
  });

  it("repairs legacy OMML labels without changing set notation", () => {
    const { container } = render(
      <MathText>
        {"椭圆 $\\mathbb{C}_1$ 交于 $P,\\mathbb{Q}$；设 $x\\in\\mathbb{N}$。"}
      </MathText>,
    );

    expect(container.textContent?.replace(/\u200b/g, "")).toContain("椭圆 C1 交于 P,Q");
    expect(container.querySelectorAll(".mathbb")).toHaveLength(1);
  });
});
