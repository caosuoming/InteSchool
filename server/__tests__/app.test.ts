// @vitest-environment node

import { mkdtemp, readFile, rm } from "node:fs/promises";
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

function multipartPayload(fileName: string, content: string): { body: Buffer; contentType: string } {
  const boundary = `----inteschool-${Date.now()}`;
  const body = Buffer.from([
    `--${boundary}\r\n`,
    `Content-Disposition: form-data; name="file"; filename="${fileName}"\r\n`,
    "Content-Type: text/plain\r\n\r\n",
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

    const admin = await login(built.app);
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
