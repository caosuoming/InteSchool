import type {
  RegistrationAuthorization,
  RegistrationAuthorizationKind,
  RegistrationContext,
  SchoolAdminApplication,
  SchoolApplication,
  Teacher,
  TeacherAffiliation,
  TeacherRole,
} from "@/types";
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

  async getRegistrationContext(phone: string): Promise<RegistrationContext> {
    return apiRequest<RegistrationContext>(`/api/auth/registration-context?phone=${encodeURIComponent(phone)}`);
  },

  async register(
    input: {
      email?: string;
      password: string;
      name: string;
      phone: string;
      schoolId?: string;
      newSchool?: { name: string; code: string; city: string; description?: string };
      subject: string;
      teachingGrades?: string[];
    } | string,
    password?: string,
    name?: string,
    phone?: string,
  ): Promise<Teacher> {
    const payload = typeof input === "string"
      ? { email: input, password: password || "", name: name || "", phone: phone || "" }
      : input;
    return storeAuth(await apiRequest<AuthPayload>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify(payload),
    }));
  },

  async login(identifier: string, password: string): Promise<Teacher> {
    return storeAuth(await apiRequest<AuthPayload>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ identifier, password }),
    }));
  },

  async logout(): Promise<void> {
    await apiRequest("/api/auth/logout", { method: "POST" }, true);
    currentTeacher = null;
    teacherCache = [];
    setCsrfToken(null);
  },

  async listRegistrationAuthorizations(): Promise<RegistrationAuthorization[]> {
    return apiRequest<RegistrationAuthorization[]>("/api/auth/registration-authorizations");
  },

  async createRegistrationAuthorization(
    phone: string,
    kind: RegistrationAuthorizationKind,
  ): Promise<RegistrationAuthorization> {
    return apiRequest<RegistrationAuthorization>("/api/auth/registration-authorizations", {
      method: "POST",
      body: JSON.stringify({ phone, kind }),
    }, true);
  },

  async revokeRegistrationAuthorization(id: string): Promise<void> {
    await apiRequest(`/api/auth/registration-authorizations/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }, true);
  },

  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    await apiRequest("/api/auth/password", {
      method: "POST",
      body: JSON.stringify({ currentPassword, newPassword }),
    }, true);
  },

  async bindEmail(email: string): Promise<Teacher> {
    const teacher = await apiRequest<Teacher>("/api/auth/email", {
      method: "PATCH",
      body: JSON.stringify({ email }),
    }, true);
    currentTeacher = teacher;
    return teacher;
  },

  async updateProfile(patch: {
    nickname?: string;
    subject?: string;
    teachingGrades?: string[];
  }): Promise<Teacher> {
    const teacher = await apiRequest<Teacher>("/api/auth/profile", {
      method: "PATCH",
      body: JSON.stringify(patch),
    }, true);
    currentTeacher = teacher;
    return teacher;
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
    subjects: string[] | string,
    proofFileId?: string,
    teachingGrades: string[] = [],
    position = "",
    requestSchoolAdmin = false,
    roles: TeacherRole[] = ["teacher"],
  ): Promise<SchoolApplication> {
    const normalizedSubjects = Array.isArray(subjects) ? subjects : [subjects];
    return apiRequest<SchoolApplication>("/api/auth/applications", {
      method: "POST",
      body: JSON.stringify({
        schoolId,
        employeeNo,
        subjects: normalizedSubjects,
        proofFileId,
        teachingGrades,
        position,
        requestSchoolAdmin,
        roles,
      }),
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


  async applySchoolAdmin(reason: string): Promise<SchoolAdminApplication> {
    return apiRequest<SchoolAdminApplication>("/api/auth/admin-applications", {
      method: "POST",
      body: JSON.stringify({ reason }),
    }, true);
  },

  async getMySchoolAdminApplications(): Promise<SchoolAdminApplication[]> {
    return apiRequest<SchoolAdminApplication[]>("/api/auth/admin-applications/mine");
  },

  async getPendingSchoolAdminApplications(): Promise<SchoolAdminApplication[]> {
    return apiRequest<SchoolAdminApplication[]>("/api/auth/admin-applications/pending");
  },

  async reviewSchoolAdminApplication(id: string, approved: boolean): Promise<void> {
    await apiRequest(`/api/auth/admin-applications/${encodeURIComponent(id)}/review`, {
      method: "POST",
      body: JSON.stringify({ approved }),
    }, true);
  },

  async updateTeacherTeachingProfile(
    teacherId: string,
    patch: {
      subject?: string;
      teachingGrades?: string[];
      teachingClassIds?: string[];
      homeroomClassIds?: string[];
    },
  ): Promise<Teacher> {
    return apiRequest<Teacher>(`/api/auth/teachers/${encodeURIComponent(teacherId)}/teaching-profile`, {
      method: "PATCH",
      body: JSON.stringify(patch),
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
