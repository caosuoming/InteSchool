// @vitest-environment node

import { describe, expect, it } from "vitest";
import { createAsyncLimiter } from "./async-limiter.js";

function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("async limiter", () => {
  it("queues work above the configured concurrency", async () => {
    const limit = createAsyncLimiter(2);
    let active = 0;
    let peak = 0;
    const release: Array<() => void> = [];

    const jobs = Array.from({ length: 5 }, (_, index) => limit(async () => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise<void>((resolve) => release.push(resolve));
      active -= 1;
      return index;
    }));

    await tick();
    expect(active).toBe(2);
    expect(release).toHaveLength(2);

    while (release.length > 0 || active > 0) {
      release.splice(0).forEach((resolve) => resolve());
      await tick();
    }

    await expect(Promise.all(jobs)).resolves.toEqual([0, 1, 2, 3, 4]);
    expect(peak).toBe(2);
  });

  it("rejects invalid limits", () => {
    expect(() => createAsyncLimiter(0)).toThrow("positive integer");
  });
});
