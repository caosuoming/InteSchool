import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearResourceCache, readResourceCache, resourceCacheKey, writeResourceCache } from "./resource-cache";

const scope = { teacherId: "teacher-a", schoolId: "school-a", subject: "数学" };

describe("resource cache", () => {
  beforeEach(() => {
    vi.useRealTimers();
    clearResourceCache();
  });

  afterEach(() => vi.useRealTimers());

  it("restores a cached page and separates identities, subjects, filters and pages", () => {
    const key = resourceCacheKey("question", scope, { page: 1, keyword: "函数" });
    writeResourceCache(key, { items: [{ id: "q1" }], total: 1 });

    expect(readResourceCache(key)).toEqual({ items: [{ id: "q1" }], total: 1 });
    expect(readResourceCache(resourceCacheKey("question", { ...scope, teacherId: "teacher-b" }, { page: 1, keyword: "函数" }))).toBeNull();
    expect(readResourceCache(resourceCacheKey("question", { ...scope, subject: "语文" }, { page: 1, keyword: "函数" }))).toBeNull();
    expect(readResourceCache(resourceCacheKey("question", scope, { page: 2, keyword: "函数" }))).toBeNull();
    expect(readResourceCache(resourceCacheKey("question", scope, { page: 1, keyword: "几何" }))).toBeNull();
  });

  it("expires old entries and rejects corrupt storage", () => {
    const key = resourceCacheKey("lecture", scope, {});
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-01T00:00:00Z"));
    writeResourceCache(key, ["first"]);
    vi.setSystemTime(new Date("2026-10-03T00:00:00Z"));
    expect(readResourceCache(key)).toBeNull();
    localStorage.setItem(key, "broken-json");
    expect(readResourceCache(key)).toBeNull();
    expect(localStorage.getItem(key)).toBeNull();
  });

  it("evicts older entries and ignores oversized pages", () => {
    for (let page = 1; page <= 30; page++) {
      writeResourceCache(resourceCacheKey("question", scope, { page }), { page });
    }
    const remaining = Array.from({ length: 30 }, (_, i) => readResourceCache(resourceCacheKey("question", scope, { page: i + 1 })))
      .filter((item) => item !== null);
    expect(remaining).toHaveLength(24);
    const hugeKey = resourceCacheKey("question", scope, { page: "huge" });
    writeResourceCache(hugeKey, "x".repeat(1024 * 1024));
    expect(readResourceCache(hugeKey)).toBeNull();
  });

  it("invalidates only the specified resource and supports clearing on logout", () => {
    const question = resourceCacheKey("question", scope, {});
    const paper = resourceCacheKey("examPaper", scope, {});
    writeResourceCache(question, ["q1"]);
    writeResourceCache(paper, ["p1"]);
    clearResourceCache("question");
    expect(readResourceCache(question)).toBeNull();
    expect(readResourceCache(paper)).toEqual(["p1"]);
    clearResourceCache();
    expect(readResourceCache(paper)).toBeNull();
  });
});
