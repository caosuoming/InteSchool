import type { ClassroomHomework, ClassroomHomeworkFilter } from "@/types";
import { rpcCall } from "./api";

export interface ClassroomHomeworkInput {
  content: string;
  classIds: string[];
  assignedDate: string;
  publishAt: string;
}

export const classroomHomeworkService = {
  async listHomeworks(filter: ClassroomHomeworkFilter = {}): Promise<ClassroomHomework[]> {
    return rpcCall("classroomHomework", "listHomeworks", [filter]) as any;
  },

  async createHomework(
    teacherId: string,
    schoolId: string,
    input: ClassroomHomeworkInput,
  ): Promise<ClassroomHomework> {
    return rpcCall("classroomHomework", "createHomework", [teacherId, schoolId, input]) as any;
  },

  async deleteHomework(id: string): Promise<void> {
    return rpcCall("classroomHomework", "deleteHomework", [id]) as any;
  },
};
