import { useEffect, useMemo, useState } from "react";
import {
  Download,
  ExternalLink,
  File,
  FileText,
  Image as ImageIcon,
  Minus,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Spinner } from "@/components/ui/Spinner";
import { OfficeDocumentHtml } from "@/components/resource/OfficeDocumentHtml";
import { cn } from "@/lib/utils";
import { extractStoredFile } from "@/services/api";
import type { ClassroomHomeworkAttachment } from "@/types";

interface HomeworkAttachmentsProps {
  attachments?: ClassroomHomeworkAttachment[];
  theme?: "light" | "dark";
  className?: string;
  onRemove?: (attachment: ClassroomHomeworkAttachment) => void;
  removeDisabled?: boolean;
}

type PreviewKind = "image" | "pdf" | "document" | "download";

function attachmentKind(attachment: ClassroomHomeworkAttachment): PreviewKind {
  if (attachment.mimeType.startsWith("image/")) return "image";
  if (attachment.mimeType === "application/pdf" || /\.pdf$/i.test(attachment.name)) return "pdf";
  if (/\.(docx|txt|md)$/i.test(attachment.name)) return "document";
  return "download";
}

function fileSizeLabel(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function AttachmentIcon({ attachment, className }: {
  attachment: ClassroomHomeworkAttachment;
  className?: string;
}) {
  const kind = attachmentKind(attachment);
  if (kind === "image") return <ImageIcon className={className} />;
  if (kind === "document" || kind === "pdf") return <FileText className={className} />;
  return <File className={className} />;
}

function HomeworkAttachmentPreview({
  attachment,
  onClose,
}: {
  attachment: ClassroomHomeworkAttachment | null;
  onClose: () => void;
}) {
  const [pageZoom, setPageZoom] = useState(100);
  const [fontSize, setFontSize] = useState(18);
  const [document, setDocument] = useState({ loading: false, html: "", text: "", error: "" });
  const kind = attachment ? attachmentKind(attachment) : "download";

  useEffect(() => {
    setPageZoom(100);
    setFontSize(18);
  }, [attachment?.id]);

  useEffect(() => {
    if (!attachment || kind !== "document") {
      setDocument({ loading: false, html: "", text: "", error: "" });
      return;
    }
    let active = true;
    setDocument({ loading: true, html: "", text: "", error: "" });
    extractStoredFile(attachment.url)
      .then((result) => {
        if (active) {
          setDocument({ loading: false, html: result.html, text: result.text, error: "" });
        }
      })
      .catch((error) => {
        if (active) {
          setDocument({
            loading: false,
            html: "",
            text: "",
            error: error instanceof Error ? error.message : "文档预览失败",
          });
        }
      });
    return () => {
      active = false;
    };
  }, [attachment, kind]);

  const preview = useMemo(() => {
    if (!attachment) return null;
    if (kind === "image") {
      return (
        <div className="flex min-h-full min-w-full items-center justify-center p-6">
          <img
            src={attachment.url}
            alt={attachment.name}
            className="h-auto max-w-none object-contain shadow-lg"
            style={{ width: `${pageZoom}%` }}
          />
        </div>
      );
    }
    if (kind === "pdf") {
      return (
        <iframe
          key={`${attachment.id}:${pageZoom}`}
          src={`${attachment.url}#zoom=${pageZoom}`}
          title={attachment.name}
          className="h-full min-h-[64vh] w-full border-0 bg-white"
        />
      );
    }
    if (kind === "document") {
      if (document.loading) {
        return <div className="flex min-h-[60vh] items-center justify-center"><Spinner size={28} /></div>;
      }
      if (document.html || document.text) {
        return (
          <div className="min-h-full bg-neutral-200 p-6 sm:p-10">
            <div
              className="mx-auto min-h-[60vh] max-w-5xl origin-top bg-white px-8 py-10 text-ink-900 shadow-xl sm:px-14"
              style={{ fontSize: `${fontSize}px`, zoom: pageZoom / 100 }}
            >
              {document.html ? (
                <OfficeDocumentHtml html={document.html} className="leading-relaxed" />
              ) : (
                <pre className="whitespace-pre-wrap font-sans leading-relaxed">{document.text}</pre>
              )}
            </div>
          </div>
        );
      }
    }
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center px-8 text-center">
        <File className="h-16 w-16 text-ink-200" />
        <div className="mt-4 text-base font-medium text-ink-800">{attachment.name}</div>
        <div className="mt-2 max-w-lg text-sm text-ink-500">
          {document.error || "该文件格式暂不支持站内预览，可在新窗口打开或下载查看。"}
        </div>
      </div>
    );
  }, [attachment, document, fontSize, kind, pageZoom]);

  return (
    <Modal
      open={Boolean(attachment)}
      onClose={onClose}
      title={attachment?.name}
      description={attachment ? `${fileSizeLabel(attachment.size)} · ${attachment.mimeType}` : undefined}
      size="full"
      className="h-[94vh]"
    >
      {attachment && (
        <div className="flex h-[78vh] min-h-0 flex-col">
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-ink-100 bg-mist/60 p-2">
            {kind !== "download" && (
              <div className="flex items-center rounded-md border border-ink-150 bg-paper p-0.5">
                <button
                  type="button"
                  aria-label="缩小附件页面"
                  disabled={pageZoom <= 50}
                  onClick={() => setPageZoom((value) => Math.max(50, value - 25))}
                  className="flex h-8 w-8 items-center justify-center rounded text-ink-600 hover:bg-mist disabled:opacity-30"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <span className="w-14 text-center text-xs text-ink-500">{pageZoom}%</span>
                <button
                  type="button"
                  aria-label="放大附件页面"
                  disabled={pageZoom >= 200}
                  onClick={() => setPageZoom((value) => Math.min(200, value + 25))}
                  className="flex h-8 w-8 items-center justify-center rounded text-ink-600 hover:bg-mist disabled:opacity-30"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            )}
            {kind === "document" && (
              <div className="flex items-center rounded-md border border-ink-150 bg-paper p-0.5">
                <button
                  type="button"
                  aria-label="缩小文档字体"
                  disabled={fontSize <= 14}
                  onClick={() => setFontSize((value) => Math.max(14, value - 2))}
                  className="flex h-8 w-8 items-center justify-center rounded text-ink-600 hover:bg-mist disabled:opacity-30"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <span className="w-16 text-center text-xs text-ink-500">字体 {fontSize}</span>
                <button
                  type="button"
                  aria-label="放大文档字体"
                  disabled={fontSize >= 32}
                  onClick={() => setFontSize((value) => Math.min(32, value + 2))}
                  className="flex h-8 w-8 items-center justify-center rounded text-ink-600 hover:bg-mist disabled:opacity-30"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            )}
            <div className="ml-auto flex items-center gap-2">
              <a href={attachment.url} target="_blank" rel="noreferrer">
                <Button variant="outline" size="sm">
                  <ExternalLink className="h-4 w-4" />
                  新窗口打开
                </Button>
              </a>
              <a href={attachment.url} download={attachment.name}>
                <Button variant="gold" size="sm">
                  <Download className="h-4 w-4" />
                  下载
                </Button>
              </a>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-ink-100 bg-neutral-100">
            {preview}
          </div>
        </div>
      )}
    </Modal>
  );
}

export function HomeworkAttachments({
  attachments = [],
  theme = "light",
  className,
  onRemove,
  removeDisabled = false,
}: HomeworkAttachmentsProps) {
  const [previewing, setPreviewing] = useState<ClassroomHomeworkAttachment | null>(null);
  if (attachments.length === 0) return null;

  return (
    <>
      <div className={cn("flex flex-wrap gap-2", className)}>
        {attachments.map((attachment) => (
          <div
            key={attachment.id}
            className={cn(
              "inline-flex min-w-0 max-w-full items-stretch overflow-hidden rounded-lg border text-xs transition-colors",
              theme === "dark"
                ? "border-neutral-700 bg-neutral-900 text-neutral-200 hover:border-amber-400"
                : "border-ink-150 bg-paper text-ink-700 hover:border-gold-400",
            )}
          >
            <button
              type="button"
              onClick={() => setPreviewing(attachment)}
              className={cn(
                "inline-flex min-w-0 items-center gap-2 px-3 py-2 text-left",
                theme === "dark" ? "hover:text-amber-200" : "hover:text-ink-900",
              )}
              title={`预览 ${attachment.name}`}
            >
              <AttachmentIcon attachment={attachment} className="h-4 w-4 flex-shrink-0" />
              <span className="truncate">{attachment.name}</span>
              <span className={cn("flex-shrink-0", theme === "dark" ? "text-neutral-500" : "text-ink-400")}>
                {fileSizeLabel(attachment.size)}
              </span>
            </button>
            {onRemove && (
              <button
                type="button"
                aria-label={`移除附件 ${attachment.name}`}
                disabled={removeDisabled}
                onClick={() => onRemove(attachment)}
                className={cn(
                  "flex w-9 flex-shrink-0 items-center justify-center border-l disabled:cursor-not-allowed disabled:opacity-40",
                  theme === "dark"
                    ? "border-neutral-700 text-neutral-500 hover:bg-red-950/40 hover:text-red-300"
                    : "border-ink-100 text-ink-400 hover:bg-red-50 hover:text-red-600",
                )}
              >
                <Minus className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        ))}
      </div>
      <HomeworkAttachmentPreview attachment={previewing} onClose={() => setPreviewing(null)} />
    </>
  );
}

export default HomeworkAttachments;
