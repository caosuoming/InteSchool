import { afterEach, describe, expect, it, vi } from "vitest";
import { openPage } from "./navigation";

describe("openPage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("opens app pages in a separate tab without opener access", () => {
    const opened = {} as Window;
    const spy = vi.spyOn(window, "open").mockReturnValue(opened);

    expect(openPage("/my-resources")).toBe(opened);
    expect(spy).toHaveBeenCalledWith(
      "/my-resources",
      "_blank",
      "noopener,noreferrer",
    );
  });
});
