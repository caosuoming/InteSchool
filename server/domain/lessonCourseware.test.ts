import { describe, expect, it } from "vitest";
import type { AppState } from "../types.js";
import type {
  Courseware,
  ExamPaper,
  Lecture,
  LessonDocumentBlock,
  Question,
} from "../../src/types/index.js";
import { runWithState } from "../runtime-db.js";
import { coursewareService } from "./courseware.js";
import { lessonCoursewareService } from "./lessonCourseware.js";

const now = "2026-08-01T12:00:00.000Z";

function sourceCourseware(overrides: Partial<Courseware> = {}): Courseware {
  return {
    id: "courseware-1",
    teacherId: "teacher-1",
    schoolId: "school-1",
    title: "函数图像课件",
    description: "用于函数图像课堂演示",
    chapterIds: ["chapter-1"],
    knowledgePointIds: ["knowledge-1"],
    grade: "高一",
    schoolYear: "2026-2027",
    semester: "上学期",
    type: "ggb",
    content: "GeoGebra 动态课件",
    fileUrl: "/api/files/file-1",
    fileName: "function.ggb",
    fileSize: 1024,
    tags: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function createState(courseware = sourceCourseware()): AppState {
  return {
    teachers: [{
      id: "teacher-1",
      email: "teacher@example.com",
      name: "张老师",
      phone: "13800000000",
      avatar: "",
      subject: "数学",
      schoolId: "school-1",
      status: "active",
      role: "teacher",
      roles: ["teacher"],
      teachingGrades: ["高一"],
      teachingClassIds: ["class-1"],
      subjectGroupIds: [],
      prepGroupIds: [],
      affiliations: [],
      currentAffiliationId: null,
      createdAt: now,
      updatedAt: now,
    }],
    currentTeacherId: "teacher-1",
    coursewares: [courseware],
    questions: [],
    examPapers: [],
    lectures: [],
    lessonCoursewares: [],
    schoolClasses: [{
      id: "class-1",
      type: "school",
      schoolId: "school-1",
      name: "高一(1)班",
      grade: "高一",
      studentCount: 30,
      status: "active",
      createdBy: "teacher-1",
      createdAt: now,
    }],
  };
}

function sourceQuestion(overrides: Partial<Question> = {}): Question {
  return {
    id: "question-1",
    teacherId: "teacher-1",
    schoolId: "school-1",
    type: "single",
    stem: '<p>观察图像并选择答案。</p><img src="/api/files/question-image" alt="函数图像">',
    options: ["A. 递增", "B. 递减"],
    answer: "A",
    analysis: "函数随自变量增大而增大。",
    chapterIds: ["chapter-1"],
    knowledgePointIds: ["knowledge-1"],
    difficulty: 2,
    recommendation: 4,
    usageCount: 0,
    remark: "",
    isShared: false,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function sourceExamPaper(question = sourceQuestion()): ExamPaper {
  return {
    id: "paper-1",
    teacherId: "teacher-1",
    schoolId: "school-1",
    title: "函数单元测验",
    chapterIds: ["chapter-1"],
    knowledgePointIds: ["knowledge-1"],
    grade: "高一",
    schoolYear: "2026-2027",
    semester: "上学期",
    duration: 45,
    totalScore: 10,
    questions: [{
      id: "paper-question-1",
      questionId: question.id,
      stem: question.stem,
      options: question.options,
      answer: question.answer,
      analysis: question.analysis,
      score: 10,
      type: question.type,
    }],
    status: "draft",
    createdAt: now,
    updatedAt: now,
  };
}

function sourceLecture(): Lecture {
  return {
    id: "lecture-1",
    teacherId: "teacher-1",
    schoolId: "school-1",
    title: "函数讲义",
    description: "函数的基本性质",
    chapterIds: ["chapter-1"],
    knowledgePointIds: ["knowledge-1"],
    grade: "高一",
    schoolYear: "2026-2027",
    semester: "上学期",
    classIds: [],
    studentIds: [],
    originalFileName: "函数专题讲义.docx",
    sections: [{
      id: "section-1",
      title: "函数概念",
      type: "chapter",
      content: "本章介绍函数概念。",
      children: [{
        id: "section-2",
        title: "例题 1",
        type: "question",
        content: "",
        questionId: "question-1",
        children: [],
      }],
    }],
    version: 1,
    status: "draft",
    createdAt: now,
    updatedAt: now,
  };
}

describe("courseware lesson flow", () => {
  it("backfills a public preview token for legacy uploaded courseware", async () => {
    const state = createState();

    await runWithState(state, async () => {
      const loaded = await coursewareService.getCourseware("courseware-1");
      expect(loaded?.onlineAccessToken).toEqual(expect.any(String));
      expect(state.coursewares[0]).toMatchObject({
        onlineAccessToken: loaded?.onlineAccessToken,
      });
      await expect(coursewareService.updateCourseware("courseware-1", {
        editorUrl: "javascript:alert(1)",
      })).rejects.toThrow("在线编辑地址必须使用 HTTPS");
    });
  });

  it("converts a courseware resource into an editable lesson slide", async () => {
    const state = createState(sourceCourseware({ onlineAccessToken: "preview-token" }));

    await runWithState(state, async () => {
      const lesson = await lessonCoursewareService.createFromCourseware(
        "teacher-1",
        "school-1",
        "courseware-1",
      );

      expect(lesson).toMatchObject({
        teacherId: "teacher-1",
        schoolId: "school-1",
        sourceType: "courseware",
        sourceId: "courseware-1",
        subject: "数学",
        teacherName: "张老师",
        status: "draft",
        classIds: [],
      });
      expect(lesson.slides).toEqual([
        expect.objectContaining({
          type: "courseware",
          coursewareType: "ggb",
          fileUrl: "/api/files/file-1",
          fileName: "function.ggb",
          onlineAccessToken: "preview-token",
        }),
      ]);
      await expect(lessonCoursewareService.createFromCourseware(
        "teacher-other",
        "school-1",
        "courseware-1",
      )).rejects.toThrow("课件不存在或无权访问");
    });
  });

  it("requires a class before publishing and lists published lessons by class", async () => {
    const state = createState(sourceCourseware({ onlineAccessToken: "preview-token" }));

    await runWithState(state, async () => {
      const lesson = await lessonCoursewareService.createFromCourseware(
        "teacher-1",
        "school-1",
        "courseware-1",
      );

      await expect(lessonCoursewareService.publishCourseware(lesson.id))
        .rejects.toThrow("请先选择至少一个授课班级");

      await lessonCoursewareService.updateCourseware(lesson.id, { classIds: ["class-1"] });
      const published = await lessonCoursewareService.publishCourseware(lesson.id);
      const classroomLessons = await lessonCoursewareService.listCoursewares({
        classId: "class-1",
        status: "published",
      });

      expect(published).toMatchObject({
        status: "published",
        classIds: ["class-1"],
        subject: "数学",
        teacherName: "张老师",
        publishedAt: expect.any(String),
      });
      expect(classroomLessons.map((item) => item.id)).toEqual([lesson.id]);
      expect(await lessonCoursewareService.listCoursewares({ classId: "class-2" })).toEqual([]);
    });
  });

  it("creates an exam cover and one editable slide per question", async () => {
    const question = sourceQuestion({
      options: [
        'A. <img src="/api/files/option-a" alt="选项 A">递增',
        "B. ![选项 B](/api/files/option-b)递减",
      ],
    });
    const state = createState();
    state.questions = [question];
    const paper = sourceExamPaper(question);
    paper.questions = Array.from({ length: 19 }, (_, index) => ({
      ...paper.questions[0],
      id: `paper-question-${index + 1}`,
      questionId: index === 0 ? question.id : undefined,
      stem: index === 0 ? paper.questions[0].stem : `第 ${index + 1} 题题干`,
      options: index === 0 ? paper.questions[0].options : undefined,
    }));
    state.examPapers = [paper];

    await runWithState(state, async () => {
      const lesson = await lessonCoursewareService.createFromExamPaper(
        "teacher-1",
        "school-1",
        paper.id,
      );

      expect(lesson.slides).toHaveLength(20);
      expect(lesson.slides[0]).toMatchObject({
        type: "section",
        title: paper.title,
      });
      expect(lesson.slides[1]).toMatchObject({
        type: "question",
        title: "第 1 题",
        questionId: question.id,
        questionSnapshot: {
          stem: "<p>观察图像并选择答案。</p>",
          options: ["A. 递增", "B. 递减"],
        },
      });
      expect(lesson.slides[1].elements).toEqual([
        expect.objectContaining({
          kind: "image",
          src: "/api/files/question-image",
          questionSection: "stem",
        }),
        expect.objectContaining({
          kind: "image",
          src: "/api/files/option-a",
          questionSection: "options",
        }),
        expect.objectContaining({
          kind: "image",
          src: "/api/files/option-b",
          questionSection: "options",
        }),
      ]);
      expect(new Set(lesson.slides[1].elements?.map((element) => element.y)).size).toBe(3);
      expect(lesson.slides.at(-1)).toMatchObject({
        type: "question",
        title: "第 19 题",
      });
    });
  });

  it("preserves question and knowledge block order from an extracted paper", async () => {
    const state = createState();
    const paper = sourceExamPaper();
    paper.contentBlocks = [
      { id: "title-1", type: "documentTitle", content: "审阅后的函数检测" },
      { id: "info-1", type: "documentInfo", content: "考试时间：45 分钟" },
      { id: "group-1", type: "groupTitle", content: "一、选择题" },
      {
        id: "knowledge-1",
        type: "knowledge",
        title: "函数定义",
        content: "函数描述两个变量之间的对应关系。",
      },
      {
        id: "question-1",
        type: "question",
        content: paper.questions[0].stem,
        examPaperQuestionId: paper.questions[0].id,
      },
    ];
    paper.questions.push({
      ...paper.questions[0],
      id: "paper-question-2",
      questionId: undefined,
      stem: "第二道未出现在结构块中的题目",
    });
    state.examPapers = [paper];

    await runWithState(state, async () => {
      const lesson = await lessonCoursewareService.createFromExamPaper(
        "teacher-1",
        "school-1",
        paper.id,
      );

      expect(lesson.slides).toHaveLength(4);
      expect(lesson.slides[0]).toMatchObject({
        type: "section",
        title: "审阅后的函数检测",
      });
      expect(lesson.slides.map((slide) => slide.type)).toEqual([
        "section",
        "knowledge",
        "question",
        "question",
      ]);
      expect(lesson.slides[1]).toMatchObject({
        title: "函数定义",
        content: "函数描述两个变量之间的对应关系。",
      });
      expect(lesson.slides[3]).toMatchObject({
        title: "第 2 题",
        questionSnapshot: { stem: "第二道未出现在结构块中的题目" },
      });
    });
  });

  it("creates one page per parsed question when an original paper has not been ingested", async () => {
    const state = createState();
    const paper = sourceExamPaper();
    paper.questions = [];
    paper.originalFileUrl = "/api/files/paper-file";
    paper.originalFileName = "泉州一模.docx";
    state.examPapers = [paper];
    const documentBlocks: LessonDocumentBlock[] = [
      {
        id: "parsed-title",
        type: "documentTitle",
        content: "泉州一模数学试卷",
      },
      {
        id: "parsed-info",
        type: "documentInfo",
        content: "考试时间：120 分钟",
      },
      {
        id: "parsed-group",
        type: "groupTitle",
        content: "一、选择题",
      },
      ...Array.from({ length: 19 }, (_, index) => ({
        id: `parsed-question-${index + 1}`,
        type: "question" as const,
        content: `第 ${index + 1} 题题干`,
        questionType: "short" as const,
        answer: `${index + 1}`,
        analysis: `第 ${index + 1} 题解析`,
      })),
    ];

    await runWithState(state, async () => {
      const lesson = await lessonCoursewareService.createFromExamPaper(
        "teacher-1",
        "school-1",
        paper.id,
        documentBlocks,
      );

      expect(lesson.slides).toHaveLength(20);
      expect(lesson.slides[0]).toMatchObject({
        type: "section",
        title: "泉州一模数学试卷",
      });
      expect(lesson.slides[1]).toMatchObject({
        type: "question",
        title: "第 1 题",
        questionSnapshot: {
          stem: "第 1 题题干",
          answer: "1",
          analysis: "第 1 题解析",
        },
      });
      expect(lesson.slides[19]).toMatchObject({
        type: "question",
        title: "第 19 题",
      });
    });
  });

  it("creates a lecture cover and recursively snapshots knowledge and question pages", async () => {
    const state = createState();
    const question = sourceQuestion();
    state.questions = [question];
    const lecture = sourceLecture();
    lecture.contentBlocks = [
      { id: "lecture-title", type: "documentTitle", content: "审阅后的函数专题" },
      { id: "lecture-info", type: "documentInfo", content: "适用年级：高一" },
    ];
    lecture.sections[0].children.unshift(
      {
        id: "section-knowledge",
        title: "函数定义",
        type: "knowledge",
        content: "函数是两个集合之间的对应关系。",
        children: [],
      },
      {
        id: "section-text",
        title: "过渡正文",
        type: "text",
        content: "这段正文不单独生成课件页。",
        children: [],
      },
    );
    state.lectures = [lecture];

    await runWithState(state, async () => {
      const lesson = await lessonCoursewareService.createFromLecture(
        "teacher-1",
        "school-1",
        lecture.id,
      );

      expect(lesson.slides).toHaveLength(3);
      expect(lesson.slides[0]).toMatchObject({
        type: "section",
        title: "审阅后的函数专题",
      });
      expect(lesson.slides[1]).toMatchObject({
        type: "knowledge",
        title: "函数定义",
        content: "函数是两个集合之间的对应关系。",
      });
      expect(lesson.slides[2]).toMatchObject({
        type: "question",
        title: "例题 1",
        questionId: question.id,
        questionSnapshot: {
          type: question.type,
          answer: question.answer,
          analysis: question.analysis,
        },
      });
      expect(lesson.slides[2].elements).toEqual([
        expect.objectContaining({ kind: "image", src: "/api/files/question-image" }),
      ]);
    });
  });
});
