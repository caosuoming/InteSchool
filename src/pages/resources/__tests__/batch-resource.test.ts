import { describe, expect, it } from "vitest";
import {
  appendUniqueIds,
  batchResourceKey,
  parseBatchResourceKey,
} from "@/pages/resources/batch-resource";

describe("batch resource helpers", () => {
  it("round-trips resource selection keys", () => {
    const key = batchResourceKey("examPaper", "paper:with-colon");

    expect(parseBatchResourceKey(key)).toEqual({
      resourceType: "examPaper",
      resourceId: "paper:with-colon",
    });
  });

  it("appends directory ids without removing or duplicating existing values", () => {
    expect(appendUniqueIds(["chapter-1", "chapter-2"], ["chapter-2", "chapter-3"]))
      .toEqual(["chapter-1", "chapter-2", "chapter-3"]);
  });
});
