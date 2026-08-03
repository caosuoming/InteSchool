import type { Courseware, LessonSlide } from "@/types";
import { getCoursewareFileUrl } from "@/lib/courseware-online";

type WpsCourseware = Courseware | LessonSlide;

interface WpsDownloadResult {
  filePath?: string;
  tempFilePath?: string;
  path?: string;
}

interface WpsSdk {
  downloadFile?: (options: {
    params: { url: string; cachePolicy?: number };
    onSuccess: (result: WpsDownloadResult) => void;
    onError: () => void;
  }) => void;
  previewFile?: (options: {
    params: {
      filePath: string;
      fileType?: string;
      openMode?: "local" | "external";
      showMenu?: boolean;
    };
    onSuccess?: () => void;
    onError?: () => void;
  }) => void;
}

declare global {
  interface Window {
    ksoxz_sdk?: WpsSdk;
  }
}

function fileType(courseware: WpsCourseware): string | undefined {
  const extension = courseware.fileName?.split(".").pop()?.toLowerCase();
  return extension || undefined;
}

export async function openCoursewareInWps(courseware: WpsCourseware): Promise<boolean> {
  const url = getCoursewareFileUrl(courseware);
  if (!url) return false;

  const sdk = window.ksoxz_sdk;
  if (sdk?.downloadFile && sdk.previewFile) {
    return new Promise((resolve) => {
      sdk.downloadFile?.({
        params: { url, cachePolicy: 1 },
        onSuccess: (result) => {
          const localPath = result.filePath || result.tempFilePath || result.path;
          if (!localPath) {
            resolve(false);
            return;
          }
          sdk.previewFile?.({
            params: {
              filePath: localPath,
              fileType: fileType(courseware),
              openMode: "external",
              showMenu: true,
            },
            onSuccess: () => resolve(true),
            onError: () => resolve(false),
          });
        },
        onError: () => resolve(false),
      });
    });
  }

  return Boolean(window.open(url, "_blank", "noopener,noreferrer"));
}
