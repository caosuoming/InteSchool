import { describe, expect, it } from "vitest";
import type { AppState, TeacherRecord } from "../types.js";
import type {
  ClassTypeCategory,
  ExamPaperType,
  LectureType,
  SchoolSetting,
} from "../../src/types/index.js";
import { runWithState } from "../runtime-db.js";
import { settingsService } from "./settings.js";
import { classService } from "./class.js";

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
    affiliations: [
      { id: "aff-a", schoolId: "school-a", subject: "数学", status: "active", isCurrent: true },
      { id: "aff-b", schoolId: "school-b", subject: "数学", status: "active", isCurrent: false },
    ],
    currentAffiliationId: "aff-a",
    createdAt: "2026-01-01T00:00:00.000Z",
  } as TeacherRecord;
}

function state(): AppState {
  const now = "2026-01-01T00:00:00.000Z";
  return {
    teachers: [teacher()],
    currentTeacherId: "teacher-1",
    schoolSettings: [
      { id: "source-a", schoolId: "school-a", type: "source", name: "校本", value: "school", sortOrder: 1, enabled: true, createdAt: now, updatedAt: now },
      { id: "source-common-a", schoolId: "school-a", type: "source", name: "网络", value: "web", sortOrder: 2, enabled: true, createdAt: now, updatedAt: now },
      { id: "source-common-b", schoolId: "school-b", type: "source", name: "网络资源", value: "web", sortOrder: 1, enabled: true, createdAt: now, updatedAt: now },
      { id: "source-b", schoolId: "school-b", type: "source", name: "自编", value: "self", sortOrder: 2, enabled: true, createdAt: now, updatedAt: now },
    ] satisfies SchoolSetting[],
    classTypeCategories: [
      { id: "class-a", schoolId: "school-a", name: "实验班", sortOrder: 1, enabled: true, createdAt: now },
      { id: "class-b-same", schoolId: "school-b", name: "实验班", sortOrder: 1, enabled: true, createdAt: now },
      { id: "class-b", schoolId: "school-b", name: "平行班", sortOrder: 2, enabled: true, createdAt: now },
    ] satisfies ClassTypeCategory[],
    examPaperTypes: [
      { id: "exam-a", schoolId: "school-a", name: "考试", format: "gaokao", sortOrder: 1, enabled: true, createdAt: now },
      { id: "monthly-a", schoolId: "school-a", name: "月考", parentId: "exam-a", format: "gaokao", sortOrder: 1, enabled: true, createdAt: now },
      { id: "exam-b", schoolId: "school-b", name: "考试", format: "gaokao", sortOrder: 1, enabled: true, createdAt: now },
      { id: "weekly-b", schoolId: "school-b", name: "周测", parentId: "exam-b", format: "gaokao", sortOrder: 1, enabled: true, createdAt: now },
    ] satisfies ExamPaperType[],
    lectureTypes: [
      { id: "lecture-a", schoolId: "school-a", name: "学案", format: "mixed", sortOrder: 1, enabled: true, createdAt: now },
      { id: "lecture-b", schoolId: "school-b", name: "教案", format: "table", sortOrder: 1, enabled: true, createdAt: now },
    ] satisfies LectureType[],
    schoolClasses: [
      { id: "school-class-1", type: "school", schoolId: "school-a", name: "高一1班", grade: "高一", classTypeId: "class-a", studentCount: 0, createdBy: "teacher-1", createdAt: now },
    ],
    examPapers: [{ id: "paper-1", teacherId: "teacher-1", schoolId: "school-a", typeId: "monthly-a" }],
    lectures: [{ id: "lecture-1", teacherId: "teacher-1", schoolId: "school-b", typeId: "lecture-b" }],
  } as AppState;
}

function switchSchool(appState: AppState): void {
  const current = appState.teachers[0];
  appState.teachers[0] = {
    ...current,
    schoolId: "school-b",
    currentAffiliationId: "aff-b",
    affiliations: current.affiliations.map((item) => ({ ...item, isCurrent: item.id === "aff-b" })),
  };
}

describe("personal system settings", () => {
  it("migrates settings from all affiliated schools and keeps one set after switching schools", async () => {
    const appState = state();

    await runWithState(appState, async () => {
      const sources = await settingsService.listSettings("teacher-1", "source");
      const classTypes = await settingsService.listClassTypes("teacher-1");
      const examTypes = await settingsService.listExamPaperTypes("teacher-1");
      const lectureTypes = await settingsService.listLectureTypes("teacher-1");

      expect(sources.map((item) => item.value)).toEqual(["school", "web", "self"]);
      expect(sources.map((item) => item.name)).toEqual(["校本", "网络", "自编"]);
      expect(classTypes.map((item) => item.name)).toEqual(["实验班", "平行班"]);
      expect(examTypes.map((item) => item.name)).toEqual(["考试", "月考", "周测"]);
      expect(lectureTypes.map((item) => item.name)).toEqual(["学案", "教案"]);

      for (const item of [...sources, ...classTypes, ...examTypes, ...lectureTypes]) {
        expect(item.teacherId).toBe("teacher-1");
        expect(item.schoolId).toBe("personal-settings:teacher-1");
      }

      const examByName = new Map(examTypes.map((item) => [item.name, item]));
      expect(examByName.get("月考")?.parentId).toBe(examByName.get("考试")?.id);
      expect(examByName.get("周测")?.parentId).toBe(examByName.get("考试")?.id);
      expect((appState.examPapers as Array<{ typeId?: string }>)[0].typeId).toBe(examByName.get("月考")?.id);
      expect((appState.lectures as Array<{ typeId?: string }>)[0].typeId).toBe(lectureTypes.find((item) => item.name === "教案")?.id);
      const personalExperimentType = classTypes.find((item) => item.name === "实验班")!;
      expect(personalExperimentType.legacyIds).toEqual(["class-a", "class-b-same"]);
      expect((appState.schoolClasses as Array<{ classTypeId?: string }>)[0].classTypeId).toBe("class-a");
      const schoolBClass = await classService.createSchoolClass("school-b", "teacher-1", "高一2班", "高一", {
        classTypeId: personalExperimentType.id,
      });
      expect(schoolBClass.classTypeId).toBe("class-b-same");

      const added = await settingsService.createSetting("teacher-1", {
        type: "source",
        name: "个人新增",
        value: "mine",
      });
      const beforeSwitchIds = (await settingsService.listSettings("teacher-1", "source")).map((item) => item.id);

      switchSchool(appState);
      const afterSwitch = await settingsService.listSettings("teacher-1", "source");
      expect(afterSwitch.map((item) => item.id)).toEqual(beforeSwitchIds);
      expect(afterSwitch.find((item) => item.id === added.id)?.name).toBe("个人新增");
    });
  });
});
