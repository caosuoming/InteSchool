// @vitest-environment node

import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp, type BuiltApp } from "../app.js";
import { fetchPublicText } from "../lib/safe-fetch.js";

interface SessionContext {
  cookie: string;
  csrfToken: string;
  teacher: Record<string, unknown>;
}

let built: BuiltApp;
let workDir: string;

async function createTestApp(databasePath?: string): Promise<BuiltApp> {
  return buildApp({
    databasePath: databasePath || join(workDir, "inteschool.sqlite"),
    uploadsDir: join(workDir, "uploads"),
    seedStatePath: resolve("server/seed-state.json"),
    serveStatic: false,
    logger: false,
    enableDemoAccount: true,
    demoPassword: "demo123456",
    cookieSecure: false,
  });
}

function sessionCookie(appResponse: { headers: Record<string, unknown> }): string {
  const header = appResponse.headers["set-cookie"];
  const value = Array.isArray(header) ? header[0] : String(header || "");
  return value.split(";")[0];
}

async function login(
  app: FastifyInstance,
  email = "li.zhang@bj04.edu.cn",
  password = "demo123456",
): Promise<SessionContext> {
  const response = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { email, password },
  });
  expect(response.statusCode).toBe(200);
  const body = response.json<{ teacher: Record<string, unknown>; csrfToken: string }>();
  return {
    cookie: sessionCookie(response),
    csrfToken: body.csrfToken,
    teacher: body.teacher,
  };
}

async function register(
  app: FastifyInstance,
  email: string,
  password = "StrongPass123",
  name = "测试教师",
): Promise<SessionContext> {
  const response = await app.inject({
    method: "POST",
    url: "/api/auth/register",
    payload: { email, password, name },
  });
  expect(response.statusCode).toBe(200);
  const body = response.json<{ teacher: Record<string, unknown>; csrfToken: string }>();
  return {
    cookie: sessionCookie(response),
    csrfToken: body.csrfToken,
    teacher: body.teacher,
  };
}

function multipartPayload(
  fileName: string,
  content: string,
  mimeType = "text/plain",
): { body: Buffer; contentType: string } {
  const boundary = `----inteschool-${Date.now()}`;
  const body = Buffer.from([
    `--${boundary}\r\n`,
    `Content-Disposition: form-data; name="file"; filename="${fileName}"\r\n`,
    `Content-Type: ${mimeType}\r\n\r\n`,
    content,
    `\r\n--${boundary}--\r\n`,
  ].join(""));
  return { body, contentType: `multipart/form-data; boundary=${boundary}` };
}

beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), "inteschool-test-"));
  built = await createTestApp();
  await built.app.ready();
});

afterEach(async () => {
  await built.app.close();
  await rm(workDir, { recursive: true, force: true });
});

describe("production backend", () => {
  it("creates a one-time bootstrap administrator without enabling the demo account", async () => {
    await built.app.close();
    built = await buildApp({
      databasePath: join(workDir, "bootstrap.sqlite"),
      uploadsDir: join(workDir, "bootstrap-uploads"),
      seedStatePath: resolve("server/seed-state.json"),
      serveStatic: false,
      logger: false,
      enableDemoAccount: false,
      seedDemoData: false,
      bootstrapAdminEmail: "admin@example.com",
      bootstrapAdminPassword: "BootstrapPass123",
      bootstrapAdminName: "首位管理员",
      bootstrapSchoolId: "school-prod",
      bootstrapSchoolName: "生产测试学校",
      bootstrapSchoolCode: "PROD",
      bootstrapSchoolCity: "南京",
    });
    await built.app.ready();

    const admin = await login(built.app, "admin@example.com", "BootstrapPass123");
    expect(admin.teacher).toMatchObject({
      email: "admin@example.com",
      role: "platform_admin",
      schoolId: "school-prod",
    });
    expect(built.store.sqlite.prepare("SELECT COUNT(*) AS count FROM users WHERE email = ?")
      .get("admin@example.com")).toEqual({ count: 1 });
    expect(built.store.loadState().schools).toEqual([
      expect.objectContaining({ id: "school-prod", name: "生产测试学校" }),
    ]);
    expect(built.store.loadState().questions).toEqual([]);
  });

  it("serves health checks and maps invalid input to 400", async () => {
    const health = await built.app.inject({ method: "GET", url: "/api/health" });
    expect(health.statusCode).toBe(200);
    expect(health.json()).toEqual({ status: "ok" });

    const anonymous = await built.app.inject({ method: "GET", url: "/api/auth/current" });
    expect(anonymous.statusCode).toBe(200);
    expect(anonymous.json()).toEqual({ teacher: null, csrfToken: null });

    const invalid = await built.app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { email: "broken", password: "short", name: "A" },
    });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json()).toEqual({ error: "请求参数不合法" });
  });

  it("serves readiness, static assets, SPA fallback, and API 404 responses", async () => {
    await built.app.close();
    const distDir = join(workDir, "dist");
    await mkdir(distDir, { recursive: true });
    await writeFile(join(distDir, "index.html"), "<!doctype html><title>InteSchool Test</title>");
    await writeFile(join(distDir, "asset.txt"), "static asset");
    built = await buildApp({
      databasePath: join(workDir, "static.sqlite"),
      uploadsDir: join(workDir, "static-uploads"),
      seedStatePath: resolve("server/seed-state.json"),
      distDir,
      serveStatic: true,
      logger: false,
      enableDemoAccount: true,
      demoPassword: "demo123456",
      cookieSecure: false,
    });
    await built.app.ready();

    const ready = await built.app.inject({ method: "GET", url: "/api/ready" });
    expect(ready.statusCode).toBe(200);
    expect(ready.json()).toEqual({ status: "ready" });

    const asset = await built.app.inject({ method: "GET", url: "/asset.txt" });
    expect(asset.statusCode).toBe(200);
    expect(asset.body).toBe("static asset");

    const fallback = await built.app.inject({ method: "GET", url: "/dashboard/deep-link" });
    expect(fallback.statusCode).toBe(200);
    expect(fallback.headers["content-type"]).toContain("text/html");
    expect(fallback.headers["cache-control"]).toBe("no-store");
    expect(fallback.body).toContain("InteSchool Test");

    const missingApi = await built.app.inject({ method: "GET", url: "/api/missing" });
    expect(missingApi.statusCode).toBe(404);
    expect(missingApi.json()).toEqual({ error: "接口不存在" });
  });

  it("maps duplicate accounts to 409 and invalid credentials to 401", async () => {
    await register(built.app, "duplicate@example.com");
    const duplicate = await built.app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { email: "DUPLICATE@example.com", password: "StrongPass123", name: "重复教师" },
    });
    expect(duplicate.statusCode).toBe(409);
    expect(duplicate.json()).toEqual({ error: "该邮箱已注册" });

    const invalidLogin = await built.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "duplicate@example.com", password: "wrong" },
    });
    expect(invalidLogin.statusCode).toBe(401);
    expect(invalidLogin.json()).toEqual({ error: "邮箱或密码错误" });
  });

  it("does not trust forwarded client IPs unless a proxy is configured", async () => {
    const statuses: number[] = [];
    for (let index = 0; index < 11; index += 1) {
      const response = await built.app.inject({
        method: "POST",
        url: "/api/auth/login",
        headers: { "x-forwarded-for": `198.51.100.${index + 1}` },
        payload: { email: "missing@example.com", password: "incorrect" },
      });
      statuses.push(response.statusCode);
    }
    expect(statuses.slice(0, 10)).toEqual(Array(10).fill(401));
    expect(statuses[10]).toBe(429);
  });

  it("hashes passwords, creates an HttpOnly session, and never returns credentials", async () => {
    const password = "StrongPass123";
    const session = await register(built.app, "new-teacher@example.com", password);
    expect(session.teacher).not.toHaveProperty("password");
    expect(session.teacher).not.toHaveProperty("passwordHash");

    const user = built.store.sqlite.prepare(
      "SELECT password_hash FROM users WHERE email = ?",
    ).get("new-teacher@example.com") as { password_hash: string };
    expect(user.password_hash).toMatch(/^scrypt\$/);
    expect(user.password_hash).not.toContain(password);

    const loginResponse = await built.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "new-teacher@example.com", password },
    });
    const setCookie = String(loginResponse.headers["set-cookie"]);
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=Lax");

    const current = await built.app.inject({
      method: "GET",
      url: "/api/auth/current",
      headers: { cookie: session.cookie },
    });
    expect(current.statusCode).toBe(200);
    expect(JSON.stringify(current.json())).not.toContain(password);
  });

  it("changes passwords, lists teachers, and invalidates the session on logout", async () => {
    const session = await login(built.app);
    const wrongPassword = await built.app.inject({
      method: "POST",
      url: "/api/auth/password",
      headers: {
        cookie: session.cookie,
        "x-inteschool-csrf": session.csrfToken,
      },
      payload: { currentPassword: "incorrect", newPassword: "NewDemoPass123" },
    });
    expect(wrongPassword.statusCode).toBe(400);
    expect(wrongPassword.json()).toEqual({ error: "当前密码错误" });

    const changed = await built.app.inject({
      method: "POST",
      url: "/api/auth/password",
      headers: {
        cookie: session.cookie,
        "x-inteschool-csrf": session.csrfToken,
      },
      payload: { currentPassword: "demo123456", newPassword: "NewDemoPass123" },
    });
    expect(changed.statusCode).toBe(200);

    const teachers = await built.app.inject({
      method: "GET",
      url: "/api/auth/teachers",
      headers: { cookie: session.cookie },
    });
    expect(teachers.statusCode).toBe(200);
    expect(teachers.json<Array<{ schoolId: string }>>()
      .every((teacher) => teacher.schoolId === "sch-1")).toBe(true);

    const logout = await built.app.inject({
      method: "POST",
      url: "/api/auth/logout",
      headers: {
        cookie: session.cookie,
        "x-inteschool-csrf": session.csrfToken,
      },
    });
    expect(logout.statusCode).toBe(200);
    expect(String(logout.headers["set-cookie"])).toContain("inteschool_session=;");

    const current = await built.app.inject({
      method: "GET",
      url: "/api/auth/current",
      headers: { cookie: session.cookie },
    });
    expect(current.json()).toEqual({ teacher: null, csrfToken: null });
    await expect(login(built.app, "li.zhang@bj04.edu.cn", "NewDemoPass123"))
      .resolves.toMatchObject({ teacher: expect.objectContaining({ id: "tch-1" }) });
  });

  it("requires CSRF and prevents teacher identity spoofing", async () => {
    const session = await login(built.app);
    const withoutCsrf = await built.app.inject({
      method: "POST",
      url: "/api/rpc",
      headers: { cookie: session.cookie },
      payload: { service: "question", method: "listQuestions", args: [{}] },
    });
    expect(withoutCsrf.statusCode).toBe(400);

    const list = await built.app.inject({
      method: "POST",
      url: "/api/rpc",
      headers: {
        cookie: session.cookie,
        "x-inteschool-csrf": session.csrfToken,
      },
      payload: { service: "question", method: "listQuestions", args: [{ teacherId: "tch-1" }] },
    });
    expect(list.statusCode).toBe(200);
    expect(list.json<{ result: unknown[] }>().result.length).toBeGreaterThan(0);

    const spoof = await built.app.inject({
      method: "POST",
      url: "/api/rpc",
      headers: {
        cookie: session.cookie,
        "x-inteschool-csrf": session.csrfToken,
      },
      payload: {
        service: "question",
        method: "createQuestion",
        args: ["tch-2", "sch-1", {
          type: "short",
          stem: "越权测试",
          answer: "无",
          analysis: "无",
          chapterIds: [],
          knowledgePointIds: [],
          difficulty: 1,
          recommendation: 1,
        }],
      },
    });
    expect(spoof.statusCode).toBe(403);
    expect(spoof.json()).toEqual({ error: "无权以其他教师身份执行操作" });
  });

  it("does not expose private questions owned by other teachers", async () => {
    const before = built.store.loadState();
    const state = structuredClone(before);
    const questions = state.questions as Array<Record<string, unknown>>;
    const template = questions[0];
    questions.unshift(
      {
        ...template,
        id: "q-private-same-school",
        teacherId: "tch-2",
        schoolId: "sch-1",
        stem: "同校其他教师私有题目",
        isShared: false,
      },
      {
        ...template,
        id: "q-private-other-school",
        teacherId: "tch-3",
        schoolId: "sch-2",
        stem: "其他学校私有题目",
        isShared: false,
      },
      {
        ...template,
        id: "q-shared-other-school",
        teacherId: "tch-3",
        schoolId: "sch-2",
        stem: "其他学校共享题目",
        isShared: true,
      },
    );
    built.store.saveState(before, state);

    const session = await login(built.app);
    const headers = {
      cookie: session.cookie,
      "x-inteschool-csrf": session.csrfToken,
    };
    const list = await built.app.inject({
      method: "POST",
      url: "/api/rpc",
      headers,
      payload: { service: "question", method: "listQuestions", args: [{}] },
    });
    expect(list.statusCode).toBe(200);
    const ids = list.json<{ result: Array<{ id: string }> }>().result.map((item) => item.id);
    expect(ids).not.toContain("q-private-same-school");
    expect(ids).not.toContain("q-private-other-school");
    expect(ids).toContain("q-shared-other-school");

    const privateRead = await built.app.inject({
      method: "POST",
      url: "/api/rpc",
      headers,
      payload: { service: "question", method: "getQuestion", args: ["q-private-same-school"] },
    });
    expect(privateRead.statusCode).toBe(403);
    expect(privateRead.json()).toEqual({ error: "无权访问该资源" });

    const sharedRead = await built.app.inject({
      method: "POST",
      url: "/api/rpc",
      headers,
      payload: { service: "question", method: "getQuestion", args: ["q-shared-other-school"] },
    });
    expect(sharedRead.statusCode).toBe(200);
  });

  it("only allows teachers to share resources they own", async () => {
    const before = built.store.loadState();
    const state = structuredClone(before);
    const questions = state.questions as Array<Record<string, unknown>>;
    questions.unshift({
      ...questions[0],
      id: "q-forged-share-source",
      teacherId: "tch-3",
      schoolId: "sch-2",
      stem: "不可被其他学校教师分享的私有题目",
      isShared: false,
    });
    built.store.saveState(before, state);

    const session = await login(built.app);
    const headers = {
      cookie: session.cookie,
      "x-inteschool-csrf": session.csrfToken,
    };
    const forged = await built.app.inject({
      method: "POST",
      url: "/api/rpc",
      headers,
      payload: {
        service: "share",
        method: "createShare",
        args: [{
          fromTeacherId: "tch-1",
          fromSchoolId: "sch-1",
          toTeacherId: "tch-1",
          toSchoolId: "sch-1",
          scope: "friends",
          resourceType: "question",
          resourceId: "q-forged-share-source",
          resourceTitle: "伪造分享",
        }],
      },
    });
    expect(forged.statusCode).toBe(403);
    expect(forged.json()).toEqual({ error: "无权分享不属于自己的资源" });

    const legitimate = await built.app.inject({
      method: "POST",
      url: "/api/rpc",
      headers,
      payload: {
        service: "share",
        method: "createShare",
        args: [{
          fromTeacherId: "tch-1",
          fromSchoolId: "sch-1",
          toTeacherId: "tch-2",
          toSchoolId: "sch-1",
          scope: "friends",
          resourceType: "question",
          resourceId: "q-4",
          resourceTitle: "合法分享",
        }],
      },
    });
    expect(legitimate.statusCode).toBe(200);
    expect(legitimate.json<{ result: { fromTeacherId: string; fromSchoolId: string } }>().result)
      .toMatchObject({ fromTeacherId: "tch-1", fromSchoolId: "sch-1" });
  });

  it("allows only the intended recipient to accept a share", async () => {
    built.store.createUser("tch-2", "share-recipient@example.com", "RecipientPass123");
    const sender = await login(built.app);
    const created = await built.app.inject({
      method: "POST",
      url: "/api/rpc",
      headers: {
        cookie: sender.cookie,
        "x-inteschool-csrf": sender.csrfToken,
      },
      payload: {
        service: "share",
        method: "createShare",
        args: [{
          fromTeacherId: "tch-1",
          fromSchoolId: "sch-1",
          toTeacherId: "tch-2",
          toSchoolId: "sch-1",
          scope: "friends",
          resourceType: "question",
          resourceId: "q-4",
          resourceTitle: "定向分享",
        }],
      },
    });
    expect(created.statusCode).toBe(200);
    const shareId = created.json<{ result: { id: string } }>().result.id;

    const senderAccept = await built.app.inject({
      method: "POST",
      url: "/api/rpc",
      headers: {
        cookie: sender.cookie,
        "x-inteschool-csrf": sender.csrfToken,
      },
      payload: { service: "share", method: "acceptShare", args: [shareId, "tch-1", "sch-1"] },
    });
    expect(senderAccept.statusCode).toBe(403);
    expect(senderAccept.json()).toEqual({ error: "无权处理该分享" });

    const recipient = await login(built.app, "share-recipient@example.com", "RecipientPass123");
    const accepted = await built.app.inject({
      method: "POST",
      url: "/api/rpc",
      headers: {
        cookie: recipient.cookie,
        "x-inteschool-csrf": recipient.csrfToken,
      },
      payload: { service: "share", method: "acceptShare", args: [shareId, "tch-1", "sch-2"] },
    });
    expect(accepted.statusCode).toBe(200);
    const newResourceId = accepted.json<{ result: { newResourceId: string } }>().result.newResourceId;
    const copied = (built.store.loadState().questions as Array<Record<string, unknown>>)
      .find((item) => item.id === newResourceId);
    expect(copied).toMatchObject({ teacherId: "tch-2", schoolId: "sch-1", isShared: false });
  });

  it("persists business records across a full server restart", async () => {
    const databasePath = built.config.databasePath;
    const session = await login(built.app);
    const create = await built.app.inject({
      method: "POST",
      url: "/api/rpc",
      headers: {
        cookie: session.cookie,
        "x-inteschool-csrf": session.csrfToken,
      },
      payload: {
        service: "question",
        method: "createQuestion",
        args: ["tch-1", "sch-1", {
          type: "short",
          stem: "服务重启后仍应存在",
          answer: "是",
          analysis: "持久化测试",
          chapterIds: [],
          knowledgePointIds: [],
          difficulty: 1,
          recommendation: 5,
        }],
      },
    });
    expect(create.statusCode).toBe(200);
    const questionId = create.json<{ result: { id: string } }>().result.id;

    await built.app.close();
    built = await createTestApp(databasePath);
    await built.app.ready();
    const relogin = await login(built.app);
    const read = await built.app.inject({
      method: "POST",
      url: "/api/rpc",
      headers: {
        cookie: relogin.cookie,
        "x-inteschool-csrf": relogin.csrfToken,
      },
      payload: { service: "question", method: "getQuestion", args: [questionId] },
    });
    expect(read.statusCode).toBe(200);
    expect(read.json<{ result: { stem: string } }>().result.stem).toBe("服务重启后仍应存在");
  });

  it("stores uploads on disk and imports actual file text", async () => {
    const session = await login(built.app);
    const multipart = multipartPayload("lesson.txt", "第一章 集合\n1. 集合的定义\n集合是确定对象的总体。\n");
    const upload = await built.app.inject({
      method: "POST",
      url: "/api/files",
      headers: {
        cookie: session.cookie,
        "x-inteschool-csrf": session.csrfToken,
        "content-type": multipart.contentType,
      },
      payload: multipart.body,
    });
    expect(upload.statusCode).toBe(200);
    const file = upload.json<{ id: string; url: string; storageName: string }>();
    const stored = await readFile(join(built.config.uploadsDir, file.storageName), "utf8");
    expect(stored).toContain("集合是确定对象的总体");

    const download = await built.app.inject({
      method: "GET",
      url: file.url,
      headers: { cookie: session.cookie },
    });
    expect(download.statusCode).toBe(200);
    expect(download.body).toContain("集合是确定对象的总体");
    expect(download.headers["content-disposition"]).toContain("lesson.txt");
    expect(download.headers["x-content-type-options"]).toBe("nosniff");

    const extract = await built.app.inject({
      method: "GET",
      url: `${file.url}/content`,
      headers: { cookie: session.cookie },
    });
    expect(extract.statusCode).toBe(200);
    expect(extract.json<{ text: string }>().text).toContain("集合的定义");

    const imported = await built.app.inject({
      method: "POST",
      url: `${file.url}/import`,
      headers: {
        cookie: session.cookie,
        "x-inteschool-csrf": session.csrfToken,
      },
    });
    expect(imported.statusCode).toBe(200);
    const document = imported.json<{ sections: Array<{ content: string }> }>();
    expect(document.sections.some((section) => section.content.includes("集合是确定对象的总体"))).toBe(true);
  });

  it("does not serve uploaded text as client-declared executable content", async () => {
    const session = await login(built.app);
    const multipart = multipartPayload(
      "malicious.txt",
      "<script>window.__INTESCHOOL_XSS__ = true</script>",
      "text/html",
    );
    const upload = await built.app.inject({
      method: "POST",
      url: "/api/files",
      headers: {
        cookie: session.cookie,
        "x-inteschool-csrf": session.csrfToken,
        "content-type": multipart.contentType,
      },
      payload: multipart.body,
    });
    expect(upload.statusCode).toBe(200);
    const file = upload.json<{ url: string; mimeType: string }>();
    expect(file.mimeType).toBe("text/plain; charset=utf-8");

    const download = await built.app.inject({
      method: "GET",
      url: file.url,
      headers: { cookie: session.cookie },
    });
    expect(download.statusCode).toBe(200);
    expect(download.headers["content-type"]).toContain("text/plain");
    expect(download.headers["content-disposition"]).toContain("attachment;");
    expect(download.headers["x-content-type-options"]).toBe("nosniff");
    expect(download.headers["content-security-policy"]).toBe("sandbox; default-src 'none'");
  });

  it("returns a generic server error when stored file content is missing", async () => {
    const session = await login(built.app);
    const multipart = multipartPayload("missing.txt", "temporary content");
    const upload = await built.app.inject({
      method: "POST",
      url: "/api/files",
      headers: {
        cookie: session.cookie,
        "x-inteschool-csrf": session.csrfToken,
        "content-type": multipart.contentType,
      },
      payload: multipart.body,
    });
    const file = upload.json<{ url: string; storageName: string }>();
    await rm(join(built.config.uploadsDir, file.storageName));

    const response = await built.app.inject({
      method: "GET",
      url: `${file.url}/content`,
      headers: { cookie: session.cookie },
    });
    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({ error: "服务器内部错误" });
    expect(response.body).not.toContain(built.config.uploadsDir);
  });

  it("returns file 404s and prevents another teacher from importing private uploads", async () => {
    const owner = await login(built.app);
    const multipart = multipartPayload("private.txt", "private teacher material");
    const upload = await built.app.inject({
      method: "POST",
      url: "/api/files",
      headers: {
        cookie: owner.cookie,
        "x-inteschool-csrf": owner.csrfToken,
        "content-type": multipart.contentType,
      },
      payload: multipart.body,
    });
    const file = upload.json<{ id: string; url: string }>();

    const missing = await built.app.inject({
      method: "GET",
      url: "/api/files/missing/content",
      headers: { cookie: owner.cookie },
    });
    expect(missing.statusCode).toBe(404);

    built.store.createUser("tch-2", "file-reader@example.com", "OtherTeacher123");
    const other = await login(built.app, "file-reader@example.com", "OtherTeacher123");
    const forbiddenImport = await built.app.inject({
      method: "POST",
      url: `${file.url}/import`,
      headers: {
        cookie: other.cookie,
        "x-inteschool-csrf": other.csrfToken,
      },
    });
    expect(forbiddenImport.statusCode).toBe(403);
    expect(forbiddenImport.json()).toEqual({ error: "只能导入自己上传的文件" });

    const missingDownload = await built.app.inject({
      method: "GET",
      url: "/api/files/missing",
      headers: { cookie: owner.cookie },
    });
    expect(missingDownload.statusCode).toBe(404);
  });

  it("supports public school RPC calls and rejects unknown RPC targets", async () => {
    const publicSchools = await built.app.inject({
      method: "POST",
      url: "/api/rpc",
      payload: { service: "school", method: "listSchools", args: [] },
    });
    expect(publicSchools.statusCode).toBe(200);
    expect(publicSchools.json<{ result: unknown[] }>().result.length).toBeGreaterThan(0);

    const unknownService = await built.app.inject({
      method: "POST",
      url: "/api/rpc",
      payload: { service: "missing", method: "list", args: [] },
    });
    expect(unknownService.statusCode).toBe(400);
    expect(unknownService.json()).toEqual({ error: "未知服务" });

    const unknownMethod = await built.app.inject({
      method: "POST",
      url: "/api/rpc",
      payload: { service: "school", method: "missingMethod", args: [] },
    });
    expect(unknownMethod.statusCode).toBe(400);
    expect(unknownMethod.json()).toEqual({ error: "未知服务方法" });
  });

  it("recognizes only source-backed answers and protects recognition ownership", async () => {
    const session = await login(built.app);
    const multipart = multipartPayload(
      "questions.txt",
      "1. 已知集合 A={1,2}，则元素 1 与 A 的关系是\nA. 1∈A\nB. 1∉A\n答案：A\n解析：1 是集合 A 的元素。\n\n2. 求函数定义域。\n",
    );
    const upload = await built.app.inject({
      method: "POST",
      url: "/api/files",
      headers: {
        cookie: session.cookie,
        "x-inteschool-csrf": session.csrfToken,
        "content-type": multipart.contentType,
      },
      payload: multipart.body,
    });
    const file = upload.json<{ url: string }>();
    const imported = await built.app.inject({
      method: "POST",
      url: `${file.url}/import`,
      headers: {
        cookie: session.cookie,
        "x-inteschool-csrf": session.csrfToken,
      },
    });
    const document = imported.json<{ id: string }>();
    const recognized = await built.app.inject({
      method: "POST",
      url: "/api/rpc",
      headers: {
        cookie: session.cookie,
        "x-inteschool-csrf": session.csrfToken,
      },
      payload: { service: "ai", method: "recognize", args: [document.id] },
    });
    expect(recognized.statusCode).toBe(200);
    const results = recognized.json<{
      result: Array<{ id: string; question: { stem?: string; answer: string; analysis: string } }>;
    }>().result;
    expect(results[0].question).toMatchObject({
      answer: "A",
      analysis: "1 是集合 A 的元素。",
    });
    expect(results.some((item) => item.question.answer === "待教师补充")).toBe(true);

    const incomplete = results.find((item) => item.question.answer === "待教师补充");
    expect(incomplete).toBeDefined();
    const confirmIncomplete = await built.app.inject({
      method: "POST",
      url: "/api/rpc",
      headers: {
        cookie: session.cookie,
        "x-inteschool-csrf": session.csrfToken,
      },
      payload: {
        service: "ai",
        method: "confirmRecognition",
        args: [incomplete!.id, "tch-1", "sch-1"],
      },
    });
    expect(confirmIncomplete.statusCode).toBe(400);
    expect(confirmIncomplete.json()).toEqual({ error: "请先补充答案和解析再入库" });

    built.store.createUser("tch-2", "other-teacher@example.com", "OtherTeacher123");
    const other = await login(built.app, "other-teacher@example.com", "OtherTeacher123");
    const forbidden = await built.app.inject({
      method: "POST",
      url: "/api/rpc",
      headers: {
        cookie: other.cookie,
        "x-inteschool-csrf": other.csrfToken,
      },
      payload: { service: "ai", method: "getRecognitions", args: [document.id] },
    });
    expect(forbidden.statusCode).toBe(403);
  });

  it("blocks private and loopback URLs before online resource fetching", async () => {
    await expect(fetchPublicText("http://127.0.0.1/internal"))
      .rejects.toThrow("受保护网络");
    await expect(fetchPublicText("http://169.254.169.254/latest/meta-data"))
      .rejects.toThrow("受保护网络");
  });

  it("keeps school applications pending until an administrator reviews them", async () => {
    const applicant = await register(built.app, "applicant@example.com");
    const multipart = multipartPayload("proof.txt", "teacher proof");
    const upload = await built.app.inject({
      method: "POST",
      url: "/api/files",
      headers: {
        cookie: applicant.cookie,
        "x-inteschool-csrf": applicant.csrfToken,
        "content-type": multipart.contentType,
      },
      payload: multipart.body,
    });
    const file = upload.json<{ id: string }>();

    const apply = await built.app.inject({
      method: "POST",
      url: "/api/auth/applications",
      headers: {
        cookie: applicant.cookie,
        "x-inteschool-csrf": applicant.csrfToken,
      },
      payload: { schoolId: "sch-1", employeeNo: "TEST-001", subject: "数学", proofFileId: file.id },
    });
    expect(apply.statusCode).toBe(200);
    const application = apply.json<{ id: string; status: string }>();
    expect(application.status).toBe("pending");

    built.store.createUser("tch-2", "ordinary-reviewer@example.com", "OrdinaryPass123");
    const ordinary = await login(built.app, "ordinary-reviewer@example.com", "OrdinaryPass123");
    const forbiddenProof = await built.app.inject({
      method: "GET",
      url: `/api/files/${file.id}`,
      headers: { cookie: ordinary.cookie },
    });
    expect(forbiddenProof.statusCode).toBe(403);

    const admin = await login(built.app);
    const proof = await built.app.inject({
      method: "GET",
      url: `/api/files/${file.id}`,
      headers: { cookie: admin.cookie },
    });
    expect(proof.statusCode).toBe(200);
    expect(proof.body).toContain("teacher proof");

    const review = await built.app.inject({
      method: "POST",
      url: `/api/auth/applications/${application.id}/review`,
      headers: {
        cookie: admin.cookie,
        "x-inteschool-csrf": admin.csrfToken,
      },
      payload: { approved: true },
    });
    expect(review.statusCode).toBe(200);

    const refreshed = await built.app.inject({
      method: "GET",
      url: "/api/auth/current",
      headers: { cookie: applicant.cookie },
    });
    expect(refreshed.json<{ teacher: { schoolId: string } }>().teacher.schoolId).toBe("sch-1");
  });
});
