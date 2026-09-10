import { rpcCall, uploadFile } from "./api";
import { loadCoursewarePptSlides, type PptSlideOutline, type PptxEmbeddedImage } from "@/lib/pptx";

import type {
  Courseware,
  LessonCourseware,
  LessonCoursewareFilter,
  LessonDocumentBlock,
  LessonSlide,
  PptSlideImportElement,
  ResourceSemester,
  TeacherLessonSchedule,
  TeacherLessonScheduleDisplayOptions,
  TeacherLessonScheduleEntry,
  TeacherLessonScheduleTimeRange,
} from "@/types";


const PPT_UPLOADABLE_IMAGE_TYPES: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/gif": ".gif",
  "image/webp": ".webp",
};

function imageArrayBuffer(image: PptxEmbeddedImage): ArrayBuffer {
  return image.data.buffer.slice(
    image.data.byteOffset,
    image.data.byteOffset + image.data.byteLength,
  ) as ArrayBuffer;
}

function importedImageName(image: PptxEmbeddedImage, slideNumber: number, extension: string): string {
  const basename = image.fileName
    .replace(/\.[^.]+$/, "")
    .replace(/[^\w\u4e00-\u9fff.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "image";
  return `ppt-${slideNumber}-${basename}${extension}`;
}

async function metafilePng(image: PptxEmbeddedImage, slideNumber: number): Promise<File | undefined> {
  const { convertEmfToDataUrl, convertWmfToDataUrl } = await import("emf-converter");
  const convert = image.contentType === "image/wmf" ? convertWmfToDataUrl : convertEmfToDataUrl;
  const dataUrl = await convert(imageArrayBuffer(image), {
    maxWidth: 2400,
    maxHeight: 1600,
    dpiScale: 2,
  });
  if (!dataUrl) return undefined;
  const blob = await fetch(dataUrl).then((response) => response.blob());
  return new File([blob], importedImageName(image, slideNumber, ".png"), { type: "image/png" });
}

async function browserRasterizedPng(
  image: PptxEmbeddedImage,
  slideNumber: number,
): Promise<File | undefined> {
  if (typeof createImageBitmap !== "function") return undefined;
  const source = new Blob([imageArrayBuffer(image)], { type: image.contentType });
  const bitmap = await createImageBitmap(source);
  try {
    const canvas = document.createElement("canvas");
    const scale = Math.min(1, 2400 / Math.max(1, bitmap.width), 1600 / Math.max(1, bitmap.height));
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) return undefined;
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    return blob
      ? new File([blob], importedImageName(image, slideNumber, ".png"), { type: "image/png" })
      : undefined;
  } finally {
    bitmap.close();
  }
}

async function pptImageUploadFile(
  image: PptxEmbeddedImage,
  slideNumber: number,
): Promise<File | undefined> {
  const extension = PPT_UPLOADABLE_IMAGE_TYPES[image.contentType];
  if (extension) {
    return new File(
      [imageArrayBuffer(image)],
      importedImageName(image, slideNumber, extension),
      { type: image.contentType },
    );
  }
  if (image.contentType === "image/emf" || image.contentType === "image/wmf") {
    return metafilePng(image, slideNumber);
  }
  return browserRasterizedPng(image, slideNumber);
}

/**
 * Parses an editable PPTX and materializes every embedded image as a file owned by
 * the current teacher. Lesson slides therefore do not depend on the source PPT's
 * file permissions or lifetime. Office metafiles are rasterized to PNG because
 * browsers cannot display EMF/WMF directly.
 */
export async function loadEditableCoursewarePptSlides(courseware: Courseware): Promise<PptSlideOutline[]> {
  const uploadedImages = new Map<string, Promise<string | undefined>>();
  return loadCoursewarePptSlides(courseware, {
    imageUrl: async (slideNumber, _relationshipId, image) => {
      if (!image) return undefined;
      const existing = uploadedImages.get(image.packagePath);
      if (existing) return existing;

      const upload = (async () => {
        try {
          const file = await pptImageUploadFile(image, slideNumber);
          if (!file) return undefined;
          return (await uploadFile(file)).url;
        } catch (error) {
          console.warn(`PPT image import failed: ${image.packagePath}`, error);
          return undefined;
        }
      })();
      uploadedImages.set(image.packagePath, upload);
      return upload;
    },
  });
}

export interface LessonCoursewareInput {
  title: string;
  description?: string;
  chapterIds: string[];
  knowledgePointIds: string[];
  grade: string;
  schoolYear: string;
  semester?: ResourceSemester;
  sourceType: "examPaper" | "lecture" | "courseware" | "manual";
  sourceId?: string;
  sourceTitle?: string;
  coursewareMode?: "editable" | "direct";
  slides: LessonSlide[];
  classIds: string[];
}

export const lessonCoursewareService = {
  async getLessonSchedule(): Promise<TeacherLessonSchedule> {
    return rpcCall("lessonCourseware", "getLessonSchedule", []) as any;
  },

  async saveLessonSchedule(
    entries: TeacherLessonScheduleEntry[],
    timeRanges: TeacherLessonScheduleTimeRange[],
    displayOptions: TeacherLessonScheduleDisplayOptions,
  ): Promise<TeacherLessonSchedule> {
    return rpcCall("lessonCourseware", "saveLessonSchedule", [entries, timeRanges, displayOptions, undefined]) as any;
  },

  async listCoursewares(filter: LessonCoursewareFilter = {}): Promise<LessonCourseware[]> {
    return rpcCall("lessonCourseware", "listCoursewares", [filter]) as any;
  },

  async getCourseware(id: string): Promise<LessonCourseware | null> {
    return rpcCall("lessonCourseware", "getCourseware", [id]) as any;
  },

  async getCoursewareBySource(
    teacherId: string,
    schoolId: string,
    sourceType: "examPaper" | "lecture",
    sourceId: string,
  ): Promise<LessonCourseware | null> {
    const coursewares = await rpcCall("lessonCourseware", "listCoursewares", [{
      teacherId,
      schoolId,
      sourceType,
      sourceId,
    }]) as LessonCourseware[];
    return coursewares[0] || null;
  },

  async createCourseware(teacherId: string, schoolId: string, input: LessonCoursewareInput): Promise<LessonCourseware> {
    return rpcCall("lessonCourseware", "createCourseware", [teacherId, schoolId, input]) as any;
  },

  async updateCourseware(id: string, patch: Partial<LessonCourseware>): Promise<LessonCourseware> {
    return rpcCall("lessonCourseware", "updateCourseware", [id, patch]) as any;
  },

  async deleteCourseware(id: string): Promise<void> {
    return rpcCall("lessonCourseware", "deleteCourseware", [id]) as any;
  },

  async completeCourseware(id: string): Promise<LessonCourseware> {
    return rpcCall("lessonCourseware", "completeCourseware", [id]) as any;
  },

  async restoreCourseware(id: string): Promise<LessonCourseware> {
    return rpcCall("lessonCourseware", "restoreCourseware", [id]) as any;
  },

  async publishCourseware(id: string): Promise<LessonCourseware> {
    return rpcCall("lessonCourseware", "publishCourseware", [id]) as any;
  },

  async unpublishCourseware(id: string): Promise<LessonCourseware> {
    return rpcCall("lessonCourseware", "unpublishCourseware", [id]) as any;
  },

  async createFromExamPaper(
    teacherId: string,
    schoolId: string,
    examPaperId: string,
    documentBlocks: LessonDocumentBlock[] = [],
  ): Promise<LessonCourseware> {
    return rpcCall("lessonCourseware", "createFromExamPaper", [
      teacherId,
      schoolId,
      examPaperId,
      documentBlocks,
    ]) as any;
  },

  async createFromLecture(
    teacherId: string,
    schoolId: string,
    lectureId: string,
    documentBlocks: LessonDocumentBlock[] = [],
  ): Promise<LessonCourseware> {
    return rpcCall("lessonCourseware", "createFromLecture", [
      teacherId,
      schoolId,
      lectureId,
      documentBlocks,
    ]) as any;
  },

  async createFromCourseware(
    teacherId: string,
    schoolId: string,
    courseware: Courseware,
    pptSlides: Array<{ title: string; content: string; elements?: PptSlideImportElement[] }> = [],
  ): Promise<LessonCourseware> {
    return rpcCall("lessonCourseware", "createFromCourseware", [teacherId, schoolId, courseware.id, {
      mode: "editable",
      pageCount: courseware.pageCount,
      pptSlides,
    }]) as any;
  },

  async createDirectFromCourseware(
    teacherId: string,
    schoolId: string,
    courseware: Courseware,
  ): Promise<LessonCourseware> {
    return rpcCall("lessonCourseware", "createFromCourseware", [teacherId, schoolId, courseware.id, {
      mode: "direct",
    }]) as any;
  }
};
