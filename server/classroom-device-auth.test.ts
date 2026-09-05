// @vitest-environment node

import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  canClassroomDeviceReadFile,
  classroomDeviceTokenFromRpc,
  isClassroomDeviceTokenValid,
} from "./classroom-device-auth.js";
import type { AppState } from "./types.js";

const TOKEN = "classroom-device-test-token-1234567890";

function state(): AppState {
  return {
    teachers: [],
    currentTeacherId: null,
    classroomDevices: [{
      id: "device-1",
      schoolId: "school-1",
      classId: "class-1",
      deviceTokenHash: createHash("sha256").update(TOKEN).digest("hex"),
    }],
    schoolClasses: [
      { id: "class-1", schoolId: "school-1", status: "active" },
      { id: "class-2", schoolId: "school-1", status: "active" },
      { id: "class-3", schoolId: "school-2", status: "active" },
    ],
    lessonCoursewares: [{
      id: "lesson-1",
      schoolId: "school-1",
      classIds: ["class-1"],
      status: "published",
      lifecycleStatus: "active",
      slides: [{ attachment: { url: "/api/files/file-1" } }],
    }],
    classroomHomeworks: [{
      id: "homework-1",
      schoolId: "school-1",
      classIds: ["class-1"],
      publishAt: new Date(Date.now() - 60_000).toISOString(),
      attachments: [{ url: "/api/files/file-2" }],
    }],
  } as AppState;
}

describe("classroom device authorization", () => {
  it("extracts the device token only from classroom-device session and binding RPCs", () => {
    expect(classroomDeviceTokenFromRpc({
      service: "classroomDevice",
      method: "bindDevice",
      args: [{ classId: "class-1", deviceToken: TOKEN }],
    })).toBe(TOKEN);
    expect(classroomDeviceTokenFromRpc({
      service: "classroomDevice",
      method: "getClassroomSnapshot",
      args: [TOKEN],
    })).toBe(TOKEN);
    expect(classroomDeviceTokenFromRpc({
      service: "classroomDevice",
      method: "unlockDevice",
      args: ["device-1"],
    })).toBeNull();
    expect(classroomDeviceTokenFromRpc({
      service: "question",
      method: "getQuestion",
      args: [TOKEN],
    })).toBeNull();
  });

  it("distinguishes a valid classroom device token from an unauthenticated request", () => {
    const snapshot = state();
    expect(isClassroomDeviceTokenValid(snapshot, TOKEN)).toBe(true);
    expect(isClassroomDeviceTokenValid(snapshot, "wrong-device-token-123456789012345")).toBe(false);
    expect(isClassroomDeviceTokenValid(snapshot, undefined)).toBe(false);
  });

  it("allows only files referenced by published content assigned to the bound class", () => {
    const snapshot = state();
    expect(canClassroomDeviceReadFile(snapshot, TOKEN, "file-1")).toBe(true);
    expect(canClassroomDeviceReadFile(snapshot, TOKEN, "file-2")).toBe(true);
    expect(canClassroomDeviceReadFile(snapshot, TOKEN, "file-other")).toBe(false);
    expect(canClassroomDeviceReadFile(snapshot, "wrong-device-token-123456789012345", "file-1")).toBe(false);

    (snapshot.lessonCoursewares as Array<Record<string, unknown>>)[0].status = "draft";
    expect(canClassroomDeviceReadFile(snapshot, TOKEN, "file-1")).toBe(false);
  });

  it("allows a public classroom device to read published content from other classes in the same school only", () => {
    const snapshot = state();
    (snapshot.classroomDevices as Array<Record<string, unknown>>)[0].publicClassroom = true;
    (snapshot.lessonCoursewares as Array<Record<string, unknown>>).push({
      id: "lesson-2",
      schoolId: "school-1",
      classIds: ["class-2"],
      status: "published",
      lifecycleStatus: "active",
      slides: [{ attachment: { url: "/api/files/file-class-2" } }],
    }, {
      id: "lesson-other-school",
      schoolId: "school-2",
      classIds: ["class-3"],
      status: "published",
      lifecycleStatus: "active",
      slides: [{ attachment: { url: "/api/files/file-school-2" } }],
    });

    expect(canClassroomDeviceReadFile(snapshot, TOKEN, "file-class-2")).toBe(true);
    expect(canClassroomDeviceReadFile(snapshot, TOKEN, "file-school-2")).toBe(false);
  });
});
