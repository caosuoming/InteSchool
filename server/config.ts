import { resolve } from "node:path";

function booleanEnv(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function integerEnv(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value || "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function trustProxyEnv(value: string | undefined): boolean | number | string {
  const normalized = value?.trim();
  if (!normalized || ["0", "false", "no", "off"].includes(normalized.toLowerCase())) return false;
  if (/^[1-9]\d*$/.test(normalized)) return Number.parseInt(normalized, 10);
  return normalized;
}

export interface ServerConfig {
  host: string;
  port: number;
  databaseUrl: string;
  databasePoolMax: number;
  databasePath: string;
  legacyDatabasePath: string;
  uploadsDir: string;
  distDir: string;
  seedStatePath: string;
  seedDemoData: boolean;
  sessionDays: number;
  cookieSecure: boolean;
  enableDemoAccount: boolean;
  demoEmail: string;
  demoPassword: string;
  bootstrapAdminEmail: string;
  bootstrapAdminPassword: string;
  bootstrapAdminName: string;
  bootstrapSchoolId: string;
  bootstrapSchoolName: string;
  bootstrapSchoolCode: string;
  bootstrapSchoolCity: string;
  autoApproveApplications: boolean;
  trustProxy: boolean | number | string;
  logger: boolean;
  serveStatic: boolean;
  maxUploadBytes: number;
  documentExtractionConcurrency: number;
}

export function loadConfig(overrides: Partial<ServerConfig> = {}): ServerConfig {
  const dataDir = resolve(process.env.INTESCHOOL_DATA_DIR || "data");
  return {
    host: process.env.HOST || "0.0.0.0",
    port: integerEnv(process.env.PORT, 3000),
    databaseUrl: process.env.INTESCHOOL_DATABASE_URL?.trim() || "",
    databasePoolMax: Math.max(1, integerEnv(process.env.INTESCHOOL_DATABASE_POOL_MAX, 10)),
    databasePath: resolve(process.env.INTESCHOOL_DATABASE_PATH || `${dataDir}/inteschool-test`),
    legacyDatabasePath: resolve(process.env.INTESCHOOL_LEGACY_SQLITE_PATH || `${dataDir}/inteschool.sqlite`),
    uploadsDir: resolve(process.env.INTESCHOOL_UPLOADS_DIR || `${dataDir}/uploads`),
    distDir: resolve(process.env.INTESCHOOL_DIST_DIR || "dist"),
    seedStatePath: resolve(process.env.INTESCHOOL_SEED_PATH || "server/seed-state.json"),
    seedDemoData: booleanEnv(
      process.env.INTESCHOOL_SEED_DEMO_DATA,
      process.env.NODE_ENV !== "production",
    ),
    sessionDays: integerEnv(process.env.INTESCHOOL_SESSION_DAYS, 30),
    cookieSecure: booleanEnv(process.env.INTESCHOOL_COOKIE_SECURE, false),
    enableDemoAccount: booleanEnv(
      process.env.INTESCHOOL_ENABLE_DEMO,
      process.env.NODE_ENV !== "production",
    ),
    demoEmail: process.env.INTESCHOOL_DEMO_EMAIL || "li.zhang@bj04.edu.cn",
    demoPassword: process.env.INTESCHOOL_DEMO_PASSWORD || "demo123456",
    bootstrapAdminEmail: process.env.INTESCHOOL_BOOTSTRAP_ADMIN_EMAIL || "",
    bootstrapAdminPassword: process.env.INTESCHOOL_BOOTSTRAP_ADMIN_PASSWORD || "",
    bootstrapAdminName: process.env.INTESCHOOL_BOOTSTRAP_ADMIN_NAME || "平台管理员",
    bootstrapSchoolId: process.env.INTESCHOOL_BOOTSTRAP_SCHOOL_ID || "sch-1",
    bootstrapSchoolName: process.env.INTESCHOOL_BOOTSTRAP_SCHOOL_NAME || "InteSchool 初始学校",
    bootstrapSchoolCode: process.env.INTESCHOOL_BOOTSTRAP_SCHOOL_CODE || "INITIAL",
    bootstrapSchoolCity: process.env.INTESCHOOL_BOOTSTRAP_SCHOOL_CITY || "",
    autoApproveApplications: booleanEnv(process.env.INTESCHOOL_AUTO_APPROVE_APPLICATIONS, false),
    trustProxy: trustProxyEnv(process.env.INTESCHOOL_TRUST_PROXY),
    logger: booleanEnv(process.env.INTESCHOOL_LOGGER, true),
    serveStatic: booleanEnv(process.env.INTESCHOOL_SERVE_STATIC, true),
    maxUploadBytes: integerEnv(process.env.INTESCHOOL_MAX_UPLOAD_BYTES, 50 * 1024 * 1024),
    documentExtractionConcurrency: Math.max(
      1,
      integerEnv(process.env.INTESCHOOL_DOCUMENT_EXTRACTION_CONCURRENCY, 2),
    ),
    ...overrides,
  };
}
