import { access, mkdir, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import type {
  Question,
  QuestionFilter,
} from "../src/types/index.js";
import { DEFAULT_QUESTION_TYPES } from "../src/types/index.js";
import type {
  AppState,
  ParentAccountRecord,
  ParentSessionUser,
  RegistrationAuthorizationRecord,
  SessionUser,
  StoredFile,
  TeacherRecord,
} from "./types.js";
import type { ServerConfig } from "./config.js";
import { hashPassword, verifyPassword } from "./lib/password.js";
import { createSqlClient, type SqlClient, type SqlConnection } from "./sql-client.js";

export const COLLECTIONS = [
  "schools", "teachers", "applications", "schoolClasses", "personalClasses",
  "schoolGrades", "classTypeCategories", "students", "chapters", "knowledgePoints",
  "directoryCatalogs", "directoryDonations",
  "schoolChapters", "schoolKnowledgePoints", "questions",
  "lectures", "lectureColumnTemplates", "examPapers", "coursewares", "materials", "resourceFolders", "baskets", "documents",
  "recognitions", "answerRecords", "subjectGroups", "prepGroups", "organizationDepartments", "onlineResources",
  "prepTasks", "questionReferences", "schoolSettings", "examPaperTypes", "lectureTypes",
  "shareRecords", "examPublications", "lessonCoursewares", "reflections",
  "classroomHomeworks", "classroomNotices", "classroomDevices",
  "studentInteractions", "studentInteractionFollows", "homeworkKnowledgeRecords", "homeworkRecordPreferences", "studentArchiveRecords", "schoolBackups", "platformResourceSettings", "platformResourceCorrections", "schoolAdminApplications",
  "schoolCreationApplications",
  "gradeExams", "gradePublications", "gradeTemplateProfiles", "gradeCohortSettings", "examArrangements", "examInvigilationProfiles", "teachingScheduleProfiles",
  "notifications", "parentAuthorizations", "parentAccounts",
  "helpTopics", "helpReplies", "helpCategories",
] as const;

type CollectionName = (typeof COLLECTIONS)[number];
type JsonRecord = { id: string; [key: string]: unknown };

interface UserRow {
  id: string;
  teacher_id: string;
  email: string | null;
  phone: string | null;
  password_hash: string;
}

interface SessionRow extends UserRow {
  csrf_token: string;
  expires_at: string | Date;
}

interface ParentUserRow {
  id: string;
  parent_id: string;
  phone: string;
  password_hash: string;
}

interface ParentSessionRow extends ParentUserRow {
  csrf_token: string;
  expires_at: string | Date;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function normalizePhone(phone: string): string {
  return phone.trim().replace(/[\s()-]/g, "").replace(/^\+86/, "");
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function recordScope(record: JsonRecord): { schoolId: string | null; ownerId: string | null } {
  const schoolId = typeof record.schoolId === "string"
    ? record.schoolId
    : typeof record.publisherSchoolId === "string"
      ? record.publisherSchoolId
      : typeof record.fromSchoolId === "string"
        ? record.fromSchoolId
        : null;
  const ownerId = ["teacherId", "ownerId", "createdBy", "fromTeacherId", "publisherId"]
    .map((key) => record[key])
    .find((value): value is string => typeof value === "string") || null;
  return { schoolId, ownerId };
}

function publicTeacher(teacher: TeacherRecord): TeacherRecord {
  const copy = structuredClone(teacher);
  delete copy.password;
  delete copy.wechatOpenId;
  delete copy.wechatUnionId;
  delete copy.wecomUserId;
  delete copy.wecomCorpId;
  return copy;
}

function jsonValue<T>(value: unknown): T {
  return (typeof value === "string" ? JSON.parse(value) : value) as T;
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
  return Object.freeze(value);
}

function iso(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}

function isUniqueViolation(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && (error as { code?: unknown }).code === "23505");
}

export class DuplicateAccountError extends Error {}

export class DatabaseStore {
  private stateCache: AppState = { teachers: [], currentTeacherId: null };
  private recordJsonCache = new Map<CollectionName, Map<string, string>>();

  private constructor(
    private readonly config: ServerConfig,
    private readonly sql: SqlClient,
  ) {
    for (const collection of COLLECTIONS) this.stateCache[collection] = [];
  }

  static async open(config: ServerConfig): Promise<DatabaseStore> {
    await mkdir(config.uploadsDir, { recursive: true });
    const sql = await createSqlClient(config);
    const store = new DatabaseStore(config, sql);
    try {
      await store.migrateSchema();
      await store.importLegacySqliteIfNeeded();
      await store.seed();
      await store.reloadStateCache();
      await store.ensureDemoAccount();
      await store.ensureBootstrapAdmin();
      return store;
    } catch (error) {
      await sql.close();
      throw error;
    }
  }

  async close(): Promise<void> {
    await this.sql.close();
  }

  async ping(): Promise<void> {
    await this.sql.query("SELECT 1");
  }

  private async migrateSchema(): Promise<void> {
    await this.sql.query(`
      CREATE TABLE IF NOT EXISTS app_records (
        collection TEXT NOT NULL,
        id TEXT NOT NULL,
        school_id TEXT,
        owner_id TEXT,
        data_json JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL,
        PRIMARY KEY (collection, id)
      )
    `);
    await this.sql.query(`
      CREATE INDEX IF NOT EXISTS idx_records_collection_school
        ON app_records(collection, school_id)
    `);
    await this.sql.query(`
      CREATE INDEX IF NOT EXISTS idx_records_collection_owner
        ON app_records(collection, owner_id)
    `);
    await this.sql.query(`
      CREATE INDEX IF NOT EXISTS idx_records_data_gin
        ON app_records USING GIN(data_json jsonb_path_ops)
    `);
    await this.sql.query(`
      CREATE INDEX IF NOT EXISTS idx_questions_duplicate_hash
        ON app_records((data_json->>'duplicateHash'))
        WHERE collection = 'questions'
    `);
    await this.sql.query(`
      CREATE INDEX IF NOT EXISTS idx_questions_school_teacher
        ON app_records(school_id, owner_id)
        WHERE collection = 'questions'
    `);
    await this.sql.query(`
      CREATE INDEX IF NOT EXISTS idx_questions_chapter_ids_gin
        ON app_records USING GIN ((coalesce(data_json->'chapterIds', '[]'::jsonb)))
        WHERE collection = 'questions'
    `);
    await this.sql.query(`
      CREATE INDEX IF NOT EXISTS idx_questions_knowledge_ids_gin
        ON app_records USING GIN ((coalesce(data_json->'knowledgePointIds', '[]'::jsonb)))
        WHERE collection = 'questions'
    `);
    await this.sql.query(`
      CREATE INDEX IF NOT EXISTS idx_teachers_email_lower
        ON app_records(lower(data_json->>'email'))
        WHERE collection = 'teachers'
    `);
    await this.sql.query(`
      CREATE INDEX IF NOT EXISTS idx_schools_name_lower
        ON app_records(lower(data_json->>'name'))
        WHERE collection = 'schools'
    `);
    await this.sql.query(`
      CREATE INDEX IF NOT EXISTS idx_schools_code_lower
        ON app_records(lower(data_json->>'code'))
        WHERE collection = 'schools'
    `);

    if (this.sql.kind === "postgres") {
      await this.sql.query("CREATE EXTENSION IF NOT EXISTS pg_trgm");
      await this.sql.query(`
        CREATE INDEX IF NOT EXISTS idx_questions_search_trgm
          ON app_records USING GIN (
            lower(
              coalesce(data_json->>'stem', '') || ' ' ||
              coalesce(data_json->>'analysis', '') || ' ' ||
              coalesce(data_json->>'summary', '') || ' ' ||
              coalesce(data_json->>'remark', '') || ' ' ||
              coalesce((data_json->'remarks')::text, '')
            ) gin_trgm_ops
          )
          WHERE collection = 'questions'
      `);
    }

    await this.sql.query(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        teacher_id TEXT NOT NULL UNIQUE,
        email TEXT,
        phone TEXT UNIQUE,
        password_hash TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL
      )
    `);
    await this.sql.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_lower
        ON users(lower(email)) WHERE email IS NOT NULL
    `);
    await this.sql.query(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        token_hash TEXT NOT NULL UNIQUE,
        csrf_token TEXT NOT NULL,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL,
        last_seen_at TIMESTAMPTZ NOT NULL
      )
    `);
    await this.sql.query("CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at)");

    await this.sql.query(`
      CREATE TABLE IF NOT EXISTS parent_users (
        id TEXT PRIMARY KEY,
        parent_id TEXT NOT NULL UNIQUE,
        phone TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL
      )
    `);
    await this.sql.query(`
      CREATE TABLE IF NOT EXISTS parent_sessions (
        id TEXT PRIMARY KEY,
        token_hash TEXT NOT NULL UNIQUE,
        csrf_token TEXT NOT NULL,
        parent_user_id TEXT NOT NULL REFERENCES parent_users(id) ON DELETE CASCADE,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL,
        last_seen_at TIMESTAMPTZ NOT NULL
      )
    `);
    await this.sql.query("CREATE INDEX IF NOT EXISTS idx_parent_sessions_expiry ON parent_sessions(expires_at)");

    await this.sql.query(`
      CREATE TABLE IF NOT EXISTS files (
        id TEXT PRIMARY KEY,
        owner_id TEXT NOT NULL,
        school_id TEXT,
        original_name TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        size BIGINT NOT NULL,
        storage_name TEXT NOT NULL UNIQUE,
        created_at TIMESTAMPTZ NOT NULL
      )
    `);
    await this.sql.query("CREATE INDEX IF NOT EXISTS idx_files_owner ON files(owner_id)");

    await this.sql.query(`
      CREATE TABLE IF NOT EXISTS registration_authorizations (
        id TEXT PRIMARY KEY,
        phone TEXT NOT NULL,
        kind TEXT NOT NULL CHECK(kind IN ('admin', 'guarantee')),
        school_id TEXT NOT NULL,
        created_by_teacher_id TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL,
        consumed_by_teacher_id TEXT,
        consumed_at TIMESTAMPTZ,
        revoked_at TIMESTAMPTZ
      )
    `);
    await this.sql.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_registration_authorizations_active_phone
        ON registration_authorizations(phone)
        WHERE consumed_at IS NULL AND revoked_at IS NULL
    `);
    await this.sql.query(`
      CREATE INDEX IF NOT EXISTS idx_registration_authorizations_school
        ON registration_authorizations(school_id, created_at DESC)
    `);
    await this.sql.query(`
      CREATE INDEX IF NOT EXISTS idx_registration_authorizations_creator
        ON registration_authorizations(created_by_teacher_id, created_at DESC)
    `);
    await this.sql.query(`
      CREATE TABLE IF NOT EXISTS metadata (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `);
  }

  private async importLegacySqliteIfNeeded(): Promise<void> {
    if (!await this.hasLegacySqlite(this.config.legacyDatabasePath)) return;

    const targetCounts = await this.sql.query<{ records: string; users: string }>(`
      SELECT
        (SELECT COUNT(*) FROM app_records)::text AS records,
        (SELECT COUNT(*) FROM users)::text AS users
    `);
    const target = targetCounts.rows[0];
    if (Number(target?.records || 0) > 0 || Number(target?.users || 0) > 0) return;

    const { default: SqliteDatabase } = await import("better-sqlite3");
    const legacy = new SqliteDatabase(this.config.legacyDatabasePath, {
      readonly: true,
      fileMustExist: true,
    });
    try {
      const metadataRows = legacy.prepare("SELECT key, value FROM metadata").all() as Array<{ key: string; value: string }>;
      const schemaVersion = Number.parseInt(metadataRows.find((row) => row.key === "schema_version")?.value || "1", 10);
      if (schemaVersion < 5) {
        throw new Error(`旧 SQLite 数据库 schema_version=${schemaVersion}，请先使用迁移前版本升级到 schema_version 5`);
      }

      const appRecords = legacy.prepare(`
        SELECT collection, id, school_id, owner_id, data_json, created_at, updated_at FROM app_records
      `).all() as Array<Record<string, unknown>>;
      const users = legacy.prepare(`
        SELECT id, teacher_id, email, phone, password_hash, created_at, updated_at FROM users
      `).all() as Array<Record<string, unknown>>;
      const sessions = legacy.prepare(`
        SELECT id, token_hash, csrf_token, user_id, expires_at, created_at, last_seen_at FROM sessions
      `).all() as Array<Record<string, unknown>>;
      const parentUsers = legacy.prepare(`
        SELECT id, parent_id, phone, password_hash, created_at, updated_at FROM parent_users
      `).all() as Array<Record<string, unknown>>;
      const parentSessions = legacy.prepare(`
        SELECT id, token_hash, csrf_token, parent_user_id, expires_at, created_at, last_seen_at FROM parent_sessions
      `).all() as Array<Record<string, unknown>>;
      const files = legacy.prepare(`
        SELECT id, owner_id, school_id, original_name, mime_type, size, storage_name, created_at FROM files
      `).all() as Array<Record<string, unknown>>;
      const authorizations = legacy.prepare(`
        SELECT id, phone, kind, school_id, created_by_teacher_id, created_at,
               consumed_by_teacher_id, consumed_at, revoked_at
        FROM registration_authorizations
      `).all() as Array<Record<string, unknown>>;

      await this.sql.transaction(async (client) => {
        for (const row of appRecords) {
          await client.query(`
            INSERT INTO app_records(collection, id, school_id, owner_id, data_json, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)
          `, [row.collection, row.id, row.school_id, row.owner_id, row.data_json, row.created_at, row.updated_at]);
        }
        for (const row of users) {
          await client.query(`
            INSERT INTO users(id, teacher_id, email, phone, password_hash, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
          `, [row.id, row.teacher_id, row.email, row.phone, row.password_hash, row.created_at, row.updated_at]);
        }
        for (const row of sessions) {
          await client.query(`
            INSERT INTO sessions(id, token_hash, csrf_token, user_id, expires_at, created_at, last_seen_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
          `, [row.id, row.token_hash, row.csrf_token, row.user_id, row.expires_at, row.created_at, row.last_seen_at]);
        }
        for (const row of parentUsers) {
          await client.query(`
            INSERT INTO parent_users(id, parent_id, phone, password_hash, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6)
          `, [row.id, row.parent_id, row.phone, row.password_hash, row.created_at, row.updated_at]);
        }
        for (const row of parentSessions) {
          await client.query(`
            INSERT INTO parent_sessions(id, token_hash, csrf_token, parent_user_id, expires_at, created_at, last_seen_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
          `, [row.id, row.token_hash, row.csrf_token, row.parent_user_id, row.expires_at, row.created_at, row.last_seen_at]);
        }
        for (const row of files) {
          await client.query(`
            INSERT INTO files(id, owner_id, school_id, original_name, mime_type, size, storage_name, created_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          `, [row.id, row.owner_id, row.school_id, row.original_name, row.mime_type, row.size, row.storage_name, row.created_at]);
        }
        for (const row of authorizations) {
          await client.query(`
            INSERT INTO registration_authorizations(
              id, phone, kind, school_id, created_by_teacher_id, created_at,
              consumed_by_teacher_id, consumed_at, revoked_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          `, [
            row.id, row.phone, row.kind, row.school_id, row.created_by_teacher_id, row.created_at,
            row.consumed_by_teacher_id, row.consumed_at, row.revoked_at,
          ]);
        }
        for (const row of metadataRows) {
          await client.query(`
            INSERT INTO metadata(key, value) VALUES ($1, $2)
            ON CONFLICT(key) DO UPDATE SET value = EXCLUDED.value
          `, [row.key, row.value]);
        }
        await client.query(`
          INSERT INTO metadata(key, value) VALUES ('schema_version', '6')
          ON CONFLICT(key) DO UPDATE SET value = EXCLUDED.value
        `);
      });
    } finally {
      legacy.close();
    }
  }

  private async seed(): Promise<void> {
    const count = await this.sql.query<{ count: string }>("SELECT COUNT(*)::text AS count FROM app_records");
    if (Number(count.rows[0]?.count || 0) > 0) return;

    const rawSeed = this.config.seedDemoData
      ? JSON.parse(await readFile(this.config.seedStatePath, "utf8")) as AppState
      : ({ teachers: [], currentTeacherId: null } as AppState);
    const seed = this.migrateSeedState(rawSeed);
    const now = new Date().toISOString();

    await this.sql.transaction(async (client) => {
      for (const collection of COLLECTIONS) {
        const records = Array.isArray(seed[collection]) ? seed[collection] as JsonRecord[] : [];
        for (const input of records) {
          const record = structuredClone(input);
          if (collection === "teachers") {
            delete record.password;
            delete record.wechatOpenId;
            delete record.wechatUnionId;
            delete record.wecomUserId;
            delete record.wecomCorpId;
          }
          const scope = recordScope(record);
          await client.query(`
            INSERT INTO app_records(collection, id, school_id, owner_id, data_json, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)
          `, [collection, record.id, scope.schoolId, scope.ownerId, JSON.stringify(record), now, now]);
        }
      }
      await client.query(`
        INSERT INTO metadata(key, value) VALUES ('schema_version', '6')
        ON CONFLICT(key) DO UPDATE SET value = EXCLUDED.value
      `);
    });
  }

  private migrateSeedState(input: AppState): AppState {
    const seed = structuredClone(input);
    const now = new Date().toISOString();
    const classes = (seed.schoolClasses || []) as JsonRecord[];
    const grades = ((seed.schoolGrades ||= []) as JsonRecord[]);
    const gradesByCohort = new Map(
      grades.map((grade) => [`${String(grade.schoolId || "")}:${String(grade.gradYear || "")}`, grade]),
    );

    for (const schoolClass of classes) {
      if (typeof schoolClass.gradeId === "string" && schoolClass.gradeId) continue;
      const schoolId = String(schoolClass.schoolId || "");
      const gradeLabel = String(schoolClass.grade || "高一");
      const explicitGradYear = Number(schoolClass.gradYear);
      const gradeYear = Number(schoolClass.gradeYear);
      const fallbackOffset = gradeLabel === "高三" ? 0 : gradeLabel === "高二" ? 1 : 2;
      const gradYear = Number.isInteger(explicitGradYear) && explicitGradYear > 0
        ? explicitGradYear
        : Number.isInteger(gradeYear) && gradeYear > 0
          ? gradeYear + 3
          : new Date().getFullYear() + fallbackOffset;
      const cohortKey = `${schoolId}:${gradYear}`;
      let grade = gradesByCohort.get(cohortKey);
      if (!grade) {
        grade = {
          id: `grade-${randomUUID()}`,
          schoolId,
          name: `${gradYear}届${gradeLabel}`,
          grade: gradeLabel,
          gradYear,
          status: schoolClass.status === "graduated" ? "graduated" : "active",
          createdBy: String(schoolClass.createdBy || "migration"),
          createdAt: String(schoolClass.createdAt || now),
          updatedAt: now,
        };
        grades.push(grade);
        gradesByCohort.set(cohortKey, grade);
      }
      schoolClass.gradeId = grade.id;
      schoolClass.gradYear = gradYear;
      if (!schoolClass.gradeYear) schoolClass.gradeYear = gradYear - 3;
    }

    const targetEmail = "104848931@qq.com";
    const teacher = (seed.teachers || []).find(
      (item) => normalizeEmail(item.email || "") === targetEmail,
    );
    const school = ((seed.schools || []) as JsonRecord[]).find((item) => item.name === "江苏省前黄高级中学");
    if (teacher && school) {
      const affiliations: JsonRecord[] = Array.isArray(teacher.affiliations)
        ? (teacher.affiliations as JsonRecord[]).map((item) => ({ ...item, isCurrent: false }))
        : [];
      const existingIndex = affiliations.findIndex((item) => item.schoolId === school.id);
      const current: Record<string, unknown> = existingIndex >= 0 ? affiliations[existingIndex] : {};
      const affiliationId = typeof current.id === "string" ? current.id : `aff-${randomUUID()}`;
      const promotedAffiliation = {
        ...current,
        id: affiliationId,
        teacherId: teacher.id,
        schoolId: school.id,
        schoolName: school.name,
        subject: typeof current.subject === "string" ? current.subject : "管理",
        status: "active",
        role: "platform_admin",
        roles: Array.from(new Set([...(Array.isArray(current.roles) ? current.roles : []), "principal"])),
        subjectGroupIds: Array.isArray(current.subjectGroupIds) ? current.subjectGroupIds : [],
        prepGroupIds: Array.isArray(current.prepGroupIds) ? current.prepGroupIds : [],
        isCurrent: true,
        joinedAt: typeof current.joinedAt === "string" ? current.joinedAt : now,
      };
      if (existingIndex >= 0) affiliations[existingIndex] = promotedAffiliation;
      else affiliations.push(promotedAffiliation);
      teacher.schoolId = school.id;
      teacher.status = "active";
      teacher.role = "platform_admin";
      teacher.roles = Array.from(new Set([...(Array.isArray(teacher.roles) ? teacher.roles : []), "principal"]));
      teacher.affiliations = affiliations;
      teacher.currentAffiliationId = affiliationId;
    }

    return seed;
  }

  private async ensureDefaultQuestionTypes(client: SqlConnection, schoolId: string, now: string): Promise<void> {
    const result = await client.query<{ id: string; data_json: unknown }>(`
      SELECT id, data_json FROM app_records
      WHERE collection = 'schoolSettings' AND school_id = $1
    `, [schoolId]);
    const questionTypeSettings = result.rows
      .map((row) => jsonValue<JsonRecord>(row.data_json))
      .filter((setting) => setting.type === "questionType" && typeof setting.value === "string");
    const existing = new Map(questionTypeSettings.map((setting) => [setting.value as string, setting]));
    let nextSortOrder = questionTypeSettings.reduce(
      (maximum, setting) => Math.max(maximum, Number(setting.sortOrder) || 0),
      0,
    );

    for (let index = 0; index < DEFAULT_QUESTION_TYPES.length; index += 1) {
      const option = DEFAULT_QUESTION_TYPES[index];
      const current = existing.get(option.value);
      if (current) continue;
      nextSortOrder += 1;
      const setting = {
        id: `setting-${randomUUID()}`,
        schoolId,
        type: "questionType",
        name: option.label,
        value: option.value,
        sortOrder: nextSortOrder || index + 1,
        enabled: true,
        createdAt: now,
        updatedAt: now,
      };
      await client.query(`
        INSERT INTO app_records(collection, id, school_id, owner_id, data_json, created_at, updated_at)
        VALUES ('schoolSettings', $1, $2, NULL, $3::jsonb, $4, $5)
      `, [setting.id, schoolId, JSON.stringify(setting), now, now]);
    }
  }

  private async ensureDemoAccount(): Promise<void> {
    if (!this.config.enableDemoAccount) return;
    const email = normalizeEmail(this.config.demoEmail);
    const teacher = this.getTeacherByEmail(email);
    if (!teacher || await this.getUserByEmail(email)) return;
    await this.createUser(teacher.id, email, this.config.demoPassword);
  }

  private async ensureBootstrapAdmin(): Promise<void> {
    const email = this.config.bootstrapAdminEmail.trim().toLowerCase();
    const password = this.config.bootstrapAdminPassword;
    if (!email && !password) {
      const users = await this.sql.query<{ count: string }>("SELECT COUNT(*)::text AS count FROM users");
      if (!this.config.seedDemoData && Number(users.rows[0]?.count || 0) === 0) {
        throw new Error("生产空库必须设置 bootstrap 管理员邮箱和密码");
      }
      return;
    }
    if (!email || !password) throw new Error("bootstrap 管理员邮箱和密码必须同时设置");
    if (password.length < 12) throw new Error("bootstrap 管理员密码至少需要 12 位");
    if (await this.getUserByEmail(email)) return;

    const now = new Date().toISOString();
    await this.sql.transaction(async (client) => {
      let schoolResult = await client.query<{ data_json: unknown }>(`
        SELECT data_json FROM app_records WHERE collection = 'schools' AND id = $1
      `, [this.config.bootstrapSchoolId]);
      if (schoolResult.rows.length === 0) {
        const school = {
          id: this.config.bootstrapSchoolId,
          name: this.config.bootstrapSchoolName,
          code: this.config.bootstrapSchoolCode,
          logo: this.config.bootstrapSchoolName.charAt(0) || "校",
          description: "由生产环境 bootstrap 配置创建",
          teacherCount: 1,
          studentCount: 0,
          city: this.config.bootstrapSchoolCity,
        };
        await client.query(`
          INSERT INTO app_records(collection, id, school_id, owner_id, data_json, created_at, updated_at)
          VALUES ('schools', $1, $2, NULL, $3::jsonb, $4, $5)
        `, [school.id, school.id, JSON.stringify(school), now, now]);
        await this.ensureDefaultQuestionTypes(client, school.id, now);
        schoolResult = { rows: [{ data_json: school }], rowCount: 1 };
      }
      const school = jsonValue<{ id: string; name: string }>(schoolResult.rows[0].data_json);
      const existing = this.stateCache.teachers.find((teacher) => normalizeEmail(teacher.email || "") === email) || null;
      const teacherId = existing?.id || randomUUID();
      const affiliationId = existing?.currentAffiliationId || randomUUID();
      const teacher: TeacherRecord = {
        ...(existing || {}),
        id: teacherId,
        email,
        name: this.config.bootstrapAdminName,
        nickname: existing?.nickname || "",
        avatar: this.config.bootstrapAdminName.charAt(0) || "管",
        schoolId: school.id,
        subject: existing?.subject || "管理",
        status: "active",
        role: "platform_admin",
        roles: ["principal"],
        subjectGroupIds: existing?.subjectGroupIds || [],
        prepGroupIds: existing?.prepGroupIds || [],
        affiliations: [{
          id: affiliationId,
          teacherId,
          schoolId: school.id,
          schoolName: school.name,
          subject: existing?.subject || "管理",
          status: "active",
          role: "platform_admin",
          roles: ["principal"],
          subjectGroupIds: existing?.subjectGroupIds || [],
          prepGroupIds: existing?.prepGroupIds || [],
          isCurrent: true,
          joinedAt: now,
        }],
        currentAffiliationId: affiliationId,
        createdAt: existing?.createdAt || now,
      };
      const scope = recordScope(teacher as JsonRecord);
      await client.query(`
        INSERT INTO app_records(collection, id, school_id, owner_id, data_json, created_at, updated_at)
        VALUES ('teachers', $1, $2, $3, $4::jsonb, $5, $6)
        ON CONFLICT(collection, id) DO UPDATE SET
          school_id = EXCLUDED.school_id,
          owner_id = EXCLUDED.owner_id,
          data_json = EXCLUDED.data_json,
          updated_at = EXCLUDED.updated_at
      `, [teacher.id, scope.schoolId, teacher.id, JSON.stringify(teacher), teacher.createdAt, now]);
      await client.query(`
        INSERT INTO users(id, teacher_id, email, phone, password_hash, created_at, updated_at)
        VALUES ($1, $2, $3, NULL, $4, $5, $6)
      `, [randomUUID(), teacher.id, email, hashPassword(password), now, now]);
    });
    await this.reloadStateCache();
  }

  private async reloadStateCache(): Promise<void> {
    const state: AppState = { teachers: [], currentTeacherId: null };
    for (const collection of COLLECTIONS) state[collection] = [];
    const result = await this.sql.query<{ collection: CollectionName; data_json: unknown }>(`
      SELECT collection, data_json FROM app_records ORDER BY created_at, collection, id
    `);
    for (const row of result.rows) {
      const list = state[row.collection] as JsonRecord[];
      list.push(jsonValue<JsonRecord>(row.data_json));
    }
    state.teachers = (state.teachers || []).map(publicTeacher);
    this.stateCache = deepFreeze(state);
    this.recordJsonCache = this.buildRecordJsonCache(this.stateCache);
  }

  private buildRecordJsonCache(state: AppState): Map<CollectionName, Map<string, string>> {
    const cache = new Map<CollectionName, Map<string, string>>();
    for (const collection of COLLECTIONS) {
      const records = (state[collection] || []) as JsonRecord[];
      cache.set(collection, new Map(records.map((input) => {
        const record = collection === "teachers"
          ? publicTeacher(input as unknown as TeacherRecord) as unknown as JsonRecord
          : input;
        return [record.id, JSON.stringify(record)] as const;
      })));
    }
    return cache;
  }

  loadState(): AppState {
    return structuredClone(this.stateCache);
  }

  readState(): AppState {
    return this.stateCache;
  }

  async saveState(_before: AppState, after: AppState, adoptAfter = false): Promise<void> {
    const now = new Date().toISOString();
    const nextRecordJsonCache = new Map<CollectionName, Map<string, string>>();
    await this.sql.transaction(async (client) => {
      for (const collection of COLLECTIONS) {
        const previousRecords = this.recordJsonCache.get(collection) || new Map<string, string>();
        const newRecords = (after[collection] || []) as JsonRecord[];
        const nextCollectionCache = new Map<string, string>();

        for (const input of newRecords) {
          const record = collection === "teachers"
            ? publicTeacher(input as unknown as TeacherRecord) as unknown as JsonRecord
            : input;
          const serialized = JSON.stringify(record);
          nextCollectionCache.set(record.id, serialized);
          if (previousRecords.get(record.id) === serialized) continue;
          const scope = recordScope(record);
          const createdAt = typeof record.createdAt === "string" ? record.createdAt : now;
          await client.query(`
            INSERT INTO app_records(collection, id, school_id, owner_id, data_json, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)
            ON CONFLICT(collection, id) DO UPDATE SET
              school_id = EXCLUDED.school_id,
              owner_id = EXCLUDED.owner_id,
              data_json = EXCLUDED.data_json,
              updated_at = EXCLUDED.updated_at
          `, [collection, record.id, scope.schoolId, scope.ownerId, serialized, createdAt, now]);
        }

        for (const id of previousRecords.keys()) {
          if (!nextCollectionCache.has(id)) {
            await client.query("DELETE FROM app_records WHERE collection = $1 AND id = $2", [collection, id]);
          }
        }
        nextRecordJsonCache.set(collection, nextCollectionCache);
      }
    });

    const nextState = adoptAfter ? after : structuredClone(after);
    nextState.teachers = nextState.teachers.map(publicTeacher);
    this.stateCache = deepFreeze(nextState);
    this.recordJsonCache = nextRecordJsonCache;
  }

  getTeacherByEmail(email: string): TeacherRecord | null {
    const normalized = normalizeEmail(email);
    const teacher = this.stateCache.teachers.find((item) => normalizeEmail(item.email || "") === normalized);
    return teacher ? publicTeacher(teacher) : null;
  }

  getTeacherById(id: string): TeacherRecord | null {
    const teacher = this.stateCache.teachers.find((item) => item.id === id);
    return teacher ? publicTeacher(teacher) : null;
  }

  private async getUserByEmail(email: string): Promise<UserRow | null> {
    if (!email.trim()) return null;
    const result = await this.sql.query<UserRow>(`
      SELECT id, teacher_id, email, phone, password_hash
      FROM users WHERE lower(email) = lower($1) LIMIT 1
    `, [normalizeEmail(email)]);
    return result.rows[0] || null;
  }

  async createUser(teacherId: string, email: string | null | undefined, password: string, phone: string | null = null): Promise<string> {
    const normalized = email?.trim() ? normalizeEmail(email) : null;
    if (normalized && await this.getUserByEmail(normalized)) throw new DuplicateAccountError("该邮箱已注册");
    if (phone && await this.getUserByPhone(phone)) throw new DuplicateAccountError("该手机号已注册");
    const id = randomUUID();
    const now = new Date().toISOString();
    try {
      await this.sql.query(`
        INSERT INTO users(id, teacher_id, email, phone, password_hash, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [id, teacherId, normalized, phone, hashPassword(password), now, now]);
    } catch (error) {
      if (isUniqueViolation(error)) throw new DuplicateAccountError("账号已存在");
      throw error;
    }
    return id;
  }

  async createAccount(teacher: TeacherRecord, password: string): Promise<string> {
    const now = new Date().toISOString();
    const clean = publicTeacher(teacher);
    const scope = recordScope(clean as JsonRecord);
    const id = randomUUID();
    await this.sql.transaction(async (client) => {
      await client.query(`
        INSERT INTO app_records(collection, id, school_id, owner_id, data_json, created_at, updated_at)
        VALUES ('teachers', $1, $2, $3, $4::jsonb, $5, $6)
      `, [clean.id, scope.schoolId, clean.id, JSON.stringify(clean), clean.createdAt || now, now]);
      await client.query(`
        INSERT INTO users(id, teacher_id, email, phone, password_hash, created_at, updated_at)
        VALUES ($1, $2, $3, NULL, $4, $5, $6)
      `, [id, clean.id, clean.email ? normalizeEmail(clean.email) : null, hashPassword(password), now, now]);
    });
    await this.reloadStateCache();
    return id;
  }

  async getAvailableRegistrationAuthorization(phone: string): Promise<RegistrationAuthorizationRecord | null> {
    const result = await this.sql.query<{ id: string }>(`
      SELECT id FROM registration_authorizations
      WHERE phone = $1 AND consumed_at IS NULL AND revoked_at IS NULL LIMIT 1
    `, [phone]);
    return result.rows[0] ? this.getRegistrationAuthorization(result.rows[0].id) : null;
  }

  async createAuthorizedAccount(
    teacher: TeacherRecord,
    password: string,
    phone: string,
    options: {
      newSchool?: {
        id: string;
        name: string;
        code: string;
        logo: string;
        description: string;
        teacherCount: number;
        studentCount: number;
        city: string;
      };
    } = {},
  ): Promise<string> {
    const now = new Date().toISOString();
    const userId = randomUUID();
    const normalizedEmail = teacher.email?.trim() ? normalizeEmail(teacher.email) : null;
    if (normalizedEmail && await this.getUserByEmail(normalizedEmail)) {
      throw new DuplicateAccountError("该邮箱已注册");
    }
    try {
      await this.sql.transaction(async (client) => {
      const existingPhone = await client.query("SELECT 1 FROM users WHERE phone = $1 LIMIT 1", [phone]);
      if (existingPhone.rows.length > 0) throw new DuplicateAccountError("该手机号已注册");
      const authorizationResult = await client.query<{ id: string }>(`
        SELECT id FROM registration_authorizations
        WHERE phone = $1 AND consumed_at IS NULL AND revoked_at IS NULL
        FOR UPDATE
      `, [phone]);
      const authorizationId = authorizationResult.rows[0]?.id;
      if (!authorizationId) {
        const error = new Error("该手机号尚未获得注册授权，请联系学校管理员或现有教师担保") as Error & { statusCode: number };
        error.statusCode = 403;
        throw error;
      }

      if (options.newSchool) {
        const duplicate = await client.query(`
          SELECT 1 FROM app_records
          WHERE collection = 'schools'
            AND (lower(data_json->>'code') = lower($1) OR lower(data_json->>'name') = lower($2))
          LIMIT 1
        `, [options.newSchool.code, options.newSchool.name]);
        if (duplicate.rows.length > 0) throw new DuplicateAccountError("学校名称或代码已存在");
        await client.query(`
          INSERT INTO app_records(collection, id, school_id, owner_id, data_json, created_at, updated_at)
          VALUES ('schools', $1, $2, NULL, $3::jsonb, $4, $5)
        `, [options.newSchool.id, options.newSchool.id, JSON.stringify(options.newSchool), now, now]);
        await this.ensureDefaultQuestionTypes(client, options.newSchool.id, now);
      } else if (teacher.schoolId && teacher.status === "active") {
        const schoolResult = await client.query<{ data_json: unknown }>(`
          SELECT data_json FROM app_records WHERE collection = 'schools' AND id = $1 FOR UPDATE
        `, [teacher.schoolId]);
        if (schoolResult.rows.length === 0) throw new Error("学校不存在");
        const school = jsonValue<Record<string, unknown>>(schoolResult.rows[0].data_json);
        school.teacherCount = Number(school.teacherCount || 0) + 1;
        await client.query(`
          UPDATE app_records SET data_json = $1::jsonb, updated_at = $2
          WHERE collection = 'schools' AND id = $3
        `, [JSON.stringify(school), now, teacher.schoolId]);
      }

      const clean = publicTeacher(teacher);
      const scope = recordScope(clean as JsonRecord);
      await client.query(`
        INSERT INTO app_records(collection, id, school_id, owner_id, data_json, created_at, updated_at)
        VALUES ('teachers', $1, $2, $3, $4::jsonb, $5, $6)
      `, [clean.id, scope.schoolId, clean.id, JSON.stringify(clean), clean.createdAt || now, now]);
      await client.query(`
        INSERT INTO users(id, teacher_id, email, phone, password_hash, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [userId, clean.id, clean.email?.trim() ? normalizeEmail(clean.email) : null, phone, hashPassword(password), now, now]);
      const consumed = await client.query(`
        UPDATE registration_authorizations
        SET consumed_by_teacher_id = $1, consumed_at = $2
        WHERE id = $3 AND consumed_at IS NULL AND revoked_at IS NULL
      `, [teacher.id, now, authorizationId]);
      if (consumed.rowCount !== 1) {
        const error = new Error("注册授权已被使用，请联系学校管理员重新添加") as Error & { statusCode: number };
        error.statusCode = 409;
        throw error;
      }
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        if (normalizedEmail && await this.getUserByEmail(normalizedEmail)) {
          throw new DuplicateAccountError("该邮箱已注册");
        }
        if (await this.getUserByPhone(phone)) {
          throw new DuplicateAccountError("该手机号已注册");
        }
      }
      throw error;
    }
    await this.reloadStateCache();
    return userId;
  }

  async authenticate(identifier: string, password: string): Promise<UserRow | null> {
    const normalizedPhone = normalizePhone(identifier);
    const user = /^1[3-9]\d{9}$/.test(normalizedPhone)
      ? await this.getUserByPhone(normalizedPhone)
      : await this.getUserByEmail(identifier);
    if (!user || !verifyPassword(password, user.password_hash)) return null;
    return user;
  }

  async getUserByPhone(phone: string): Promise<UserRow | null> {
    const result = await this.sql.query<UserRow>(`
      SELECT id, teacher_id, email, phone, password_hash FROM users WHERE phone = $1 LIMIT 1
    `, [phone]);
    return result.rows[0] || null;
  }

  async getTeacherIdByAccountIdentifier(identifier: string): Promise<string | null> {
    const normalizedPhone = normalizePhone(identifier);
    const user = /^1[3-9]\d{9}$/.test(normalizedPhone)
      ? await this.getUserByPhone(normalizedPhone)
      : await this.getUserByEmail(identifier);
    return user?.teacher_id || null;
  }

  async bindAccountEmail(userId: string, teacherId: string, email: string): Promise<TeacherRecord> {
    const normalized = normalizeEmail(email);
    const existing = await this.getUserByEmail(normalized);
    if (existing && existing.id !== userId) throw new DuplicateAccountError("该邮箱已注册");
    let teacher!: TeacherRecord;
    try {
      await this.sql.transaction(async (client) => {
        const result = await client.query<{ data_json: unknown }>(`
          SELECT data_json FROM app_records WHERE collection = 'teachers' AND id = $1 FOR UPDATE
        `, [teacherId]);
        if (!result.rows[0]) throw new Error("教师不存在");
        teacher = jsonValue<TeacherRecord>(result.rows[0].data_json);
        teacher.email = normalized;
        const now = new Date().toISOString();
        await client.query("UPDATE users SET email = $1, updated_at = $2 WHERE id = $3", [normalized, now, userId]);
        await client.query(`
          UPDATE app_records SET data_json = $1::jsonb, updated_at = $2
          WHERE collection = 'teachers' AND id = $3
        `, [JSON.stringify(teacher), now, teacherId]);
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new DuplicateAccountError("该邮箱已注册");
      throw error;
    }
    await this.reloadStateCache();
    return publicTeacher(teacher);
  }

  async createRegistrationAuthorization(input: Omit<RegistrationAuthorizationRecord, "createdByName" | "consumedByName">): Promise<RegistrationAuthorizationRecord> {
    if (await this.getUserByPhone(input.phone)) throw new DuplicateAccountError("该手机号已注册");
    try {
      await this.sql.query(`
        INSERT INTO registration_authorizations(
          id, phone, kind, school_id, created_by_teacher_id, created_at,
          consumed_by_teacher_id, consumed_at, revoked_at
        ) VALUES ($1, $2, $3, $4, $5, $6, NULL, NULL, NULL)
      `, [input.id, input.phone, input.kind, input.schoolId, input.createdByTeacherId, input.createdAt]);
    } catch (error) {
      if (isUniqueViolation(error)) {
        const conflict = new Error("该手机号已在注册授权名单中") as Error & { statusCode: number };
        conflict.statusCode = 409;
        throw conflict;
      }
      throw error;
    }
    return (await this.getRegistrationAuthorization(input.id))!;
  }

  private async getRegistrationAuthorization(id: string): Promise<RegistrationAuthorizationRecord | null> {
    const result = await this.sql.query<Record<string, unknown>>(`
      SELECT
        ra.id,
        ra.phone,
        ra.kind,
        ra.school_id AS "schoolId",
        ra.created_by_teacher_id AS "createdByTeacherId",
        ra.created_at AS "createdAt",
        ra.consumed_by_teacher_id AS "consumedByTeacherId",
        ra.consumed_at AS "consumedAt",
        ra.revoked_at AS "revokedAt",
        creator.data_json->>'name' AS "createdByName",
        consumer.data_json->>'name' AS "consumedByName"
      FROM registration_authorizations ra
      LEFT JOIN app_records creator
        ON creator.collection = 'teachers' AND creator.id = ra.created_by_teacher_id
      LEFT JOIN app_records consumer
        ON consumer.collection = 'teachers' AND consumer.id = ra.consumed_by_teacher_id
      WHERE ra.id = $1
    `, [id]);
    const row = result.rows[0];
    if (!row) return null;
    return {
      ...row,
      createdAt: iso(row.createdAt as string | Date),
      consumedAt: row.consumedAt ? iso(row.consumedAt as string | Date) : null,
      revokedAt: row.revokedAt ? iso(row.revokedAt as string | Date) : null,
    } as unknown as RegistrationAuthorizationRecord;
  }

  async listRegistrationAuthorizations(input: {
    schoolId: string;
    requesterTeacherId: string;
    canManageSchool: boolean;
  }): Promise<RegistrationAuthorizationRecord[]> {
    const where = input.canManageSchool
      ? "ra.school_id = $1"
      : "ra.created_by_teacher_id = $1";
    const parameter = input.canManageSchool ? input.schoolId : input.requesterTeacherId;
    const result = await this.sql.query<Record<string, unknown>>(`
      SELECT
        ra.id,
        ra.phone,
        ra.kind,
        ra.school_id AS "schoolId",
        ra.created_by_teacher_id AS "createdByTeacherId",
        ra.created_at AS "createdAt",
        ra.consumed_by_teacher_id AS "consumedByTeacherId",
        ra.consumed_at AS "consumedAt",
        ra.revoked_at AS "revokedAt",
        creator.data_json->>'name' AS "createdByName",
        consumer.data_json->>'name' AS "consumedByName"
      FROM registration_authorizations ra
      LEFT JOIN app_records creator
        ON creator.collection = 'teachers' AND creator.id = ra.created_by_teacher_id
      LEFT JOIN app_records consumer
        ON consumer.collection = 'teachers' AND consumer.id = ra.consumed_by_teacher_id
      WHERE ${where} AND ra.revoked_at IS NULL
      ORDER BY ra.created_at DESC
    `, [parameter]);
    return result.rows.map((row) => ({
      ...row,
      createdAt: iso(row.createdAt as string | Date),
      consumedAt: row.consumedAt ? iso(row.consumedAt as string | Date) : null,
      revokedAt: row.revokedAt ? iso(row.revokedAt as string | Date) : null,
    } as unknown as RegistrationAuthorizationRecord));
  }

  async revokeRegistrationAuthorization(input: {
    id: string;
    schoolId: string;
    requesterTeacherId: string;
    canManageSchool: boolean;
  }): Promise<void> {
    const authorization = await this.getRegistrationAuthorization(input.id);
    if (!authorization || authorization.revokedAt) throw new Error("注册授权不存在");
    const canRevoke = input.canManageSchool
      ? authorization.schoolId === input.schoolId
      : authorization.createdByTeacherId === input.requesterTeacherId;
    if (!canRevoke) throw new Error("无权撤销该注册授权");
    if (authorization.consumedAt) throw new Error("已使用的注册授权不能撤销");
    await this.sql.query(`
      UPDATE registration_authorizations SET revoked_at = $1
      WHERE id = $2 AND consumed_at IS NULL AND revoked_at IS NULL
    `, [new Date().toISOString(), input.id]);
  }

  async getParentUserByPhone(phone: string): Promise<ParentUserRow | null> {
    const normalized = normalizePhone(phone);
    const result = await this.sql.query<ParentUserRow>(`
      SELECT id, parent_id, phone, password_hash FROM parent_users WHERE phone = $1 LIMIT 1
    `, [normalized]);
    return result.rows[0] || null;
  }

  getParentById(id: string): ParentAccountRecord | null {
    const parent = (this.stateCache.parentAccounts as ParentAccountRecord[]).find((item) => item.id === id);
    return parent ? structuredClone(parent) : null;
  }

  async createParentAccount(input: { name: string; phone: string; password: string }): Promise<{ user: ParentUserRow; parent: ParentAccountRecord }> {
    const phone = normalizePhone(input.phone);
    if (await this.getParentUserByPhone(phone)) throw new DuplicateAccountError("该手机号已注册家长账号");
    const now = new Date().toISOString();
    const parent: ParentAccountRecord = {
      id: randomUUID(),
      name: input.name.trim(),
      phone,
      createdAt: now,
      updatedAt: now,
    };
    const user: ParentUserRow = {
      id: randomUUID(),
      parent_id: parent.id,
      phone,
      password_hash: hashPassword(input.password),
    };
    await this.sql.transaction(async (client) => {
      await client.query(`
        INSERT INTO app_records(collection, id, school_id, owner_id, data_json, created_at, updated_at)
        VALUES ('parentAccounts', $1, NULL, $2, $3::jsonb, $4, $5)
      `, [parent.id, parent.id, JSON.stringify(parent), now, now]);
      await client.query(`
        INSERT INTO parent_users(id, parent_id, phone, password_hash, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6)
      `, [user.id, user.parent_id, user.phone, user.password_hash, now, now]);
    });
    await this.reloadStateCache();
    return { user, parent };
  }

  async authenticateParent(phone: string, password: string): Promise<ParentUserRow | null> {
    const user = await this.getParentUserByPhone(phone);
    if (!user || !verifyPassword(password, user.password_hash)) return null;
    return user;
  }

  async createParentSession(user: ParentUserRow): Promise<{ token: string; session: ParentSessionUser }> {
    const token = randomBytes(32).toString("base64url");
    const csrfToken = randomBytes(24).toString("base64url");
    const now = new Date();
    const expires = new Date(now.getTime() + this.config.sessionDays * 86400000);
    const sessionId = randomUUID();
    await this.sql.query(`
      INSERT INTO parent_sessions(id, token_hash, csrf_token, parent_user_id, expires_at, created_at, last_seen_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [sessionId, hashToken(token), csrfToken, user.id, expires.toISOString(), now.toISOString(), now.toISOString()]);
    return {
      token,
      session: {
        userId: user.id,
        parentId: user.parent_id,
        phone: user.phone,
        csrfToken,
        expiresAt: expires.toISOString(),
      },
    };
  }

  async getParentSession(token: string | undefined): Promise<ParentSessionUser | null> {
    if (!token) return null;
    const now = new Date().toISOString();
    const tokenHash = hashToken(token);
    const result = await this.sql.query<ParentSessionRow>(`
      SELECT parent_users.id, parent_users.parent_id, parent_users.phone, parent_users.password_hash,
             parent_sessions.csrf_token, parent_sessions.expires_at
      FROM parent_sessions JOIN parent_users ON parent_users.id = parent_sessions.parent_user_id
      WHERE parent_sessions.token_hash = $1 AND parent_sessions.expires_at > $2
    `, [tokenHash, now]);
    const row = result.rows[0];
    if (!row) return null;
    await this.sql.query("UPDATE parent_sessions SET last_seen_at = $1 WHERE token_hash = $2", [now, tokenHash]);
    return {
      userId: row.id,
      parentId: row.parent_id,
      phone: row.phone,
      csrfToken: row.csrf_token,
      expiresAt: iso(row.expires_at),
    };
  }

  async deleteParentSession(token: string | undefined): Promise<void> {
    if (token) await this.sql.query("DELETE FROM parent_sessions WHERE token_hash = $1", [hashToken(token)]);
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    const result = await this.sql.query<UserRow>(`
      SELECT id, teacher_id, email, phone, password_hash FROM users WHERE id = $1
    `, [userId]);
    const user = result.rows[0];
    if (!user || !verifyPassword(currentPassword, user.password_hash)) throw new Error("当前密码错误");
    const now = new Date().toISOString();
    await this.sql.transaction(async (client) => {
      await client.query("UPDATE users SET password_hash = $1, updated_at = $2 WHERE id = $3", [hashPassword(newPassword), now, userId]);
      await client.query(`
        DELETE FROM sessions WHERE user_id = $1 AND id NOT IN (
          SELECT id FROM sessions WHERE user_id = $1 ORDER BY last_seen_at DESC LIMIT 1
        )
      `, [userId]);
    });
  }

  async resetPasswordByTeacherId(teacherId: string, newPassword: string): Promise<void> {
    const result = await this.sql.query<{ id: string }>("SELECT id FROM users WHERE teacher_id = $1", [teacherId]);
    const user = result.rows[0];
    if (!user) throw new Error("该教师尚未创建登录账号");
    const now = new Date().toISOString();
    await this.sql.transaction(async (client) => {
      await client.query("UPDATE users SET password_hash = $1, updated_at = $2 WHERE id = $3", [hashPassword(newPassword), now, user.id]);
      await client.query("DELETE FROM sessions WHERE user_id = $1", [user.id]);
    });
  }

  async createSession(user: UserRow): Promise<{ token: string; session: SessionUser }> {
    const token = randomBytes(32).toString("base64url");
    const csrfToken = randomBytes(24).toString("base64url");
    const now = new Date();
    const expires = new Date(now.getTime() + this.config.sessionDays * 86400000);
    const sessionId = randomUUID();
    await this.sql.query(`
      INSERT INTO sessions(id, token_hash, csrf_token, user_id, expires_at, created_at, last_seen_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [sessionId, hashToken(token), csrfToken, user.id, expires.toISOString(), now.toISOString(), now.toISOString()]);
    return {
      token,
      session: {
        userId: user.id,
        teacherId: user.teacher_id,
        email: user.email,
        csrfToken,
        expiresAt: expires.toISOString(),
      },
    };
  }

  async getSession(token: string | undefined): Promise<SessionUser | null> {
    if (!token) return null;
    const now = new Date().toISOString();
    const tokenHash = hashToken(token);
    const result = await this.sql.query<SessionRow>(`
      SELECT users.id, users.teacher_id, users.email, users.phone, users.password_hash,
             sessions.csrf_token, sessions.expires_at
      FROM sessions JOIN users ON users.id = sessions.user_id
      WHERE sessions.token_hash = $1 AND sessions.expires_at > $2
    `, [tokenHash, now]);
    const row = result.rows[0];
    if (!row) return null;
    await this.sql.query("UPDATE sessions SET last_seen_at = $1 WHERE token_hash = $2", [now, tokenHash]);
    return {
      userId: row.id,
      teacherId: row.teacher_id,
      email: row.email,
      csrfToken: row.csrf_token,
      expiresAt: iso(row.expires_at),
    };
  }

  async deleteSession(token: string | undefined): Promise<void> {
    if (token) await this.sql.query("DELETE FROM sessions WHERE token_hash = $1", [hashToken(token)]);
  }

  async cleanupSessions(): Promise<void> {
    const now = new Date().toISOString();
    await this.sql.query("DELETE FROM sessions WHERE expires_at <= $1", [now]);
    await this.sql.query("DELETE FROM parent_sessions WHERE expires_at <= $1", [now]);
  }

  async insertTeacher(teacher: TeacherRecord): Promise<void> {
    const clean = publicTeacher(teacher);
    const now = new Date().toISOString();
    const scope = recordScope(clean as JsonRecord);
    await this.sql.query(`
      INSERT INTO app_records(collection, id, school_id, owner_id, data_json, created_at, updated_at)
      VALUES ('teachers', $1, $2, $3, $4::jsonb, $5, $6)
    `, [clean.id, scope.schoolId, clean.id, JSON.stringify(clean), clean.createdAt || now, now]);
    await this.reloadStateCache();
  }

  async saveFile(file: StoredFile): Promise<void> {
    await this.sql.query(`
      INSERT INTO files(id, owner_id, school_id, original_name, mime_type, size, storage_name, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [file.id, file.ownerId, file.schoolId, file.originalName, file.mimeType, file.size, file.storageName, file.createdAt]);
  }

  async getFile(id: string): Promise<StoredFile | null> {
    const result = await this.sql.query<Record<string, unknown>>(`
      SELECT id, owner_id AS "ownerId", school_id AS "schoolId", original_name AS "originalName",
             mime_type AS "mimeType", size, storage_name AS "storageName", created_at AS "createdAt"
      FROM files WHERE id = $1
    `, [id]);
    const row = result.rows[0];
    if (!row) return null;
    return {
      id: String(row.id),
      ownerId: String(row.ownerId),
      schoolId: row.schoolId == null ? null : String(row.schoolId),
      originalName: String(row.originalName),
      mimeType: String(row.mimeType),
      size: Number(row.size),
      storageName: String(row.storageName),
      createdAt: iso(row.createdAt as string | Date),
    };
  }

  async searchQuestions(filter: QuestionFilter = {}): Promise<Question[]> {
    const clauses = ["collection = 'questions'"];
    const params: unknown[] = [];
    const add = (sql: string, value: unknown) => {
      params.push(value);
      clauses.push(sql.replace("__PARAM__", `$${params.length}`));
    };

    if (filter.keyword?.trim()) {
      const fields = filter.searchFields?.length ? filter.searchFields : ["stem", "analysis", "summary", "remark"];
      const expressions = fields.map((field) => {
        if (field === "remark") return `(coalesce(data_json->>'remark','') || ' ' || coalesce((data_json->'remarks')::text,''))`;
        return `coalesce(data_json->>'${field}','')`;
      });
      add(`lower(${expressions.join(" || ' ' || ")}) LIKE __PARAM__`, `%${filter.keyword.trim().toLowerCase()}%`);
    }
    if (filter.ids?.length) add("id = ANY(__PARAM__::text[])", filter.ids);
    if (filter.noChapter) clauses.push("jsonb_array_length(coalesce(data_json->'chapterIds', '[]'::jsonb)) = 0");
    if (filter.chapterIds?.length) {
      if ((filter.chapterLogic || "or") === "and") add("coalesce(data_json->'chapterIds', '[]'::jsonb) @> __PARAM__::jsonb", JSON.stringify(filter.chapterIds));
      else add("coalesce(data_json->'chapterIds', '[]'::jsonb) ?| __PARAM__::text[]", filter.chapterIds);
    }
    if (filter.noKnowledge) clauses.push("jsonb_array_length(coalesce(data_json->'knowledgePointIds', '[]'::jsonb)) = 0");
    if (filter.knowledgePointIds?.length) {
      if ((filter.knowledgeLogic || "or") === "and") add("coalesce(data_json->'knowledgePointIds', '[]'::jsonb) @> __PARAM__::jsonb", JSON.stringify(filter.knowledgePointIds));
      else add("coalesce(data_json->'knowledgePointIds', '[]'::jsonb) ?| __PARAM__::text[]", filter.knowledgePointIds);
    }
    if (filter.difficulty?.length) add("(data_json->>'difficulty')::int = ANY(__PARAM__::int[])", filter.difficulty);
    if (filter.recommendation?.length) add("(data_json->>'recommendation')::int = ANY(__PARAM__::int[])", filter.recommendation);
    if (filter.type?.length) add("data_json->>'type' = ANY(__PARAM__::text[])", filter.type);
    if (filter.teacherId) add("owner_id = __PARAM__", filter.teacherId);
    if (filter.schoolId) add("school_id = __PARAM__", filter.schoolId);
    if (filter.grade) add("data_json->>'grade' = __PARAM__", filter.grade);
    if (filter.schoolYear) add("data_json->>'schoolYear' = __PARAM__", filter.schoolYear);
    if (filter.semester) add("coalesce(data_json->>'semester', '上学期') = __PARAM__", filter.semester);
    if (filter.sourceType?.length) add("data_json->>'sourceType' = ANY(__PARAM__::text[])", filter.sourceType);
    if (filter.category?.length) add("data_json->>'category' = ANY(__PARAM__::text[])", filter.category);
    if (filter.excludeQuestionIds?.length) add("NOT (id = ANY(__PARAM__::text[]))", filter.excludeQuestionIds);

    const result = await this.sql.query<{ data_json: unknown }>(`
      SELECT data_json FROM app_records
      WHERE ${clauses.join(" AND ")}
      ORDER BY created_at DESC, id
    `, params);
    return result.rows.map((row) => jsonValue<Question>(row.data_json));
  }

  async hasLegacySqlite(path: string): Promise<boolean> {
    try {
      await access(path, constants.R_OK);
      return true;
    } catch {
      return false;
    }
  }
}
