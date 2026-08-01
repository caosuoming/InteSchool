import { ExternalLink, FileQuestion } from "lucide-react";
import type { Courseware, LessonSlide } from "@/types";
import { getCoursewareFileUrl, getCoursewarePreviewUrl, getCoursewareType } from "@/lib/courseware-online";
import { GeoGebraEmbed } from "./GeoGebraEmbed";

interface CoursewareEmbedProps {
  courseware: Courseware | LessonSlide;
  title: string;
  className?: string;
}

export function CoursewareEmbed({ courseware, title, className = "h-[70vh]" }: CoursewareEmbedProps) {
  const type = getCoursewareType(courseware);
  const fileUrl = getCoursewareFileUrl(courseware);
  const previewUrl = getCoursewarePreviewUrl(courseware);

  if (!fileUrl || !previewUrl) {
    return (
      <div className={`${className} flex flex-col items-center justify-center text-center bg-mist/40`}>
        <FileQuestion className="w-14 h-14 text-ink-200 mb-3" />
        <div className="font-medium text-ink-800">暂无可预览文件</div>
        <div className="text-sm text-ink-500 mt-1">请重新上传课件文件，或绑定在线编辑地址。</div>
      </div>
    );
  }

  if (type === "ggb") {
    return <GeoGebraEmbed fileUrl={fileUrl} title={title} className={className} />;
  }

  if (type === "image") {
    return (
      <div className={`${className} flex items-center justify-center overflow-auto bg-ink-950/5 p-4`}>
        <img src={fileUrl} alt={title} className="max-w-full max-h-full object-contain" />
      </div>
    );
  }

  if (type === "video") {
    return (
      <div className={`${className} flex items-center justify-center bg-black p-4`}>
        <video src={fileUrl} controls className="max-w-full max-h-full" />
      </div>
    );
  }

  if (["ppt", "pdf"].includes(type || "")) {
    return (
      <iframe
        src={previewUrl}
        title={title}
        className={`w-full border-0 bg-white ${className}`}
        allow="clipboard-read; clipboard-write; fullscreen"
      />
    );
  }

  return (
    <div className={`${className} flex flex-col items-center justify-center text-center bg-mist/40`}>
      <FileQuestion className="w-14 h-14 text-ink-200 mb-3" />
      <div className="font-medium text-ink-800">该格式暂不支持内嵌预览</div>
      <a
        href={fileUrl}
        target="_blank"
        rel="noreferrer"
        className="mt-3 inline-flex items-center gap-1.5 text-sm text-gold-700 hover:text-gold-800"
      >
        <ExternalLink className="w-4 h-4" />
        打开文件
      </a>
    </div>
  );
}
