export interface TeacherRecord {
  id: string;
  email: string;
  name: string;
  avatar: string;
  schoolId: string | null;
  subject: string;
  status: "pending" | "active" | "rejected";
  role: "teacher" | "school_admin" | "platform_admin";
  roles: string[];
  subjectGroupIds: string[];
  prepGroupIds: string[];
  affiliations: Array<Record<string, unknown>>;
  currentAffiliationId: string | null;
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
  email: string;
  csrfToken: string;
  expiresAt: string;
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
