// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { AppState, TeacherRecord } from "../types.js";
import {
  captureResourceIds, filterPersonalResources, resourceSubject, selectedSubject, tagNewPersonalResources,
} from "./resource-subject.js";

const teacher: TeacherRecord = {
  id: "teacher-1", email: "teacher@example.com", name: "Teacher", avatar: "",
  schoolId: "school-a", subject: "英语", subjects: ["数学", "英语"],
  status: "active", role: "teacher", roles: ["teacher"], subjectGroupIds: [], prepGroupIds: [],
  affiliations: [{ id: "aff-a", schoolId: "school-a", status: "active", isCurrent: true,
    subject: "英语", subjects: ["数学", "英语"] }],
  currentAffiliationId: "aff-a", createdAt: "2026-01-01T00:00:00Z",
};

function state(): AppState {
  return { currentTeacherId: teacher.id, teachers: [structuredClone(teacher)],
    questions: [{ id: "old", teacherId: teacher.id, schoolId: "school-a" },
      { id: "english", teacherId: teacher.id, schoolId: "school-a", subject: "英语" }],
    examPapers: [], lectures: [], coursewares: [], materials: [], resourceFolders: [], baskets: [],
  };
}

describe("multidisciplinary personal resources", () => {
  it("assigns historical records to the original approved subject", () => {
    const data = state();
    expect(selectedSubject(data.teachers[0])).toBe("英语");
    expect(resourceSubject(data, (data.questions as Record<string, unknown>[])[0])).toBe("数学");
    expect(filterPersonalResources(data, data.teachers[0], data.questions as Record<string, unknown>[])
      .map((item) => item.id)).toEqual(["english"]);
  });

  it("tags new records in the current subject, including new folders and baskets", () => {
    const data = state();
    const before = captureResourceIds(data);
    (data.questions as Record<string, unknown>[]).push({ id: "new", teacherId: teacher.id, schoolId: "school-a" });
    (data.resourceFolders as Record<string, unknown>[]).push({ id: "folder", teacherId: teacher.id, schoolId: "school-a" });
    (data.baskets as Record<string, unknown>[]).push({ id: "basket", teacherId: teacher.id });
    tagNewPersonalResources(data, data.teachers[0], before);
    expect((data.questions as Record<string, unknown>[])[2].subject).toBe("英语");
    expect((data.resourceFolders as Record<string, unknown>[])[0].subject).toBe("英语");
    expect((data.baskets as Record<string, unknown>[])[0].subject).toBe("英语");
    expect((data.questions as Record<string, unknown>[])[0].subject).toBeUndefined();
  });

  it("keeps historical resources with their original school when switching", () => {
    const data = state();
    data.teachers[0].affiliations.push({ id: "aff-b", schoolId: "school-b", subject: "物理", subjects: ["物理"], isCurrent: false });
    expect(resourceSubject(data, (data.questions as Record<string, unknown>[])[0])).toBe("数学");
  });
});
