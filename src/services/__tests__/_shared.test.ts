import { describe, expect, it, vi } from "vitest";
import { formatDate, maybeThrowError, storage, timeAgo } from "@/services/_shared";

describe("shared service helpers", () => {
  it("does not inject random failures unless explicitly requested", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);

    expect(() => maybeThrowError()).not.toThrow();
    expect(() => maybeThrowError(0.5)).toThrow("网络异常，请稍后重试");
  });

  it("isolates and clears application storage", () => {
    localStorage.setItem("unrelated", "keep");
    storage.set("sample", { value: 1 });

    expect(storage.get("sample", null)).toEqual({ value: 1 });
    storage.clearAll();
    expect(storage.get("sample", null)).toBeNull();
    expect(localStorage.getItem("unrelated")).toBe("keep");
  });

  it("falls back safely for malformed JSON", () => {
    localStorage.setItem("zhiti:broken", "{");
    expect(storage.get("broken", { safe: true })).toEqual({ safe: true });
  });

  it("formats absolute and relative dates", () => {
    vi.useFakeTimers();
    const now = new Date(2026, 6, 23, 12, 0);
    const previousDay = new Date(2026, 6, 22, 8, 5);
    const thirtyMinutesAgo = new Date(2026, 6, 23, 11, 30);
    vi.setSystemTime(now);

    expect(formatDate(previousDay.toISOString(), true)).toBe("2026-07-22 08:05");
    expect(timeAgo(thirtyMinutesAgo.toISOString())).toBe("30 分钟前");

    vi.useRealTimers();
  });
});
