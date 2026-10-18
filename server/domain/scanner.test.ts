import { describe, expect, it } from "vitest";
import { runWithState } from "../runtime-db.js";
import type { AppState } from "../types.js";
import { isPublicRpcCall } from "../rpc.js";
import { scannerService } from "./scanner.js";

const sheet = (id: string, schoolId: string, published = true) => ({
  id, title: `资源 ${id}`, grade: "高一", schoolYear: "2026-2027", schoolId,
  teacherId: "secret-owner", questions: [{ answer: "secret" }],
  hasAnswerSheet: true, answerSheetPublishedAt: published ? "2026-10-18T00:00:00Z" : undefined,
});

describe("scanner device resource list", () => {
  it("exposes only published sheet metadata from the selected school", async () => {
    const state: AppState = {
      teachers: [], currentTeacherId: null,
      schools: [{ id: "school-1" }, { id: "school-2" }],
      examPapers: [sheet("a", "school-1"), sheet("draft", "school-1", false), sheet("foreign", "school-2")],
      lectures: [{ ...sheet("b", "school-1"), answerSheetPublishedAt: "2026-10-19T00:00:00Z" }],
    };
    await runWithState(state, async () => {
      const items = await scannerService.listPublishedAnswerSheets("school-1");
      expect(items).toEqual([
        { id: "b", type: "lecture", title: "资源 b", grade: "高一", schoolYear: "2026-2027", publishedAt: "2026-10-19T00:00:00Z" },
        { id: "a", type: "paper", title: "资源 a", grade: "高一", schoolYear: "2026-2027", publishedAt: "2026-10-18T00:00:00Z" },
      ]);
      expect(JSON.stringify(items)).not.toContain("secret");
      await expect(scannerService.listPublishedAnswerSheets("missing")).rejects.toThrow("学校不存在");
      await expect(scannerService.listPublishedAnswerSheets("")).rejects.toThrow("请选择有效的学校");
    });
  });

  it("only exposes the scanner read endpoint publicly", () => {
    expect(isPublicRpcCall("scanner", "listPublishedAnswerSheets")).toBe(true);
    expect(isPublicRpcCall("scanner", "scan")).toBe(false);
  });
});
