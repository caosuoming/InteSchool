import { describe, expect, it, vi } from "vitest";
import { recoverFromPreloadError } from "./preload-recovery";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) || null,
    setItem: (key: string, value: string) => values.set(key, value),
  };
}

describe("dynamic import recovery", () => {
  it("reloads once when a deployed chunk is no longer available", () => {
    const event = new Event("vite:preloadError", { cancelable: true });
    const storage = memoryStorage();
    const reload = vi.fn();

    expect(recoverFromPreloadError(event, storage, reload, 100_000)).toBe(true);
    expect(event.defaultPrevented).toBe(true);
    expect(reload).toHaveBeenCalledOnce();

    const repeated = new Event("vite:preloadError", { cancelable: true });
    expect(recoverFromPreloadError(repeated, storage, reload, 105_000)).toBe(false);
    expect(repeated.defaultPrevented).toBe(true);
    expect(reload).toHaveBeenCalledOnce();
  });

  it("allows another recovery after the cooldown", () => {
    const storage = memoryStorage();
    const reload = vi.fn();

    recoverFromPreloadError(new Event("vite:preloadError", { cancelable: true }), storage, reload, 100_000);
    expect(recoverFromPreloadError(
      new Event("vite:preloadError", { cancelable: true }),
      storage,
      reload,
      131_000,
    )).toBe(true);
    expect(reload).toHaveBeenCalledTimes(2);
  });
});
