// @vitest-environment node

import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import JSZip from "jszip";
import Database from "better-sqlite3";
import { buildApp, type BuiltApp } from "../app.js";
import { fetchPublicText } from "../lib/safe-fetch.js";
import { hashPassword } from "../lib/password.js";
import { buildDefaultGradeSettings } from "../../src/lib/grade-statistics.js";
import type { AppNotification } from "../../src/types/index.js";

interface SessionContext {
  cookie: string;
  csrfToken: string;
  teacher: Record<string, unknown>;
}

let built: BuiltApp;
let workDir: string;
let phoneCounter = 0;

function nextPhone(): string {
  const suffix = String(phoneCounter).padStart(8, "0");
  phoneCounter += 1;
  return `138${suffix}`;
}

async function authorizeRegistration(
  phone: string,
  options: { creatorId?: string; schoolId?: string; kind?: "admin" | "guarantee" } = {},
): Promise<void> {
  await built.store.createRegistrationAuthorization({
    id: randomUUID(),
    phone,
    kind: options.kind || "guarantee",
    schoolId: options.schoolId || "sch-1",
    createdByTeacherId: options.creatorId || "tch-1",
    createdAt: new Date().toISOString(),
    consumedByTeacherId: null,
    consumedAt: null,
    revokedAt: null,
  });
}

async function createTestApp(databasePath?: string): Promise<BuiltApp> {
  return buildApp({
    databasePath: databasePath || join(workDir, "inteschool-test"),
    legacyDatabasePath: join(workDir, "legacy-source-not-present.sqlite"),
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
  phone = nextPhone(),
): Promise<SessionContext> {
  await authorizeRegistration(phone, { schoolId: "sch-2" });
  const response = await app.inject({
    method: "POST",
    url: "/api/auth/register",
    payload: {
      email,
      password,
      name,
      phone,
      schoolId: "sch-2",
      subject: "数学",
      teachingGrades: ["高一"],
      teachingClassIds: [],
    },
  });
  expect(response.statusCode).toBe(202);
  await approveRegistrationForTest(email);
  return login(app, email, password);
}

async function approveRegistrationForTest(identifier: string): Promise<void> {
  const before = built.store.loadState();
  const after = structuredClone(before);
  const teacherId = await built.store.getTeacherIdByAccountIdentifier(identifier);
  const teacher = after.teachers.find((item) => item.id === teacherId);
  if (!teacher) throw new Error(`待审核教师不存在: ${identifier}`);
  const application = (after.applications as Array<Record<string, unknown>>).find((item) =>
    item.registrationApplication === true && item.teacherId === teacher.id && item.status === "pending",
  );
  if (!application) throw new Error(`注册申请不存在: ${identifier}`);
  const schoolId = String(application.schoolId || "");
  const schoolAffiliation = teacher.affiliations.find((item) => item.schoolId === schoolId);
  if (!schoolAffiliation || typeof schoolAffiliation.id !== "string") {
    throw new Error(`待审核学校身份不存在: ${identifier}`);
  }
  teacher.schoolId = schoolId;
  teacher.status = "active";
  teacher.subject = String(schoolAffiliation.subject || teacher.subject);
  teacher.teachingGrades = Array.isArray(schoolAffiliation.teachingGrades)
    ? schoolAffiliation.teachingGrades as string[]
    : [];
  teacher.teachingClassIds = Array.isArray(schoolAffiliation.teachingClassIds)
    ? schoolAffiliation.teachingClassIds as string[]
    : [];
  teacher.role = schoolAffiliation.role as typeof teacher.role;
  teacher.roles = Array.isArray(schoolAffiliation.roles) ? schoolAffiliation.roles as string[] : ["teacher"];
  teacher.affiliations = teacher.affiliations.map((item) => item.id === schoolAffiliation.id
    ? { ...item, status: "active", isCurrent: true }
    : { ...item, isCurrent: false });
  teacher.currentAffiliationId = schoolAffiliation.id;
  application.status = "approved";
  const school = (after.schools as Array<Record<string, unknown>>).find((item) => item.id === schoolId);
  if (school) school.teacherCount = Number(school.teacherCount || 0) + 1;
  await built.store.saveState(before, after);
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

async function docxWithImage(imageData: Buffer): Promise<Buffer> {
  const zip = new JSZip();
  zip.file("word/_rels/document.xml.rels", `<?xml version="1.0" encoding="UTF-8"?>
    <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
      <Relationship Id="rId5" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/diagram.png"/>
    </Relationships>`);
  zip.file("word/media/diagram.png", imageData);
  return zip.generateAsync({ type: "nodebuffer" });
}

function multipartBufferPayload(
  fileName: string,
  content: Buffer,
  mimeType: string,
): { body: Buffer; contentType: string } {
  const boundary = `----inteschool-binary-${Date.now()}`;
  const body = Buffer.concat([
    Buffer.from([
      `--${boundary}\r\n`,
      `Content-Disposition: form-data; name="file"; filename="${fileName}"\r\n`,
      `Content-Type: ${mimeType}\r\n\r\n`,
    ].join("")),
    content,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return { body, contentType: `multipart/form-data; boundary=${boundary}` };
}

beforeEach(async () => {
  phoneCounter = 0;
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
    expect(await built.store.getTeacherIdByAccountIdentifier("admin@example.com")).not.toBeNull();
    expect(built.store.loadState().schools).toEqual([
      expect.objectContaining({ id: "school-prod", name: "生产测试学校" }),
    ]);
    expect(built.store.loadState().questions).toEqual([]);
  });

  it("allows multiple phone-only accounts with nullable email", async () => {
    await built.store.createUser("phone-only-teacher-1", null, "StrongPass123", "13800000001");
    await built.store.createUser("phone-only-teacher-2", null, "StrongPass123", "13800000002");

    expect(await built.store.getTeacherIdByAccountIdentifier("13800000001")).toBe("phone-only-teacher-1");
    expect(await built.store.getTeacherIdByAccountIdentifier("13800000002")).toBe("phone-only-teacher-2");
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
    await mkdir(join(distDir, "assets"), { recursive: true });
    await writeFile(join(distDir, "index.html"), "<!doctype html><title>InteSchool Test</title>");
    await writeFile(join(distDir, "asset.txt"), "static asset");
    await writeFile(join(distDir, "assets", "chunk-abc123.js"), "export default true;");
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
    expect(asset.headers["cache-control"]).toBe("no-cache");

    const chunk = await built.app.inject({ method: "GET", url: "/assets/chunk-abc123.js" });
    expect(chunk.statusCode).toBe(200);
    expect(chunk.headers["cache-control"]).toBe("public, max-age=31536000, immutable");

    const missingChunk = await built.app.inject({ method: "GET", url: "/assets/chunk-old.js" });
    expect(missingChunk.statusCode).toBe(404);
    expect(missingChunk.headers["content-type"]).toContain("text/plain");
    expect(missingChunk.body).toBe("静态资源不存在");

    const fallback = await built.app.inject({ method: "GET", url: "/dashboard/deep-link" });
    expect(fallback.statusCode).toBe(200);
    expect(fallback.headers["content-type"]).toContain("text/html");
    expect(fallback.headers["cache-control"]).toBe("no-store");
    expect(fallback.body).toContain("InteSchool Test");

    const missingApi = await built.app.inject({ method: "GET", url: "/api/missing" });
    expect(missingApi.statusCode).toBe(404);
    expect(missingApi.json()).toEqual({ error: "接口不存在" });

    const repeatedChunks = await Promise.all(Array.from({ length: 320 }, () => built.app.inject({
      method: "GET",
      url: "/assets/chunk-abc123.js",
    })));
    expect(repeatedChunks.every((response) => response.statusCode === 200)).toBe(true);

    const repeatedPreviewAssets = await Promise.all(Array.from({ length: 320 }, () => built.app.inject({
      method: "GET",
      url: "/api/files/00000000-0000-0000-0000-000000000000/assets/rIdFormula",
    })));
    expect(repeatedPreviewAssets.every((response) => response.statusCode === 401)).toBe(true);
  });

  it("maps duplicate accounts to 409 and invalid credentials to 401", async () => {
    await register(built.app, "duplicate@example.com");
    const duplicatePhone = nextPhone();
    await authorizeRegistration(duplicatePhone);
    const duplicate = await built.app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: {
        email: "DUPLICATE@example.com",
        password: "StrongPass123",
        name: "重复教师",
        phone: duplicatePhone,
        schoolId: "sch-1",
        subject: "数学",
      },
    });
    expect(duplicate.statusCode).toBe(409);
    expect(duplicate.json()).toEqual({ error: "该邮箱已注册" });

    const invalidLogin = await built.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "duplicate@example.com", password: "wrong" },
    });
    expect(invalidLogin.statusCode).toBe(401);
    expect(invalidLogin.json()).toEqual({ error: "邮箱、手机号或密码错误" });
  });

  it("logs in with either the bound email or a formatted mobile number", async () => {
    const phone = nextPhone();
    await register(
      built.app,
      "phone-login@example.com",
      "StrongPass123",
      "手机号教师",
      phone,
    );

    const emailLogin = await built.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { identifier: "PHONE-LOGIN@example.com", password: "StrongPass123" },
    });
    expect(emailLogin.statusCode).toBe(200);
    expect(emailLogin.json<{ teacher: { email: string } }>().teacher.email)
      .toBe("phone-login@example.com");

    const phoneLogin = await built.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: {
        identifier: `+86 ${phone.slice(0, 3)}-${phone.slice(3, 7)}-${phone.slice(7)}`,
        password: "StrongPass123",
      },
    });
    expect(phoneLogin.statusCode).toBe(200);
    expect(phoneLogin.json<{ teacher: { email: string } }>().teacher.email)
      .toBe("phone-login@example.com");
  });

  it("registers with only an authorized phone and lets the teacher bind an email later", async () => {
    const phone = nextPhone();
    await authorizeRegistration(phone, { schoolId: "sch-2" });
    const registered = await built.app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: {
        email: "",
        password: "StrongPass123",
        name: "无邮箱教师",
        phone,
        schoolId: "sch-2",
        subject: "数学",
        teachingGrades: [],
        teachingClassIds: [],
      },
    });
    expect(registered.statusCode).toBe(202);
    expect(registered.json()).toMatchObject({ teacher: null, csrfToken: null, pending: true });
    expect(await built.store.getTeacherIdByAccountIdentifier(phone)).not.toBeNull();

    const personalLogin = await built.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { identifier: phone, password: "StrongPass123" },
    });
    expect(personalLogin.statusCode).toBe(200);
    expect(personalLogin.json<{ teacher: { schoolId: string | null } }>().teacher.schoolId).toBeNull();
    await approveRegistrationForTest(phone);

    const phoneLogin = await built.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { identifier: phone, password: "StrongPass123" },
    });
    expect(phoneLogin.statusCode).toBe(200);
    const phoneLoginBody = phoneLogin.json<{ csrfToken: string }>();

    const bound = await built.app.inject({
      method: "PATCH",
      url: "/api/auth/email",
      headers: {
        cookie: sessionCookie(phoneLogin),
        "x-inteschool-csrf": phoneLoginBody.csrfToken,
      },
      payload: { email: "RECOVERY@example.com" },
    });
    expect(bound.statusCode).toBe(200);
    expect(bound.json<{ email: string }>().email).toBe("recovery@example.com");

    const emailLogin = await built.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { identifier: "recovery@example.com", password: "StrongPass123" },
    });
    expect(emailLogin.statusCode).toBe(200);

    const otherPhone = nextPhone();
    await authorizeRegistration(otherPhone, { schoolId: "sch-2" });
    const other = await built.app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: {
        password: "StrongPass123",
        name: "另一教师",
        phone: otherPhone,
        schoolId: "sch-2",
        subject: "语文",
        teachingGrades: [],
        teachingClassIds: [],
      },
    });
    expect(other.statusCode).toBe(202);
    await approveRegistrationForTest(otherPhone);
    const otherLogin = await built.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { identifier: otherPhone, password: "StrongPass123" },
    });
    expect(otherLogin.statusCode).toBe(200);
    const otherBody = otherLogin.json<{ csrfToken: string }>();
    const duplicate = await built.app.inject({
      method: "PATCH",
      url: "/api/auth/email",
      headers: {
        cookie: sessionCookie(otherLogin),
        "x-inteschool-csrf": otherBody.csrfToken,
      },
      payload: { email: "recovery@example.com" },
    });
    expect(duplicate.statusCode).toBe(409);
    expect(duplicate.json()).toEqual({ error: "该邮箱已注册" });
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

  it("requires a one-time phone authorization and lets administrators manage school access", async () => {
    const unauthorizedPhone = nextPhone();
    const unauthorized = await built.app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: {
        email: "blocked@example.com",
        password: "StrongPass123",
        name: "未授权教师",
        phone: unauthorizedPhone,
        schoolId: "sch-1",
        subject: "数学",
      },
    });
    expect(unauthorized.statusCode).toBe(403);
    expect(unauthorized.json()).toEqual({
      error: "该手机号尚未获得注册授权，请联系学校管理员或现有教师担保",
    });

    const admin = await login(built.app);
    const authorizedPhone = nextPhone();
    const created = await built.app.inject({
      method: "POST",
      url: "/api/auth/registration-authorizations",
      headers: {
        cookie: admin.cookie,
        "x-inteschool-csrf": admin.csrfToken,
      },
      payload: { phone: `+86 ${authorizedPhone.slice(0, 3)}-${authorizedPhone.slice(3)}`, kind: "admin" },
    });
    expect(created.statusCode).toBe(200);
    expect(created.json()).toMatchObject({ phone: authorizedPhone, kind: "admin", createdByTeacherId: "tch-1" });

    const registered = await built.app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: {
        email: "authorized@example.com",
        password: "StrongPass123",
        name: "授权教师",
        phone: authorizedPhone,
        schoolId: "sch-1",
        subject: "物理",
        teachingGrades: ["高一"],
      },
    });
    expect(registered.statusCode).toBe(202);

    const records = await built.app.inject({
      method: "GET",
      url: "/api/auth/registration-authorizations",
      headers: { cookie: admin.cookie },
    });
    expect(records.statusCode).toBe(200);
    expect(records.json<Array<Record<string, unknown>>>()).toEqual(expect.arrayContaining([
      expect.objectContaining({
        phone: authorizedPhone,
        kind: "admin",
        consumedAt: expect.any(String),
        consumedByName: "授权教师",
      }),
    ]));

    const reused = await built.app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: {
        email: "reused@example.com",
        password: "StrongPass123",
        name: "重复手机",
        phone: authorizedPhone,
        schoolId: "sch-1",
        subject: "物理",
      },
    });
    expect(reused.statusCode).toBe(409);
    expect(reused.json()).toEqual({ error: "该手机号已注册" });
  });

  it("lets teachers guarantee registrations but reserves administrator preauthorization for admins", async () => {
    await built.store.createUser("tch-2", "min.wang@bj04.edu.cn", "TeacherPass123");
    const teacher = await login(built.app, "min.wang@bj04.edu.cn", "TeacherPass123");

    const denied = await built.app.inject({
      method: "POST",
      url: "/api/auth/registration-authorizations",
      headers: {
        cookie: teacher.cookie,
        "x-inteschool-csrf": teacher.csrfToken,
      },
      payload: { phone: nextPhone(), kind: "admin" },
    });
    expect(denied.statusCode).toBe(403);

    const guaranteedPhone = nextPhone();
    const guaranteed = await built.app.inject({
      method: "POST",
      url: "/api/auth/registration-authorizations",
      headers: {
        cookie: teacher.cookie,
        "x-inteschool-csrf": teacher.csrfToken,
      },
      payload: { phone: guaranteedPhone, kind: "guarantee" },
    });
    expect(guaranteed.statusCode).toBe(200);
    const authorization = guaranteed.json<{ id: string }>();

    const mine = await built.app.inject({
      method: "GET",
      url: "/api/auth/registration-authorizations",
      headers: { cookie: teacher.cookie },
    });
    expect(mine.json<Array<Record<string, unknown>>>()).toEqual([
      expect.objectContaining({ phone: guaranteedPhone, createdByTeacherId: "tch-2" }),
    ]);

    const revoked = await built.app.inject({
      method: "DELETE",
      url: `/api/auth/registration-authorizations/${authorization.id}`,
      headers: {
        cookie: teacher.cookie,
        "x-inteschool-csrf": teacher.csrfToken,
      },
    });
    expect(revoked.statusCode).toBe(200);

    const blockedAfterRevoke = await built.app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: {
        email: "revoked@example.com",
        password: "StrongPass123",
        name: "撤销授权",
        phone: guaranteedPhone,
        schoolId: "sch-1",
        subject: "数学",
      },
    });
    expect(blockedAfterRevoke.statusCode).toBe(403);
  });

  it("lets teachers request new roles in backend settings and lets only their school administrator approve them", async () => {
    await built.store.createUser("tch-2", "role-applicant@example.com", "RoleApplicant123");
    const applicant = await login(built.app, "role-applicant@example.com", "RoleApplicant123");
    const applied = await built.app.inject({
      method: "POST",
      url: "/api/auth/role-applications",
      headers: { cookie: applicant.cookie, "x-inteschool-csrf": applicant.csrfToken },
      payload: {
        roles: ["teacher", "gradeLeader"],
        reason: "负责高一年级教学管理",
      },
    });
    expect(applied.statusCode, applied.body).toBe(200);
    const application = applied.json<{ id: string; requestedRoles: string[] }>();
    expect(application.requestedRoles).toEqual(["gradeLeader"]);
    expect((built.store.loadState().notifications as AppNotification[]).some((notification) =>
      notification.recipientTeacherId === "tch-1"
      && notification.title === "新的教师权限申请"
      && notification.actionUrl === "/admin/permission-applications"
      && notification.readAt === null,
    )).toBe(true);

    const mine = await built.app.inject({
      method: "GET",
      url: "/api/auth/role-applications/mine",
      headers: { cookie: applicant.cookie },
    });
    expect(mine.json<Array<{ id: string }>>().map((item) => item.id)).toContain(application.id);

    const admin = await login(built.app);
    const pending = await built.app.inject({
      method: "GET",
      url: "/api/auth/role-applications/pending",
      headers: { cookie: admin.cookie },
    });
    expect(pending.statusCode).toBe(200);
    expect(pending.json<Array<Record<string, unknown>>>()).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: application.id, teacherName: expect.any(String), requestedRoles: ["gradeLeader"] }),
    ]));

    const reviewed = await built.app.inject({
      method: "POST",
      url: `/api/auth/role-applications/${application.id}/review`,
      headers: { cookie: admin.cookie, "x-inteschool-csrf": admin.csrfToken },
      payload: { approved: true },
    });
    expect(reviewed.statusCode, reviewed.body).toBe(200);

    const current = await built.app.inject({
      method: "GET",
      url: "/api/auth/current",
      headers: { cookie: applicant.cookie },
    });
    expect(current.json<{ teacher: { roles: string[] } }>().teacher.roles).toContain("gradeLeader");
  });

  it("hashes passwords, creates an HttpOnly session, and never returns credentials", async () => {
    const password = "StrongPass123";
    const session = await register(built.app, "new-teacher@example.com", password);
    expect(session.teacher).not.toHaveProperty("password");
    expect(session.teacher).not.toHaveProperty("passwordHash");

    const rejectedPassword = await built.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "new-teacher@example.com", password: "definitely-wrong" },
    });
    expect(rejectedPassword.statusCode).toBe(401);

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

  it("requires approval for existing-school registration, grants requested roles, and keeps new-school creation direct", async () => {
    const phone = nextPhone();
    await authorizeRegistration(phone, { schoolId: "sch-1" });

    const context = await built.app.inject({
      method: "GET",
      url: `/api/auth/registration-context?phone=${phone}`,
    });
    expect(context.statusCode).toBe(200);
    expect(context.json()).toMatchObject({
      authorization: { schoolId: "sch-1", schoolName: expect.any(String) },
      schools: expect.arrayContaining([expect.objectContaining({ id: "sch-1" })]),
    });

    const wrongSchool = await built.app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: {
        email: "wrong-school@example.com",
        password: "StrongPass123",
        name: "错误学校",
        phone,
        schoolId: "sch-2",
        subject: "物理",
      },
    });
    expect(wrongSchool.statusCode).toBe(403);
    expect(wrongSchool.json()).toEqual({ error: "该手机号的注册授权不属于所选学校" });

    const registered = await built.app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: {
        email: "school-profile@example.com",
        password: "StrongPass123",
        name: "教学资料教师",
        phone,
        schoolId: "sch-1",
        subject: "物理",
        teachingGrades: ["高一", "高二"],
        teachingClassIds: [],
        roles: ["teacher", "headTeacher", "gradeLeader"],
      },
    });
    expect(registered.statusCode).toBe(202);
    expect(registered.json()).toMatchObject({ teacher: null, csrfToken: null, pending: true });
    expect((built.store.loadState().notifications as AppNotification[]).some((notification) =>
      notification.recipientTeacherId === "tch-1"
      && notification.title === "新教师注册待审核"
      && notification.actionUrl === "/admin/teacher-school-applications"
      && notification.readAt === null,
    )).toBe(true);

    const personalLogin = await built.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { identifier: "school-profile@example.com", password: "StrongPass123" },
    });
    expect(personalLogin.statusCode).toBe(200);
    const personalBody = personalLogin.json<{
      teacher: {
        schoolId: string | null;
        status: string;
        currentAffiliationId: string;
        affiliations: Array<Record<string, unknown>>;
      };
      csrfToken: string;
    }>();
    expect(personalBody.teacher).toMatchObject({ schoolId: null, status: "active" });
    expect(personalBody.teacher.affiliations).toEqual(expect.arrayContaining([
      expect.objectContaining({ schoolId: null, status: "active", isCurrent: true }),
      expect.objectContaining({ schoolId: "sch-1", status: "pending", isCurrent: false }),
    ]));

    const duplicatePending = await built.app.inject({
      method: "POST",
      url: "/api/auth/applications",
      headers: {
        cookie: sessionCookie(personalLogin),
        "x-inteschool-csrf": personalBody.csrfToken,
      },
      payload: {
        schoolId: "sch-1",
        subjects: ["物理"],
        roles: ["teacher"],
      },
    });
    expect(duplicatePending.statusCode).toBe(400);
    expect(duplicatePending.json()).toEqual({
      error: "已提交过该学校的认证申请，不能重复申请；后续权限调整请在后台设置中提交",
    });

    const admin = await login(built.app);
    const pending = await built.app.inject({
      method: "GET",
      url: "/api/auth/applications/pending",
      headers: { cookie: admin.cookie },
    });
    const registrationApplication = pending.json<Array<Record<string, unknown>>>().find((item) =>
      item.teacherName === "教学资料教师",
    );
    expect(registrationApplication).toMatchObject({
      schoolId: "sch-1",
      teachingGrades: ["高一", "高二"],
      roles: ["teacher", "headTeacher", "gradeLeader"],
      registrationApplication: true,
    });
    const approved = await built.app.inject({
      method: "POST",
      url: `/api/auth/applications/${String(registrationApplication?.id)}/review`,
      headers: { cookie: admin.cookie, "x-inteschool-csrf": admin.csrfToken },
      payload: { approved: true },
    });
    expect(approved.statusCode).toBe(200);

    const approvedLogin = await built.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { identifier: "school-profile@example.com", password: "StrongPass123" },
    });
    expect(approvedLogin.statusCode).toBe(200);
    const registeredBody = approvedLogin.json<{ teacher: Record<string, unknown>; csrfToken: string }>();
    expect(registeredBody.teacher).toMatchObject({
      schoolId: "sch-1",
      subject: "物理",
      teachingGrades: ["高一", "高二"],
      status: "active",
      roles: ["teacher", "headTeacher", "gradeLeader"],
    });

    const proofPayload = multipartPayload("same-school-proof.txt", "already joined");
    const proofUpload = await built.app.inject({
      method: "POST",
      url: "/api/files",
      headers: {
        cookie: sessionCookie(approvedLogin),
        "x-inteschool-csrf": registeredBody.csrfToken,
        "content-type": proofPayload.contentType,
      },
      payload: proofPayload.body,
    });
    const duplicateApplication = await built.app.inject({
      method: "POST",
      url: "/api/auth/applications",
      headers: {
        cookie: sessionCookie(approvedLogin),
        "x-inteschool-csrf": registeredBody.csrfToken,
      },
      payload: {
        schoolId: "sch-1",
        employeeNo: "DUP-001",
        subject: "物理",
        proofFileId: proofUpload.json<{ id: string }>().id,
      },
    });
    expect(duplicateApplication.statusCode).toBe(400);
    expect(duplicateApplication.json()).toEqual({ error: "已加入该学校，无需重复申请" });

    const newSchoolPhone = nextPhone();
    await authorizeRegistration(newSchoolPhone, { schoolId: "sch-1" });
    const created = await built.app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: {
        email: "new-school@example.com",
        password: "StrongPass123",
        name: "新校教师",
        phone: newSchoolPhone,
        newSchool: { name: "南京测试新校", code: "NJTST", city: "南京", description: "测试学校" },
        subject: "化学",
      },
    });
    expect(created.statusCode).toBe(200);
    expect(built.store.loadState().schools).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "南京测试新校", code: "NJTST", teacherCount: 1 }),
    ]));
  });

  it("keeps class assignments manager-only and allows authorized school leaders to maintain them", async () => {
    const manager = await register(built.app, "manager-candidate@example.com");
    const target = await register(built.app, "managed-teacher@example.com");

    const selfUpdate = await built.app.inject({
      method: "PATCH",
      url: "/api/auth/profile",
      headers: { cookie: target.cookie, "x-inteschool-csrf": target.csrfToken },
      payload: { subject: "英语", teachingGrades: ["高二"] },
    });
    expect(selfUpdate.statusCode).toBe(200);
    expect(selfUpdate.json()).toMatchObject({ subject: "英语", teachingGrades: ["高二"] });

    const selfAssignedClass = await built.app.inject({
      method: "PATCH",
      url: "/api/auth/profile",
      headers: { cookie: target.cookie, "x-inteschool-csrf": target.csrfToken },
      payload: { teachingClassIds: ["class-from-another-school"] },
    });
    expect(selfAssignedClass.statusCode).toBe(400);
    expect(selfAssignedClass.json()).toEqual({
      error: "任教班级只能由年级组长、教务主任、副校长、校长或学校管理员设置",
    });

    const forbidden = await built.app.inject({
      method: "PATCH",
      url: `/api/auth/teachers/${String(target.teacher.id)}/teaching-profile`,
      headers: { cookie: manager.cookie, "x-inteschool-csrf": manager.csrfToken },
      payload: { subject: "语文" },
    });
    expect(forbidden.statusCode).toBe(403);

    const beforeLeaderGrant = built.store.loadState();
    const leaderState = structuredClone(beforeLeaderGrant);
    const leaderTeacher = leaderState.teachers.find((item) => item.id === manager.teacher.id)!;
    const managedTeacher = leaderState.teachers.find((item) => item.id === target.teacher.id)!;
    leaderTeacher.roles = ["teacher", "gradeLeader"];
    leaderTeacher.teachingGrades = ["高二"];
    leaderTeacher.affiliations = leaderTeacher.affiliations.map((item) => item.id === leaderTeacher.currentAffiliationId
      ? { ...item, roles: ["teacher", "gradeLeader"], teachingGrades: ["高二"] }
      : item);
    managedTeacher.teachingGrades = ["高二"];
    managedTeacher.affiliations = managedTeacher.affiliations.map((item) => item.id === managedTeacher.currentAffiliationId
      ? { ...item, teachingGrades: ["高二"] }
      : item);
    await built.store.saveState(beforeLeaderGrant, leaderState);

    const leaderManaged = await built.app.inject({
      method: "PATCH",
      url: `/api/auth/teachers/${String(target.teacher.id)}/teaching-profile`,
      headers: { cookie: manager.cookie, "x-inteschool-csrf": manager.csrfToken },
      payload: { subject: "物理" },
    });
    expect(leaderManaged.statusCode, leaderManaged.body).toBe(200);
    expect(leaderManaged.json()).toMatchObject({ subject: "物理", teachingGrades: ["高二"] });

    const afterLeaderGrant = built.store.loadState();
    const ordinaryState = structuredClone(afterLeaderGrant);
    const ordinaryManager = ordinaryState.teachers.find((item) => item.id === manager.teacher.id)!;
    ordinaryManager.roles = ["teacher"];
    ordinaryManager.affiliations = ordinaryManager.affiliations.map((item) => item.id === ordinaryManager.currentAffiliationId
      ? { ...item, roles: ["teacher"] }
      : item);
    await built.store.saveState(afterLeaderGrant, ordinaryState);

    const application = await built.app.inject({
      method: "POST",
      url: "/api/auth/admin-applications",
      headers: { cookie: manager.cookie, "x-inteschool-csrf": manager.csrfToken },
      payload: { reason: "负责维护本校教师教学资料" },
    });
    expect(application.statusCode).toBe(200);
    const applicationId = application.json<{ id: string }>().id;

    const duplicateAdminApplication = await built.app.inject({
      method: "POST",
      url: "/api/auth/admin-applications",
      headers: { cookie: manager.cookie, "x-inteschool-csrf": manager.csrfToken },
      payload: { reason: "重复提交同一所学校的管理员申请" },
    });
    expect(duplicateAdminApplication.statusCode).toBe(400);
    expect(duplicateAdminApplication.json()).toEqual({ error: "已有待审核的学校管理员申请" });

    const ordinaryPendingReview = await built.app.inject({
      method: "GET",
      url: "/api/auth/admin-applications/pending",
      headers: { cookie: manager.cookie },
    });
    expect(ordinaryPendingReview.statusCode).toBe(403);

    const beforePromotion = built.store.loadState();
    const state = structuredClone(beforePromotion);
    const platformTeacher = state.teachers.find((item) => item.id === "tch-1")!;
    platformTeacher.role = "platform_admin";
    platformTeacher.affiliations = platformTeacher.affiliations.map((item) => item.id === platformTeacher.currentAffiliationId
      ? { ...item, role: "platform_admin" }
      : item);
    await built.store.saveState(beforePromotion, state);
    const platformAdmin = await login(built.app);
    const pending = await built.app.inject({
      method: "GET",
      url: "/api/auth/admin-applications/pending",
      headers: { cookie: platformAdmin.cookie },
    });
    expect(pending.statusCode).toBe(200);
    expect(pending.json<Array<Record<string, unknown>>>()).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: applicationId, teacherId: manager.teacher.id, status: "pending" }),
    ]));

    const approved = await built.app.inject({
      method: "POST",
      url: `/api/auth/admin-applications/${applicationId}/review`,
      headers: { cookie: platformAdmin.cookie, "x-inteschool-csrf": platformAdmin.csrfToken },
      payload: { approved: true },
    });
    expect(approved.statusCode).toBe(200);

    const managedSchoolId = String(target.teacher.schoolId);
    const managedClassId = String(
      (built.store.loadState().schoolClasses as Array<{ id: string; schoolId: string }>)
        .find((item) => item.schoolId === managedSchoolId)!.id,
    );
    const managed = await built.app.inject({
      method: "PATCH",
      url: `/api/auth/teachers/${String(target.teacher.id)}/teaching-profile`,
      headers: { cookie: manager.cookie, "x-inteschool-csrf": manager.csrfToken },
      payload: {
        subject: "语文",
        teachingGrades: ["高三"],
        teachingClassIds: [],
        homeroomClassIds: [managedClassId],
      },
    });
    expect(managed.statusCode, managed.body).toBe(200);
    expect(managed.json()).toMatchObject({
      subject: "语文",
      teachingGrades: ["高三"],
      homeroomClassIds: [managedClassId],
      roles: expect.arrayContaining(["headTeacher"]),
    });

    const crossSchool = await built.app.inject({
      method: "PATCH",
      url: "/api/auth/teachers/tch-1/teaching-profile",
      headers: { cookie: manager.cookie, "x-inteschool-csrf": manager.csrfToken },
      payload: { subject: "历史" },
    });
    expect(crossSchool.statusCode).toBe(403);
    expect(crossSchool.json()).toEqual({ error: "无权管理其他学校的教师" });
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

  it("lets school administrators reset local teacher passwords and invalidates target sessions", async () => {
    await built.store.createUser("tch-2", "min.wang@bj04.edu.cn", "TeacherPass123");
    const targetSession = await login(built.app, "min.wang@bj04.edu.cn", "TeacherPass123");
    const admin = await login(built.app);

    const reset = await built.app.inject({
      method: "POST",
      url: "/api/auth/teachers/tch-2/password-reset",
      headers: { cookie: admin.cookie, "x-inteschool-csrf": admin.csrfToken },
      payload: {},
    });
    expect(reset.statusCode).toBe(200);
    const generatedPassword = reset.json<{ password: string }>().password;
    expect(generatedPassword).toMatch(/^[A-Za-z0-9_-]{16}$/);

    const oldSession = await built.app.inject({
      method: "GET",
      url: "/api/auth/current",
      headers: { cookie: targetSession.cookie },
    });
    expect(oldSession.json()).toEqual({ teacher: null, csrfToken: null });

    const oldPassword = await built.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { identifier: "min.wang@bj04.edu.cn", password: "TeacherPass123" },
    });
    expect(oldPassword.statusCode).toBe(401);
    await expect(login(built.app, "min.wang@bj04.edu.cn", generatedPassword))
      .resolves.toMatchObject({ teacher: expect.objectContaining({ id: "tch-2" }) });

    const crossSchool = await built.app.inject({
      method: "POST",
      url: "/api/auth/teachers/tch-3/password-reset",
      headers: { cookie: admin.cookie, "x-inteschool-csrf": admin.csrfToken },
      payload: {},
    });
    expect(crossSchool.statusCode).toBe(403);
    expect(crossSchool.json()).toEqual({ error: "无权重置其他学校教师的密码" });
  });

  it("lets platform administrators reset passwords across schools with a specified password", async () => {
    await built.store.createUser("tch-3", "hua.liu@shsy.edu.cn", "TeacherPass123");
    const before = built.store.loadState();
    const after = structuredClone(before);
    const platformTeacher = after.teachers.find((item) => item.id === "tch-1")!;
    platformTeacher.role = "platform_admin";
    platformTeacher.affiliations = platformTeacher.affiliations.map((item) => item.id === platformTeacher.currentAffiliationId
      ? { ...item, role: "platform_admin" }
      : item);
    await built.store.saveState(before, after);
    const admin = await login(built.app);

    const reset = await built.app.inject({
      method: "POST",
      url: "/api/auth/teachers/tch-3/password-reset",
      headers: { cookie: admin.cookie, "x-inteschool-csrf": admin.csrfToken },
      payload: { newPassword: "ManagedPass123" },
    });
    expect(reset.statusCode).toBe(200);
    expect(reset.json()).toEqual({ password: "ManagedPass123" });
    await expect(login(built.app, "hua.liu@shsy.edu.cn", "ManagedPass123"))
      .resolves.toMatchObject({ teacher: expect.objectContaining({ id: "tch-3" }) });
  });

  it("lets users update a validated public nickname and persists it", async () => {
    const session = await login(built.app);

    const withoutCsrf = await built.app.inject({
      method: "PATCH",
      url: "/api/auth/profile",
      headers: { cookie: session.cookie },
      payload: { nickname: "公开昵称" },
    });
    expect(withoutCsrf.statusCode).toBe(400);

    const invalid = await built.app.inject({
      method: "PATCH",
      url: "/api/auth/profile",
      headers: {
        cookie: session.cookie,
        "x-inteschool-csrf": session.csrfToken,
      },
      payload: { nickname: "   " },
    });
    expect(invalid.statusCode).toBe(400);

    const updated = await built.app.inject({
      method: "PATCH",
      url: "/api/auth/profile",
      headers: {
        cookie: session.cookie,
        "x-inteschool-csrf": session.csrfToken,
      },
      payload: { nickname: "  立方课堂新版  " },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json()).toMatchObject({
      id: "tch-1",
      name: "张立",
      nickname: "立方课堂新版",
    });

    const current = await built.app.inject({
      method: "GET",
      url: "/api/auth/current",
      headers: { cookie: session.cookie },
    });
    expect(current.json<{ teacher: { nickname: string } }>().teacher.nickname).toBe("立方课堂新版");
    expect(built.store.getTeacherById("tch-1")?.nickname).toBe("立方课堂新版");
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

  it("restricts exam preprocessing mutations to grade and school managers", async () => {
    const session = await login(built.app);
    const schoolId = String(session.teacher.schoolId);
    const teacherId = String(session.teacher.id);
    const headers = {
      cookie: session.cookie,
      "x-inteschool-csrf": session.csrfToken,
    };
    const cohortsResponse = await built.app.inject({
      method: "POST",
      url: "/api/rpc",
      headers,
      payload: { service: "grade", method: "listCohorts", args: [schoolId] },
    });
    const cohorts = cohortsResponse.json<{ result: Array<{ key: string }> }>().result;
    expect(cohorts.length).toBeGreaterThan(0);
    const cohortKey = cohorts[0].key;

    const contextResponse = await built.app.inject({
      method: "POST",
      url: "/api/rpc",
      headers,
      payload: { service: "grade", method: "getImportContext", args: [schoolId, cohortKey] },
    });
    const context = contextResponse.json<{
      result: {
        classes: Array<{ id: string }>;
        teachers: Array<{ id: string; name: string; subject: string }>;
      };
    }>().result;
    const subjects = ["数学"];
    const settings = buildDefaultGradeSettings(
      subjects,
      context.classes.map((item) => item.id),
      context.teachers,
    );
    const payload = {
      service: "grade",
      method: "saveCohortSettings",
      args: [schoolId, teacherId, cohortKey, subjects, settings],
    };

    const initial = built.store.loadState();
    const ordinaryState = structuredClone(initial);
    ordinaryState.teachers = ordinaryState.teachers.map((item) => item.id === teacherId
      ? {
          ...item,
          role: "teacher" as const,
          roles: ["teacher" as const],
          affiliations: item.affiliations.map((affiliation) => affiliation.id === item.currentAffiliationId
            ? {
                ...affiliation,
                role: "teacher" as const,
                roles: ["teacher" as const],
              }
            : affiliation),
        }
      : item);
    await built.store.saveState(initial, ordinaryState);

    const forbidden = await built.app.inject({ method: "POST", url: "/api/rpc", headers, payload });
    expect(forbidden.statusCode).toBe(403);
    expect(forbidden.json()).toEqual({ error: "该操作需要年级组长或学校管理员权限" });
    const roomPayload = {
      service: "examArrangement",
      method: "listCohorts",
      args: [schoolId],
    };
    const roomForbidden = await built.app.inject({
      method: "POST",
      url: "/api/rpc",
      headers,
      payload: roomPayload,
    });
    expect(roomForbidden.statusCode).toBe(403);
    expect(roomForbidden.json()).toEqual({ error: "该操作需要年级组长或学校管理员权限" });

    const before = built.store.loadState();
    const state = structuredClone(before);
    state.teachers = state.teachers.map((item) => item.id === teacherId
      ? {
          ...item,
          roles: [...new Set([...item.roles, "gradeLeader" as const])],
          affiliations: item.affiliations.map((affiliation) => affiliation.id === item.currentAffiliationId
            ? {
                ...affiliation,
                roles: [
                  ...new Set([
                    ...(Array.isArray(affiliation.roles) ? affiliation.roles : []),
                    "gradeLeader" as const,
                  ]),
                ],
              }
            : affiliation),
        }
      : item);
    await built.store.saveState(before, state);

    const allowed = await built.app.inject({ method: "POST", url: "/api/rpc", headers, payload });
    expect(allowed.statusCode).toBe(200);
    expect(allowed.json<{ result: { cohortKey: string } }>().result.cohortKey).toBe(cohortKey);
    const roomAllowed = await built.app.inject({
      method: "POST",
      url: "/api/rpc",
      headers,
      payload: roomPayload,
    });
    expect(roomAllowed.statusCode).toBe(200);
    expect(roomAllowed.json<{ result: Array<{ key: string }> }>().result)
      .toEqual(expect.arrayContaining([expect.objectContaining({ key: cohortKey })]));

    const beforeLegacyRoles = built.store.loadState();
    const legacyRolesState = structuredClone(beforeLegacyRoles);
    legacyRolesState.teachers = legacyRolesState.teachers.map((item) => item.id === teacherId
      ? {
          ...item,
          roles: ["teacher" as const, "gradeLeader" as const],
          affiliations: item.affiliations.map((affiliation) => affiliation.id === item.currentAffiliationId
            ? { ...affiliation, roles: [] }
            : affiliation),
        }
      : item);
    await built.store.saveState(beforeLegacyRoles, legacyRolesState);

    const allowedWithLegacyRoles = await built.app.inject({
      method: "POST",
      url: "/api/rpc",
      headers,
      payload,
    });
    expect(allowedWithLegacyRoles.statusCode, allowedWithLegacyRoles.body).toBe(200);
  });

  it("returns an empty student list without losing the service method receiver", async () => {
    const before = built.store.loadState();
    const state = structuredClone(before);
    state.students = [];
    state.studentInteractions = [];
    await built.store.saveState(before, state);

    const session = await login(built.app);
    const schoolId = String(session.teacher.schoolId);
    const teacherId = String(session.teacher.id);
    const headers = {
      cookie: session.cookie,
      "x-inteschool-csrf": session.csrfToken,
    };

    const students = await built.app.inject({
      method: "POST",
      url: "/api/rpc",
      headers,
      payload: { service: "class", method: "listStudentsBySchool", args: [schoolId] },
    });
    expect(students.statusCode).toBe(200);
    expect(students.json()).toEqual({ result: [] });

    const classIds = await built.app.inject({
      method: "POST",
      url: "/api/rpc",
      headers,
      payload: { service: "class", method: "listMyClassIds", args: [schoolId, teacherId] },
    });
    expect(classIds.statusCode).toBe(200);
    expect(classIds.json()).toEqual({
      result: {
        __rpcType: "Set",
        values: expect.any(Array),
      },
    });
  });

  it("includes personal-class members in the current teacher's student list", async () => {
    const session = await login(built.app);
    const schoolId = String(session.teacher.schoolId);
    const teacherId = String(session.teacher.id);
    const headers = {
      cookie: session.cookie,
      "x-inteschool-csrf": session.csrfToken,
    };

    const personalClassResponse = await built.app.inject({
      method: "POST",
      url: "/api/rpc",
      headers,
      payload: {
        service: "class",
        method: "createPersonalClass",
        args: [teacherId, "Issue 14 教学班", "用于验证个人班学生选择"],
      },
    });
    expect(personalClassResponse.statusCode).toBe(200);
    const personalClass = personalClassResponse.json<{ result: { id: string } }>().result;

    const studentResponse = await built.app.inject({
      method: "POST",
      url: "/api/rpc",
      headers,
      payload: {
        service: "class",
        method: "addExternalStudentToPersonalClass",
        args: [personalClass.id, {
          name: "个人班学生",
          studentNo: "P001",
          grade: "高一",
          externalSchool: "校外学校",
        }],
      },
    });
    expect(studentResponse.statusCode).toBe(200);
    const student = studentResponse.json<{ result: { id: string } }>().result;

    const studentsResponse = await built.app.inject({
      method: "POST",
      url: "/api/rpc",
      headers,
      payload: {
        service: "class",
        method: "listMyStudents",
        args: [schoolId, teacherId],
      },
    });
    expect(studentsResponse.statusCode).toBe(200);
    expect(studentsResponse.json<{ result: Array<{ id: string }> }>().result).toContainEqual(
      expect.objectContaining({ id: student.id }),
    );
  });

  it("allows a teacher to rename a personal class and edit its external student", async () => {
    const session = await register(built.app, "issue206@example.com");
    const teacherId = String(session.teacher.id);
    const headers = {
      cookie: session.cookie,
      "x-inteschool-csrf": session.csrfToken,
    };

    const personalClassResponse = await built.app.inject({
      method: "POST",
      url: "/api/rpc",
      headers,
      payload: {
        service: "class",
        method: "createPersonalClass",
        args: [teacherId, "原教学班", "Issue 206"],
      },
    });
    expect(personalClassResponse.statusCode).toBe(200);
    const personalClass = personalClassResponse.json<{ result: { id: string } }>().result;

    const renameResponse = await built.app.inject({
      method: "POST",
      url: "/api/rpc",
      headers,
      payload: {
        service: "class",
        method: "updatePersonalClass",
        args: [personalClass.id, { name: "新教学班" }],
      },
    });
    expect(renameResponse.statusCode).toBe(200);
    expect(renameResponse.json()).toEqual({
      result: expect.objectContaining({ id: personalClass.id, name: "新教学班" }),
    });

    const studentResponse = await built.app.inject({
      method: "POST",
      url: "/api/rpc",
      headers,
      payload: {
        service: "class",
        method: "addExternalStudentToPersonalClass",
        args: [personalClass.id, {
          name: "外校学生",
          studentNo: "EXT-206",
          grade: "高一",
          externalSchool: "外校",
        }],
      },
    });
    expect(studentResponse.statusCode).toBe(200);
    const student = studentResponse.json<{ result: { id: string } }>().result;

    const updateStudentResponse = await built.app.inject({
      method: "POST",
      url: "/api/rpc",
      headers,
      payload: {
        service: "class",
        method: "updateStudent",
        args: [student.id, { name: "已编辑外校学生" }],
      },
    });
    expect(updateStudentResponse.statusCode).toBe(200);
    expect(updateStudentResponse.json()).toEqual({
      result: expect.objectContaining({ id: student.id, name: "已编辑外校学生" }),
    });
  });

  it("excludes suspended school-class members from the current teacher's student list", async () => {
    const session = await login(built.app);
    const schoolId = String(session.teacher.schoolId);
    const teacherId = String(session.teacher.id);
    const headers = {
      cookie: session.cookie,
      "x-inteschool-csrf": session.csrfToken,
    };

    const schoolClassResponse = await built.app.inject({
      method: "POST",
      url: "/api/rpc",
      headers,
      payload: {
        service: "class",
        method: "createSchoolClass",
        args: [schoolId, teacherId, "Issue 15 行政班", "高一"],
      },
    });
    expect(schoolClassResponse.statusCode).toBe(200);
    const schoolClass = schoolClassResponse.json<{ result: { id: string } }>().result;

    const studentResponse = await built.app.inject({
      method: "POST",
      url: "/api/rpc",
      headers,
      payload: {
        service: "class",
        method: "addStudent",
        args: [schoolClass.id, schoolId, {
          name: "挂起学生",
          studentNo: "SUSPENDED-001",
          grade: "高一",
        }],
      },
    });
    expect(studentResponse.statusCode).toBe(200);
    const student = studentResponse.json<{ result: { id: string } }>().result;

    const suspendResponse = await built.app.inject({
      method: "POST",
      url: "/api/rpc",
      headers,
      payload: {
        service: "class",
        method: "suspendStudent",
        args: [student.id],
      },
    });
    expect(suspendResponse.statusCode).toBe(200);

    const studentsResponse = await built.app.inject({
      method: "POST",
      url: "/api/rpc",
      headers,
      payload: {
        service: "class",
        method: "listMyStudents",
        args: [schoolId, teacherId],
      },
    });
    expect(studentsResponse.statusCode).toBe(200);
    expect(studentsResponse.json<{ result: Array<{ id: string }> }>().result).not.toContainEqual(
      expect.objectContaining({ id: student.id }),
    );
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
    await built.store.saveState(before, state);

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
    await built.store.saveState(before, state);

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
    await built.store.createUser("tch-2", "share-recipient@example.com", "RecipientPass123");
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

  it("polls long-running text extraction without holding one HTTP request open", async () => {
    const session = await login(built.app);
    const multipart = multipartPayload("long-running.txt", "第一章 集合\n1. 集合的定义\n");
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

    const started = await built.app.inject({
      method: "GET",
      url: `${file.url}/content?textOnly=1&async=1&retry=1`,
      headers: { cookie: session.cookie },
    });
    expect(started.statusCode).toBe(202);
    expect(started.json()).toEqual({ status: "processing" });
    expect(started.headers["cache-control"]).toBe("no-store");

    let completed = await built.app.inject({
      method: "GET",
      url: `${file.url}/content?textOnly=1&async=1`,
      headers: { cookie: session.cookie },
    });
    for (let attempt = 0; attempt < 10 && completed.statusCode === 202; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      completed = await built.app.inject({
        method: "GET",
        url: `${file.url}/content?textOnly=1&async=1`,
        headers: { cookie: session.cookie },
      });
    }

    expect(completed.statusCode).toBe(200);
    expect(completed.json<{ text: string; html: string }>().text).toContain("集合的定义");
    expect(completed.json<{ text: string; html: string }>().html).toBe("");
  });

  it("serves embedded DOCX images through authenticated asset URLs", async () => {
    const session = await login(built.app);
    const fileId = randomUUID();
    const storageName = `${fileId}.docx`;
    const imageData = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    const documentData = await docxWithImage(imageData);
    await writeFile(join(built.config.uploadsDir, storageName), documentData);
    await built.store.saveFile({
      id: fileId,
      ownerId: "tch-1",
      schoolId: "sch-1",
      originalName: "illustrated.docx",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      size: documentData.length,
      storageName,
      createdAt: new Date().toISOString(),
    });

    const image = await built.app.inject({
      method: "GET",
      url: `/api/files/${fileId}/assets/rId5`,
      headers: { cookie: session.cookie },
    });
    expect(image.statusCode).toBe(200);
    expect(image.headers["content-type"]).toContain("image/png");
    expect(image.headers["content-disposition"]).toContain("inline;");
    expect(image.headers["cache-control"]).toContain("immutable");
    expect(image.rawPayload).toEqual(imageData);

    const invalidRelationship = await built.app.inject({
      method: "GET",
      url: `/api/files/${fileId}/assets/rId999`,
      headers: { cookie: session.cookie },
    });
    expect(invalidRelationship.statusCode).toBe(404);

    const anonymous = await built.app.inject({
      method: "GET",
      url: `/api/files/${fileId}/assets/rId5`,
    });
    expect(anonymous.statusCode).toBe(401);
  });

  it("reports the OMML download conversion capability", async () => {
    const session = await login(built.app);
    const response = await built.app.inject({
      method: "GET",
      url: "/api/files/formula-capabilities",
      headers: { cookie: session.cookie },
    });

    expect(response.statusCode).toBe(200);
    const payload = response.json<{
      officeFormulaConversion: { available: boolean; message: string };
    }>();
    expect(typeof payload.officeFormulaConversion.available).toBe("boolean");
    expect(payload.officeFormulaConversion.message).toBeTruthy();

    const anonymous = await built.app.inject({
      method: "GET",
      url: "/api/files/formula-capabilities",
    });
    expect(anonymous.statusCode).toBe(401);
  });

  it("downloads DOCX files as Office Math by default and rejects MathType output", async () => {
    const session = await login(built.app);
    const zip = new JSZip();
    zip.file(
      "word/document.xml",
      `<?xml version="1.0" encoding="UTF-8"?>
       <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
         xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math">
         <w:body><w:p><w:r><w:t>公式测试</w:t></w:r><m:oMath><m:r><m:t>x=1</m:t></m:r></m:oMath></w:p></w:body>
       </w:document>`,
    );
    zip.file(
      "word/_rels/document.xml.rels",
      `<?xml version="1.0" encoding="UTF-8"?>
       <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>`,
    );
    zip.file(
      "[Content_Types].xml",
      `<?xml version="1.0" encoding="UTF-8"?>
       <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
         <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
         <Default Extension="xml" ContentType="application/xml"/>
       </Types>`,
    );
    const document = await zip.generateAsync({ type: "nodebuffer" });
    const multipart = multipartBufferPayload(
      "formula.docx",
      document,
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
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
    const file = upload.json<{ url: string }>();

    const officeDownload = await built.app.inject({
      method: "GET",
      url: file.url,
      headers: { cookie: session.cookie },
    });
    expect(officeDownload.statusCode).toBe(200);
    expect(officeDownload.headers["x-formula-format"]).toBe("office");
    const officeZip = await JSZip.loadAsync(officeDownload.rawPayload);
    const officeXml = await officeZip.file("word/document.xml")?.async("string");
    expect(officeXml).toContain("公式测试");
    expect(officeXml).toContain("<m:oMath");
    expect(officeXml).not.toContain("Equation.DSMT4");

    const mathTypeDownload = await built.app.inject({
      method: "GET",
      url: `${file.url}?formulaFormat=mathtype`,
      headers: { cookie: session.cookie },
    });
    expect(mathTypeDownload.statusCode).toBe(400);
    expect(mathTypeDownload.json()).toEqual({ error: "不支持的公式格式" });

    const invalid = await built.app.inject({
      method: "GET",
      url: `${file.url}?formulaFormat=legacy`,
      headers: { cookie: session.cookie },
    });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json()).toEqual({ error: "不支持的公式格式" });
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

    await built.store.createUser("tch-2", "file-reader@example.com", "OtherTeacher123");
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

  it("serves uploaded GeoGebra courseware through a tokenized public preview URL", async () => {
    const session = await login(built.app);
    const multipart = multipartPayload(
      "function.ggb",
      "geogebra-test-content",
      "application/vnd.geogebra.file",
    );
    const uploadResponse = await built.app.inject({
      method: "POST",
      url: "/api/files",
      headers: {
        cookie: session.cookie,
        "x-inteschool-csrf": session.csrfToken,
        "content-type": multipart.contentType,
      },
      payload: multipart.body,
    });
    expect(uploadResponse.statusCode).toBe(200);
    const uploaded = uploadResponse.json<{ url: string }>();

    const createResponse = await built.app.inject({
      method: "POST",
      url: "/api/rpc",
      headers: {
        cookie: session.cookie,
        "x-inteschool-csrf": session.csrfToken,
      },
      payload: {
        service: "courseware",
        method: "createCourseware",
        args: ["tch-1", "sch-1", {
          title: "函数图像",
          chapterIds: [],
          knowledgePointIds: [],
          grade: "高一",
          schoolYear: "2026-2027",
          semester: "上学期",
          type: "ggb",
          content: "动态函数图像",
          fileUrl: uploaded.url,
          fileName: "function.ggb",
          fileSize: 21,
          tags: [],
        }],
      },
    });
    expect(createResponse.statusCode).toBe(200);
    const created = createResponse.json<{ result: { onlineAccessToken: string } }>().result;
    expect(created.onlineAccessToken).toEqual(expect.any(String));

    const previewResponse = await built.app.inject({
      method: "GET",
      url: `/api/courseware-files/${created.onlineAccessToken}`,
    });
    expect(previewResponse.statusCode).toBe(200);
    expect(previewResponse.headers["content-type"]).toContain("application/vnd.geogebra.file");
    expect(previewResponse.headers["access-control-allow-origin"]).toBe("*");
    expect(previewResponse.body).toBe("geogebra-test-content");
  });

  it("supports public school RPC calls and rejects unknown RPC targets", async () => {
    const publicSchools = await built.app.inject({
      method: "POST",
      url: "/api/rpc",
      payload: { service: "school", method: "listSchools", args: [] },
    });
    expect(publicSchools.statusCode).toBe(200);
    expect(publicSchools.json<{ result: unknown[] }>().result.length).toBeGreaterThan(0);

    const publicClasses = await built.app.inject({
      method: "POST",
      url: "/api/rpc",
      payload: { service: "class", method: "listClassroomChoices", args: [] },
    });
    expect(publicClasses.statusCode).toBe(200);
    expect(publicClasses.json<{ result: Array<Record<string, unknown>> }>().result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: expect.any(String),
          schoolId: expect.any(String),
          schoolName: expect.any(String),
          name: expect.any(String),
          grade: expect.any(String),
        }),
      ]),
    );

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

    await built.store.createUser("tch-2", "other-teacher@example.com", "OtherTeacher123");
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

    await built.store.createUser("tch-2", "ordinary-reviewer@example.com", "OrdinaryPass123");
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

  it("supports multi-subject optional applications and platform-wide review", async () => {
    const beforeSchool = built.store.loadState();
    const stateWithSchool = structuredClone(beforeSchool);
    (stateWithSchool.schools as Array<Record<string, unknown>>).push({
      id: "sch-3",
      name: "跨校审核测试学校",
      code: "CROSS",
      logo: "跨",
      description: "用于测试平台管理员跨校审核",
      teacherCount: 0,
      studentCount: 0,
      city: "南京",
    });
    await built.store.saveState(beforeSchool, stateWithSchool);

    const applicant = await register(built.app, "optional-applicant@example.com");
    const missingSubjects = await built.app.inject({
      method: "POST",
      url: "/api/auth/applications",
      headers: {
        cookie: applicant.cookie,
        "x-inteschool-csrf": applicant.csrfToken,
      },
      payload: { schoolId: "sch-3" },
    });
    expect(missingSubjects.statusCode).toBe(400);

    const invalidRole = await built.app.inject({
      method: "POST",
      url: "/api/auth/applications",
      headers: {
        cookie: applicant.cookie,
        "x-inteschool-csrf": applicant.csrfToken,
      },
      payload: {
        schoolId: "sch-3",
        subjects: ["数学"],
        roles: ["platform_admin"],
      },
    });
    expect(invalidRole.statusCode).toBe(400);

    const apply = await built.app.inject({
      method: "POST",
      url: "/api/auth/applications",
      headers: {
        cookie: applicant.cookie,
        "x-inteschool-csrf": applicant.csrfToken,
      },
      payload: {
        schoolId: "sch-3",
        subjects: ["数学", "物理"],
        teachingGrades: ["高一", "高二"],
        position: "年级组长",
        roles: ["teacher", "headTeacher", "gradeLeader"],
        requestSchoolAdmin: true,
      },
    });
    expect(apply.statusCode, apply.body).toBe(200);
    const application = apply.json<{
      id: string;
      employeeNo: string;
      subjects: string[];
      proofFileId: null;
      requestSchoolAdmin: boolean;
      roles: string[];
    }>();
    expect(application).toMatchObject({
      employeeNo: "",
      subjects: ["数学", "物理"],
      proofFileId: null,
      requestSchoolAdmin: true,
      roles: ["teacher", "headTeacher", "gradeLeader"],
    });

    const schoolAdmin = await login(built.app);
    const schoolScopedPending = await built.app.inject({
      method: "GET",
      url: "/api/auth/applications/pending",
      headers: { cookie: schoolAdmin.cookie },
    });
    expect(schoolScopedPending.statusCode).toBe(200);
    expect(schoolScopedPending.json<Array<{ id: string }>>().map((item) => item.id))
      .not.toContain(application.id);

    const schoolAdminReview = await built.app.inject({
      method: "POST",
      url: `/api/auth/applications/${application.id}/review`,
      headers: {
        cookie: schoolAdmin.cookie,
        "x-inteschool-csrf": schoolAdmin.csrfToken,
      },
      payload: { approved: true },
    });
    expect(schoolAdminReview.statusCode).toBe(404);

    const beforePromotion = built.store.loadState();
    const promotedState = structuredClone(beforePromotion);
    const platformTeacher = promotedState.teachers.find((item) => item.id === "tch-1")!;
    platformTeacher.role = "platform_admin";
    platformTeacher.affiliations = platformTeacher.affiliations.map((item) => item.id === platformTeacher.currentAffiliationId
      ? { ...item, role: "platform_admin" }
      : item);
    await built.store.saveState(beforePromotion, promotedState);

    const platformAdmin = await login(built.app);
    const platformPending = await built.app.inject({
      method: "GET",
      url: "/api/auth/applications/pending",
      headers: { cookie: platformAdmin.cookie },
    });
    expect(platformPending.statusCode).toBe(200);
    expect(platformPending.json<Array<Record<string, unknown>>>()).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: application.id,
        teacherName: "测试教师",
        schoolName: "跨校审核测试学校",
        subjects: ["数学", "物理"],
      }),
    ]));

    const approved = await built.app.inject({
      method: "POST",
      url: `/api/auth/applications/${application.id}/review`,
      headers: {
        cookie: platformAdmin.cookie,
        "x-inteschool-csrf": platformAdmin.csrfToken,
      },
      payload: { approved: true },
    });
    expect(approved.statusCode, approved.body).toBe(200);

    const refreshed = await built.app.inject({
      method: "GET",
      url: "/api/auth/current",
      headers: { cookie: applicant.cookie },
    });
    const teacher = refreshed.json<{
      teacher: {
        schoolId: string;
        subject: string;
        subjects: string[];
        position: string;
        role: string;
        roles: string[];
        affiliations: Array<Record<string, unknown>>;
      };
    }>().teacher;
    expect(teacher).toMatchObject({
      schoolId: "sch-3",
      subject: "数学",
      subjects: ["数学", "物理"],
      position: "年级组长",
      role: "school_admin",
      roles: ["teacher", "headTeacher", "gradeLeader"],
    });
    expect(teacher.affiliations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        schoolId: "sch-3",
        subjects: ["数学", "物理"],
        teachingGrades: ["高一", "高二"],
        position: "年级组长",
        role: "school_admin",
        roles: ["teacher", "headTeacher", "gradeLeader"],
      }),
    ]));
  });

  it("persists and filters resource semesters", async () => {
    const session = await login(built.app);
    const teacherId = String(session.teacher.id);
    const schoolId = String(session.teacher.schoolId);
    const headers = {
      cookie: session.cookie,
      "x-inteschool-csrf": session.csrfToken,
    };

    const createLecture = await built.app.inject({
      method: "POST",
      url: "/api/rpc",
      headers,
      payload: {
        service: "lecture",
        method: "createLecture",
        args: [teacherId, schoolId, {
          title: "暑假专题讲义",
          description: "issue 30 regression",
          chapterIds: [],
          knowledgePointIds: [],
          grade: "高二",
          schoolYear: "2026-2027",
          semester: "暑假",
          classIds: [],
          studentIds: [],
          sections: [],
        }],
      },
    });
    expect(createLecture.statusCode).toBe(200);
    const lecture = createLecture.json<{ result: { id: string; semester: string } }>().result;
    expect(lecture.semester).toBe("暑假");

    const summerLectures = await built.app.inject({
      method: "POST",
      url: "/api/rpc",
      headers,
      payload: {
        service: "lecture",
        method: "listLectures",
        args: [{ teacherId, semester: "暑假" }],
      },
    });
    expect(summerLectures.statusCode).toBe(200);
    expect(summerLectures.json<{ result: Array<{ id: string }> }>().result)
      .toContainEqual(expect.objectContaining({ id: lecture.id }));

    const winterLectures = await built.app.inject({
      method: "POST",
      url: "/api/rpc",
      headers,
      payload: {
        service: "lecture",
        method: "listLectures",
        args: [{ teacherId, semester: "寒假" }],
      },
    });
    expect(winterLectures.statusCode).toBe(200);
    expect(winterLectures.json<{ result: Array<{ id: string }> }>().result)
      .not.toContainEqual(expect.objectContaining({ id: lecture.id }));

    const createQuestion = await built.app.inject({
      method: "POST",
      url: "/api/rpc",
      headers,
      payload: {
        service: "question",
        method: "createQuestion",
        args: [teacherId, schoolId, {
          type: "short",
          stem: "默认学期测试",
          answer: "上学期",
          analysis: "未显式传入学期时使用兼容默认值",
          chapterIds: [],
          knowledgePointIds: [],
          grade: "高二",
          schoolYear: "2026-2027",
          difficulty: 1,
          recommendation: 1,
        }],
      },
    });
    expect(createQuestion.statusCode).toBe(200);
    expect(createQuestion.json<{ result: { semester: string } }>().result.semester).toBe("上学期");
  });

  it("imports a schema v5 SQLite database into PostgreSQL storage exactly once", async () => {
    const sourceState = built.store.loadState();
    const sourceTeacher = sourceState.teachers[0];
    const sourceSchool = (sourceState.schools as Array<Record<string, unknown>>)[0];
    expect(sourceTeacher).toBeTruthy();
    expect(sourceSchool).toBeTruthy();

    await built.app.close();
    const legacyPath = join(workDir, "legacy-v5.sqlite");
    const legacy = new Database(legacyPath);
    legacy.exec(`
      CREATE TABLE app_records (
        collection TEXT NOT NULL,
        id TEXT NOT NULL,
        school_id TEXT,
        owner_id TEXT,
        data_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (collection, id)
      );
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        teacher_id TEXT NOT NULL UNIQUE,
        email TEXT,
        phone TEXT UNIQUE,
        password_hash TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE sessions (
        id TEXT PRIMARY KEY,
        token_hash TEXT NOT NULL UNIQUE,
        csrf_token TEXT NOT NULL,
        user_id TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        last_seen_at TEXT NOT NULL
      );
      CREATE TABLE parent_users (
        id TEXT PRIMARY KEY,
        parent_id TEXT NOT NULL UNIQUE,
        phone TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE parent_sessions (
        id TEXT PRIMARY KEY,
        token_hash TEXT NOT NULL UNIQUE,
        csrf_token TEXT NOT NULL,
        parent_user_id TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        last_seen_at TEXT NOT NULL
      );
      CREATE TABLE files (
        id TEXT PRIMARY KEY,
        owner_id TEXT NOT NULL,
        school_id TEXT,
        original_name TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        size INTEGER NOT NULL,
        storage_name TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL
      );
      CREATE TABLE registration_authorizations (
        id TEXT PRIMARY KEY,
        phone TEXT NOT NULL,
        kind TEXT NOT NULL,
        school_id TEXT NOT NULL,
        created_by_teacher_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        consumed_by_teacher_id TEXT,
        consumed_at TEXT,
        revoked_at TEXT
      );
      CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    `);
    const now = new Date().toISOString();
    const legacyTeacher = {
      ...sourceTeacher,
      id: "legacy-pg-teacher",
      email: "legacy-pg@example.com",
      name: "迁移教师",
      schoolId: String(sourceSchool.id),
      createdAt: now,
    };
    const legacyQuestion = {
      id: "legacy-pg-question",
      teacherId: legacyTeacher.id,
      schoolId: legacyTeacher.schoolId,
      type: "short",
      stem: "PostgreSQL 迁移题",
      answer: "保留",
      analysis: "来自旧 SQLite",
      summary: "迁移验证",
      chapterIds: [],
      knowledgePointIds: [],
      difficulty: 2,
      recommendation: 3,
      usageCount: 0,
      remark: "legacy",
      isShared: false,
      hiddenByExamIds: [],
      createdAt: now,
      updatedAt: now,
    };
    const insertRecord = legacy.prepare(`
      INSERT INTO app_records(collection, id, school_id, owner_id, data_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    insertRecord.run("schools", String(sourceSchool.id), String(sourceSchool.id), null, JSON.stringify(sourceSchool), now, now);
    insertRecord.run("teachers", legacyTeacher.id, legacyTeacher.schoolId, legacyTeacher.id, JSON.stringify(legacyTeacher), now, now);
    insertRecord.run("questions", legacyQuestion.id, legacyQuestion.schoolId, legacyQuestion.teacherId, JSON.stringify(legacyQuestion), now, now);
    legacy.prepare(`
      INSERT INTO users(id, teacher_id, email, phone, password_hash, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      "legacy-pg-user",
      legacyTeacher.id,
      legacyTeacher.email,
      "13800009999",
      hashPassword("LegacyPostgres123"),
      now,
      now,
    );
    legacy.prepare("INSERT INTO metadata(key, value) VALUES ('schema_version', '5')").run();
    legacy.close();

    const targetPath = join(workDir, "postgres-import-target");
    built = await buildApp({
      databasePath: targetPath,
      legacyDatabasePath: legacyPath,
      uploadsDir: join(workDir, "legacy-import-uploads"),
      seedStatePath: resolve("server/seed-state.json"),
      serveStatic: false,
      logger: false,
      enableDemoAccount: false,
      seedDemoData: false,
      cookieSecure: false,
    });
    await built.app.ready();

    expect(built.store.getTeacherById(legacyTeacher.id)).toMatchObject({
      id: legacyTeacher.id,
      email: legacyTeacher.email,
      name: legacyTeacher.name,
    });
    expect((built.store.loadState().questions as Array<Record<string, unknown>>)).toEqual([
      expect.objectContaining({ id: legacyQuestion.id, stem: legacyQuestion.stem }),
    ]);
    const migratedLogin = await built.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { identifier: legacyTeacher.email, password: "LegacyPostgres123" },
    });
    expect(migratedLogin.statusCode, migratedLogin.body).toBe(200);

    await built.app.close();
    built = await buildApp({
      databasePath: targetPath,
      legacyDatabasePath: legacyPath,
      uploadsDir: join(workDir, "legacy-import-uploads"),
      seedStatePath: resolve("server/seed-state.json"),
      serveStatic: false,
      logger: false,
      enableDemoAccount: false,
      seedDemoData: false,
      cookieSecure: false,
    });
    await built.app.ready();
    expect((built.store.loadState().questions as Array<Record<string, unknown>>)
      .filter((question) => question.id === legacyQuestion.id)).toHaveLength(1);
  });

});
