// @vitest-environment node
import { mkdtemp, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp, type BuiltApp } from "../app.js";
import { withSerializedState } from "../rpc.js";

let built: BuiltApp;
let dir: string;
let cookie: string;
let csrf: string;
const schoolId = "sch-1";
const sheetId = "scanner-test-paper";
const qr = `intes://answer-sheet/v1/exam-paper/${sheetId}`;
const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);

function payload(bytes: Buffer) {
  const boundary = "----inteschool-scanner-test";
  return {
    contentType: `multipart/form-data; boundary=${boundary}`,
    body: Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="scan.png"\r\nContent-Type: image/png\r\n\r\n`),
      bytes,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]),
  };
}

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "inteschool-scanner-api-"));
  built = await buildApp({
    databasePath: join(dir, "db"), legacyDatabasePath: join(dir, "none.sqlite"),
    uploadsDir: join(dir, "uploads"), seedStatePath: resolve("server/seed-state.json"),
    serveStatic: false, logger: false, enableDemoAccount: true, demoPassword: "demo123456", cookieSecure: false,
  });
  const login = await built.app.inject({ method: "POST", url: "/api/auth/login", payload: { email: "li.zhang@bj04.edu.cn", password: "demo123456" } });
  expect(login.statusCode).toBe(200);
  cookie = String(login.headers["set-cookie"]).split(";")[0];
  csrf = login.json().csrfToken;
  await withSerializedState(built.store, (state) => {
    (state.examPapers as Array<Record<string, unknown>>).push({
      id: sheetId, schoolId, teacherId: "tch-1", title: "测试答题卡", grade: "高一",
      schoolYear: "2026-2027", hasAnswerSheet: true, answerSheetPublishedAt: new Date().toISOString(),
    });
  });
}, 60_000);
afterAll(async () => { if (built) await built.app.close(); if (dir) await rm(dir, { recursive: true, force: true }); });

describe("scanned page persistence and permissions", () => {
  it("requires teacher authentication and rejects cross-school/incorrect QR uploads", async () => {
    const data = payload(png);
    const query = new URLSearchParams({ schoolId, sheetId, sheetType: "paper", qrPayload: qr });
    const unauth = await built.app.inject({ method: "POST", url: `/api/scanner/pages?${query}`, headers: { "content-type": data.contentType }, payload: data.body });
    expect(unauth.statusCode).toBe(401);
    const foreign = await built.app.inject({ method: "POST", url: `/api/scanner/pages?${new URLSearchParams({ schoolId: "sch-2", sheetId, sheetType: "paper" })}`, headers: { cookie, "x-inteschool-csrf": csrf, "content-type": data.contentType }, payload: data.body });
    expect(foreign.statusCode).toBe(403);
    const mismatch = await built.app.inject({ method: "POST", url: `/api/scanner/pages?${new URLSearchParams({ schoolId, sheetId, sheetType: "paper", qrPayload: "intes://wrong" })}`, headers: { cookie, "x-inteschool-csrf": csrf, "content-type": data.contentType }, payload: data.body });
    expect(mismatch.statusCode).toBe(400);
  });

  it("stores verified and unresolved scans and permits manual student association", async () => {
    const data = payload(png);
    const upload = async (qrPayload?: string) => built.app.inject({ method: "POST", url: `/api/scanner/pages?${new URLSearchParams({ schoolId, sheetId, sheetType: "paper", ...(qrPayload ? { qrPayload } : {}) })}`, headers: { cookie, "x-inteschool-csrf": csrf, "content-type": data.contentType }, payload: data.body });
    const verified = await upload(qr);
    expect(verified.statusCode).toBe(200);
    expect(verified.json().verified).toBe(true);
    const exceptional = await upload();
    expect(exceptional.statusCode).toBe(200);
    expect(exceptional.json()).toMatchObject({ verified: false, status: "pending", studentId: null });
    const records = await built.app.inject({ method: "GET", url: `/api/scanner/pages?schoolId=${schoolId}`, headers: { cookie } });
    expect(records.statusCode).toBe(200);
    expect(records.json()).toHaveLength(2);
    const students = built.store.loadState().students as Array<{ id: string; schoolId: string }>;
    const student = students.find((item) => item.schoolId === schoolId)!;
    const change = await built.app.inject({ method: "PATCH", url: `/api/scanner/pages/${exceptional.json().id}`, headers: { cookie, "x-inteschool-csrf": csrf }, payload: { studentId: student.id } });
    expect(change.statusCode).toBe(200);
    expect(change.json()).toMatchObject({ studentId: student.id, status: "assigned" });
    const image = await built.app.inject({ method: "GET", url: `/api/files/${verified.json().fileId}`, headers: { cookie } });
    expect(image.statusCode).toBe(200);
    expect(image.rawPayload.subarray(0, 8)).toEqual(png.subarray(0, 8));
  });

  it("rejects obsolete QR codes after a sheet revision is replaced", async () => {
    const data = payload(png);
    const upload = async (qrPayload: string) => built.app.inject({
      method: "POST", url: `/api/scanner/pages?${new URLSearchParams({ schoolId, sheetId, sheetType: "paper", qrPayload })}`,
      headers: { cookie, "x-inteschool-csrf": csrf, "content-type": data.contentType }, payload: data.body,
    });
    await withSerializedState(built.store, (state) => {
      const sheet = (state.examPapers as Array<Record<string, unknown>>).find((item) => item.id === sheetId)!;
      sheet.answerSheetRevisionId = "revision-2";
    });
    const old = await upload(qr);
    expect(old.statusCode).toBe(400);
    const currentQr = `intes://answer-sheet/v2/exam-paper/${sheetId}/revision-2`;
    const current = await upload(currentQr);
    expect(current.statusCode).toBe(200);
    expect(current.json().verified).toBe(true);
    await withSerializedState(built.store, (state) => {
      const sheet = (state.examPapers as Array<Record<string, unknown>>).find((item) => item.id === sheetId)!;
      sheet.answerSheetRevisionId = "revision-3";
    });
    expect((await upload(currentQr)).statusCode).toBe(400);
    expect((await upload(`intes://answer-sheet/v2/exam-paper/${sheetId}/revision-3`)).statusCode).toBe(200);
  });

});
