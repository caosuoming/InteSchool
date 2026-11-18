import type { Courseware, Material, MaterialType } from "../../src/types/index.js";
import type { AppState } from "../types.js";

/**
 * Preserve the original courseware record for existing lesson/share links while
 * exposing uploaded non-PPT mathematics files in the material library.
 * The migration is idempotent and applied transactionally at database startup.
 */
export function migrateMathCoursewareMaterials(state: AppState): number {
  const teachers = new Map((state.teachers || []).map((teacher) => [teacher.id, teacher]));
  const coursewares = (state.coursewares || []) as Courseware[];
  const materials = (state.materials || []) as Material[];
  const materialIds = new Set(materials.map((material) => material.id));
  let converted = 0;

  const nextCoursewares = coursewares.map((item) => {
    if (item.migratedToMaterial || item.type === "ppt" || !item.fileUrl
      || item.lessonCoursewareId || item.sourceResourceType) return item;
    const owner = teachers.get(item.teacherId);
    const subject = item.subject || owner?.subject;
    if (subject !== "数学") return item;

    if (!materialIds.has(item.id)) {
      const filename = (item.fileName || "").toLowerCase();
      let type: MaterialType = "file";
      if (item.type === "image" || /\.(png|jpe?g|gif|webp|svg|bmp)$/.test(filename)) type = "image";
      else if (item.type === "video" || /\.(mp4|webm|mov|avi)$/.test(filename)) type = "video";
      else if (/\.(mp3|wav|ogg|m4a|aac|flac)$/.test(filename)) type = "audio";
      materials.push({
        id: item.id,
        teacherId: item.teacherId,
        schoolId: item.schoolId,
        subject: "数学",
        title: item.title,
        description: item.description,
        chapterIds: item.chapterIds || [],
        knowledgePointIds: item.knowledgePointIds || [],
        thoughtMethodIds: item.thoughtMethodIds,
        errorReasonIds: item.errorReasonIds,
        grade: item.grade,
        schoolYear: item.schoolYear,
        semester: item.semester,
        type,
        content: item.content,
        fileUrl: item.fileUrl,
        fileName: item.fileName,
        fileSize: item.fileSize,
        tags: item.tags || [],
        platformSourceDonationIds: item.platformSourceDonationIds,
        schoolSourceBackupIds: item.schoolSourceBackupIds,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      });
      materialIds.add(item.id);
    }
    converted++;
    return { ...item, migratedToMaterial: true };
  });

  if (converted > 0) {
    state.coursewares = nextCoursewares;
    state.materials = materials;
  }
  return converted;
}
