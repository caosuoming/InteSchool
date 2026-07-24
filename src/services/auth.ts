import type { SchoolApplication, Teacher, TeacherAffiliation } from "@/types";
import { apiRequest, setCsrfToken } from "./api";

interface AuthPayload {
  teacher: Teacher | null;
  csrfToken: string | null;
}

let currentTeacher: Teacher | null = null;
let teacherCache: Teacher[] = [];

function storeAuth(payload: { teacher: Teacher; csrfToken: string }): Teacher {
  currentTeacher = payload.teacher;
  setCsrfToken(payload.csrfToken);
  return payload.teacher;
}

export const authService = {
  async init(): Promise<Teacher | null> {
    const payload = await apiRequest<AuthPayload>("/api/auth/current");
    if (!payload.teacher || !payload.csrfToken) {
      currentTeacher = null;
      setCsrfToken(null);
      return null;
    }
    return storeAuth({ teacher: payload.teacher, csrfToken: payload.csrfToken });
  },

  async register(email: string, password: string, name: string): Promise<Teacher> {
    return storeAuth(await apiRequest<AuthPayload>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password, name }),
    }));
  },

  async login(email: string, password: string): Promise<Teacher> {
    return storeAuth(await apiRequest<AuthPayload>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }));
  },

  async logout(): Promise<void> {
    await apiRequest("/api/auth/logout", { method: "POST" }, true);
    currentTeacher = null;
    teacherCache = [];
    setCsrfToken(null);
  },

  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    await apiRequest("/api/auth/password", {
      method: "POST",
      body: JSON.stringify({ currentPassword, newPassword }),
    }, true);
  },

  getCurrentTeacher(): Teacher | null {
    return currentTeacher;
  },

  async refreshCurrentTeacher(): Promise<Teacher | null> {
    return this.init();
  },

  async listTeachers(): Promise<Teacher[]> {
    teacherCache = await apiRequest<Teacher[]>("/api/auth/teachers");
    return teacherCache;
  },

  getTeacherById(id: string): Teacher | null {
    if (currentTeacher?.id === id) return currentTeacher;
    return teacherCache.find((teacher) => teacher.id === id) || null;
  },

  async applySchool(
    _teacherId: string,
    schoolId: string,
    employeeNo: string,
    subject: string,
    proofFileId: string,
  ): Promise<SchoolApplication> {
    return apiRequest<SchoolApplication>("/api/auth/applications", {
      method: "POST",
      body: JSON.stringify({ schoolId, employeeNo, subject, proofFileId }),
    }, true);
  },

  async getApplicationsByTeacher(_teacherId: string): Promise<SchoolApplication[]> {
    return apiRequest<SchoolApplication[]>("/api/auth/applications/mine");
  },

  async getPendingApplications(_schoolId: string): Promise<SchoolApplication[]> {
    return apiRequest<SchoolApplication[]>("/api/auth/applications/pending");
  },

  async reviewApplication(applicationId: string, approved: boolean): Promise<void> {
    await apiRequest(`/api/auth/applications/${encodeURIComponent(applicationId)}/review`, {
      method: "POST",
      body: JSON.stringify({ approved }),
    }, true);
  },

  getAffiliations(teacherId: string): TeacherAffiliation[] {
    if (!currentTeacher || currentTeacher.id !== teacherId) return [];
    return currentTeacher.affiliations || [];
  },

  getCurrentAffiliation(teacherId: string): TeacherAffiliation | null {
    const affiliations = this.getAffiliations(teacherId);
    return affiliations.find((item) => item.id === currentTeacher?.currentAffiliationId)
      || affiliations.find((item) => item.isCurrent)
      || affiliations[0]
      || null;
  },

  async switchAffiliation(_teacherId: string, affiliationId: string): Promise<TeacherAffiliation> {
    const teacher = await apiRequest<Teacher>(`/api/auth/affiliations/${encodeURIComponent(affiliationId)}/activate`, {
      method: "POST",
    }, true);
    currentTeacher = teacher;
    const affiliation = this.getCurrentAffiliation(teacher.id);
    if (!affiliation) throw new Error("身份切换失败");
    return affiliation;
  },
};
