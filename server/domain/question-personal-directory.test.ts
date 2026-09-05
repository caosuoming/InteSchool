import { describe, expect, it } from "vitest";
import type { KnowledgePoint } from "../../src/types/index.js";
import type { AppState, TeacherRecord } from "../types.js";
import { runWithState } from "../runtime-db.js";
import { questionService } from "./question.js";

function teacher(): TeacherRecord {
  return {
    id: "teacher-1",
    email: "teacher@example.com",
    name: "教师一",
    avatar: "",
    schoolId: "school-a",
    subject: "数学",
    status: "active",
    role: "teacher",
    roles: ["teacher"],
    subjectGroupIds: [],
    prepGroupIds: [],
    affiliations: [],
    currentAffiliationId: null,
    createdAt: "2026-01-01T00:00:00.000Z",
  } as TeacherRecord;
}

function state(): AppState {
  const personalSchoolId = "personal-directory:teacher-1";
  return {
    teachers: [teacher()],
    currentTeacherId: "teacher-1",
    chapters: [],
    knowledgePoints: [
      { id: "root-a", schoolId: personalSchoolId, teacherId: "teacher-1", parentId: null, name: "目录 A", order: 1, level: 0 },
      { id: "root-b", schoolId: personalSchoolId, teacherId: "teacher-1", parentId: null, name: "目录 B", order: 2, level: 0 },
      { id: "kp-a", schoolId: personalSchoolId, teacherId: "teacher-1", parentId: "root-a", name: "同名知识点", order: 1, level: 1 },
      { id: "kp-b", schoolId: personalSchoolId, teacherId: "teacher-1", parentId: "root-b", name: "同名知识点", order: 1, level: 1 },
    ] satisfies KnowledgePoint[],
    questions: [],
    directoryCatalogs: [],
    directoryDonations: [],
  } as AppState;
}

describe("question aliases with personal knowledge directories", () => {
  it("expands aliases from the teacher directory instead of the active school", async () => {
    await runWithState(state(), async () => {
      const created = await questionService.createQuestion("teacher-1", "school-a", {
        type: "short",
        stem: "测试题",
        answer: "答案",
        analysis: "解析",
        chapterIds: [],
        knowledgePointIds: ["kp-a"],
        difficulty: 2,
        recommendation: 3,
      });

      expect(created.knowledgePointIds).toEqual(["kp-a", "kp-b"]);
    });
  });
});
