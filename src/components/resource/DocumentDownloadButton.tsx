import { useState } from "react";
import { Download, FileCode2, Sigma } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { cn } from "@/lib/utils";
import { toast } from "@/stores/ui";

export type DocumentFormulaFormat = "office" | "mathtype";

interface DocumentDownloadButtonProps {
  fileUrl: string;
  fileName?: string;
  label?: string;
  className?: string;
  iconClassName?: string;
}

function downloadUrl(fileUrl: string, formulaFormat?: DocumentFormulaFormat): string {
  const url = new URL(fileUrl, window.location.origin);
  if (formulaFormat) url.searchParams.set("formulaFormat", formulaFormat);
  return `${url.pathname}${url.search}${url.hash}`;
}

async function responseError(response: Response): Promise<string> {
  try {
    const payload = await response.json() as { error?: unknown };
    if (typeof payload.error === "string" && payload.error) return payload.error;
  } catch {
    // The server may return plain text for infrastructure-level failures.
  }
  return `下载失败（HTTP ${response.status}）`;
}

export function DocumentDownloadButton({
  fileUrl,
  fileName = "document.docx",
  label = "下载",
  className,
  iconClassName = "w-4 h-4",
}: DocumentDownloadButtonProps) {
  const [open, setOpen] = useState(false);
  const [downloading, setDownloading] = useState<DocumentFormulaFormat | "original" | null>(null);
  const isDocx = /\.docx$/i.test(fileName);

  const startDownload = async (formulaFormat?: DocumentFormulaFormat) => {
    const state = formulaFormat || "original";
    setDownloading(state);
    try {
      const response = await fetch(downloadUrl(fileUrl, formulaFormat), { credentials: "same-origin" });
      if (!response.ok) throw new Error(await responseError(response));
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(objectUrl);
      setOpen(false);
    } catch (error) {
      toast.error("下载失败", error instanceof Error ? error.message : undefined);
    } finally {
      setDownloading(null);
    }
  };

  return (
    <>
      <button
        type="button"
        className={cn("inline-flex items-center gap-1", className)}
        onClick={() => {
          if (isDocx) setOpen(true);
          else void startDownload();
        }}
        disabled={downloading !== null}
      >
        <Download className={cn(iconClassName, downloading && "animate-pulse")} />
        {label}
      </button>

      <Modal
        open={open}
        onClose={() => {
          if (!downloading) setOpen(false);
        }}
        title="选择数学公式格式"
        description="DOCX 中的数学公式可下载为 Word 原生公式，或保留原始 MathType 对象。"
        size="sm"
      >
        <div className="space-y-3">
          <button
            type="button"
            className="w-full rounded-lg border border-ink-200 p-4 text-left transition-colors hover:border-gold-300 hover:bg-gold-50/40 disabled:opacity-60"
            onClick={() => void startDownload("office")}
            disabled={downloading !== null}
          >
            <div className="flex items-start gap-3">
              <div className="rounded-lg bg-gold-50 p-2 text-gold-600">
                <Sigma className="h-5 w-5" />
              </div>
              <div>
                <div className="font-medium text-ink-900">新微软公式</div>
                <div className="mt-1 text-xs leading-relaxed text-ink-500">
                  转换为 Word 原生 OMML，可在新版 Microsoft Word 中直接编辑。
                </div>
              </div>
            </div>
          </button>

          <button
            type="button"
            className="w-full rounded-lg border border-ink-200 p-4 text-left transition-colors hover:border-gold-300 hover:bg-gold-50/40 disabled:opacity-60"
            onClick={() => void startDownload("mathtype")}
            disabled={downloading !== null}
          >
            <div className="flex items-start gap-3">
              <div className="rounded-lg bg-ink-50 p-2 text-ink-600">
                <FileCode2 className="h-5 w-5" />
              </div>
              <div>
                <div className="font-medium text-ink-900">MathType</div>
                <div className="mt-1 text-xs leading-relaxed text-ink-500">
                  保留上传文档中的 MathType 对象，适合继续使用 MathType 编辑。
                </div>
              </div>
            </div>
          </button>
        </div>
        <div className="mt-4 flex justify-end">
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={downloading !== null}>
            取消
          </Button>
        </div>
      </Modal>
    </>
  );
}
