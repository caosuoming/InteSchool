import { describe, expect, it } from "vitest";
import { needsMultipleChoiceMarker } from "@/lib/multiple-choice-marker";

describe("needsMultipleChoiceMarker", () => {
  it("marks only multiple-choice stems that lack a leading marker", () => {
    expect(needsMultipleChoiceMarker(true, "下列结论正确的是？")).toBe(true);
    expect(needsMultipleChoiceMarker(false, "下列结论正确的是？")).toBe(false);
    expect(needsMultipleChoiceMarker(true, "（多选）下列结论正确的是？")).toBe(false);
    expect(needsMultipleChoiceMarker(true, "<p>（多选）下列结论正确的是？</p>")).toBe(false);
    expect(needsMultipleChoiceMarker(true, "&nbsp;1.（多选）下列结论正确的是？")).toBe(false);
    expect(needsMultipleChoiceMarker(true, "（1）（多选）下列结论正确的是？")).toBe(false);
    expect(needsMultipleChoiceMarker(true, "下列结论正确的是？（多选）")).toBe(true);
  });
});
