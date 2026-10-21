import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { settingsService } from "@/services/settings";
import { useQuestionMetadataOptions } from "./useQuestionMetadataOptions";

vi.mock("@/services/settings", () => ({
  settingsService: { listSettings: vi.fn() },
}));

describe("useQuestionMetadataOptions", () => {
  beforeEach(() => {
    vi.mocked(settingsService.listSettings).mockReset();
    vi.mocked(settingsService.listSettings).mockImplementation(async (_schoolId, type) => {
      if (type !== "category") return [];
      return [
        { id: "classic", schoolId: "school-1", type: "category", name: "典型题", value: "classic", enabled: true, sortOrder: 1 },
        { id: "multi-sol", schoolId: "school-1", type: "category", name: "一题多解", value: "multi-solution", enabled: true, sortOrder: 2 },
        { id: "multi-part", schoolId: "school-1", type: "category", name: "一题多问", value: "multi-part", enabled: true, sortOrder: 3 },
      ] as Awaited<ReturnType<typeof settingsService.listSettings>>;
    });
  });

  it("shows a single checkbox per auto category and includes legacy values in filtering", async () => {
    const { result } = renderHook(() => useQuestionMetadataOptions("school-1"));
    await waitFor(() => expect(result.current.ready).toBe(true));

    expect(result.current.categoryOptions.map(({ label }) => label))
      .toEqual(["典型题", "一题多解", "一题多问"]);
    expect(result.current.expandCategoryFilter(["一题多解", "一题多问"]))
      .toEqual(["multi-solution", "一题多解", "multi-part", "一题多问"]);
    expect(result.current.getCategoryLabel("multi-solution")).toBe("一题多解");
    expect(result.current.normalizeCategory("multi-part")).toBe("一题多问");
  });
});
