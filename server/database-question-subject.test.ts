// @vitest-environment node

import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";
import { DatabaseStore } from "./database.js";
import type { AppState, TeacherRecord } from "./types.js";

describe("subject-filtered indexed question pages", () => {
  it("preserves explicit subjects and legacy affiliation inheritance", async () => {
    const sql = new PGlite();
    try {
      await sql.exec(`
        CREATE TABLE app_records (
          collection text NOT NULL,
          id text NOT NULL,
          school_id text,
          owner_id text,
          data_json jsonb NOT NULL,
          created_at timestamptz NOT NULL
        )
      `);
      const record = async (id: string, schoolId: string | null, subject?: string) => {
        const data = { id, teacherId: "teacher-1", schoolId, ...(subject ? { subject } : {}) };
        await sql.query(
          "INSERT INTO app_records VALUES ('questions', $1, $2, $3, $4::jsonb, $5)",
          [id, schoolId, "teacher-1", JSON.stringify(data), "2026-01-01T00:00:00Z"],
        );
      };
      await record("math-explicit", "school-a", "数学");
      await record("physics-explicit", "school-a", "物理");
      await record("math-legacy", "school-a");
      await record("history-legacy", "school-b");
      await record("unknown-legacy", "school-old");
      await record("empty-subject", "school-a", " ");
      const owner = {
        id: "teacher-1",
        subject: "物理",
        schoolId: "school-a",
        currentAffiliationId: "aff-a",
        affiliations: [
          { id: "aff-a", schoolId: "school-a", subject: "物理", subjects: ["数学", "物理"] },
          { id: "aff-b", schoolId: "school-b", subject: "历史", subjects: ["历史"] },
        ],
      } as unknown as TeacherRecord;
      const store = Object.assign(Object.create(DatabaseStore.prototype), {
        sql,
        stateCache: { teachers: [owner] } as AppState,
      }) as DatabaseStore;
      const getPage = (subject: string) => store.searchQuestionPage(
        { teacherId: owner.id, subject }, 1, 20, "newest", owner.id,
      );

      const crossSchool = await store.searchQuestionPage({
        teacherId: owner.id, subject: "物理", ownerSubjectSchoolId: "school-a",
      }, 1, 20, "newest", owner.id);
      expect(crossSchool.items.map((item) => item.id).sort()).toEqual([
        "history-legacy", "physics-explicit", "unknown-legacy",
      ]);
      const math = await getPage("数学");
      expect(math.total).toBe(4);
      expect(math.items.map((item) => item.id).sort()).toEqual([
        "empty-subject", "math-explicit", "math-legacy", "unknown-legacy",
      ]);
      const physics = await getPage("物理");
      expect(physics.items.map((item) => item.id)).toEqual(["physics-explicit"]);
      const history = await getPage("历史");
      expect(history.items.map((item) => item.id)).toEqual(["history-legacy"]);
    } finally {
      await sql.close();
    }
  });
});
