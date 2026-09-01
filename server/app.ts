import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import cookie from "@fastify/cookie";
import compress from "@fastify/compress";
import helmet from "@fastify/helmet";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import { ZodError, z } from "zod";
import { loadConfig, type ServerConfig } from "./config.js";
import { DatabaseStore, DuplicateAccountError } from "./database.js";
import { invokeRpc } from "./rpc.js";
import {
  CLASSROOM_DEVICE_COOKIE,
  CLASSROOM_DEVICE_COOKIE_MAX_AGE,
  classroomDeviceTokenFromRpc,
} from "./classroom-device-auth.js";
import { getSession, registerAuthRoutes, requireCsrf } from "./routes/auth.js";
import { registerFileRoutes } from "./routes/files.js";
import { registerParentRoutes } from "./routes/parent.js";

const rpcSchema = z.object({
  service: z.string().regex(/^[A-Za-z][A-Za-z0-9]*$/).max(50),
  method: z.string().regex(/^[A-Za-z][A-Za-z0-9]*$/).max(80),
  args: z.array(z.unknown()).max(20).default([]),
});

const STATIC_ASSET_PATH = /\.(?:css|eot|gif|ico|jpe?g|js|json|map|otf|png|svg|ttf|wasm|webp|woff2?)$/i;
const DOCX_PREVIEW_ASSET_PATH = /^\/api\/files\/[^/?]+\/assets\/[^/?]+(?:\?|$)/;

function rateLimitAllowList(request: FastifyRequest): boolean {
  if (!request.url.startsWith("/api/")) return true;
  return request.method === "GET" && DOCX_PREVIEW_ASSET_PATH.test(request.url);
}

function isStaticAssetRequest(url: string): boolean {
  const path = url.split("?", 1)[0];
  return path.startsWith("/assets/") || STATIC_ASSET_PATH.test(path);
}

function statusForError(error: Error): number {
  if (error instanceof ZodError) return 400;
  if (error instanceof DuplicateAccountError) return 409;
  const declaredStatus = (error as Error & { statusCode?: unknown }).statusCode;
  if (
    typeof declaredStatus === "number"
    && Number.isInteger(declaredStatus)
    && declaredStatus >= 400
    && declaredStatus <= 599
  ) return declaredStatus;
  if (
    error.message.includes("请先登录")
    || error.message.includes("未登录")
    || error.message.includes("邮箱或密码错误")
    || error.message.includes("邮箱、手机号或密码错误")
    || error.message.includes("手机号或密码错误")
  ) return 401;
  if (error.message.includes("无权") || error.message.includes("管理员权限")) return 403;
  if (error.message.includes("不存在")) return 404;
  if (error.message.includes("AI 服务请求超时") || error.message.includes("在线资源请求超时")) return 504;
  if (
    error.message.startsWith("AI 服务")
    || error.message.startsWith("在线资源请求失败")
    || error.message.startsWith("在线资源返回 HTTP")
  ) return 502;
  const systemCode = (error as NodeJS.ErrnoException).code;
  if (typeof systemCode === "string") return 500;
  if ([
    "业务数据库上下文未初始化",
    "生产环境不支持通过业务服务重置数据库",
    "账号创建失败",
  ].includes(error.message)) return 500;
  return 400;
}

export interface BuiltApp {
  app: FastifyInstance;
  store: DatabaseStore;
  config: ServerConfig;
}

export async function buildApp(overrides: Partial<ServerConfig> = {}): Promise<BuiltApp> {
  const config = loadConfig(overrides);
  const app = Fastify({
    logger: config.logger,
    bodyLimit: 5 * 1024 * 1024,
    trustProxy: config.trustProxy,
  });
  const store = await DatabaseStore.open(config);

  await app.register(cookie);
  await app.register(compress);
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "https://www.geogebra.org"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "blob:", "https://www.geogebra.org"],
        fontSrc: ["'self'", "data:", "https://www.geogebra.org"],
        connectSrc: ["'self'", "https://www.geogebra.org"],
        workerSrc: ["'self'", "blob:", "https://www.geogebra.org"],
        frameSrc: ["'self'", "https://view.officeapps.live.com"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
      },
    },
  });
  await app.register(rateLimit, {
    max: 300,
    timeWindow: "1 minute",
    allowList: rateLimitAllowList,
  });
  await app.register(multipart, {
    limits: { files: 1, fileSize: config.maxUploadBytes, fields: 10 },
  });

  app.setErrorHandler((unknownError, request, reply) => {
    const error = unknownError instanceof Error ? unknownError : new Error("未知服务器错误");
    request.log.warn({ err: error }, "request failed");
    const status = statusForError(error);
    const message = error instanceof ZodError
      ? "请求参数不合法"
      : status >= 500
        ? "服务器内部错误"
        : error.message;
    reply.code(status).send({ error: message });
  });

  app.get("/api/health", async () => ({ status: "ok" }));
  app.get("/api/ready", async () => {
    await store.ping();
    return { status: "ready" };
  });

  await registerAuthRoutes(app, store, config);
  await registerParentRoutes(app, store, config);
  await registerFileRoutes(app, store, config);

  app.post("/api/rpc", async (request, reply) => {
    const input = rpcSchema.parse(request.body);
    const session = await getSession(request, store);
    if (session) requireCsrf(request, session);
    const result = await invokeRpc(store, session, input.service, input.method, input.args);
    const classroomDeviceToken = classroomDeviceTokenFromRpc(input);
    if (classroomDeviceToken) {
      reply.setCookie(CLASSROOM_DEVICE_COOKIE, classroomDeviceToken, {
        path: "/",
        httpOnly: true,
        sameSite: "lax",
        secure: config.cookieSecure,
        maxAge: CLASSROOM_DEVICE_COOKIE_MAX_AGE,
      });
    }
    return { result };
  });

  if (config.serveStatic) {
    await access(config.distDir, constants.R_OK);
    await app.register(fastifyStatic, {
      root: config.distDir,
      prefix: "/",
      wildcard: false,
      decorateReply: true,
      maxAge: 0,
      immutable: false,
      setHeaders(reply, path) {
        const normalizedPath = path.replaceAll("\\", "/");
        if (normalizedPath.includes("/assets/")) {
          reply.header("Cache-Control", "public, max-age=31536000, immutable");
          return;
        }
        reply.header("Cache-Control", "no-cache");
      },
    });
    app.setNotFoundHandler(async (request, reply) => {
      if (request.url.startsWith("/api/")) return reply.code(404).send({ error: "接口不存在" });
      if (isStaticAssetRequest(request.url)) {
        return reply.code(404).type("text/plain; charset=utf-8").send("静态资源不存在");
      }
      const html = await readFile(`${config.distDir}/index.html`, "utf8");
      reply.type("text/html; charset=utf-8").header("Cache-Control", "no-store");
      return reply.send(html);
    });
  }



  app.addHook("onClose", async () => {
    await store.close();
  });
  await store.cleanupSessions();
  return { app, store, config };
}
