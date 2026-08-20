import { afterEach, describe, expect, it } from "vitest";
import { applyAppearanceMode, applyUiScale } from "@/stores/settings";

describe("display settings", () => {
  afterEach(() => {
    document.documentElement.removeAttribute("data-appearance");
    document.documentElement.style.removeProperty("color-scheme");
    document.documentElement.style.removeProperty("font-size");
  });

  it("applies the selected font scale to the root element", () => {
    applyUiScale("senior");
    expect(document.documentElement.style.fontSize).toBe("18px");
  });

  it("applies dark appearance and native dark controls", () => {
    applyAppearanceMode("dark");
    expect(document.documentElement.dataset.appearance).toBe("dark");
    expect(document.documentElement.style.colorScheme).toBe("dark");
  });

  it("uses light native controls for eye-care appearance", () => {
    applyAppearanceMode("eye-care");
    expect(document.documentElement.dataset.appearance).toBe("eye-care");
    expect(document.documentElement.style.colorScheme).toBe("light");
  });
});
