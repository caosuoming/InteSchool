// @vitest-environment node

import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { buildApp, type BuiltApp } from "./app.js";

let built: BuiltApp | null = null;
let workDir = "";

afterEach(async () => {
  if (built) await built.app.close();
  if (workDir) await rm(workDir, { recursive: true, force: true });
  built = null;
  workDir = "";
});

describe("school roster schema migration", () => {
  it("creates grade records and promotes the requested account at Qianhuang", async () => {
    workDir = await mkdtemp(join(tmpdir(), "inteschool-roster-migration-"));
    const seedPath = join(workDir, "seed.json");
    await writeFile(seedPath, JSON.stringify({
      currentTeacherId: null,
      schools: [
        { id: "school-old", name: "原学校", code: "OLD" },
        { id: "school-qh", name: "江苏省前黄高级中学", code: "QH" },
      ],
      teachers: [{
        id: "teacher-target",
        email: "104848931@qq.com",
        name: "目标管理员",
        avatar: "管",
        schoolId: "school-old",
        subject: "数学",
        status: "active",
        role: "teacher",
        roles: [],
        subjectGroupIds: [],
        prepGroupIds: [],
        affiliations: [{
          id: "aff-old",
          teacherId: "teacher-target",
          schoolId: "school-old",
          schoolName: "原学校",
          subject: "数学",
          status: "active",
          role: "teacher",
          roles: [],
          subjectGroupIds: [],
          prepGroupIds: [],
          isCurrent: true,
          joinedAt: "2025-09-01T00:00:00.000Z",
        }],
        currentAffiliationId: "aff-old",
        createdAt: "2025-09-01T00:00:00.000Z",
      }],
      schoolClasses: [{
        id: "class-old",
        type: "school",
        schoolId: "school-qh",
        name: "高二(1)班",
        grade: "高二",
        gradeYear: 2024,
        studentCount: 0,
        status: "active",
        createdBy: "teacher-target",
        createdAt: "2025-09-01T00:00:00.000Z",
      }],
    }), "utf8");

    built = await buildApp({
      databasePath: join(workDir, "inteschool.sqlite"),
      uploadsDir: join(workDir, "uploads"),
      seedStatePath: seedPath,
      seedDemoData: true,
      enableDemoAccount: false,
      serveStatic: false,
      logger: false,
    });
    await built.app.ready();

    const state = built.store.loadState();
    const promoted = state.teachers.find((item) => item.id === "teacher-target");
    const currentAffiliation = promoted?.affiliations.find(
      (item) => item.id === promoted.currentAffiliationId,
    );
    const migratedClass = (state.schoolClasses as Array<Record<string, unknown>>)
      .find((item) => item.id === "class-old");
    const migratedGrade = (state.schoolGrades as Array<Record<string, unknown>>)
      .find((item) => item.id === migratedClass?.gradeId);

    expect(promoted).toMatchObject({
      email: "104848931@qq.com",
      role: "platform_admin",
      schoolId: "school-qh",
      roles: expect.arrayContaining(["principal"]),
    });
    expect(currentAffiliation).toMatchObject({
      schoolId: "school-qh",
      schoolName: "江苏省前黄高级中学",
      role: "platform_admin",
      status: "active",
      isCurrent: true,
      roles: expect.arrayContaining(["principal"]),
    });
    expect(migratedClass).toMatchObject({ gradYear: 2027, gradeId: expect.any(String) });
    expect(migratedGrade).toMatchObject({
      schoolId: "school-qh",
      name: "2027届高二",
      grade: "高二",
      gradYear: 2027,
    });
  });
});
