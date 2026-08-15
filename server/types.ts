export interface TeacherRecord {
  id: string;
  email: string;
  name: string;
  nickname?: string;
  avatar: string;
  schoolId: string | null;
  subject: string;
  subjects?: string[];
  teachingGrades?: string[];
  teachingClassIds?: string[];
  homeroomClassIds?: string[];
  position?: string;
  status: "pending" | "active" | "rejected";
  role: "teacher" | "school_admin" | "platform_admin";
  roles: string[];
  subjectGroupIds: string[];
  prepGroupIds: string[];
  affiliations: Array<Record<string, unknown>>;
  currentAffiliationId: string | null;
  platformModeratorSubjects?: string[];
  createdAt: string;
  [key: string]: unknown;
}

export interface AppState {
  teachers: TeacherRecord[];
  currentTeacherId: string | null;
  [collection: string]: unknown;
}

export interface SessionUser {
  userId: string;
  teacherId: string;
  email: string | null;
  csrfToken: string;
  expiresAt: string;
}

export interface ParentAccountRecord {
  id: string;
  name: string;
  phone: string;
  createdAt: string;
  updatedAt: string;
}

export interface ParentSessionUser {
  userId: string;
  parentId: string;
  phone: string;
  csrfToken: string;
  expiresAt: string;
}

export type RegistrationAuthorizationKind = "admin" | "guarantee";

export interface RegistrationAuthorizationRecord {
  id: string;
  phone: string;
  kind: RegistrationAuthorizationKind;
  schoolId: string;
  createdByTeacherId: string;
  createdAt: string;
  consumedByTeacherId: string | null;
  consumedAt: string | null;
  revokedAt: string | null;
  createdByName?: string;
  consumedByName?: string | null;
}

export interface StoredFile {
  id: string;
  ownerId: string;
  schoolId: string | null;
  originalName: string;
  mimeType: string;
  size: number;
  storageName: string;
  createdAt: string;
}
