import { useState } from "react";
import { ExternalLink, Link2, Video } from "lucide-react";
import { MathHtml } from "@/components/ui/MathHtml";
import { Modal } from "@/components/ui/Modal";
import type { QuestionLink, QuestionVideoReference } from "@/types";

interface QuestionSupplementaryDetailsProps {
  board?: string;
  boardImages?: string[];
  links?: QuestionLink[];
  explanationVideo?: QuestionVideoReference | null;
  compact?: boolean;
}

function isImageSource(value: string): boolean {
  return value.startsWith("/api/files/")
    || value.startsWith("data:image/")
    || /\.(?:png|jpe?g|gif|webp|svg)(?:[?#].*)?$/i.test(value);
}

function isPlayableVideoSource(value: string): boolean {
  return value.startsWith("/api/files/")
    || value.startsWith("data:video/")
    || /\.(?:mp4|webm|ogg|mov|m4v)(?:[?#].*)?$/i.test(value);
}

export function QuestionSupplementaryDetails({
  board,
  boardImages = [],
  links = [],
  explanationVideo,
  compact = false,
}: QuestionSupplementaryDetailsProps) {
  const [previewBoardImage, setPreviewBoardImage] = useState<string | null>(null);
  const videoSource = explanationVideo?.fileUrl || explanationVideo?.content || "";
  const legacyBoardImage = board && isImageSource(board) ? board : null;
  const boardImageSources = Array.from(new Set([
    ...(legacyBoardImage ? [legacyBoardImage] : []),
    ...boardImages.filter(Boolean),
  ]));
  const boardText = board && !legacyBoardImage ? board : "";

  if (!board && boardImageSources.length === 0 && links.length === 0 && !explanationVideo) return null;

  return (
    <>
      <div className={compact ? "space-y-2" : "space-y-3"}>
      {(boardText || boardImageSources.length > 0) && (
        <div>
          <div className="mb-1 text-xs font-medium text-ink-500">板书</div>
          <div className="space-y-2 rounded-md border border-sky-200 bg-sky-50/30 p-2.5">
            {boardText && (
              <MathHtml className="whitespace-pre-wrap text-sm leading-relaxed text-ink-900">
                {boardText}
              </MathHtml>
            )}
            {boardImageSources.length > 0 && (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                {boardImageSources.map((src, index) => (
                  <button
                    key={src}
                    type="button"
                    className="group overflow-hidden rounded-md border border-sky-200 bg-paper text-left shadow-sm transition hover:border-sky-400 hover:shadow"
                    onClick={() => setPreviewBoardImage(src)}
                    aria-label={`查看板书 ${index + 1}`}
                  >
                    <img
                      src={src}
                      alt={boardImageSources.length === 1 ? "题目板书" : `题目板书 ${index + 1}`}
                      className="aspect-video w-full object-cover"
                    />
                    {boardImageSources.length > 1 && (
                      <span className="block px-2 py-1 text-[11px] text-ink-500">书写区 {index + 1}</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {links.length > 0 && (
        <div>
          <div className="mb-1 flex items-center gap-1 text-xs font-medium text-ink-500">
            <Link2 className="h-3 w-3" />
            相关链接
          </div>
          <div className="flex flex-wrap gap-2">
            {links.map((link) => (
              <a
                key={link.id}
                href={link.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-md border border-teal-200 bg-teal-50 px-2.5 py-1.5 text-xs font-medium text-teal-800 hover:bg-teal-100"
              >
                {link.name}
                <ExternalLink className="h-3 w-3" />
              </a>
            ))}
          </div>
        </div>
      )}

      {explanationVideo && (
        <div>
          <div className="mb-1 flex items-center gap-1 text-xs font-medium text-ink-500">
            <Video className="h-3 w-3" />
            讲解视频
          </div>
          <div className="rounded-md border border-violet-200 bg-violet-50/30 p-2.5">
            <div className="mb-2 text-sm font-medium text-ink-800">{explanationVideo.title}</div>
            {videoSource && isPlayableVideoSource(videoSource) ? (
              <video controls preload="metadata" className="max-h-[28rem] w-full rounded bg-black" src={videoSource}>
                当前浏览器不支持视频播放。
              </video>
            ) : videoSource ? (
              <a
                href={videoSource}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-violet-700 hover:text-violet-900"
              >
                打开讲解视频
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            ) : (
              <div className="text-xs text-ink-400">素材文件暂不可用</div>
            )}
          </div>
        </div>
      )}
      </div>

      <Modal
        open={Boolean(previewBoardImage)}
        onClose={() => setPreviewBoardImage(null)}
        title="板书内容"
        size="full"
      >
        {previewBoardImage && (
          <img
            src={previewBoardImage}
            alt="板书大图"
            className="mx-auto max-h-[80vh] max-w-full object-contain"
          />
        )}
      </Modal>
    </>
  );
}

export default QuestionSupplementaryDetails;
