import { rpcCall } from "./api";

export interface PublishedScannerSheet {
  id: string;
  type: "paper" | "lecture";
  title: string;
  grade: string;
  schoolYear: string;
  publishedAt: string;
}

export const SCANNER_SCHOOL_KEY = "inteschool-scanner-school";
const SCANNER_BRIDGE = "http://127.0.0.1:17380";

export const scannerService = {
  async listPublishedAnswerSheets(schoolId: string): Promise<PublishedScannerSheet[]> {
    return rpcCall("scanner", "listPublishedAnswerSheets", [schoolId]);
  },

  async scan(): Promise<Blob> {
    let response: Response;
    try {
      response = await fetch(`${SCANNER_BRIDGE}/scan`, {
        method: "POST",
        headers: { "X-InteSchool-Scanner": "scanner-v1" },
        signal: AbortSignal.timeout(125_000),
      });
    } catch {
      throw new Error("无法连接本机扫描服务。请安装并启动扫描桥接程序，然后重试。");
    }
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(detail.slice(0, 300) || "扫描失败，请检查扫描仪连接");
    }
    const image = await response.blob();
    if (!["image/png", "image/jpeg", "image/bmp"].includes(image.type)) {
      throw new Error("扫描仪返回了不支持的图像格式");
    }
    return image;
  },
};
