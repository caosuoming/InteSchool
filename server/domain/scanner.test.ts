import { describe, expect, it } from "vitest";
import { runWithState } from "../runtime-db.js";
import type { AppState } from "../types.js";
import { isPublicRpcCall } from "../rpc.js";
import { createThirdPartyCard, scannerService } from "./scanner.js";
import type { TeacherRecord } from "../types.js";

const sheet = (id: string, schoolId: string, published = true) => ({
  id, title: `资源 ${id}`, grade: "高一", schoolYear: "2026-2027", schoolId,
  teacherId: "secret-owner", questions: [{ answer: "secret" }],
  hasAnswerSheet: true, answerSheetPublishedAt: published ? "2026-10-18T00:00:00Z" : undefined,
});

describe("scanner device resource list", () => {
  it("exposes only published sheet metadata from the selected school", async () => {
    const state: AppState = {
      teachers: [{ id: "secret-owner", schoolId: "school-1", subject: "数学" } as TeacherRecord], currentTeacherId: null,
      schoolClasses: [{ id: "class-1", schoolId: "school-1", grade: "高一", name: "一班" }],
      schools: [{ id: "school-1" }, { id: "school-2" }],
      examPapers: [{ ...sheet("a", "school-1"), classIds: ["class-1"] }, sheet("draft", "school-1", false), sheet("foreign", "school-2")],
      lectures: [{ ...sheet("b", "school-1"), answerSheetPublishedAt: "2026-10-19T00:00:00Z" }],
    };
    await runWithState(state, async () => {
      const items = await scannerService.listPublishedAnswerSheets("school-1");
      expect(items).toEqual([
        { id: "b", type: "lecture", title: "资源 b", grade: "高一", schoolYear: "2026-2027", publishedAt: "2026-10-19T00:00:00Z", subject: "数学", classes: [] },
        { id: "a", type: "paper", title: "资源 a", grade: "高一", schoolYear: "2026-2027", publishedAt: "2026-10-18T00:00:00Z", subject: "数学", classes: [{ id: "class-1", name: "高一 · 一班" }] },
      ]);
      expect(JSON.stringify(items)).not.toContain("secret");
      await expect(scannerService.listPublishedAnswerSheets("missing")).rejects.toThrow("学校不存在");
      await expect(scannerService.listPublishedAnswerSheets("")).rejects.toThrow("请选择有效的学校");
    });
  });

  it("persists annotations and rejects cross-school and invalid paper associations", async () => {
    const owner = { id: "teacher-1", schoolId: "school-1" } as TeacherRecord;
    const other = { id: "teacher-2", schoolId: "school-2" } as TeacherRecord;
    const state: AppState = {
      teachers: [owner, other], currentTeacherId: null, schools: [{ id: "school-1" }],
      examPapers: [{ id: "paper-1", teacherId: "teacher-1", schoolId: "school-1" }, { id: "paper-2", teacherId: "teacher-2", schoolId: "school-2" }],
      thirdPartyCards: [],
    };
    await runWithState(state, async () => {
      const card = await createThirdPartyCard({ fileId: "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa", fileName: "scan.png" }, owner);
      expect(await scannerService.listThirdPartyCards("school-1", owner)).toHaveLength(1);
      await expect(scannerService.listThirdPartyCards("school-1", other)).rejects.toThrow("无权");
      await expect(scannerService.updateThirdPartyCard(card.id, { fileName: "forged" }, other)).rejects.toThrow("无权");
      await expect(scannerService.updateThirdPartyCard(card.id, { paperId: "paper-2" }, owner)).rejects.toThrow("无权");
      await expect(scannerService.updateThirdPartyCard(card.id, { regions: [{ id: "r1", type: "choice", x: 0.9, y: 0, width: 0.2, height: 0.5 }] }, owner)).rejects.toThrow("边界");
      const updated = await scannerService.updateThirdPartyCard(card.id, {
        paperId: "paper-1", regions: [{ id: "r1", type: "choice", x: 0.1, y: 0.2, width: 0.3, height: 0.4 }],
      }, owner);
      expect(updated.paperId).toBe("paper-1");
      expect((await scannerService.listThirdPartyCards("school-1", owner))[0].regions).toEqual(updated.regions);
    });
  });

  it("only exposes the scanner read endpoint publicly", () => {
    expect(isPublicRpcCall("scanner", "listPublishedAnswerSheets")).toBe(true);
    expect(isPublicRpcCall("scanner", "scan")).toBe(false);
    expect(isPublicRpcCall("scanner", "listThirdPartyCards")).toBe(false);
    expect(isPublicRpcCall("scanner", "updateThirdPartyCard")).toBe(false);
  });
});
