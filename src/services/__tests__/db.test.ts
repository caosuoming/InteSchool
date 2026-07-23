import { beforeEach, describe, expect, it, vi } from "vitest";
import { computeDuplicateHash, db } from "@/services/db";

describe("mock database", () => {
  beforeEach(() => {
    db.reset();
  });

  it("normalizes semantically equivalent question text", () => {
    expect(computeDuplicateHash("若 x > 0，求 x。", "1", ["A. 1", "B. 2"]))
      .toBe(computeDuplicateHash("若x>0求x", "1", ["A.1", "B.2"]));
  });

  it("restores a fully migrated schema when reset", () => {
    const snapshot = db.snapshot();

    expect(snapshot.questions.every((question) => question.duplicateHash)).toBe(true);
    expect(snapshot.questions.every((question) => Array.isArray(question.hiddenByExamIds))).toBe(true);
    expect(snapshot.students.every((student) => student.status)).toBe(true);
    expect(snapshot.schoolBackups.length).toBeGreaterThan(0);
  });

  it("returns detached snapshots", () => {
    const snapshot = db.snapshot();
    snapshot.schools[0].name = "mutated";

    expect(db.read("schools")[0].name).not.toBe("mutated");
  });

  it("migrates an older stored database without replacing user data", async () => {
    const snapshot = db.snapshot();
    snapshot.schools[0].name = "用户修改后的学校名称";
    localStorage.setItem("zhiti:db", JSON.stringify(snapshot));
    localStorage.setItem("zhiti:db-version", JSON.stringify("older-version"));

    vi.resetModules();
    const { db: reloadedDb } = await import("@/services/db");

    expect(reloadedDb.read("schools")[0].name).toBe("用户修改后的学校名称");
  });
});
