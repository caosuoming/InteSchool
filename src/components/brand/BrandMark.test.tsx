import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BrandMark } from "./BrandMark";

describe("BrandMark", () => {
  it("uses the custom vector asset as a decorative mark by default", () => {
    const { container } = render(<BrandMark />);
    const image = container.querySelector("img");

    expect(image).toHaveAttribute("src", "/brand-mark.svg");
    expect(image).toHaveAttribute("alt", "");
    expect(image).toHaveAttribute("aria-hidden", "true");
  });

  it("can expose the product name when used without adjacent brand text", () => {
    render(<BrandMark decorative={false} />);

    expect(screen.getByRole("img", { name: "智题云校" })).toHaveAttribute("src", "/brand-mark.svg");
  });
});
