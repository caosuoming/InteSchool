import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { MathHtml } from "@/components/ui/MathHtml";
import { cn } from "@/lib/utils";
import type { MaterialType } from "@/types";

interface MaterialPreviewModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  type: MaterialType;
  content?: string;
  fileUrl?: string;
}

export function MaterialPreviewModal({
  open,
  onClose,
  title,
  type,
  content,
  fileUrl,
}: MaterialPreviewModalProps) {
  const isImage = type === "image";

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={isImage ? "图片预览" : "知识块完整内容"}
      size="lg"
      footer={<Button variant="ghost" onClick={onClose}>关闭</Button>}
    >
      {isImage ? (
        fileUrl ? (
          <div className="flex items-center justify-center rounded-lg border border-ink-100 bg-mist/40 p-4">
            <img
              src={fileUrl}
              alt={title}
              className="max-h-[70vh] max-w-full rounded-lg object-contain"
            />
          </div>
        ) : (
          <div className="py-12 text-center text-sm text-ink-400">暂无可预览的图片</div>
        )
      ) : (
        <div
          data-testid="material-preview-content"
          className="max-h-[70vh] overflow-auto rounded-lg border border-ink-100 bg-mist/40 p-4 text-sm leading-relaxed text-ink-800"
        >
          <MathHtml className="whitespace-pre-wrap">{content || "（无内容）"}</MathHtml>
        </div>
      )}
    </Modal>
  );
}

interface MaterialImageThumbnailProps {
  title: string;
  fileUrl: string;
  onOpen: () => void;
  className?: string;
}

export function MaterialImageThumbnail({
  title,
  fileUrl,
  onOpen,
  className,
}: MaterialImageThumbnailProps) {
  return (
    <button
      type="button"
      aria-label={`预览图片：${title}`}
      onClick={onOpen}
      className={cn(
        "flex-shrink-0 overflow-hidden rounded-lg border border-ink-100 transition-colors hover:border-gold-300 focus:outline-none focus:ring-2 focus:ring-gold-300/60",
        className,
      )}
    >
      <img src={fileUrl} alt={title} className="h-full w-full object-cover" />
    </button>
  );
}
