import type { ClassroomNotice, ClassroomNoticeFilter } from "@/types";
import { rpcCall } from "./api";

export interface ClassroomNoticeInput {
  content: string;
  classIds: string[];
  startsAt: string;
  endsAt: string;
}

export const classroomNoticeService = {
  async listNotices(filter: ClassroomNoticeFilter = {}): Promise<ClassroomNotice[]> {
    return rpcCall("classroomNotice", "listNotices", [filter]) as any;
  },

  async createNotice(
    teacherId: string,
    schoolId: string,
    input: ClassroomNoticeInput,
  ): Promise<ClassroomNotice> {
    return rpcCall("classroomNotice", "createNotice", [teacherId, schoolId, input]) as any;
  },
};
