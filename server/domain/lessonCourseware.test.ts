import { describe, expect, it } from "vitest";
import type { AppState } from "../types.js";
import type {
  Courseware,
  ExamPaper,
  Lecture,
  LessonCourseware,
  LessonDocumentBlock,
  Question,
  Teacher,
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
        customLabel: "例1",
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
        lifecycleStatus: "active",
        classIds: ["class-1"],
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

  it("reuses a personal courseware from a former school in the teacher's current school", async () => {
    const state = createState();
    state.teachers[0].schoolId = "school-2";
    state.teachers[0].teachingClassIds = ["class-2"];
    (state.schoolClasses as Array<Record<string, unknown>>).push({
      id: "class-2",
      type: "school",
      schoolId: "school-2",
      name: "高一(2)班",
      grade: "高一",
      studentCount: 32,
      status: "active",
      createdBy: "teacher-1",
      createdAt: now,
    });

    await runWithState(state, async () => {
      const lesson = await lessonCoursewareService.createFromCourseware(
        "teacher-1",
        "school-2",
        "courseware-1",
      );

      expect(state.coursewares[0].schoolId).toBe("school-1");
      expect(lesson).toMatchObject({
        teacherId: "teacher-1",
        schoolId: "school-2",
        sourceId: "courseware-1",
        classIds: ["class-2"],
      });
    });
  });

  it("splits an uploaded PPT into one editable lesson page per source slide", async () => {
    const state = createState(sourceCourseware({
      type: "ppt",
      fileName: "function.pptx",
      pageCount: 20,
      onlineAccessToken: "preview-token",
    }));
    const pptSlides = Array.from({ length: 20 }, (_, index) => ({
      title: `函数课件第 ${index + 1} 页`,
      content: `第 ${index + 1} 页正文`,
    }));

    await runWithState(state, async () => {
      const lesson = await lessonCoursewareService.createFromCourseware(
        "teacher-1",
        "school-1",
        "courseware-1",
        { mode: "editable", pageCount: 20, pptSlides },
      );

      expect(lesson.coursewareMode).toBe("editable");
      expect(lesson.slides).toHaveLength(20);
      expect(lesson.slides[0]).toMatchObject({
        type: "knowledge",
        title: "函数课件第 1 页",
        content: "第 1 页正文",
        pptSlideNumber: 1,
        coursewareType: "ppt",
        fileName: "function.pptx",
      });
      expect(lesson.slides[19]).toMatchObject({
        title: "函数课件第 20 页",
        pptSlideNumber: 20,
      });
    });
  });

  it("keeps imported PPT text and images as freeform elements without showing the source text as a slide title", async () => {
    const state = createState(sourceCourseware({
      type: "ppt",
      fileName: "function.pptx",
      pageCount: 1,
      onlineAccessToken: "preview-token",
    }));

    await runWithState(state, async () => {
      const lesson = await lessonCoursewareService.createFromCourseware(
        "teacher-1",
        "school-1",
        "courseware-1",
        {
          mode: "editable",
          pageCount: 1,
          pptSlides: [{
            title: "这个原文本不应作为页面标题显示",
            content: "第一行\n第二行",
            elements: [{
              kind: "text",
              content: '<div><span style="font-family:宋体;font-size:24pt">第一行</span><br>第二行</div>',
              x: 10,
              y: 12,
              width: 55,
              height: 18,
              fontSize: 32,
              fontFamily: "宋体",
              color: "#112233",
              backgroundColor: "transparent",
              padding: 0,
              textAlign: "left",
            }, {
              kind: "image",
              src: "/api/files/file-1/assets/ppt-slide-1-rId5",
              alt: "函数图",
              x: 60,
              y: 20,
              width: 30,
              height: 50,
            }],
          }],
        },
      );

      expect(lesson.slides[0]).toMatchObject({
        type: "knowledge",
        title: "函数图像课件 · 第 1 页",
        content: "第一行\n第二行",
        freeformLayout: true,
        pptSlideNumber: 1,
      });
      expect(lesson.slides[0].title).not.toContain("这个原文本");
      expect(lesson.slides[0].elements).toEqual([
        expect.objectContaining({
          id: expect.any(String),
          kind: "text",
          content: expect.stringContaining("<br>"),
          fontFamily: "宋体",
          color: "#112233",
          backgroundColor: "transparent",
          padding: 0,
        }),
        expect.objectContaining({
          id: expect.any(String),
          kind: "image",
          src: "/api/files/file-1/assets/ppt-slide-1-rId5",
          alt: "函数图",
        }),
      ]);
    });
  });

  it("keeps a direct PPT as one WPS-backed lesson slide", async () => {
    const state = createState(sourceCourseware({
      type: "ppt",
      fileName: "function.pptx",
      pageCount: 20,
      onlineAccessToken: "preview-token",
    }));

    await runWithState(state, async () => {
      const lesson = await lessonCoursewareService.createFromCourseware(
        "teacher-1",
        "school-1",
        "courseware-1",
        { mode: "direct" },
      );

      expect(lesson.coursewareMode).toBe("direct");
      expect(lesson.slides).toEqual([
        expect.objectContaining({
          type: "courseware",
          coursewareType: "ppt",
          fileName: "function.pptx",
          openInWps: true,
        }),
      ]);
    });
  });

  it("requires a class before publishing and lists published lessons by class", async () => {
    const state = createState(sourceCourseware({ onlineAccessToken: "preview-token" }));
    state.teachers[0].teachingClassIds = [];

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

  it("restores completed lessons as published and deleted lessons as drafts", async () => {
    const state = createState(sourceCourseware({ onlineAccessToken: "preview-token" }));

    await runWithState(state, async () => {
      const lesson = await lessonCoursewareService.createFromCourseware(
        "teacher-1",
        "school-1",
        "courseware-1",
      );
      await lessonCoursewareService.publishCourseware(lesson.id);

      const completed = await lessonCoursewareService.completeCourseware(lesson.id);
      expect(completed).toMatchObject({
        lifecycleStatus: "completed",
        status: "draft",
        completedAt: expect.any(String),
      });
      expect(await lessonCoursewareService.listCoursewares({ classId: "class-1" })).toEqual([]);
      expect(await lessonCoursewareService.listCoursewares({
        lifecycleStatus: "completed",
        teacherId: "teacher-1",
      })).toHaveLength(1);

      const restoredCompleted = await lessonCoursewareService.restoreCourseware(lesson.id);
      expect(restoredCompleted).toMatchObject({
        lifecycleStatus: "active",
        status: "published",
        completedAt: null,
        deletedAt: null,
        publishedAt: expect.any(String),
      });

      await lessonCoursewareService.deleteCourseware(lesson.id);
      expect(await lessonCoursewareService.listCoursewares({ lifecycleStatus: "completed" })).toEqual([]);
      expect(await lessonCoursewareService.listCoursewares({ lifecycleStatus: "trashed" })).toEqual([
        expect.objectContaining({
          id: lesson.id,
          lifecycleStatus: "trashed",
          deletedAt: expect.any(String),
        }),
      ]);

      const restoredDeleted = await lessonCoursewareService.restoreCourseware(lesson.id);
      expect(restoredDeleted).toMatchObject({
        lifecycleStatus: "active",
        status: "draft",
        completedAt: null,
        deletedAt: null,
      });
      expect(await lessonCoursewareService.listCoursewares({ teacherId: "teacher-1" })).toHaveLength(1);
    });
  });

  it("persists the expanded teacher schedule with weekend parity and time ranges", async () => {
    const state = createState();

    await runWithState(state, async () => {
      const teacher = state.teachers[0] as unknown as Teacher;
      const schedule = await lessonCoursewareService.saveLessonSchedule([
        { day: 1, period: 1, classId: "class-1" },
        { day: 1, period: -2, classId: "class-1" },
        { day: 5, period: 12, classId: "class-1" },
        { day: 6, period: 1, weekParity: "odd", classId: "class-1" },
        { day: 6, period: 1, weekParity: "even", classId: "class-1" },
      ], [{ period: 1, startTime: "08:00", endTime: "08:45" }], teacher);

      expect(schedule.entries).toEqual([
        { day: 1, period: -2, weekParity: "all", classId: "class-1" },
        { day: 1, period: 1, weekParity: "all", classId: "class-1" },
        { day: 5, period: 12, weekParity: "all", classId: "class-1" },
        { day: 6, period: 1, weekParity: "odd", classId: "class-1" },
        { day: 6, period: 1, weekParity: "even", classId: "class-1" },
      ]);
      expect(schedule.timeRanges).toHaveLength(15);
      expect(schedule.timeRanges).toContainEqual({
        period: 1,
        startTime: "08:00",
        endTime: "08:45",
      });
      expect(await lessonCoursewareService.getLessonSchedule(
        state.teachers[0] as unknown as Teacher,
      )).toEqual(schedule);
    });
  });

  it("normalizes legacy schedules and rejects invalid expanded schedule values", async () => {
    const state = createState();

    await runWithState(state, async () => {
      const teacher = state.teachers[0] as unknown as Teacher;
      teacher.lessonSchedule = {
        entries: [{ day: 1, period: 1, classId: "class-1" }],
        updatedAt: now,
      };
      const legacySchedule = await lessonCoursewareService.getLessonSchedule(teacher);
      expect(legacySchedule.entries).toEqual([
        { day: 1, period: 1, weekParity: "all", classId: "class-1" },
      ]);
      expect(legacySchedule.timeRanges).toHaveLength(15);

      await expect(lessonCoursewareService.saveLessonSchedule([
        { day: 2, period: 3, classId: "class-other" },
      ], undefined, teacher)).rejects.toThrow("课表中包含非本人任教班级");
      await expect(lessonCoursewareService.saveLessonSchedule([
        { day: 8 as 7, period: 1, classId: "class-1" },
      ], undefined, teacher)).rejects.toThrow("课表星期设置不合法");
      await expect(lessonCoursewareService.saveLessonSchedule([
        { day: 1, period: 13 as 12, classId: "class-1" },
      ], undefined, teacher)).rejects.toThrow("课表节次设置不合法");
      await expect(lessonCoursewareService.saveLessonSchedule([
        { day: 1, period: 1, weekParity: "odd", classId: "class-1" },
      ], undefined, teacher)).rejects.toThrow("工作日课表不区分单双周");
      await expect(lessonCoursewareService.saveLessonSchedule([
        { day: 6, period: 1, classId: "class-1" },
      ], undefined, teacher)).rejects.toThrow("周末课表必须设置单周或双周");
      await expect(lessonCoursewareService.saveLessonSchedule([], [
        { period: 1, startTime: "09:00", endTime: "08:00" },
      ], teacher)).rejects.toThrow("课表时间区间设置不合法");
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
        freeformLayout: true,
      });
      expect(lesson.slides[0].elements).toEqual(expect.arrayContaining([
        expect.objectContaining({ kind: "text", content: paper.title }),
      ]));
      expect(lesson.slides[1]).toMatchObject({
        type: "question",
        title: "1.",
        freeformLayout: true,
        questionId: question.id,
        questionSnapshot: {
          stem: "<p>观察图像并选择答案。</p>",
          options: ["A. 递增", "B. 递减"],
        },
      });
      expect(lesson.slides[1].elements).toEqual(expect.arrayContaining([
        expect.objectContaining({
          kind: "text",
          content: "1.",
          x: 5,
          y: 5,
          width: 4,
          height: 6,
          fontSize: 30,
          autoHeight: true,
          questionSection: "stem",
        }),
        expect.objectContaining({
          kind: "text",
          content: "<p>观察图像并选择答案。</p>",
          x: 10,
          width: 85,
          fontSize: 30,
          autoHeight: true,
          questionSection: "stem",
        }),
        expect.objectContaining({
          kind: "text",
          content: "A. 递增",
          fontSize: 30,
          autoHeight: true,
          questionSection: "options",
        }),
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
      ]));
      expect(new Set(
        lesson.slides[1].elements
          ?.filter((element) => element.kind === "image")
          .map((element) => element.y),
      ).size).toBe(3);
      for (const generatedElement of lesson.slides.flatMap((slide) => slide.elements || [])) {
        expect(generatedElement.animation ?? "none").toBe("none");
        expect(generatedElement.enterAnimation ?? "none").toBe("none");
        expect(generatedElement.actionAnimation ?? "none").toBe("none");
        expect(generatedElement.exitAnimation ?? "none").toBe("none");
        expect(generatedElement.animationOrder).toBeUndefined();
      }
      expect(lesson.slides.at(-1)).toMatchObject({
        type: "question",
        title: "19.",
      });
      expect(lesson.libraryCoursewareId).toBeTruthy();
      const libraryCourseware = await coursewareService.getCourseware(lesson.libraryCoursewareId!);
      expect(libraryCourseware).toMatchObject({
        id: lesson.libraryCoursewareId,
        lessonCoursewareId: lesson.id,
        sourceResourceType: "examPaper",
        sourceResourceId: paper.id,
        sourceResourceTitle: paper.title,
        title: lesson.title,
        type: "other",
        tags: ["上课课件"],
      });
      expect(libraryCourseware?.content).toContain("共 20 页");

      await expect(lessonCoursewareService.listCoursewares({
        teacherId: "teacher-1",
        schoolId: "school-1",
        sourceType: "examPaper",
        sourceId: paper.id,
      })).resolves.toEqual([expect.objectContaining({ id: lesson.id })]);
      await expect(lessonCoursewareService.listCoursewares({
        teacherId: "teacher-1",
        schoolId: "school-1",
        sourceType: "lecture",
        sourceId: paper.id,
      })).resolves.toEqual([]);

      await lessonCoursewareService.updateCourseware(lesson.id, { title: "函数检测课堂版" });
      await expect(coursewareService.getCourseware(lesson.libraryCoursewareId!))
        .resolves.toMatchObject({ title: "函数检测课堂版" });
    });
  });

  it("compacts legacy generated question labels when loading a courseware", async () => {
    const question = sourceQuestion();
    const paper = sourceExamPaper(question);
    const state = createState();
    state.questions = [question];
    state.examPapers = [paper];

    await runWithState(state, async () => {
      const lesson = await lessonCoursewareService.createFromExamPaper(
        "teacher-1",
        "school-1",
        paper.id,
      );
      const questionSlide = (state.lessonCoursewares as LessonCourseware[])
        .find((item) => item.id === lesson.id)
        ?.slides.find((slide) => slide.type === "question");
      const numberElement = questionSlide?.elements?.find((element) =>
        element.kind === "text" && element.content === "1.");
      const stemElement = questionSlide?.elements?.find((element) =>
        element.kind === "text" && element.content === "<p>观察图像并选择答案。</p>");

      expect(numberElement).toBeDefined();
      expect(stemElement).toBeDefined();
      Object.assign(numberElement!, { x: 5, y: 5, width: 14, height: 10 });
      Object.assign(stemElement!, { x: 20, y: 5, width: 75, height: 24 });

      const loaded = await lessonCoursewareService.getCourseware(lesson.id);
      expect(loaded?.slides[1].elements).toEqual(expect.arrayContaining([
        expect.objectContaining({
          kind: "text",
          content: "1.",
          x: 5,
          y: 5,
          width: 4,
          height: 6,
        }),
        expect.objectContaining({
          kind: "text",
          content: "<p>观察图像并选择答案。</p>",
          x: 10,
          width: 85,
        }),
      ]));
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
        title: "题目：（2017·课标 I·理，20）",
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
        freeformLayout: true,
      });
      expect(lesson.slides[1].elements).toEqual([
        expect.objectContaining({
          kind: "text",
          content: "函数描述两个变量之间的对应关系。",
          fontSize: 30,
          autoHeight: true,
        }),
      ]);
      expect(lesson.slides[1].elements).not.toEqual(expect.arrayContaining([
        expect.objectContaining({ content: "函数定义" }),
      ]));
      expect(lesson.slides[2]).toMatchObject({
        title: "1.",
        questionSnapshot: { stem: paper.questions[0].stem.replace(/<img[^>]+>/, "").trim() },
      });
      expect(lesson.slides[2].elements).not.toEqual(expect.arrayContaining([
        expect.objectContaining({ kind: "text", content: "题目：（2017·课标 I·理，20）" }),
      ]));
      expect(lesson.slides[3]).toMatchObject({
        title: "2.",
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
        title: "1.",
        questionSnapshot: {
          stem: "第 1 题题干",
          answer: "1",
          analysis: "第 1 题解析",
        },
      });
      expect(lesson.slides[1].elements).toEqual(expect.arrayContaining([
        expect.objectContaining({ kind: "text", content: "1.", questionSection: "stem" }),
      ]));
      expect(lesson.slides[19]).toMatchObject({
        type: "question",
        title: "19.",
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
    lecture.sections[0].children.push({
      id: "section-question-default-label",
      title: "这段题目名称不应进入课件",
      type: "question",
      content: "补充题干",
      children: [],
    });
    state.lectures = [lecture];

    await runWithState(state, async () => {
      const lesson = await lessonCoursewareService.createFromLecture(
        "teacher-1",
        "school-1",
        lecture.id,
      );

      expect(lesson.slides).toHaveLength(4);
      expect(lesson.slides[0]).toMatchObject({
        type: "section",
        title: "审阅后的函数专题",
        freeformLayout: true,
      });
      expect(lesson.slides[1]).toMatchObject({
        type: "knowledge",
        title: "函数定义",
        content: "函数是两个集合之间的对应关系。",
        freeformLayout: true,
      });
      expect(lesson.slides[2]).toMatchObject({
        type: "question",
        title: "例1",
        freeformLayout: true,
        questionId: question.id,
        questionSnapshot: {
          type: question.type,
          answer: question.answer,
          analysis: question.analysis,
        },
      });
      expect(lesson.slides[2].elements).toEqual(expect.arrayContaining([
        expect.objectContaining({
          kind: "text",
          content: "例1",
          questionSection: "stem",
        }),
        expect.objectContaining({
          kind: "text",
          content: "<p>观察图像并选择答案。</p>",
          questionSection: "stem",
        }),
        expect.objectContaining({ kind: "image", src: "/api/files/question-image" }),
      ]));
      expect(lesson.slides[2].elements).not.toEqual(expect.arrayContaining([
        expect.objectContaining({ kind: "text", content: "例题 1" }),
      ]));
      expect(lesson.slides[3]).toMatchObject({
        type: "question",
        title: "2.",
        questionSnapshot: { stem: "补充题干" },
      });
      expect(lesson.slides[3].elements).toEqual(expect.arrayContaining([
        expect.objectContaining({ kind: "text", content: "2.", questionSection: "stem" }),
      ]));
      expect(lesson.slides[3].elements).not.toEqual(expect.arrayContaining([
        expect.objectContaining({ kind: "text", content: "这段题目名称不应进入课件" }),
      ]));
      const libraryCourseware = await coursewareService.getCourseware(lesson.libraryCoursewareId!);
      expect(libraryCourseware).toMatchObject({
        lessonCoursewareId: lesson.id,
        sourceResourceType: "lecture",
        sourceResourceId: lecture.id,
        sourceResourceTitle: lecture.title,
        title: lesson.title,
      });
      expect(libraryCourseware?.content).toContain("由讲义");
      await expect(lessonCoursewareService.listCoursewares({
        teacherId: "teacher-1",
        schoolId: "school-1",
        sourceType: "lecture",
        sourceId: lecture.id,
      })).resolves.toEqual([expect.objectContaining({ id: lesson.id })]);
    });
  });
});
