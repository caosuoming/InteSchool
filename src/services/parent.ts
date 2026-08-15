import { apiRequest, setCsrfToken } from "./api";

export interface ParentAccount {
  id: string;
  name: string;
  phone: string;
  createdAt: string;
  updatedAt: string;
}

export interface ParentChild {
  id: string;
  name: string;
  studentNo: string;
  grade: string;
  schoolId: string;
  schoolName: string;
  classId: string;
  className: string;
  guardianName: string;
}

export interface ParentRegistrationContext {
  phone: string;
  children: ParentChild[];
  registered: boolean;
}

export interface ParentGradeResult {
  examId: string;
  examName: string;
  examDate?: string;
  cohortLabel: string;
  subjects: string[];
  publishedAt: string;
  result: {
    studentId: string;
    studentName: string;
    studentNo: string;
    classId: string;
    className: string;
    scores: Record<string, number | null>;
    assignedScores: Record<string, number | null>;
    rawTotal: number;
    assignedTotal: number;
    classRank: number;
    gradeRank: number;
  };
}

export interface ParentLearningItem {
  id: string;
  name: string;
  totalAttempts: number;
  correctRate: number;
  gradeCorrectRate: number;
  gap: number;
  masteryLevel: "mastered" | "basic" | "weak";
}

interface ParentAuthPayload {
  parent: ParentAccount | null;
  csrfToken: string | null;
}

let currentParent: ParentAccount | null = null;

function storeParent(payload: { parent: ParentAccount; csrfToken: string }): ParentAccount {
  currentParent = payload.parent;
  setCsrfToken(payload.csrfToken);
  return payload.parent;
}

export const parentService = {
  async getRegistrationContext(phone: string): Promise<ParentRegistrationContext> {
    return apiRequest<ParentRegistrationContext>(`/api/parent/registration-context?phone=${encodeURIComponent(phone)}`);
  },

  async register(input: { name: string; phone: string; password: string }): Promise<ParentAccount> {
    return storeParent(await apiRequest<ParentAuthPayload>("/api/parent/register", {
      method: "POST",
      body: JSON.stringify(input),
    }) as { parent: ParentAccount; csrfToken: string });
  },

  async login(phone: string, password: string): Promise<ParentAccount> {
    return storeParent(await apiRequest<ParentAuthPayload>("/api/parent/login", {
      method: "POST",
      body: JSON.stringify({ phone, password }),
    }) as { parent: ParentAccount; csrfToken: string });
  },

  async init(): Promise<ParentAccount | null> {
    const payload = await apiRequest<ParentAuthPayload>("/api/parent/current");
    if (!payload.parent || !payload.csrfToken) {
      currentParent = null;
      return null;
    }
    return storeParent({ parent: payload.parent, csrfToken: payload.csrfToken });
  },

  async logout(): Promise<void> {
    await apiRequest("/api/parent/logout", { method: "POST" }, true);
    currentParent = null;
    setCsrfToken(null);
  },

  async listChildren(): Promise<ParentChild[]> {
    return apiRequest<ParentChild[]>("/api/parent/children");
  },

  async listGrades(studentId: string): Promise<ParentGradeResult[]> {
    return apiRequest<ParentGradeResult[]>(`/api/parent/children/${encodeURIComponent(studentId)}/grades`);
  },

  async getLearning(studentId: string): Promise<{ chapter: ParentLearningItem[]; knowledge: ParentLearningItem[] }> {
    return apiRequest<{ chapter: ParentLearningItem[]; knowledge: ParentLearningItem[] }>(
      `/api/parent/children/${encodeURIComponent(studentId)}/learning`,
    );
  },
};
