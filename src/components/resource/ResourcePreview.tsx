import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import {
  Download, ExternalLink, FileText, Film, Image, Music,
  Link as LinkIcon, File,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ============ 类型定义 ============

export type PreviewType =
  | "ppt" | "geogebra" | "sketchpad" | "pdf" | "video"
  | "image" | "text" | "audio" | "link" | "file" | "other";

export interface ResourcePreviewProps {
  type: PreviewType;
  title: string;
  content?: string;
  fileUrl?: string;
  open: boolean;
  onClose: () => void;
}

// ============ 常量 ============

const typeLabel: Record<PreviewType, string> = {
  ppt: "PPT",
  geogebra: "GeoGebra",
  sketchpad: "几何画板",
  pdf: "PDF",
  video: "视频",
  image: "图片",
  text: "文本",
  audio: "音频",
  link: "链接",
  file: "文件",
  other: "其他",
};

const typeIcon: Record<PreviewType, typeof File> = {
  ppt: FileText,
  geogebra: FileText,
  sketchpad: FileText,
  pdf: FileText,
  video: Film,
  image: Image,
  text: FileText,
  audio: Music,
  link: LinkIcon,
  file: File,
  other: File,
};

// ============ 主组件 ============

export function ResourcePreview({
  type,
  title,
  content,
  fileUrl,
  open,
  onClose,
}: ResourcePreviewProps) {
  const handleDownload = () => {
    if (fileUrl) {
      window.open(fileUrl, "_blank");
    } else if (content) {
      const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${title || "resource"}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  };

  const handleOpenLink = () => {
    if (fileUrl) window.open(fileUrl, "_blank");
  };

  const renderContent = () => {
    switch (type) {
      case "ppt":
        return (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <FileText className="w-12 h-12 text-ink-300 mb-3" />
            <p className="text-sm text-ink-600 mb-4">PPT文件需下载后查看</p>
            <Button variant="gold" size="sm" onClick={handleDownload}>
              <Download className="w-3.5 h-3.5" />
              下载文件
            </Button>
          </div>
        );
      case "geogebra":
        return (
          <div className="w-full h-[60vh] rounded-lg overflow-hidden border border-ink-100">
            <iframe
              src={fileUrl || "https://www.geogebra.org/classic"}
              className="w-full h-full"
              title="GeoGebra 预览"
              allowFullScreen
            />
          </div>
        );
      case "sketchpad":
        return (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <FileText className="w-12 h-12 text-ink-300 mb-3" />
            <p className="text-sm text-ink-600 mb-4">几何画板文件需下载后查看</p>
            <Button variant="gold" size="sm" onClick={handleDownload}>
              <Download className="w-3.5 h-3.5" />
              下载文件
            </Button>
          </div>
        );
      case "pdf":
        return (
          <div className="w-full h-[60vh] rounded-lg overflow-hidden border border-ink-100">
            <iframe
              src={fileUrl}
              className="w-full h-full"
              title="PDF 预览"
            />
          </div>
        );
      case "video":
        return (
          <div className="w-full rounded-lg overflow-hidden border border-ink-100 bg-ink-950">
            <video
              src={fileUrl}
              controls
              className="w-full max-h-[60vh]"
            >
              您的浏览器不支持视频播放。
            </video>
          </div>
        );
      case "image":
        return (
          <div className="flex items-center justify-center rounded-lg border border-ink-100 bg-mist p-4">
            <img
              src={fileUrl}
              alt={title}
              className="max-w-full max-h-[60vh] object-contain rounded"
            />
          </div>
        );
      case "audio":
        return (
          <div className="flex flex-col items-center justify-center py-12">
            <Music className="w-12 h-12 text-ink-300 mb-4" />
            <audio src={fileUrl} controls className="w-full max-w-md">
              您的浏览器不支持音频播放。
            </audio>
          </div>
        );
      case "text":
        return (
          <div className="rounded-lg border border-ink-100 bg-mist p-4 max-h-[60vh] overflow-auto">
            <pre className="text-sm text-ink-800 whitespace-pre-wrap font-sans leading-relaxed">
              {content || "（无内容）"}
            </pre>
          </div>
        );
      case "link":
        return (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <LinkIcon className="w-12 h-12 text-ink-300 mb-3" />
            <p className="text-sm text-ink-600 mb-1">外部链接</p>
            <p className="text-xs text-ink-500 mb-4 break-all max-w-md">
              {fileUrl || content}
            </p>
            <Button variant="gold" size="sm" onClick={handleOpenLink}>
              <ExternalLink className="w-3.5 h-3.5" />
              在新窗口打开
            </Button>
          </div>
        );
      case "file":
      case "other":
      default:
        return (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <File className="w-12 h-12 text-ink-300 mb-3" />
            <p className="text-sm text-ink-600 mb-1">{title}</p>
            <p className="text-xs text-ink-500 mb-4">
              {fileUrl ? "点击下载查看文件内容" : "暂无文件预览"}
            </p>
            <Button variant="gold" size="sm" onClick={handleDownload}>
              <Download className="w-3.5 h-3.5" />
              下载文件
            </Button>
          </div>
        );
    }
  };

  const TypeIcon = typeIcon[type] || File;

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title={
        <div className="flex items-center gap-2">
          <TypeIcon className={cn("w-4 h-4 text-gold-500")} />
          <span className="truncate">{title}</span>
          <Badge variant="gold">{typeLabel[type]}</Badge>
        </div>
      }
      footer={
        <Button variant="gold" size="sm" onClick={handleDownload}>
          <Download className="w-3.5 h-3.5" />
          下载
        </Button>
      }
    >
      {renderContent()}
    </Modal>
  );
}

export default ResourcePreview;
