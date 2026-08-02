// @vitest-environment node

import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildApp, type BuiltApp } from "./app.js";
import { invokeRpc } from "./rpc.js";
import type { SessionUser } from "./types.js";

let built: BuiltApp;
let workDir: string;

function teacher(id: string, roles: string[]) {
  return {
    id,
    email: `${id}@example.com`,
    name: id,
    avatar: id.slice(0, 1),
    schoolId: "school-1",
    subject: "数学",
    status: "active",
    role: "teacher",
    roles,
    subjectGroupIds: [],
    prepGroupIds: [],
    affiliations: [{
      id: `aff-${id}`,
      teacherId: id,
      schoolId: "school-1",
      schoolName: "测试学校",
      subject: "数学",
      status: "active",
      role: "teacher",
      roles,
      subjectGroupIds: [],
      prepGroupIds: [],
      isCurrent: true,
      joinedAt: "2025-09-01T00:00:00.000Z",
    }],
    currentAffiliationId: `aff-${id}`,
    createdAt: "2025-09-01T00:00:00.000Z",
  };
}

function session(teacherId: string): SessionUser {
  return {
    userId: `user-${teacherId}`,
    teacherId,
    email: `${teacherId}@example.com`,
    csrfToken: "csrf",
    expiresAt: "2099-01-01T00:00:00.000Z",
  };
}

beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), "inteschool-roster-permission-"));
  const seedPath = join(workDir, "seed.json");
  await writeFile(seedPath, JSON.stringify({
    currentTeacherId: null,
    schools: [{ id: "school-1", name: "测试学校", code: "TEST" }],
    teachers: [
      teacher("ordinary", []),
      teacher("leader", ["gradeLeader"]),
    ],
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
});

afterEach(async () => {
  await built.app.close();
  await rm(workDir, { recursive: true, force: true });
});

describe("school roster RPC permissions", () => {
  it("denies ordinary teachers and allows grade leaders", async () => {
    await expect(invokeRpc(
      built.store,
      session("ordinary"),
      "class",
      "createSchoolGrade",
      ["school-1", "ordinary", 2028, "高一"],
    )).rejects.toThrow("年级组长、副校长、校长或学校管理员权限");

    await expect(invokeRpc(
      built.store,
      session("leader"),
      "class",
      "createSchoolGrade",
      ["school-1", "leader", 2028, "高一"],
    )).resolves.toMatchObject({
      schoolId: "school-1",
      name: "2028届高一",
      grade: "高一",
    });
  });
});
