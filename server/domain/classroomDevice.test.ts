import { describe, expect, it } from "vitest";
import type { Teacher } from "../../src/types/index.js";
import { runWithState } from "../runtime-db.js";
import type { AppState } from "../types.js";
import { classroomDeviceService } from "./classroomDevice.js";

const CREATED_AT = "2026-09-01T02:00:00.000Z";
const TOKEN_1 = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee-11111111";
const TOKEN_2 = "ffffffff-1111-2222-3333-444444444444-22222222";

function makeTeacher(
  id: string,
  role: "teacher" | "school_admin" | "platform_admin",
  schoolId = "school-1",
  teachingClassIds: string[] = [],
  homeroomClassIds: string[] = [],
): Teacher {
  const affiliation = {
    id: `aff-${id}`,
    teacherId: id,
    schoolId,
    schoolName: schoolId === "school-1" ? "第一中学" : "第二中学",
    subject: "数学",
    teachingClassIds,
    homeroomClassIds,
    status: "active" as const,
    role,
    assignedRoles: homeroomClassIds.length ? ["teacher" as const, "headTeacher" as const] : ["teacher" as const],
    roles: homeroomClassIds.length ? ["teacher" as const, "headTeacher" as const] : ["teacher" as const],
    subjectGroupIds: [],
    prepGroupIds: [],
    isCurrent: true,
    joinedAt: CREATED_AT,
  };
  return {
    id,
    email: `${id}@example.com`,
    name: id,
    avatar: id.slice(0, 1),
    schoolId,
    subject: "数学",
    teachingClassIds,
    homeroomClassIds,
    status: "active",
    role,
    roles: affiliation.roles,
    subjectGroupIds: [],
    prepGroupIds: [],
    affiliations: [affiliation],
    currentAffiliationId: affiliation.id,
    createdAt: CREATED_AT,
  };
}

function makeState(): AppState {
  return {
    currentTeacherId: "admin",
    teachers: [
      makeTeacher("admin", "school_admin"),
      makeTeacher("subject", "teacher", "school-1", ["class-1"]),
      makeTeacher("homeroom", "teacher", "school-1", [], ["class-1"]),
      makeTeacher("other", "teacher", "school-1", ["class-2"]),
      makeTeacher("platform", "platform_admin"),
    ] as any,
    schools: [
      { id: "school-1", name: "第一中学", code: "S1" },
      { id: "school-2", name: "第二中学", code: "S2" },
    ],
    schoolClasses: [
      { id: "class-1", type: "school", schoolId: "school-1", name: "1班", grade: "高一", studentCount: 0, status: "active", createdBy: "admin", createdAt: CREATED_AT },
      { id: "class-2", type: "school", schoolId: "school-1", name: "2班", grade: "高一", studentCount: 0, status: "active", createdBy: "admin", createdAt: CREATED_AT },
      { id: "class-3", type: "school", schoolId: "school-2", name: "3班", grade: "高二", studentCount: 0, status: "active", createdBy: "platform", createdAt: CREATED_AT },
    ],
    classroomDevices: [],
    classroomHomeworks: [],
    classroomNotices: [],
    lessonCoursewares: [],
    students: [],
  };
}

function pick(state: AppState, id: string): Teacher {
  return state.teachers.find((item) => item.id === id) as unknown as Teacher;
}

async function bindClassOne(state: AppState) {
  return classroomDeviceService.bindDevice({
    classId: "class-1",
    deviceToken: TOKEN_1,
    installationId: "installation-class-one",
    deviceName: "高一1班一体机",
  }, pick(state, "admin"));
}

describe("classroomDeviceService", () => {
  it("requires a school administrator for first binding and exposes only the public device shape", async () => {
    const state = makeState();
    await runWithState(state, async () => {
      await expect(classroomDeviceService.bindDevice({
        classId: "class-1",
        deviceToken: TOKEN_1,
        installationId: "installation-class-one",
      }, pick(state, "subject"))).rejects.toThrow("管理员");

      const bound = await bindClassOne(state);
      expect(bound).toMatchObject({ classId: "class-1", deviceName: "高一1班一体机", effectiveState: "active" });
      expect(bound).not.toHaveProperty("deviceTokenHash");

      const session = await classroomDeviceService.getDeviceSession(TOKEN_1);
      expect(session.classroom.id).toBe("class-1");
      expect(session.device).not.toHaveProperty("deviceTokenHash");
    });
  });

  it("grants subject teachers view/unlock and homeroom teachers lock/close permissions", async () => {
    const state = makeState();
    await runWithState(state, async () => {
      await bindClassOne(state);
      const subjectDevices = await classroomDeviceService.listManagedDevices(undefined, pick(state, "subject"));
      expect(subjectDevices).toHaveLength(1);
      expect(subjectDevices[0].permissions).toMatchObject({
        canView: true,
        canUnlock: true,
        canLock: false,
        canClose: false,
        canUnbind: false,
      });
      await expect(classroomDeviceService.listManagedDevices(undefined, pick(state, "other"))).resolves.toEqual([]);
      await expect(classroomDeviceService.lockDevice(boundId(subjectDevices), pick(state, "subject"))).rejects.toThrow("无权");

      const deviceId = boundId(subjectDevices);
      await expect(classroomDeviceService.lockDevice(deviceId, pick(state, "homeroom"))).resolves.toMatchObject({ effectiveState: "locked" });
      await expect(classroomDeviceService.closeDevice(deviceId, pick(state, "homeroom"))).resolves.toMatchObject({ effectiveState: "closed" });
      await expect(classroomDeviceService.unlockDevice(deviceId, pick(state, "subject"))).resolves.toMatchObject({ effectiveState: "active" });
    });
  });

  it("lets school administrators configure schedules and unbind their school's device", async () => {
    const state = makeState();
    await runWithState(state, async () => {
      const bound = await bindClassOne(state);
      await expect(classroomDeviceService.updateDeviceSchedule(bound.id, [{
        id: "invalid",
        weekdays: [1],
        start: "18:00",
        end: "08:00",
      }], pick(state, "admin"))).rejects.toThrow("起止时间");

      const updated = await classroomDeviceService.updateDeviceSchedule(bound.id, [{
        id: "weekday",
        weekdays: [1, 2, 3, 4, 5],
        start: "07:00",
        end: "18:00",
      }], pick(state, "admin"));
      expect(updated.allowedTimeRanges).toHaveLength(1);

      const heartbeat = await classroomDeviceService.reportHeartbeat(TOKEN_1, {
        path: "/classroom-device",
        title: "数学课件：函数",
        screenshot: "data:image/jpeg;base64,abc",
      });
      expect(heartbeat.currentPage).toMatchObject({ path: "/classroom-device", title: "数学课件：函数" });
      expect(heartbeat.lastSeenAt).toBeTruthy();

      await classroomDeviceService.unbindDevice(bound.id, pick(state, "admin"));
      await expect(classroomDeviceService.getDeviceSession(TOKEN_1)).rejects.toThrow("尚未绑定");
    });
  });

  it("allows platform administrators to switch schools and unlock/unbind but not lock or close", async () => {
    const state = makeState();
    await runWithState(state, async () => {
      const platform = pick(state, "platform");
      const bound = await classroomDeviceService.bindDevice({
        classId: "class-3",
        deviceToken: TOKEN_2,
        installationId: "installation-class-three",
      }, platform);
      const devices = await classroomDeviceService.listManagedDevices("school-2", platform);
      expect(devices).toHaveLength(1);
      expect(devices[0].permissions).toMatchObject({ canUnlock: true, canLock: false, canClose: false, canUnbind: true });
      await expect(classroomDeviceService.lockDevice(bound.id, platform)).rejects.toThrow("无权");
      await expect(classroomDeviceService.closeDevice(bound.id, platform)).rejects.toThrow("无权");
      await expect(classroomDeviceService.unlockDevice(bound.id, platform)).resolves.toMatchObject({ controlState: "active" });
      await expect(classroomDeviceService.unbindDevice(bound.id, platform)).resolves.toBeUndefined();
    });
  });
});

function boundId(devices: Array<{ id: string }>): string {
  const id = devices[0]?.id;
  if (!id) throw new Error("test device missing");
  return id;
}
