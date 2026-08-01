import { describe, expect, it } from "vitest";
import type { AppState } from "../types.js";
import type { Chapter, Courseware, ExamPaper, KnowledgePoint, Lecture, Material, Question, ShareRecord } from "../../src/types/index.js";
import { runWithState } from "../runtime-db.js";
import { shareService } from "./share.js";

const now = "2026-07-29T09:00:00.000Z";

function teacher(
  id: string,
  name: string,
  schoolId: string,
  overrides: Partial<AppState["teachers"][number]> = {},
): AppState["teachers"][number] {
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
    ...overrides,
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
    schoolChapters: [],
    schoolKnowledgePoints: [],
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
      expect(copied).toMatchObject({
        teacherId: "teacher-c",
        schoolId: "school-c",
        sourceType: "shared",
        stem: "函数 f(x)=x² 的导数是什么？（副本）",
      });
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

  it("appends the copy suffix for every platform resource type", async () => {
    const appState = state();
    const sharedFields = {
      teacherId: "teacher-b",
      schoolId: "school-b",
      chapterIds: ["ch-b"],
      knowledgePointIds: ["kp-b"],
      grade: "高一",
      schoolYear: "2026-2027",
      semester: "上学期" as const,
      createdAt: now,
      updatedAt: now,
    };
    (appState.examPapers as ExamPaper[]).push({
      ...sharedFields,
      id: "exam-b",
      title: "函数测试",
      duration: 60,
      totalScore: 100,
      questions: [],
      status: "draft",
    });
    (appState.lectures as Lecture[]).push({
      ...sharedFields,
      id: "lecture-b",
      title: "函数讲义",
      classIds: [],
      studentIds: [],
      sections: [],
      version: 1,
      status: "draft",
    });
    (appState.coursewares as Courseware[]).push({
      ...sharedFields,
      id: "courseware-b",
      title: "函数课件",
      type: "ppt",
      content: "",
      tags: [],
    });
    (appState.materials as Material[]).push({
      ...sharedFields,
      id: "material-b",
      title: "函数素材",
      type: "text",
      content: "",
      tags: [],
    });

    await runWithState(appState, async () => {
      const requests = [
        { resourceType: "question" as const, resourceId: "q-b" },
        { resourceType: "examPaper" as const, resourceId: "exam-b" },
        { resourceType: "lecture" as const, resourceId: "lecture-b" },
        { resourceType: "courseware" as const, resourceId: "courseware-b" },
        { resourceType: "material" as const, resourceId: "material-b" },
      ];
      const donations = await shareService.donateResources("teacher-b", "school-b", requests);
      expect(donations).toHaveLength(5);

      for (const donation of donations) {
        await shareService.saveDonationAsOwnResource(donation.id, "teacher-c", "school-c");
      }

      expect((appState.questions as Question[]).find((item) => item.teacherId === "teacher-c")?.stem)
        .toBe("函数 f(x)=x² 的导数是什么？（副本）");
      expect((appState.examPapers as ExamPaper[]).find((item) => item.teacherId === "teacher-c")?.title)
        .toBe("函数测试（副本）");
      expect((appState.lectures as Lecture[]).find((item) => item.teacherId === "teacher-c")?.title)
        .toBe("函数讲义（副本）");
      expect((appState.coursewares as Courseware[]).find((item) => item.teacherId === "teacher-c")?.title)
        .toBe("函数课件（副本）");
      expect((appState.materials as Material[]).find((item) => item.teacherId === "teacher-c")?.title)
        .toBe("函数素材（副本）");
    });
  });

  it("keeps both selected answers, analyses, and summaries with second-field labels", async () => {
    const appState = state();
    const source = (appState.questions as Question[]).find((item) => item.id === "q-a")!;
    source.answer = "B";
    await runWithState(appState, async () => {
      const [donation] = await shareService.donateResources("teacher-b", "school-b", [
        { resourceType: "question", resourceId: "q-b" },
      ]);

      await expect(shareService.donateResources("teacher-a", "school-a", [{
        resourceType: "question",
        resourceId: "q-a",
        duplicateAction: "merge",
        duplicateTargetDonationId: donation.id,
        mergeFields: { stem: "both" },
      }])).rejects.toThrow("题干只能二选一");

      await shareService.donateResources("teacher-a", "school-a", [{
        resourceType: "question",
        resourceId: "q-a",
        duplicateAction: "merge",
        duplicateTargetDonationId: donation.id,
        mergeFields: {
          stem: "existing",
          answer: "both",
          analysis: "both",
          summary: "both",
        },
      }]);

      const snapshot = (await shareService.listPublicDonations())[0].resourceSnapshot as Question;
      expect(snapshot.answer).toBe("A\n\n答案二：B");
      expect(snapshot.analysis).toBe("平台原解析\n\n解析二：本次捐赠解析");
      expect(snapshot.summary).toBe("平台原总结\n\n总结二：本次捐赠总结");
    });
  });

  it("deduplicates platform saves, blocks self-saves, and makes merged copies non-donatable", async () => {
    const appState = state();
    (appState.questions as Question[]).push(question("q-c", "teacher-c", "school-c", "", "", {
      answer: "B",
      analysis: "我的原解析",
      summary: "我的原总结",
      chapterIds: [],
      knowledgePointIds: [],
    }));
    await runWithState(appState, async () => {
      const [donation] = await shareService.donateResources("teacher-b", "school-b", [
        { resourceType: "question", resourceId: "q-b" },
      ]);

      const selfCheck = await shareService.checkSaveAsOwnResource(donation.id, "teacher-b", "school-b");
      expect(selfCheck).toMatchObject({ canSave: false, alreadySaved: false });
      await expect(shareService.saveDonationAsOwnResource(donation.id, "teacher-b", "school-b"))
        .rejects.toThrow("自己捐赠");

      const check = await shareService.checkSaveAsOwnResource(donation.id, "teacher-c", "school-c");
      expect(check.conflict).toMatchObject({ targetResourceId: "q-c" });
      await expect(shareService.saveDonationAsOwnResource(donation.id, "teacher-c", "school-c"))
        .rejects.toThrow("请先选择新增或合并");

      const saved = await shareService.saveDonationAsOwnResource(donation.id, "teacher-c", "school-c", {
        action: "merge",
        targetResourceId: "q-c",
        fields: {
          stem: "target",
          answer: "both",
          analysis: "both",
          summary: "both",
        },
      });
      expect(saved).toEqual({ resourceType: "question", resourceId: "q-c", merged: true });
      const merged = (appState.questions as Question[]).find((item) => item.id === "q-c")!;
      expect(merged.answer).toBe("B\n\n答案二：A");
      expect(merged.analysis).toBe("我的原解析\n\n解析二：平台原解析");
      expect(merged.summary).toBe("我的原总结\n\n总结二：平台原总结");
      expect(merged.platformSourceDonationIds).toEqual([donation.id]);

      const repeated = await shareService.checkSaveAsOwnResource(donation.id, "teacher-c", "school-c");
      expect(repeated).toMatchObject({ canSave: false, alreadySaved: true });
      await expect(shareService.donateResources("teacher-c", "school-c", [
        { resourceType: "question", resourceId: "q-c" },
      ])).rejects.toThrow("平台资源创建的副本不能再次捐赠");
    });
  });

  it("uses explicit platform admins and subject moderators instead of ranking-based management", async () => {
    const appState = state();
    appState.teachers.push(teacher("teacher-admin", "平台管理员", "school-admin", {
      role: "platform_admin",
      subject: "平台管理",
    }));
    (appState.questions as Question[]).push(question("q-a-2", "teacher-a", "school-a", "ch-a", "kp-a", {
      stem: "第二道数学平台题目",
    }));
    await runWithState(appState, async () => {
      const [donationB] = await shareService.donateResources("teacher-b", "school-b", [
        { resourceType: "question", resourceId: "q-b" },
      ]);
      expect(await shareService.donateResources("teacher-b", "school-b", [
        { resourceType: "question", resourceId: "q-b" },
      ])).toEqual([]);
      const [donationA] = await shareService.donateResources("teacher-a", "school-a", [
        { resourceType: "question", resourceId: "q-a-2" },
      ]);

      const contributor = await shareService.getDonationPrivileges("teacher-b");
      expect(contributor).toMatchObject({ donationCount: 1, isTopContributor: true });
      expect((await shareService.getDonationPrivileges("teacher-c")).isTopContributor).toBe(false);

      await expect(shareService.updateDonationResource("teacher-b", donationA.id, { title: "排名越权修改" }))
        .rejects.toThrow("学科版主");
      await expect(shareService.updateDonationResource("teacher-c", donationB.id, { title: "普通教师越权修改" }))
        .rejects.toThrow("学科版主");

      await shareService.setSubjectModerator("teacher-admin", "数学", "teacher-c", true);
      expect(await shareService.getDonationPrivileges("teacher-c")).toMatchObject({
        moderatedSubjects: ["数学"],
        canManageAllSubjects: false,
      });
      await shareService.updateDonationResource("teacher-c", donationB.id, { title: "数学版主修改后的题干" });
      expect((await shareService.listPublicDonations("teacher-c")).find((item) => item.id === donationB.id)?.resourceTitle)
        .toBe("数学版主修改后的题干");

      await shareService.updateDonationOrder("teacher-c", "数学", [donationA.id, donationB.id]);
      expect((await shareService.listPublicDonations("teacher-c")).map((item) => item.id))
        .toEqual([donationA.id, donationB.id]);

      const settings = await shareService.listPlatformResourceSettings();
      await expect(shareService.updatePlatformResourceSettings("teacher-b", settings.map((item) => ({
        type: item.type,
        values: item.values,
      })))).rejects.toThrow("平台超级管理员");
      await shareService.updatePlatformResourceSettings("teacher-admin", settings.map((item) => ({
        type: item.type,
        values: item.type === "grade" ? ["高一", "高二"] : item.values,
      })));
      expect((appState.platformResourceSettings as Array<{ type: string; values: string[] }>).find((item) => item.type === "grade")?.values)
        .toEqual(["高一", "高二"]);

      await expect(shareService.deleteDonationResource("teacher-c", donationB.id))
        .rejects.toThrow("平台超级管理员");
      await shareService.deleteDonationResource("teacher-admin", donationB.id);
      expect((await shareService.listPublicDonations("teacher-admin")).some((item) => item.id === donationB.id)).toBe(false);
    });
  });

  it("separates platform resources by subject while allowing platform admins to view all subjects", async () => {
    const appState = state();
    appState.teachers.push(
      teacher("teacher-physics", "物理老师", "school-physics", { subject: "物理" }),
      teacher("teacher-admin", "平台管理员", "school-admin", { role: "platform_admin", subject: "平台管理" }),
    );
    (appState.questions as Question[]).push(question("q-physics", "teacher-physics", "school-physics", "ch-a", "kp-a", {
      stem: "牛顿第二定律的表达式是什么？",
    }));
    await runWithState(appState, async () => {
      await shareService.donateResources("teacher-b", "school-b", [
        { resourceType: "question", resourceId: "q-b" },
      ]);
      await shareService.donateResources("teacher-physics", "school-physics", [
        { resourceType: "question", resourceId: "q-physics" },
      ]);

      expect((await shareService.listPublicDonations("teacher-a")).map((item) => item.platformSubject)).toEqual(["数学"]);
      expect((await shareService.listPublicDonations("teacher-physics")).map((item) => item.platformSubject)).toEqual(["物理"]);
      expect(new Set((await shareService.listPublicDonations("teacher-admin")).map((item) => item.platformSubject)))
        .toEqual(new Set(["数学", "物理"]));
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

  it("groups public ordinary shares behind one batch identifier", async () => {
    const appState = state();
    (appState.questions as Question[]).push(question("q-a-2", "teacher-a", "school-a", "ch-a", "kp-a", {
      stem: "第二道批量分享题目",
    }));
    await runWithState(appState, async () => {
      const first = await shareService.createShare({
        fromTeacherId: "teacher-a",
        fromSchoolId: "school-a",
        scope: "public",
        resourceType: "question",
        resourceId: "q-a",
        resourceTitle: "第一道批量分享题目",
        batchId: "batch-public",
      });
      const second = await shareService.createShare({
        fromTeacherId: "teacher-a",
        fromSchoolId: "school-a",
        scope: "public",
        resourceType: "question",
        resourceId: "q-a-2",
        resourceTitle: "第二道批量分享题目",
        batchId: "batch-public",
      });
      await shareService.createShare({
        fromTeacherId: "teacher-a",
        fromSchoolId: "school-a",
        scope: "school",
        resourceType: "question",
        resourceId: "q-a",
        resourceTitle: "不应出现在链接中",
        batchId: "batch-public",
      });

      expect((await shareService.getBatchShare("batch-public")).map((item) => item.id))
        .toEqual([first.id, second.id]);
      expect(await shareService.getBatchShare("missing-batch")).toEqual([]);
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
