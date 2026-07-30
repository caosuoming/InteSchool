import { describe, expect, it } from "vitest";
import type {
  Chapter,
  ExamPaper,
  KnowledgePoint,
  Lecture,
  Question,
  SchoolResourceBackup,
  Teacher,
  TreeNode,
} from "../../src/types/index.js";
import type { AppState, TeacherRecord } from "../types.js";
import { computeDuplicateHash, runWithState } from "../runtime-db.js";
import { examPublishService } from "./examPublish.js";
import { lectureService } from "./lecture.js";
import { schoolBackupService } from "./schoolBackup.js";

const now = "2026-07-30T11:00:00.000Z";

function teacher(id: string, schoolId = "school-a"): TeacherRecord & Teacher {
  return {
    id,
    email: `${id}@example.com`,
    name: id,
    avatar: "",
    schoolId,
    subject: "数学",
    status: "active",
    role: "teacher",
    roles: [],
    subjectGroupIds: [],
    prepGroupIds: [],
    affiliations: [],
    currentAffiliationId: null,
    createdAt: now,
  };
}

function question(
  id: string,
  chapterId: string,
  knowledgePointId: string,
  teacherId = "teacher-a",
): Question {
  const stem = "函数 f(x)=x² 的导数是什么？";
  const options = ["2x", "x", "x²", "2"];
  const answer = "A";
  return {
    id,
    teacherId,
    schoolId: "school-a",
    type: "single",
    stem,
    options,
    answer,
    analysis: "幂函数求导。",
    summary: "幂函数求导公式",
    chapterIds: [chapterId],
    knowledgePointIds: [knowledgePointId],
    difficulty: 2,
    recommendation: 4,
    usageCount: 0,
    remark: "重点题",
    isShared: false,
    duplicateHash: computeDuplicateHash(stem, answer, options),
    hiddenByExamIds: [],
    createdAt: now,
    updatedAt: now,
  };
}

function baseState(): AppState {
  const chapters: Chapter[] = [
    {
      id: "ch-book-a",
      schoolId: "school-a",
      parentId: null,
      name: "必修第一册",
      order: 1,
      level: 0,
    },
    {
      id: "ch-function-a",
      schoolId: "school-a",
      parentId: "ch-book-a",
      name: "函数",
      order: 1,
      level: 1,
    },
    {
      id: "ch-book-b",
      schoolId: "school-a",
      parentId: null,
      name: "必修第一册",
      order: 2,
      level: 0,
    },
    {
      id: "ch-function-b",
      schoolId: "school-a",
      parentId: "ch-book-b",
      name: "函数",
      order: 1,
      level: 1,
    },
  ];
  const knowledgePoints: KnowledgePoint[] = [
    {
      id: "kp-derivative-a",
      schoolId: "school-a",
      parentId: null,
      chapterId: "ch-function-a",
      name: "导数",
      order: 1,
      level: 0,
    },
    {
      id: "kp-derivative-b",
      schoolId: "school-a",
      parentId: null,
      chapterId: "ch-function-b",
      name: "导数",
      order: 1,
      level: 0,
    },
  ];
  return {
    teachers: [teacher("teacher-a"), teacher("teacher-b")],
    currentTeacherId: "teacher-a",
    chapters,
    knowledgePoints,
    schoolChapters: [],
    schoolKnowledgePoints: [],
    questions: [
      question("q-a", "ch-function-a", "kp-derivative-a"),
      question("q-b", "ch-function-b", "kp-derivative-b"),
    ],
    lectures: [],
    examPapers: [],
    examPublications: [],
    coursewares: [],
    materials: [],
    schoolBackups: [],
    schoolClasses: [],
    personalClasses: [],
    students: [],
    reflections: [],
  };
}

function findNode(tree: TreeNode, name: string): TreeNode | undefined {
  if (tree.name === name) return tree;
  for (const child of tree.children) {
    const match = findNode(child, name);
    if (match) return match;
  }
  return undefined;
}

describe("independent school resource catalogs", () => {
  it("starts empty, merges same-name directory paths, and deduplicates question content", async () => {
    const state = baseState();
    await runWithState(state, async () => {
      expect((state.schoolChapters as Chapter[])).toEqual([]);
      expect((state.schoolKnowledgePoints as KnowledgePoint[])).toEqual([]);

      await schoolBackupService.autoBackupForResource(
        "school-a",
        "teacher-a",
        "question",
        "q-a",
        ["class-a"],
        "首次跨班级发布",
        ["student-a"],
      );
      await schoolBackupService.autoBackupForResource(
        "school-a",
        "teacher-a",
        "question",
        "q-b",
        ["class-b"],
        "再次跨班级发布",
        ["student-b"],
      );

      const backups = (state.schoolBackups as SchoolResourceBackup[])
        .filter((item) => item.resourceType === "question");
      expect(backups).toHaveLength(1);
      expect(backups[0].targetClassIds).toEqual(expect.arrayContaining(["class-a", "class-b"]));
      expect(backups[0].targetStudentIds).toEqual(expect.arrayContaining(["student-a", "student-b"]));

      const schoolChapters = state.schoolChapters as Chapter[];
      const schoolPoints = state.schoolKnowledgePoints as KnowledgePoint[];
      expect(schoolChapters.map((item) => item.name)).toEqual(["必修第一册", "函数"]);
      expect(schoolPoints.map((item) => item.name)).toEqual(["导数"]);
      expect(backups[0].chapterIds).toEqual([schoolChapters.find((item) => item.name === "函数")!.id]);
      expect(backups[0].knowledgePointIds).toEqual([schoolPoints[0].id]);
      expect(backups[0].chapterIds).not.toContain("ch-function-a");

      const chapterTree = await schoolBackupService.getChapterTree("school-a");
      const knowledgeTree = await schoolBackupService.getKnowledgeTree("school-a");
      expect(findNode(chapterTree, "必修第一册")?.count).toBe(1);
      expect(findNode(chapterTree, "函数")?.count).toBe(1);
      expect(findNode(knowledgeTree, "导数")?.count).toBe(1);
    });
  });

  it("maps school catalog assignments back to ordinary directories when saving a personal copy", async () => {
    const state = baseState();
    await runWithState(state, async () => {
      const backup = await schoolBackupService.autoBackupForResource(
        "school-a",
        "teacher-a",
        "question",
        "q-a",
        ["class-b"],
        "跨班级发布",
      );
      expect(backup).not.toBeNull();
      state.questions = (state.questions as Question[]).filter(
        (item) => item.id !== "q-a",
      );

      const result = await schoolBackupService.saveAsOwnResource(
        backup!.id,
        teacher("teacher-b"),
      );
      const copy = (state.questions as Question[]).find((item) => item.id === result.newResourceId)!;
      expect(copy.teacherId).toBe("teacher-b");
      expect(copy.summary).toBe("幂函数求导公式");
      expect(copy.remark).toBe("重点题");
      expect((state.chapters as Chapter[]).find((item) => item.id === copy.chapterIds[0])?.name).toBe("函数");
      expect((state.knowledgePoints as KnowledgePoint[]).find((item) => item.id === copy.knowledgePointIds[0])?.name).toBe("导数");
      expect(copy.chapterIds).not.toEqual(backup!.chapterIds);
    });
  });

  it("backs up a lecture and its questions when publishing to non-owned classes or students", async () => {
    const state = baseState();
    const lecture: Lecture = {
      id: "lecture-a",
      teacherId: "teacher-a",
      schoolId: "school-a",
      title: "函数专题讲义",
      description: "跨班讲义",
      chapterIds: ["ch-function-a"],
      knowledgePointIds: ["kp-derivative-a"],
      grade: "高一",
      schoolYear: "2026-2027",
      semester: "上学期",
      classIds: ["class-other"],
      studentIds: ["student-other"],
      sections: [
        {
          id: "section-root",
          title: "函数",
          type: "chapter",
          content: "",
          children: [
            {
              id: "section-question",
              title: "例题",
              type: "question",
              content: "",
              questionId: "q-a",
              children: [],
            },
          ],
        },
      ],
      version: 1,
      status: "draft",
      createdAt: now,
      updatedAt: now,
    };
    state.lectures = [lecture];
    state.schoolClasses = [
      {
        id: "class-own",
        type: "school",
        schoolId: "school-a",
        name: "自己所教班级",
        grade: "高一",
        studentCount: 1,
        createdBy: "teacher-a",
        createdAt: now,
      },
      {
        id: "class-other",
        type: "school",
        schoolId: "school-a",
        name: "其他教师班级",
        grade: "高一",
        studentCount: 1,
        createdBy: "teacher-b",
        createdAt: now,
      },
    ];
    state.students = [
      {
        id: "student-own",
        name: "本班学生",
        studentNo: "001",
        classId: "class-own",
        schoolId: "school-a",
        grade: "高一",
        status: "active",
      },
      {
        id: "student-other",
        name: "外班学生",
        studentNo: "002",
        classId: "class-other",
        schoolId: "school-a",
        grade: "高一",
        status: "active",
      },
    ];

    await runWithState(state, async () => {
      await lectureService.publish("lecture-a");

      expect((state.lectures as Lecture[])[0].status).toBe("published");
      const backups = state.schoolBackups as SchoolResourceBackup[];
      expect(backups.map((item) => item.resourceType).sort()).toEqual(["lecture", "question"]);
      for (const backup of backups) {
        expect(backup.targetClassIds).toEqual(["class-other"]);
        expect(backup.targetStudentIds).toEqual(["student-other"]);
      }

      const lectureBackup = backups.find((item) => item.resourceType === "lecture")!;
      state.lectures = [];
      const saved = await schoolBackupService.saveAsOwnResource(
        lectureBackup.id,
        teacher("teacher-b"),
      );
      const restored = (state.lectures as Lecture[]).find(
        (item) => item.id === saved.newResourceId,
      )!;
      expect(restored.description).toBe("跨班讲义");
      expect(restored.sections[0].children[0].questionId).toBe("q-a");
      expect(restored.classIds).toEqual(["class-other"]);
    });
  });

  it("backs up a paper and deduplicated questions for a direct non-owned student target", async () => {
    const state = baseState();
    const paper: ExamPaper = {
      id: "exam-a",
      teacherId: "teacher-a",
      schoolId: "school-a",
      title: "函数单元测试",
      description: "跨学生发布",
      chapterIds: ["ch-function-a"],
      knowledgePointIds: ["kp-derivative-a"],
      grade: "高一",
      schoolYear: "2026-2027",
      semester: "上学期",
      duration: 60,
      totalScore: 10,
      questions: [
        {
          id: "paper-question-a",
          questionId: "q-a",
          stem: "函数 f(x)=x² 的导数是什么？",
          options: ["2x", "x", "x²", "2"],
          answer: "A",
          analysis: "幂函数求导。",
          score: 10,
          type: "single",
        },
      ],
      status: "draft",
      createdAt: now,
      updatedAt: now,
    };
    state.examPapers = [paper];
    state.schoolClasses = [
      {
        id: "class-own",
        type: "school",
        schoolId: "school-a",
        name: "自己所教班级",
        grade: "高一",
        studentCount: 1,
        createdBy: "teacher-a",
        createdAt: now,
      },
      {
        id: "class-other",
        type: "school",
        schoolId: "school-a",
        name: "其他教师班级",
        grade: "高一",
        studentCount: 1,
        createdBy: "teacher-b",
        createdAt: now,
      },
    ];
    state.students = [
      {
        id: "student-own",
        name: "本班学生",
        studentNo: "001",
        classId: "class-own",
        schoolId: "school-a",
        grade: "高一",
        status: "active",
      },
      {
        id: "student-other",
        name: "外班学生",
        studentNo: "002",
        classId: "class-other",
        schoolId: "school-a",
        grade: "高一",
        status: "active",
      },
    ];

    await runWithState(state, async () => {
      const publication = await examPublishService.publishExam({
        examPaperId: paper.id,
        publisherId: paper.teacherId,
        publisherSchoolId: paper.schoolId,
        title: paper.title,
        targetType: "schoolClass",
        targetClassIds: [],
        targetStudentIds: ["student-other"],
        questionIds: ["q-a", "q-a"],
      });

      expect(publication.targetStudentIds).toEqual(["student-other"]);
      const backups = state.schoolBackups as SchoolResourceBackup[];
      expect(backups.map((item) => item.resourceType).sort()).toEqual(["examPaper", "question"]);
      expect(backups.filter((item) => item.resourceType === "question")).toHaveLength(1);
      for (const backup of backups) {
        expect(backup.targetClassIds).toEqual([]);
        expect(backup.targetStudentIds).toEqual(["student-other"]);
      }

      const paperBackup = backups.find((item) => item.resourceType === "examPaper")!;
      state.examPapers = [];
      const saved = await schoolBackupService.saveAsOwnResource(
        paperBackup.id,
        teacher("teacher-b"),
      );
      const restored = (state.examPapers as ExamPaper[]).find(
        (item) => item.id === saved.newResourceId,
      )!;
      expect(restored.description).toBe("跨学生发布");
      expect(restored.duration).toBe(60);
      expect(restored.questions[0].questionId).toBe("q-a");
    });
  });
});
