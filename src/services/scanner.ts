import { apiRequest, rpcCall } from "./api";

export interface PublishedScannerSheet {
  id: string;
  type: "paper" | "lecture";
  title: string;
  grade: string;
  schoolYear: string;
  publishedAt: string;
}

export interface ScannerDevice {
  id: string;
  name: string;
  driver: string;
  duplex: boolean;
}

export interface ScannerPageRecord {
  id: string;
  schoolId: string;
  teacherId: string;
  sheetType: "paper" | "lecture";
  sheetId: string;
  fileId: string;
  qrPayload: string | null;
  verified: boolean;
  studentId: string | null;
  status: "pending" | "assigned";
  createdAt: string;
}

export const SCANNER_SCHOOL_KEY = "inteschool-scanner-school";
export const SCANNER_DEVICE_KEY = "inteschool-scanner-device";
const SCANNER_BRIDGE = "http://127.0.0.1:17380";

async function bridgeRequest(path: string, init: RequestInit = {}): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(`${SCANNER_BRIDGE}${path}`, {
      ...init,
      headers: { "X-InteSchool-Scanner": "scanner-v1", ...init.headers },
      signal: AbortSignal.timeout(path === "/scan" ? 300_000 : 20_000),
    });
  } catch {
    throw new Error("无法连接本机扫描服务。请安装并启动扫描桥接程序，然后重试。");
  }
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail.slice(0, 300) || "扫描失败，请检查扫描仪连接");
  }
  return response;
}

export const scannerService = {
  async listPublishedAnswerSheets(schoolId: string): Promise<PublishedScannerSheet[]> {
    return rpcCall("scanner", "listPublishedAnswerSheets", [schoolId]);
  },

  async listDevices(): Promise<{ devices: ScannerDevice[]; diagnostics: string[] }> {
    return (await bridgeRequest("/devices")).json();
  },

  async scan(deviceId: string, duplex: boolean): Promise<Blob[]> {
    const response = await bridgeRequest("/scan", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceId, duplex }),
    });
    const { pages } = await response.json() as { pages: Array<{ data: string; mime: string }> };
    if (!Array.isArray(pages) || !pages.length || pages.length > 40) throw new Error("扫描仪未返回有效图像");
    return pages.map((page) => {
      if (!["image/png", "image/jpeg"].includes(page.mime) || typeof page.data !== "string" || page.data.length > 34_952_536) {
        throw new Error("扫描仪返回了不支持的图像格式或图像过大");
      }
      const binary = atob(page.data);
      const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
      return new Blob([bytes], { type: page.mime });
    });
  },

  async uploadPage(image: Blob, schoolId: string, sheet: PublishedScannerSheet, qrPayload: string | null): Promise<ScannerPageRecord> {
    const form = new FormData();
    form.append("file", image, `scan.${image.type === "image/jpeg" ? "jpg" : "png"}`);
    const query = new URLSearchParams({ schoolId, sheetId: sheet.id, sheetType: sheet.type });
    if (qrPayload) query.set("qrPayload", qrPayload);
    return apiRequest<ScannerPageRecord>(`/api/scanner/pages?${query.toString()}`, { method: "POST", body: form }, true);
  },

  async listPages(schoolId: string): Promise<ScannerPageRecord[]> {
    return apiRequest<ScannerPageRecord[]>(`/api/scanner/pages?${new URLSearchParams({ schoolId })}`);
  },

  async assignPage(pageId: string, studentId: string | null): Promise<ScannerPageRecord> {
    return apiRequest<ScannerPageRecord>(`/api/scanner/pages/${encodeURIComponent(pageId)}`, {
      method: "PATCH", body: JSON.stringify({ studentId }),
    }, true);
  },
};
