import type { CoursewareType } from "@/types";

export interface OnlineCourseware {
  type?: string;
  coursewareType?: CoursewareType;
  fileUrl?: string;
  fileName?: string;
  onlineAccessToken?: string;
  editorUrl?: string;
}

export function getCoursewareType(courseware: OnlineCourseware): CoursewareType | undefined {
  const type = courseware.coursewareType || courseware.type;
  return ["ppt", "ggb", "pdf", "video", "image", "other"].includes(type || "")
    ? type as CoursewareType
    : undefined;
}

export function getCoursewareFileUrl(courseware: OnlineCourseware): string | undefined {
  if (courseware.onlineAccessToken) {
    return `${window.location.origin}/api/courseware-files/${encodeURIComponent(courseware.onlineAccessToken)}`;
  }
  if (!courseware.fileUrl) return undefined;
  return new URL(courseware.fileUrl, window.location.origin).toString();
}

export function getCoursewarePreviewUrl(courseware: OnlineCourseware): string | undefined {
  const fileUrl = getCoursewareFileUrl(courseware);
  if (!fileUrl) return undefined;
  const type = getCoursewareType(courseware);
  if (type === "ppt") {
    return `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(fileUrl)}`;
  }
  return fileUrl;
}

export function getCoursewareEditorUrl(courseware: OnlineCourseware): string | undefined {
  return courseware.editorUrl;
}
