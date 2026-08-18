import type {
  Courseware,
  ExamPaper,
  ExamPaperQuestion,
  ExtractedDocumentBlock,
  Lecture,
  LectureSection,
  LessonCourseware,
  PrepTask,
  QuestionType,
  Reflection,
  ResourceFolder,
} from "../../src/types/index.js";
import { db } from "../runtime-db.js";
import { genId } from "../domain-shared.js";
import { assertResourceCapacity } from "./quota.js";

type DocumentResourceType = "examPaper" | "lecture";

function scoreForQuestionType(type: QuestionType): number {
  if (type === "essay") return 15;
  if (type === "short") return 5;
  if (type === "multiple") return 3;
  return 2;
}

function lectureSectionsFromBlocks(blocks: ExtractedDocumentBlock[]): LectureSection[] {
  return blocks.map((block, index) => {
    if (block.type === "documentTitle" || block.type === "groupTitle" || block.type === "heading") {
      return {
        id: genId("sec"),
        title: block.content,
        type: "chapter",
        content: "",
        children: [],
      };
    }
    if (block.type === "knowledge") {
      return {
        id: genId("sec"),
        title: block.title || `知识块 ${index + 1}`,
        type: "knowledge",
        content: block.content,
        children: [],
      };
    }
    if (block.type === "question") {
      return {
        id: genId("sec"),
        title: `题目·${block.content.slice(0, 18)}${block.content.length > 18 ? "..." : ""}`,
        type: "question",
        content: block.content,
        questionId: block.questionId,
        children: [],
        displayMode: "stem-only",
      };
    }
    return {
      id: genId("sec"),
      title: block.title || `正文 ${index + 1}`,
      type: "text",
      content: block.content,
      children: [],
    };
  });
}

function lectureSectionsFromPaperQuestions(questions: ExamPaperQuestion[]): LectureSection[] {
  return questions.map((question, index) => ({
    id: genId("sec"),
    title: `第${index + 1}题`,
    type: "question",
    content: question.stem,
    questionId: question.questionId,
    children: [],
  }));
}

function paperQuestionsFromBlocks(
  blocks: ExtractedDocumentBlock[],
): { blocks: ExtractedDocumentBlock[]; questions: ExamPaperQuestion[] } {
  const normalizedBlocks = blocks.map((block) => ({ ...block }));
  const questions = normalizedBlocks
    .filter((block) => block.type === "question")
    .map((block) => {
      const id = genId("epq");
      block.examPaperQuestionId = id;
      const linkedQuestion = block.questionId
        ? (db.read("questions") || []).find((question: { id: string }) => question.id === block.questionId)
        : undefined;
      const type = (linkedQuestion?.type || block.questionType || "short") as QuestionType;
      return {
        id,
        questionId: block.questionId,
        stem: block.content || linkedQuestion?.stem || "",
        options: linkedQuestion?.options,
        answer: linkedQuestion?.answer || "",
        analysis: linkedQuestion?.analysis || "",
        score: scoreForQuestionType(type),
        type,
      };
    });
  return { blocks: normalizedBlocks, questions };
}

function paperQuestionsFromLectureSections(sections: LectureSection[]): ExamPaperQuestion[] {
  const result: ExamPaperQuestion[] = [];
  for (const section of sections) {
    if (section.type === "question") {
      const linkedQuestion = section.questionId
        ? (db.read("questions") || []).find((question: { id: string }) => question.id === section.questionId)
        : undefined;
      const type = (linkedQuestion?.type || "short") as QuestionType;
      result.push({
        id: genId("epq"),
        stem: section.content || section.title,
        options: linkedQuestion?.options,
        answer: linkedQuestion?.answer || "",
        analysis: linkedQuestion?.analysis || "",
        score: 5,
        type,
        questionId: linkedQuestion?.id || section.questionId,
      });
    }
    if (section.children?.length) result.push(...paperQuestionsFromLectureSections(section.children));
  }
  return result;
}

function paperToLecture(paper: ExamPaper, root: ExamPaper, now: string): Lecture {
  const contentBlocks = paper.contentBlocks?.map((block) => {
    const copy = { ...block };
    delete copy.examPaperQuestionId;
    return copy;
  });
  const sections = contentBlocks?.length
    ? lectureSectionsFromBlocks(contentBlocks)
    : lectureSectionsFromPaperQuestions(paper.questions);
  return {
    id: paper.id,
    teacherId: paper.teacherId,
    schoolId: paper.schoolId,
    title: paper.title,
    description: paper.description,
    chapterIds: paper.chapterIds,
    knowledgePointIds: paper.knowledgePointIds,
    grade: paper.grade,
    schoolYear: paper.schoolYear,
    semester: paper.semester || "上学期",
    classIds: paper.classIds || [],
    studentIds: paper.studentIds || [],
    sections,
    contentBlocks,
    version: 1,
    status: paper.status,
    typeId: undefined,
    questionSourceType: paper.questionSourceType,
    questionCategory: paper.questionCategory,
    originalFileUrl: paper.originalFileUrl,
    originalFileName: paper.originalFileName,
    originalFileType: paper.originalFileType,
    originalFileSize: paper.originalFileSize,
    isExtractCopy: paper.isExtractCopy,
    sourceResourceId: paper.sourceResourceId,
    platformSourceDonationIds: paper.platformSourceDonationIds,
    schoolSourceBackupIds: paper.schoolSourceBackupIds,
    extractStatus: paper.extractStatus,
    versionType: paper.isExtractCopy ? "extract" : undefined,
    hasOrigin: paper.isExtractCopy ? Boolean(root.originalFileUrl) : undefined,
    createdAt: paper.createdAt,
    updatedAt: now,
  };
}

function lectureToPaper(lecture: Lecture, now: string): ExamPaper {
  const fromBlocks = lecture.contentBlocks?.length
    ? paperQuestionsFromBlocks(lecture.contentBlocks)
    : null;
  const questions = fromBlocks?.questions || paperQuestionsFromLectureSections(lecture.sections);
  return {
    id: lecture.id,
    teacherId: lecture.teacherId,
    schoolId: lecture.schoolId,
    title: lecture.title,
    description: lecture.description,
    chapterIds: lecture.chapterIds,
    knowledgePointIds: lecture.knowledgePointIds,
    grade: lecture.grade,
    schoolYear: lecture.schoolYear,
    semester: lecture.semester || "上学期",
    duration: 60,
    totalScore: questions.reduce((sum, question) => sum + question.score, 0),
    questions,
    contentBlocks: fromBlocks?.blocks || lecture.contentBlocks?.map((block) => ({ ...block })),
    status: lecture.status,
    typeId: undefined,
    questionSourceType: lecture.questionSourceType,
    questionCategory: lecture.questionCategory,
    layoutMode: "grouped",
    classIds: lecture.classIds,
    studentIds: lecture.studentIds,
    originalFileUrl: lecture.originalFileUrl,
    originalFileName: lecture.originalFileName,
    originalFileType: lecture.originalFileType,
    originalFileSize: lecture.originalFileSize,
    isExtractCopy: lecture.isExtractCopy,
    sourceResourceId: lecture.sourceResourceId,
    platformSourceDonationIds: lecture.platformSourceDonationIds,
    schoolSourceBackupIds: lecture.schoolSourceBackupIds,
    extractStatus: lecture.extractStatus,
    createdAt: lecture.createdAt,
    updatedAt: now,
  };
}

function retargetDirectReferences(
  resourceIds: Set<string>,
  fromType: DocumentResourceType,
  toType: DocumentResourceType,
  now: string,
): void {
  const folders = db.read("resourceFolders");
  if (Array.isArray(folders)) {
    db.write("resourceFolders", (folders as ResourceFolder[]).map((folder) => {
      if (folder.resourceType !== fromType) return folder;
      const resourceIdsNext = folder.resourceIds.filter((id) => !resourceIds.has(id));
      return resourceIdsNext.length === folder.resourceIds.length
        ? folder
        : { ...folder, resourceIds: resourceIdsNext, updatedAt: now };
    }));
  }

  const lessonCoursewares = db.read("lessonCoursewares");
  if (Array.isArray(lessonCoursewares)) {
    db.write("lessonCoursewares", (lessonCoursewares as LessonCourseware[]).map((courseware) => (
      courseware.sourceType === fromType && courseware.sourceId && resourceIds.has(courseware.sourceId)
        ? { ...courseware, sourceType: toType, updatedAt: now }
        : courseware
    )));
  }

  const coursewares = db.read("coursewares");
  if (Array.isArray(coursewares)) {
    db.write("coursewares", (coursewares as Courseware[]).map((courseware) => (
      courseware.sourceResourceType === fromType
        && courseware.sourceResourceId
        && resourceIds.has(courseware.sourceResourceId)
        ? { ...courseware, sourceResourceType: toType, updatedAt: now }
        : courseware
    )));
  }

  const reflections = db.read("reflections");
  if (Array.isArray(reflections)) {
    db.write("reflections", (reflections as Reflection[]).map((reflection) => (
      reflection.targetType === fromType && resourceIds.has(reflection.targetId)
        ? { ...reflection, targetType: toType, updatedAt: now }
        : reflection
    )));
  }

  const prepTasks = db.read("prepTasks");
  if (Array.isArray(prepTasks)) {
    db.write("prepTasks", (prepTasks as PrepTask[]).map((task) => (
      task.linkedResource?.type === fromType && resourceIds.has(task.linkedResource.id)
        ? {
            ...task,
            linkedResource: { ...task.linkedResource, type: toType },
            updatedAt: now,
          }
        : task
    )));
  }
}

function assertNoTargetIdCollision(target: Array<{ id: string }>, ids: Set<string>, label: string): void {
  if (target.some((resource) => ids.has(resource.id))) {
    throw new Error(`${label}中已存在同一文档，无法移动`);
  }
}

export function moveExamPaperToLecture(paperId: string): { lectureId: string } {
  const papers = (db.read("examPapers") || []) as ExamPaper[];
  const selected = papers.find((paper) => paper.id === paperId);
  if (!selected) throw new Error("试卷不存在");
  const rootId = selected.isExtractCopy && selected.sourceResourceId
    ? selected.sourceResourceId
    : selected.id;
  const root = papers.find((paper) => paper.id === rootId);
  if (!root) throw new Error("试卷原稿不存在");
  const family = papers.filter((paper) => (
    paper.id === rootId || (paper.isExtractCopy && paper.sourceResourceId === rootId)
  ));
  const movedIds = new Set(family.map((paper) => paper.id));
  const lectures = (db.read("lectures") || []) as Lecture[];
  assertNoTargetIdCollision(lectures, movedIds, "讲义库");
  assertResourceCapacity(selected.teacherId, "lecture", family.length);

  const now = new Date().toISOString();
  const moved = family.map((paper) => paperToLecture(paper, root, now));
  db.write("examPapers", papers.filter((paper) => !movedIds.has(paper.id)));
  db.write("lectures", [...moved, ...lectures]);
  retargetDirectReferences(movedIds, "examPaper", "lecture", now);
  return { lectureId: selected.id };
}

export function moveLectureToExamPaper(lectureId: string): { paperId: string } {
  const lectures = (db.read("lectures") || []) as Lecture[];
  const selected = lectures.find((lecture) => lecture.id === lectureId);
  if (!selected) throw new Error("讲义不存在");
  const rootId = selected.isExtractCopy && selected.sourceResourceId
    ? selected.sourceResourceId
    : selected.id;
  const root = lectures.find((lecture) => lecture.id === rootId);
  if (!root) throw new Error("讲义原稿不存在");
  const family = lectures.filter((lecture) => (
    lecture.id === rootId || (lecture.isExtractCopy && lecture.sourceResourceId === rootId)
  ));
  const movedIds = new Set(family.map((lecture) => lecture.id));
  const papers = (db.read("examPapers") || []) as ExamPaper[];
  assertNoTargetIdCollision(papers, movedIds, "试卷库");
  assertResourceCapacity(selected.teacherId, "examPaper", family.length);

  const now = new Date().toISOString();
  const moved = family.map((lecture) => lectureToPaper(lecture, now));
  db.write("lectures", lectures.filter((lecture) => !movedIds.has(lecture.id)));
  db.write("examPapers", [...moved, ...papers]);
  retargetDirectReferences(movedIds, "lecture", "examPaper", now);
  return { paperId: selected.id };
}
