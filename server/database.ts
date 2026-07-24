import { mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import {
  createHash,
  randomBytes,
  randomUUID,
} from "node:crypto";
import Database from "better-sqlite3";
import type { AppState, SessionUser, StoredFile, TeacherRecord } from "./types.js";
import type { ServerConfig } from "./config.js";
import { hashPassword, verifyPassword } from "./lib/password.js";

export const COLLECTIONS = [
  "schools", "teachers", "applications", "schoolClasses", "personalClasses",
  "classTypeCategories", "students", "chapters", "knowledgePoints", "questions",
  "lectures", "examPapers", "coursewares", "materials", "baskets", "documents",
  "recognitions", "answerRecords", "subjectGroups", "prepGroups", "onlineResources",
  "prepTasks", "questionReferences", "schoolSettings", "examPaperTypes", "lectureTypes",
  "shareRecords", "examPublications", "lessonCoursewares", "reflections",
  "studentInteractions", "schoolBackups",
] as const;

type CollectionName = (typeof COLLECTIONS)[number];
type JsonRecord = { id: string; [key: string]: unknown };

interface UserRow {
  id: string;
  teacher_id: string;
  email: string;
  password_hash: string;
}

interface SessionRow extends UserRow {
  csrf_token: string;
  expires_at: string;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
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

export class DuplicateAccountError extends Error {}

export class DatabaseStore {
  readonly sqlite: Database.Database;
  private readonly config: ServerConfig;

  constructor(config: ServerConfig) {
    this.config = config;
    mkdirSync(dirname(config.databasePath), { recursive: true });
    mkdirSync(config.uploadsDir, { recursive: true });
    this.sqlite = new Database(config.databasePath);
    this.sqlite.pragma("journal_mode = WAL");
    this.sqlite.pragma("foreign_keys = ON");
    this.sqlite.pragma("busy_timeout = 5000");
    this.migrate();
    this.seed();
    this.ensureBootstrapAdmin();
  }

  close(): void {
    this.sqlite.close();
  }

  private migrate(): void {
    this.sqlite.exec(`
      CREATE TABLE IF NOT EXISTS app_records (
        collection TEXT NOT NULL,
        id TEXT NOT NULL,
        school_id TEXT,
        owner_id TEXT,
        data_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (collection, id)
      );
      CREATE INDEX IF NOT EXISTS idx_records_collection_school
        ON app_records(collection, school_id);
      CREATE INDEX IF NOT EXISTS idx_records_collection_owner
        ON app_records(collection, owner_id);

      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        teacher_id TEXT NOT NULL UNIQUE,
        email TEXT NOT NULL UNIQUE COLLATE NOCASE,
        password_hash TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        token_hash TEXT NOT NULL UNIQUE,
        csrf_token TEXT NOT NULL,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        last_seen_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);

      CREATE TABLE IF NOT EXISTS files (
        id TEXT PRIMARY KEY,
        owner_id TEXT NOT NULL,
        school_id TEXT,
        original_name TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        size INTEGER NOT NULL,
        storage_name TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_files_owner ON files(owner_id);

      CREATE TABLE IF NOT EXISTS metadata (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
  }

  private seed(): void {
    const count = this.sqlite.prepare("SELECT COUNT(*) AS count FROM app_records").get() as { count: number };
    if (count.count === 0) {
      const seed = this.config.seedDemoData
        ? JSON.parse(readFileSync(this.config.seedStatePath, "utf8")) as AppState
        : ({ teachers: [], currentTeacherId: null } as AppState);
      const now = new Date().toISOString();
      const insert = this.sqlite.prepare(`
        INSERT INTO app_records(collection, id, school_id, owner_id, data_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      this.sqlite.transaction(() => {
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
            insert.run(collection, record.id, scope.schoolId, scope.ownerId, JSON.stringify(record), now, now);
          }
        }
        this.sqlite.prepare("INSERT OR REPLACE INTO metadata(key, value) VALUES ('schema_version', '1')").run();
      })();
    }

    if (this.config.enableDemoAccount) {
      const teacher = this.getTeacherByEmail(this.config.demoEmail);
      if (teacher && !this.getUserByEmail(this.config.demoEmail)) {
        this.createUser(teacher.id, this.config.demoEmail, this.config.demoPassword);
      }
    }
  }

  private ensureBootstrapAdmin(): void {
    const email = this.config.bootstrapAdminEmail.trim().toLowerCase();
    const password = this.config.bootstrapAdminPassword;
    if (!email && !password) {
      const users = this.sqlite.prepare("SELECT COUNT(*) AS count FROM users").get() as { count: number };
      if (!this.config.seedDemoData && users.count === 0) {
        throw new Error("生产空库必须设置 bootstrap 管理员邮箱和密码");
      }
      return;
    }
    if (!email || !password) {
      throw new Error("bootstrap 管理员邮箱和密码必须同时设置");
    }
    if (password.length < 12) {
      throw new Error("bootstrap 管理员密码至少需要 12 位");
    }
    if (this.getUserByEmail(email)) return;

    let schoolRow = this.sqlite.prepare(
      "SELECT data_json FROM app_records WHERE collection = 'schools' AND id = ?",
    ).get(this.config.bootstrapSchoolId) as { data_json: string } | undefined;
    if (!schoolRow) {
      const now = new Date().toISOString();
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
      this.sqlite.prepare(`
        INSERT INTO app_records(collection, id, school_id, owner_id, data_json, created_at, updated_at)
        VALUES ('schools', ?, ?, NULL, ?, ?, ?)
      `).run(school.id, school.id, JSON.stringify(school), now, now);
      schoolRow = { data_json: JSON.stringify(school) };
    }
    const school = JSON.parse(schoolRow.data_json) as { id: string; name: string };
    const now = new Date().toISOString();
    const existing = this.getTeacherByEmail(email);
    const teacherId = existing?.id || randomUUID();
    const affiliationId = existing?.currentAffiliationId || randomUUID();
    const teacher: TeacherRecord = {
      ...(existing || {}),
      id: teacherId,
      email,
      name: this.config.bootstrapAdminName,
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

    this.sqlite.transaction(() => {
      const scope = recordScope(teacher as JsonRecord);
      this.sqlite.prepare(`
        INSERT INTO app_records(collection, id, school_id, owner_id, data_json, created_at, updated_at)
        VALUES ('teachers', ?, ?, ?, ?, ?, ?)
        ON CONFLICT(collection, id) DO UPDATE SET
          school_id = excluded.school_id,
          owner_id = excluded.owner_id,
          data_json = excluded.data_json,
          updated_at = excluded.updated_at
      `).run(teacher.id, scope.schoolId, teacher.id, JSON.stringify(teacher), teacher.createdAt, now);
      this.createUser(teacher.id, email, password);
    })();
  }

  loadState(): AppState {
    const state: AppState = { teachers: [], currentTeacherId: null };
    for (const collection of COLLECTIONS) state[collection] = [];
    const rows = this.sqlite.prepare("SELECT collection, data_json FROM app_records ORDER BY rowid").all() as Array<{ collection: CollectionName; data_json: string }>;
    for (const row of rows) {
      const list = state[row.collection] as JsonRecord[];
      list.push(JSON.parse(row.data_json) as JsonRecord);
    }
    state.teachers = (state.teachers || []).map(publicTeacher);
    return state;
  }

  saveState(before: AppState, after: AppState): void {
    const insert = this.sqlite.prepare(`
      INSERT INTO app_records(collection, id, school_id, owner_id, data_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(collection, id) DO UPDATE SET
        school_id = excluded.school_id,
        owner_id = excluded.owner_id,
        data_json = excluded.data_json,
        updated_at = excluded.updated_at
    `);
    const remove = this.sqlite.prepare("DELETE FROM app_records WHERE collection = ? AND id = ?");
    const now = new Date().toISOString();

    this.sqlite.transaction(() => {
      for (const collection of COLLECTIONS) {
        const oldRecords = new Map(((before[collection] || []) as JsonRecord[]).map((item) => [item.id, item]));
        const newRecords = new Map(((after[collection] || []) as JsonRecord[]).map((item) => [item.id, item]));
        for (const [id] of oldRecords) {
          if (!newRecords.has(id)) remove.run(collection, id);
        }
        for (const [id, input] of newRecords) {
          const record = structuredClone(input);
          if (collection === "teachers") {
            delete record.password;
            delete record.wechatOpenId;
            delete record.wechatUnionId;
            delete record.wecomUserId;
            delete record.wecomCorpId;
          }
          if (JSON.stringify(oldRecords.get(id)) === JSON.stringify(record)) continue;
          const scope = recordScope(record);
          const createdAt = typeof record.createdAt === "string" ? record.createdAt : now;
          insert.run(collection, id, scope.schoolId, scope.ownerId, JSON.stringify(record), createdAt, now);
        }
      }
    })();
  }

  getTeacherByEmail(email: string): TeacherRecord | null {
    const row = this.sqlite.prepare(
      "SELECT data_json FROM app_records WHERE collection = 'teachers' AND lower(json_extract(data_json, '$.email')) = lower(?) LIMIT 1",
    ).get(normalizeEmail(email)) as { data_json: string } | undefined;
    return row ? publicTeacher(JSON.parse(row.data_json) as TeacherRecord) : null;
  }

  getTeacherById(id: string): TeacherRecord | null {
    const row = this.sqlite.prepare(
      "SELECT data_json FROM app_records WHERE collection = 'teachers' AND id = ?",
    ).get(id) as { data_json: string } | undefined;
    return row ? publicTeacher(JSON.parse(row.data_json) as TeacherRecord) : null;
  }

  private getUserByEmail(email: string): UserRow | null {
    return (this.sqlite.prepare("SELECT * FROM users WHERE email = ? COLLATE NOCASE").get(normalizeEmail(email)) as UserRow | undefined) || null;
  }

  createUser(teacherId: string, email: string, password: string): string {
    const normalized = normalizeEmail(email);
    if (this.getUserByEmail(normalized)) throw new DuplicateAccountError("该邮箱已注册");
    const id = randomUUID();
    const now = new Date().toISOString();
    try {
      this.sqlite.prepare(`
        INSERT INTO users(id, teacher_id, email, password_hash, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(id, teacherId, normalized, hashPassword(password), now, now);
    } catch (error) {
      if (error instanceof Error && error.message.includes("UNIQUE")) {
        throw new DuplicateAccountError("该邮箱已注册");
      }
      throw error;
    }
    return id;
  }

  createAccount(teacher: TeacherRecord, password: string): string {
    return this.sqlite.transaction(() => {
      this.insertTeacher(teacher);
      return this.createUser(teacher.id, teacher.email, password);
    })();
  }

  authenticate(email: string, password: string): UserRow | null {
    const user = this.getUserByEmail(email);
    if (!user || !verifyPassword(password, user.password_hash)) return null;
    return user;
  }

  changePassword(userId: string, currentPassword: string, newPassword: string): void {
    const user = this.sqlite.prepare("SELECT * FROM users WHERE id = ?").get(userId) as UserRow | undefined;
    if (!user || !verifyPassword(currentPassword, user.password_hash)) {
      throw new Error("当前密码错误");
    }
    this.sqlite.prepare("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?")
      .run(hashPassword(newPassword), new Date().toISOString(), userId);
    this.sqlite.prepare("DELETE FROM sessions WHERE user_id = ? AND id NOT IN (SELECT id FROM sessions WHERE user_id = ? ORDER BY last_seen_at DESC LIMIT 1)")
      .run(userId, userId);
  }

  createSession(user: UserRow): { token: string; session: SessionUser } {
    const token = randomBytes(32).toString("base64url");
    const csrfToken = randomBytes(24).toString("base64url");
    const now = new Date();
    const expires = new Date(now.getTime() + this.config.sessionDays * 86400000);
    const sessionId = randomUUID();
    this.sqlite.prepare(`
      INSERT INTO sessions(id, token_hash, csrf_token, user_id, expires_at, created_at, last_seen_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(sessionId, hashToken(token), csrfToken, user.id, expires.toISOString(), now.toISOString(), now.toISOString());
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

  getSession(token: string | undefined): SessionUser | null {
    if (!token) return null;
    const now = new Date().toISOString();
    const row = this.sqlite.prepare(`
      SELECT users.id, users.teacher_id, users.email, users.password_hash,
             sessions.csrf_token, sessions.expires_at
      FROM sessions JOIN users ON users.id = sessions.user_id
      WHERE sessions.token_hash = ? AND sessions.expires_at > ?
    `).get(hashToken(token), now) as SessionRow | undefined;
    if (!row) return null;
    this.sqlite.prepare("UPDATE sessions SET last_seen_at = ? WHERE token_hash = ?").run(now, hashToken(token));
    return {
      userId: row.id,
      teacherId: row.teacher_id,
      email: row.email,
      csrfToken: row.csrf_token,
      expiresAt: row.expires_at,
    };
  }

  deleteSession(token: string | undefined): void {
    if (token) this.sqlite.prepare("DELETE FROM sessions WHERE token_hash = ?").run(hashToken(token));
  }

  cleanupSessions(): void {
    this.sqlite.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(new Date().toISOString());
  }

  insertTeacher(teacher: TeacherRecord): void {
    const clean = publicTeacher(teacher);
    const now = new Date().toISOString();
    const scope = recordScope(clean as JsonRecord);
    this.sqlite.prepare(`
      INSERT INTO app_records(collection, id, school_id, owner_id, data_json, created_at, updated_at)
      VALUES ('teachers', ?, ?, ?, ?, ?, ?)
    `).run(clean.id, scope.schoolId, clean.id, JSON.stringify(clean), clean.createdAt || now, now);
  }

  saveFile(file: StoredFile): void {
    this.sqlite.prepare(`
      INSERT INTO files(id, owner_id, school_id, original_name, mime_type, size, storage_name, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(file.id, file.ownerId, file.schoolId, file.originalName, file.mimeType, file.size, file.storageName, file.createdAt);
  }

  getFile(id: string): StoredFile | null {
    const row = this.sqlite.prepare(`
      SELECT id, owner_id AS ownerId, school_id AS schoolId, original_name AS originalName,
             mime_type AS mimeType, size, storage_name AS storageName, created_at AS createdAt
      FROM files WHERE id = ?
    `).get(id) as StoredFile | undefined;
    return row || null;
  }
}
