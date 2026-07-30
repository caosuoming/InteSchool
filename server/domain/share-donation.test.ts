import { describe, expect, it } from "vitest";
import type { AppState } from "../types.js";
import type { Chapter, KnowledgePoint, Question, ShareRecord } from "../../src/types/index.js";
import { runWithState } from "../runtime-db.js";
import { shareService } from "./share.js";

const now = "2026-07-29T09:00:00.000Z";

function teacher(id: string, name: string, schoolId: string) {
  return {
    id,
    email: `${id}@example.com`,
    name,
    nickname: `${name}昵称`,
    avatar: "",
    schoolId,
    subject: "数学",
    status: "active" as const,
    role: "teacher" as const,
    roles: ["teacher"],
    subjectGroupIds: [],
    prepGroupIds: [],
    affiliations: [],
    currentAffiliationId: null,
    createdAt: now,
  };
}

function question(
  id: string,
  teacherId: string,
  schoolId: string,
  chapterId: string,
  knowledgePointId: string,
  overrides: Partial<Question> = {},
): Question {
  return {
    id,
    teacherId,
    schoolId,
    type: "single",
    stem: "函数 f(x)=x² 的导数是什么？",
    options: ["2x", "x", "x²", "2"],
    answer: "A",
    analysis: "使用幂函数求导公式。",
    summary: "幂函数求导",
    chapterIds: [chapterId],
    knowledgePointIds: [knowledgePointId],
    difficulty: 2,
    recommendation: 4,
    usageCount: 0,
    remark: "",
    isShared: false,
    hiddenByExamIds: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function state(): AppState {
  const chapters: Chapter[] = [
    { id: "ch-a", schoolId: "school-a", parentId: null, name: "微积分", order: 1, level: 0, questionCount: 1 },
    { id: "ch-b", schoolId: "school-b", parentId: null, name: "函数", order: 1, level: 0, questionCount: 1 },
  ];
  const points: KnowledgePoint[] = [
    { id: "kp-a", schoolId: "school-a", parentId: null, chapterId: "ch-a", name: "导数", order: 1, level: 0, questionCount: 1 },
    { id: "kp-b", schoolId: "school-b", parentId: null, chapterId: "ch-b", name: "二次函数", order: 1, level: 0, questionCount: 1 },
  ];
  return {
    teachers: [
      teacher("teacher-a", "甲老师", "school-a"),
      teacher("teacher-b", "乙老师", "school-b"),
      teacher("teacher-c", "丙老师", "school-c"),
    ],
    currentTeacherId: "teacher-a",
    questions: [
      question("q-a", "teacher-a", "school-a", "ch-a", "kp-a", {
        analysis: "本次捐赠解析",
        summary: "本次捐赠总结",
      }),
      question("q-b", "teacher-b", "school-b", "ch-b", "kp-b", {
        analysis: "平台原解析",
        summary: "平台原总结",
      }),
    ],
    examPapers: [],
    lectures: [],
    coursewares: [],
    materials: [],
    chapters,
    knowledgePoints: points,
    shareRecords: [],
    platformResourceSettings: [],
    schoolBackups: [],
  };
}

describe("platform resource donations", () => {
  it("detects >80% duplicate questions, merges selected fields, and preserves both directory paths", async () => {
    const appState = state();
    await runWithState(appState, async () => {
      const first = await shareService.donateResources("teacher-b", "school-b", [
        { resourceType: "question", resourceId: "q-b" },
      ]);
      expect(first).toHaveLength(1);

      const previews = await shareService.checkDonationCandidates("teacher-a", [
        { resourceType: "question", resourceId: "q-a" },
      ]);
      expect(previews[0].alreadyDonated).toBe(false);
      expect(previews[0].duplicates[0]).toMatchObject({
        donationId: first[0].id,
        contributorNickname: "乙老师昵称",
      });
      expect(previews[0].duplicates[0].similarity).toBeGreaterThan(0.8);

      const merged = await shareService.donateResources("teacher-a", "school-a", [{
        resourceType: "question",
        resourceId: "q-a",
        duplicateAction: "merge",
        duplicateTargetDonationId: first[0].id,
        mergeFields: {
          stem: "existing",
          answer: "existing",
          analysis: "source",
          summary: "source",
        },
      }]);
      expect(merged).toHaveLength(1);
      expect(merged[0].mergedIntoDonationId).toBe(first[0].id);

      const platform = await shareService.listPublicDonations();
      expect(platform).toHaveLength(1);
      const snapshot = platform[0].resourceSnapshot as Question;
      expect(snapshot.analysis).toBe("本次捐赠解析");
      expect(snapshot.summary).toBe("本次捐赠总结");
      expect(platform[0].directorySnapshot?.chapters.filter((entry) => entry.selected).map((entry) => entry.name))
        .toEqual(expect.arrayContaining(["函数", "微积分"]));
      expect(platform[0].directorySnapshot?.knowledgePoints.filter((entry) => entry.selected).map((entry) => entry.name))
        .toEqual(expect.arrayContaining(["二次函数", "导数"]));
    });
  });

  it("copies a platform snapshot into personal resources and creates missing directories", async () => {
    const appState = state();
    await runWithState(appState, async () => {
      const [donation] = await shareService.donateResources("teacher-b", "school-b", [
        { resourceType: "question", resourceId: "q-b" },
      ]);
      const result = await shareService.acceptShare(donation.id, "teacher-c", "school-c");
      expect(result.resourceType).toBe("question");

      const copied = (appState.questions as Question[]).find((item) => item.id === result.newResourceId)!;
      expect(copied).toMatchObject({ teacherId: "teacher-c", schoolId: "school-c", sourceType: "shared" });
      expect(copied.chapterIds).toHaveLength(1);
      expect(copied.knowledgePointIds).toHaveLength(1);
      expect((appState.chapters as Chapter[]).find((item) => item.id === copied.chapterIds[0])).toMatchObject({
        schoolId: "school-c",
        name: "函数",
      });
      expect((appState.knowledgePoints as KnowledgePoint[]).find((item) => item.id === copied.knowledgePointIds[0])).toMatchObject({
        schoolId: "school-c",
        name: "二次函数",
      });
    });
  });

  it("blocks repeated donations and reserves cross-resource maintenance for top contributors", async () => {
    const appState = state();
    await runWithState(appState, async () => {
      const [donation] = await shareService.donateResources("teacher-b", "school-b", [
        { resourceType: "question", resourceId: "q-b" },
      ]);
      expect(await shareService.donateResources("teacher-b", "school-b", [
        { resourceType: "question", resourceId: "q-b" },
      ])).toEqual([]);

      const contributor = await shareService.getDonationPrivileges("teacher-b");
      expect(contributor).toMatchObject({ donationCount: 1, rank: 1, isTopContributor: true });
      expect((await shareService.getDonationPrivileges("teacher-c")).isTopContributor).toBe(false);

      await shareService.updateDonationResource("teacher-b", donation.id, { title: "贡献者修改后的题干" });
      expect((await shareService.listPublicDonations())[0].resourceTitle).toBe("贡献者修改后的题干");
      await expect(shareService.updateDonationResource("teacher-c", donation.id, { title: "越权修改" }))
        .rejects.toThrow("仅捐赠者本人或贡献榜前十名");

      const settings = await shareService.listPlatformResourceSettings();
      await shareService.updatePlatformResourceSettings("teacher-b", settings.map((item) => ({
        type: item.type,
        values: item.type === "grade" ? ["高一", "高二"] : item.values,
      })));
      expect((appState.platformResourceSettings as Array<{ type: string; values: string[] }>).find((item) => item.type === "grade")?.values)
        .toEqual(["高一", "高二"]);
      await expect(shareService.updatePlatformResourceSettings("teacher-c", []))
        .rejects.toThrow("仅贡献榜前十名");
    });
  });

  it("rejects server-side merge attempts below the 80% threshold", async () => {
    const appState = state();
    (appState.questions as Question[]).push(question("q-c", "teacher-a", "school-a", "ch-a", "kp-a", {
      stem: "完全不同的几何证明题",
      options: ["条件甲", "条件乙"],
      answer: "需要证明两三角形全等",
    }));
    await runWithState(appState, async () => {
      const [donation] = await shareService.donateResources("teacher-b", "school-b", [
        { resourceType: "question", resourceId: "q-b" },
      ]);
      await expect(shareService.donateResources("teacher-a", "school-a", [{
        resourceType: "question",
        resourceId: "q-c",
        duplicateAction: "merge",
        duplicateTargetDonationId: donation.id,
      }])).rejects.toThrow("仅相似度超过 80% 的题目可以合并");
    });
  });

  it("keeps donation records out of ordinary share inboxes", async () => {
    const appState = state();
    await runWithState(appState, async () => {
      await shareService.donateResources("teacher-b", "school-b", [
        { resourceType: "question", resourceId: "q-b" },
      ]);
      expect(await shareService.listIncomingShares("teacher-a")).toEqual([]);
      expect(await shareService.listOutgoingShares("teacher-b")).toEqual([]);
      expect((appState.shareRecords as ShareRecord[]).filter((item) => item.kind === "donation")).toHaveLength(1);
    });
  });

  it("uses an anonymous label instead of a donor's real name when no nickname is set", async () => {
    const appState = state();
    const donor = appState.teachers.find((item) => item.id === "teacher-b")!;
    delete donor.nickname;
    await runWithState(appState, async () => {
      await shareService.donateResources("teacher-b", "school-b", [
        { resourceType: "question", resourceId: "q-b" },
      ]);
      expect(await shareService.listDonationContributors()).toContainEqual(expect.objectContaining({
        teacherId: "teacher-b",
        nickname: "匿名用户",
      }));
      const previews = await shareService.checkDonationCandidates("teacher-a", [
        { resourceType: "question", resourceId: "q-a" },
      ]);
      expect(previews[0].duplicates[0].contributorNickname).toBe("匿名用户");
      expect(JSON.stringify(previews)).not.toContain("乙老师");
    });
  });
});
