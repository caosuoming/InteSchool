import { useState } from "react";
import { Download } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/stores/ui";

interface DocumentDownloadButtonProps {
  fileUrl: string;
  fileName?: string;
  label?: string;
  className?: string;
  iconClassName?: string;
}

function downloadUrl(fileUrl: string, forceOfficeMath: boolean): string {
  const url = new URL(fileUrl, window.location.origin);
  if (forceOfficeMath) url.searchParams.set("formulaFormat", "office");
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
  const [downloading, setDownloading] = useState(false);
  const isDocx = /\.docx$/i.test(fileName);

  const startDownload = async () => {
    setDownloading(true);
    try {
      const response = await fetch(downloadUrl(fileUrl, isDocx), { credentials: "same-origin" });
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
    } catch (error) {
      toast.error("下载失败", error instanceof Error ? error.message : undefined);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <button
      type="button"
      className={cn("inline-flex items-center gap-1", className)}
      onClick={() => void startDownload()}
      disabled={downloading}
    >
      <Download className={cn(iconClassName, downloading && "animate-pulse")} />
      {label}
    </button>
  );
}
