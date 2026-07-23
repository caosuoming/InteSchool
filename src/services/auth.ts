import type { Teacher, SchoolApplication, TeacherAffiliation } from "@/types";
import { db } from "./db";
import { delay, genId, maybeThrowError } from "./_shared";

export const authService = {
  async register(email: string, password: string, name: string): Promise<Teacher> {
    await delay(500);
    maybeThrowError();
    const teachers = db.read("teachers");
    if (teachers.some((t) => t.email === email)) {
      throw new Error("该邮箱已注册");
    }
    const personalAff = {
      id: genId("aff"),
      teacherId: "",
      schoolId: null,
      schoolName: null,
      subject: "",
      status: "active" as const,
      role: "teacher" as const,
      roles: ["teacher" as const],
      subjectGroupIds: [] as string[],
      prepGroupIds: [] as string[],
      isCurrent: true,
      joinedAt: new Date().toISOString(),
    };
    const teacher: Teacher = {
      id: genId("tch"),
      email,
      password,
      name,
      avatar: name.charAt(0),
      schoolId: null,
      subject: "",
      status: "pending",
      role: "teacher",
      roles: ["teacher"],
      subjectGroupIds: [],
      prepGroupIds: [],
      affiliations: [{ ...personalAff, teacherId: "" }],
      currentAffiliationId: "",
      createdAt: new Date().toISOString(),
    };
    teacher.affiliations[0].teacherId = teacher.id;
    teacher.currentAffiliationId = teacher.affiliations[0].id;
    db.update("teachers", (list) => [...list, teacher]);
    return teacher;
  },

  async login(email: string, password: string): Promise<Teacher> {
    await delay(400);
    maybeThrowError();
    const teachers = db.read("teachers");
    const teacher = teachers.find((t) => t.email === email && t.password === password);
    if (!teacher) {
      throw new Error("邮箱或密码错误");
    }
    db.write("currentTeacherId", teacher.id);
    return teacher;
  },

  async loginWithWechat(openId: string, unionId?: string): Promise<Teacher> {
    await delay(600);
    maybeThrowError();
    const teachers = db.read("teachers");
    let teacher = teachers.find((t) => t.wechatOpenId === openId);
    if (!teacher && unionId) {
      teacher = teachers.find((t) => t.wechatUnionId === unionId);
    }
    if (!teacher) {
      const name = `微信用户_${openId.slice(-6)}`;
      const personalAff = {
        id: genId("aff"),
        teacherId: "",
        schoolId: null,
        schoolName: null,
        subject: "",
        status: "active" as const,
        role: "teacher" as const,
        roles: ["teacher" as const],
        subjectGroupIds: [] as string[],
        prepGroupIds: [] as string[],
        isCurrent: true,
        joinedAt: new Date().toISOString(),
      };
      teacher = {
        id: genId("tch"),
        email: `${openId}@wechat.local`,
        password: "",
        name,
        avatar: name.charAt(0),
        wechatOpenId: openId,
        wechatUnionId: unionId,
        schoolId: null,
        subject: "",
        status: "pending",
        role: "teacher",
        roles: ["teacher"],
        subjectGroupIds: [],
        prepGroupIds: [],
        affiliations: [{ ...personalAff, teacherId: "" }],
        currentAffiliationId: "",
        createdAt: new Date().toISOString(),
      };
      teacher.affiliations[0].teacherId = teacher.id;
      teacher.currentAffiliationId = teacher.affiliations[0].id;
      db.update("teachers", (list) => [...list, teacher!]);
    }
    db.write("currentTeacherId", teacher.id);
    return teacher;
  },

  async loginWithWecom(userId: string, corpId: string): Promise<Teacher> {
    await delay(600);
    maybeThrowError();
    const teachers = db.read("teachers");
    let teacher = teachers.find((t) => t.wecomUserId === userId && t.wecomCorpId === corpId);
    if (!teacher) {
      const name = `企微用户_${userId.slice(-6)}`;
      const personalAff = {
        id: genId("aff"),
        teacherId: "",
        schoolId: null,
        schoolName: null,
        subject: "",
        status: "active" as const,
        role: "teacher" as const,
        roles: ["teacher" as const],
        subjectGroupIds: [] as string[],
        prepGroupIds: [] as string[],
        isCurrent: true,
        joinedAt: new Date().toISOString(),
      };
      teacher = {
        id: genId("tch"),
        email: `${userId}@wecom.local`,
        password: "",
        name,
        avatar: name.charAt(0),
        wecomUserId: userId,
        wecomCorpId: corpId,
        schoolId: null,
        subject: "",
        status: "pending",
        role: "teacher",
        roles: ["teacher"],
        subjectGroupIds: [],
        prepGroupIds: [],
        affiliations: [{ ...personalAff, teacherId: "" }],
        currentAffiliationId: "",
        createdAt: new Date().toISOString(),
      };
      teacher.affiliations[0].teacherId = teacher.id;
      teacher.currentAffiliationId = teacher.affiliations[0].id;
      db.update("teachers", (list) => [...list, teacher!]);
    }
    db.write("currentTeacherId", teacher.id);
    return teacher;
  },

  async bindWechat(teacherId: string, openId: string, unionId?: string): Promise<void> {
    await delay(300);
    maybeThrowError();
    const teachers = db.read("teachers");
    const existingTeacher = teachers.find((t) => t.wechatOpenId === openId && t.id !== teacherId);
    if (existingTeacher) {
      throw new Error("该微信账号已绑定其他教师");
    }
    db.update("teachers", (list) =>
      list.map((t) =>
        t.id === teacherId
          ? { ...t, wechatOpenId: openId, wechatUnionId: unionId }
          : t,
      ),
    );
  },

  async unbindWechat(teacherId: string): Promise<void> {
    await delay(200);
    db.update("teachers", (list) =>
      list.map((t) =>
        t.id === teacherId
          ? { ...t, wechatOpenId: undefined, wechatUnionId: undefined }
          : t,
      ),
    );
  },

  async bindWecom(teacherId: string, userId: string, corpId: string): Promise<void> {
    await delay(300);
    maybeThrowError();
    const teachers = db.read("teachers");
    const existingTeacher = teachers.find(
      (t) => t.wecomUserId === userId && t.wecomCorpId === corpId && t.id !== teacherId,
    );
    if (existingTeacher) {
      throw new Error("该企业微信账号已绑定其他教师");
    }
    db.update("teachers", (list) =>
      list.map((t) =>
        t.id === teacherId
          ? { ...t, wecomUserId: userId, wecomCorpId: corpId }
          : t,
      ),
    );
  },

  async unbindWecom(teacherId: string): Promise<void> {
    await delay(200);
    db.update("teachers", (list) =>
      list.map((t) =>
        t.id === teacherId
          ? { ...t, wecomUserId: undefined, wecomCorpId: undefined }
          : t,
      ),
    );
  },

  async logout(): Promise<void> {
    await delay(100);
    db.write("currentTeacherId", null);
  },

  getCurrentTeacher(): Teacher | null {
    const id = db.read("currentTeacherId");
    if (!id) return null;
    return db.read("teachers").find((t) => t.id === id) || null;
  },

  /** 根据 ID 查询教师信息（用于资源页展示提供者名称等） */
  getTeacherById(id: string): Teacher | null {
    return db.read("teachers").find((t) => t.id === id) || null;
  },

  /** 查询全部教师（用于批量构建 ID→教师 映射） */
  listTeachers(): Teacher[] {
    return db.read("teachers");
  },

  async applySchool(
    teacherId: string,
    schoolId: string,
    employeeNo: string,
    subject: string,
    proofFileName: string,
  ): Promise<SchoolApplication> {
    await delay(600);
    maybeThrowError();
    const applications = db.read("applications");
    const application: SchoolApplication = {
      id: genId("app"),
      teacherId,
      schoolId,
      employeeNo,
      subject,
      proofFileName,
      status: "pending",
      createdAt: new Date().toISOString(),
    };
    db.update("applications", (list) => [...list, application]);

    // 演示用：自动审核通过
    await delay(400);
    db.update("applications", (list) =>
      list.map((a) => (a.id === application.id ? { ...a, status: "approved" as const } : a)),
    );
    db.update("teachers", (list) =>
      list.map((t) =>
        t.id === teacherId
          ? { ...t, schoolId, employeeNo, subject, status: "active" as const }
          : t,
      ),
    );
    return application;
  },

  async getApplicationsByTeacher(teacherId: string): Promise<SchoolApplication[]> {
    await delay(200);
    return db.read("applications").filter((a) => a.teacherId === teacherId);
  },

  async getPendingApplications(schoolId: string): Promise<SchoolApplication[]> {
    await delay(200);
    return db
      .read("applications")
      .filter((a) => a.schoolId === schoolId && a.status === "pending");
  },

  async reviewApplication(applicationId: string, approved: boolean): Promise<void> {
    await delay(300);
    const applications = db.read("applications");
    const app = applications.find((a) => a.id === applicationId);
    if (!app) throw new Error("申请记录不存在");
    db.update("applications", (list) =>
      list.map((a) =>
        a.id === applicationId
          ? { ...a, status: approved ? ("approved" as const) : ("rejected" as const) }
          : a,
      ),
    );
    if (approved) {
      db.update("teachers", (list) =>
        list.map((t) =>
          t.id === app.teacherId
            ? {
                ...t,
                schoolId: app.schoolId,
                employeeNo: app.employeeNo,
                subject: app.subject,
                status: "active" as const,
              }
            : t,
        ),
      );
    }
  },

  /** 获取教师的所有所属单位（身份列表） */
  getAffiliations(teacherId: string): TeacherAffiliation[] {
    const teacher = db.read("teachers").find((t) => t.id === teacherId);
    if (!teacher) return [];
    if (teacher.affiliations && teacher.affiliations.length > 0) {
      return teacher.affiliations;
    }
    // 兼容旧数据：从 schoolId 等字段生成一个默认身份
    const defaultAff: TeacherAffiliation = {
      id: `aff-default-${teacher.id}`,
      teacherId: teacher.id,
      schoolId: teacher.schoolId,
      schoolName: teacher.schoolId
        ? db.read("schools").find((s) => s.id === teacher.schoolId)?.name || null
        : null,
      subject: teacher.subject,
      employeeNo: teacher.employeeNo,
      status: teacher.status,
      role: teacher.role,
      roles: teacher.roles,
      subjectGroupIds: teacher.subjectGroupIds,
      prepGroupIds: teacher.prepGroupIds,
      isCurrent: true,
      joinedAt: teacher.createdAt,
    };
    return [defaultAff];
  },

  /** 获取当前激活的所属单位 */
  getCurrentAffiliation(teacherId: string): TeacherAffiliation | null {
    const affs = this.getAffiliations(teacherId);
    const current = affs.find((a) => a.isCurrent);
    return current || affs[0] || null;
  },

  /** 切换所属单位（身份切换） */
  async switchAffiliation(teacherId: string, affiliationId: string): Promise<TeacherAffiliation> {
    await delay(200);
    const teachers = db.read("teachers");
    const teacherIndex = teachers.findIndex((t) => t.id === teacherId);
    if (teacherIndex === -1) throw new Error("教师不存在");

    const teacher = teachers[teacherIndex];
    const affs = this.getAffiliations(teacherId);
    const targetAff = affs.find((a) => a.id === affiliationId);
    if (!targetAff) throw new Error("所属单位不存在");

    // 更新身份列表中的 isCurrent
    const updatedAffs = affs.map((a) => ({
      ...a,
      isCurrent: a.id === affiliationId,
    }));

    // 更新 teacher 对象的冗余字段，保持向后兼容
    const updatedTeacher: Teacher = {
      ...teacher,
      affiliations: updatedAffs,
      currentAffiliationId: affiliationId,
      schoolId: targetAff.schoolId,
      subject: targetAff.subject,
      employeeNo: targetAff.employeeNo,
      status: targetAff.status,
      role: targetAff.role,
      roles: targetAff.roles,
      subjectGroupIds: targetAff.subjectGroupIds,
      prepGroupIds: targetAff.prepGroupIds,
    };

    const newTeachers = [...teachers];
    newTeachers[teacherIndex] = updatedTeacher;
    db.write("teachers", newTeachers);

    return targetAff;
  },
};
