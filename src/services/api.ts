let csrfToken: string | null = null;

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function setCsrfToken(token: string | null): void {
  csrfToken = token;
}

function reviveRpc(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reviveRpc);
  if (!value || typeof value !== "object") return value;
  const record = value as Record<string, unknown>;
  if (record.__rpcType === "Set" && Array.isArray(record.values)) {
    return new Set(record.values.map(reviveRpc));
  }
  if (record.__rpcType === "Map" && Array.isArray(record.entries)) {
    return new Map(record.entries.map((entry) => {
      const pair = entry as unknown[];
      return [reviveRpc(pair[0]), reviveRpc(pair[1])];
    }));
  }
  return Object.fromEntries(Object.entries(record).map(([key, child]) => [key, reviveRpc(child)]));
}

export async function apiRequest<T>(path: string, init: RequestInit = {}, useCsrf = false): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (useCsrf) {
    if (!csrfToken) throw new Error("会话已失效，请刷新页面后重试");
    headers.set("X-InteSchool-CSRF", csrfToken);
  }
  const response = await fetch(path, {
    ...init,
    headers,
    credentials: "include",
  });
  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json")
    ? await response.json()
    : await response.text();
  if (!response.ok) {
    const message = payload && typeof payload === "object" && "error" in payload
      ? String((payload as { error: unknown }).error)
      : `请求失败（${response.status}）`;
    if (response.status === 401) csrfToken = null;
    throw new ApiError(message, response.status);
  }
  return reviveRpc(payload) as T;
}

export async function apiBlobRequest(path: string, init: RequestInit = {}, useCsrf = false): Promise<Blob> {
  const headers = new Headers(init.headers);
  if (useCsrf) {
    if (!csrfToken) throw new Error("会话已失效，请刷新页面后重试");
    headers.set("X-InteSchool-CSRF", csrfToken);
  }
  const response = await fetch(path, {
    ...init,
    headers,
    credentials: "include",
  });
  if (!response.ok) {
    const contentType = response.headers.get("content-type") || "";
    let message = `请求失败（${response.status}）`;
    if (contentType.includes("application/json")) {
      const payload = await response.json() as { error?: unknown };
      if (typeof payload.error === "string" && payload.error) message = payload.error;
    } else {
      const text = await response.text();
      if (text) message = text;
    }
    if (response.status === 401) csrfToken = null;
    throw new ApiError(message, response.status);
  }
  return response.blob();
}

export async function rpcCall<T>(service: string, method: string, args: unknown[]): Promise<T> {
  const response = await apiRequest<{ result: T }>("/api/rpc", {
    method: "POST",
    body: JSON.stringify({ service, method, args }),
  }, csrfToken !== null);
  return response.result;
}

export interface UploadedFile {
  id: string;
  ownerId: string;
  schoolId: string | null;
  originalName: string;
  mimeType: string;
  size: number;
  createdAt: string;
  url: string;
}

export async function uploadFile(file: File): Promise<UploadedFile> {
  const form = new FormData();
  form.append("file", file, file.name);
  return apiRequest<UploadedFile>("/api/files", { method: "POST", body: form }, true);
}

export interface ExtractedFileContent {
  text: string;
  html: string;
  format: "docx" | "pdf" | "text";
  warnings: string[];
}

export async function extractStoredFile(
  fileUrl: string,
  options: { textOnly?: boolean } = {},
): Promise<ExtractedFileContent> {
  if (!fileUrl.startsWith("/api/files/")) {
    throw new Error("该资源不是服务端托管文件");
  }
  const suffix = options.textOnly ? "?textOnly=1" : "";
  return apiRequest<ExtractedFileContent>(`${fileUrl}/content${suffix}`);
}

export async function importStoredFile<T>(fileId: string): Promise<T> {
  return apiRequest<T>(`/api/files/${encodeURIComponent(fileId)}/import`, {
    method: "POST",
  }, true);
}
