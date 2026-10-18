import { describe, expect, it, vi } from "vitest";
import { renderMathHtml } from "@/lib/math-html";
import { detachLessonInlineImage } from "./lesson-inline-image";

describe("detachLessonInlineImage", () => {
  it("preserves text, formulas and remaining images while extracting the selected image", () => {
    const root = document.createElement("div");
    root.innerHTML = renderMathHtml('<p>公式 $x^2$ <img src="/api/files/first.png" alt="第一张" /></p><p><img src="/api/files/second.png" alt="第二张" /></p>');
    const canvas = document.createElement("div");
    const images = root.querySelectorAll("img");
    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
      left: 100, top: 50, width: 1000, height: 500,
      right: 1100, bottom: 550, x: 100, y: 50, toJSON: () => ({}),
    });
    vi.spyOn(images[1], "getBoundingClientRect").mockReturnValue({
      left: 700, top: 200, width: 240, height: 180,
      right: 940, bottom: 380, x: 700, y: 200, toJSON: () => ({}),
    });

    const result = detachLessonInlineImage(images[1], root, canvas, "floating-1");

    expect(result?.element).toMatchObject({
      id: "floating-1", kind: "image", src: "/api/files/second.png", alt: "第二张",
      x: 60, y: 30, width: 24, height: 36,
    });
    expect(result?.content).toContain("$x^2$");
    expect(result?.content).toContain("/api/files/first.png");
    expect(result?.content).not.toContain("/api/files/second.png");
    expect(root.querySelectorAll("img")).toHaveLength(2);
  });

  it("ignores unsafe or unrelated images", () => {
    const root = document.createElement("div");
    const canvas = document.createElement("div");
    root.innerHTML = '<img src="javascript:alert(1)">';
    expect(detachLessonInlineImage(root.querySelector("img")!, root, canvas, "id")).toBeNull();
    const outside = document.createElement("img");
    outside.src = "/api/files/test.png";
    expect(detachLessonInlineImage(outside, root, canvas, "id")).toBeNull();
  });
});
