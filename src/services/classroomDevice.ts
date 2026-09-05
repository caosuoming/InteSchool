import { rpcCall } from "./api";
import type {
  ClassroomDeviceAccessPolicy,
  ClassroomDevice,
  ClassroomDeviceSession,
  ClassroomDeviceSnapshot,
  ClassroomDeviceTimeRange,
} from "@/types";

export interface ClassroomDeviceBindInput {
  schoolId: string;
  classId?: string;
  publicClassroom?: boolean;
  deviceToken: string;
  installationId: string;
  deviceName?: string;
}

export interface ClassroomDeviceHeartbeatInput {
  path?: string;
  title?: string;
  screenshot?: string;
}

export const CLASSROOM_DEVICE_TOKEN_KEY = "inteschool-classroom-device-token";
export const CLASSROOM_INSTALLATION_ID_KEY = "inteschool-classroom-installation-id";

export function classroomInstallationId(): string {
  const stored = localStorage.getItem(CLASSROOM_INSTALLATION_ID_KEY);
  if (stored) return stored;
  const value = typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
  localStorage.setItem(CLASSROOM_INSTALLATION_ID_KEY, value);
  return value;
}

export function createClassroomDeviceToken(): string {
  if (typeof crypto.randomUUID === "function") {
    return `${crypto.randomUUID()}-${crypto.randomUUID()}`;
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

export const classroomDeviceService = {
  async getDeviceSession(deviceToken: string): Promise<ClassroomDeviceSession> {
    return rpcCall("classroomDevice", "getDeviceSession", [deviceToken]) as any;
  },

  async getClassroomSnapshot(deviceToken: string, classId?: string): Promise<ClassroomDeviceSnapshot> {
    return rpcCall("classroomDevice", "getClassroomSnapshot", [deviceToken, classId]) as any;
  },

  async reportHeartbeat(deviceToken: string, input: ClassroomDeviceHeartbeatInput): Promise<ClassroomDevice> {
    return rpcCall("classroomDevice", "reportHeartbeat", [deviceToken, input]) as any;
  },

  async bindDevice(input: ClassroomDeviceBindInput): Promise<ClassroomDevice> {
    return rpcCall("classroomDevice", "bindDevice", [input]) as any;
  },

  async listManagedDevices(targetSchoolId?: string): Promise<ClassroomDevice[]> {
    return rpcCall("classroomDevice", "listManagedDevices", [targetSchoolId]) as any;
  },

  async unlockDevice(deviceId: string): Promise<ClassroomDevice> {
    return rpcCall("classroomDevice", "unlockDevice", [deviceId]) as any;
  },

  async lockDevice(deviceId: string): Promise<ClassroomDevice> {
    return rpcCall("classroomDevice", "lockDevice", [deviceId]) as any;
  },

  async closeDevice(deviceId: string): Promise<ClassroomDevice> {
    return rpcCall("classroomDevice", "closeDevice", [deviceId]) as any;
  },

  async updateDeviceSchedule(deviceId: string, ranges: ClassroomDeviceTimeRange[]): Promise<ClassroomDevice> {
    return rpcCall("classroomDevice", "updateDeviceSchedule", [deviceId, ranges]) as any;
  },

  async updateDeviceAccessPolicy(deviceId: string, policy: ClassroomDeviceAccessPolicy): Promise<ClassroomDevice> {
    return rpcCall("classroomDevice", "updateDeviceAccessPolicy", [deviceId, policy]) as any;
  },

  async unbindDevice(deviceId: string): Promise<void> {
    return rpcCall("classroomDevice", "unbindDevice", [deviceId]) as any;
  },
};
