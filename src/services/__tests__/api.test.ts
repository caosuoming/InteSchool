import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ApiError,
  apiRequest,
  extractStoredFile,
  importStoredFile,
  rpcCall,
  setCsrfToken,
  uploadFile,
} from "../api";

const fetchMock = vi.fn<typeof fetch>();

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  setCsrfToken(null);
});

afterEach(() => {
  vi.useRealTimers();
  setCsrfToken(null);
  vi.unstubAllGlobals();
});

describe("api service", () => {
  it("constructs typed API errors", () => {
    const error = new ApiError("conflict", 409);
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("ApiError");
    expect(error.message).toBe("conflict");
    expect(error.status).toBe(409);
  });

  it("sends JSON with credentials and revives RPC collections", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({
      plain: "ok",
      nested: [{ __rpcType: "Set", values: [1, { value: 2 }] }],
      mapping: {
        __rpcType: "Map",
        entries: [["first", { __rpcType: "Set", values: ["a", "b"] }]],
      },
    }));

    const result = await apiRequest<{
      plain: string;
      nested: Set<unknown>[];
      mapping: Map<string, Set<string>>;
    }>("/api/example", {
      method: "POST",
      body: JSON.stringify({ hello: "world" }),
    });

    expect(result.plain).toBe("ok");
    expect(result.nested[0]).toEqual(new Set([1, { value: 2 }]));
    expect(result.mapping.get("first")).toEqual(new Set(["a", "b"]));
    expect(fetchMock).toHaveBeenCalledOnce();
    const [path, init] = fetchMock.mock.calls[0];
    expect(path).toBe("/api/example");
    expect(init?.credentials).toBe("include");
    expect(new Headers(init?.headers).get("Content-Type")).toBe("application/json");
  });

  it("preserves explicit headers and handles plain-text responses", async () => {
    fetchMock.mockResolvedValueOnce(new Response("created", {
      status: 200,
      headers: { "content-type": "text/plain" },
    }));

    const result = await apiRequest<string>("/api/text", {
      method: "POST",
      headers: { "Content-Type": "application/custom" },
      body: "raw",
    });

    expect(result).toBe("created");
    const init = fetchMock.mock.calls[0][1];
    expect(new Headers(init?.headers).get("Content-Type")).toBe("application/custom");
  });

  it("requires a CSRF token for protected requests", async () => {
    await expect(apiRequest("/api/protected", { method: "POST" }, true))
      .rejects.toThrow("会话已失效，请刷新页面后重试");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("adds CSRF headers and clears the token after a 401", async () => {
    setCsrfToken("csrf-token");
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "登录已失效" }, 401));

    await expect(apiRequest("/api/protected", { method: "POST" }, true))
      .rejects.toMatchObject({ name: "ApiError", status: 401, message: "登录已失效" });
    expect(new Headers(fetchMock.mock.calls[0][1]?.headers).get("X-InteSchool-CSRF"))
      .toBe("csrf-token");

    fetchMock.mockResolvedValueOnce(jsonResponse({ result: "anonymous" }));
    await expect(rpcCall<string>("school", "listSchools", [])).resolves.toBe("anonymous");
    expect(new Headers(fetchMock.mock.calls[1][1]?.headers).has("X-InteSchool-CSRF")).toBe(false);
  });

  it("uses a status fallback for non-JSON errors", async () => {
    fetchMock.mockResolvedValueOnce(new Response("gateway failure", {
      status: 502,
      headers: { "content-type": "text/plain" },
    }));

    await expect(apiRequest("/api/failure"))
      .rejects.toMatchObject({ status: 502, message: "请求失败（502）" });
  });

  it("serializes RPC calls with and without an authenticated session", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ result: { ok: true } }));
    await expect(rpcCall<{ ok: boolean }>("school", "listSchools", ["南京"]))
      .resolves.toEqual({ ok: true });
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({
      service: "school",
      method: "listSchools",
      args: ["南京"],
    });

    setCsrfToken("rpc-csrf");
    fetchMock.mockResolvedValueOnce(jsonResponse({ result: 3 }));
    await expect(rpcCall<number>("question", "listQuestions", [])).resolves.toBe(3);
    expect(new Headers(fetchMock.mock.calls[1][1]?.headers).get("X-InteSchool-CSRF"))
      .toBe("rpc-csrf");
  });

  it("uploads files as multipart data without forcing JSON content type", async () => {
    setCsrfToken("upload-csrf");
    fetchMock.mockResolvedValueOnce(jsonResponse({
      id: "file-1",
      ownerId: "teacher-1",
      schoolId: "school-1",
      originalName: "lesson.txt",
      mimeType: "text/plain",
      size: 4,
      createdAt: "2026-07-24T00:00:00.000Z",
      url: "/api/files/file-1",
    }));
    const file = new File(["text"], "lesson.txt", { type: "text/plain" });

    const uploaded = await uploadFile(file);

    expect(uploaded.id).toBe("file-1");
    const init = fetchMock.mock.calls[0][1];
    expect(init?.body).toBeInstanceOf(FormData);
    expect(new Headers(init?.headers).has("Content-Type")).toBe(false);
    expect(new Headers(init?.headers).get("X-InteSchool-CSRF")).toBe("upload-csrf");
  });

  it("extracts and imports only server-managed files", async () => {
    await expect(extractStoredFile("https://example.com/file.txt"))
      .rejects.toThrow("该资源不是服务端托管文件");

    fetchMock
      .mockResolvedValueOnce(jsonResponse({ status: "processing" }, 202))
      .mockResolvedValueOnce(jsonResponse({ text: "body", html: "", format: "text", warnings: [] }))
      .mockResolvedValueOnce(jsonResponse({ id: "document-1" }));

    vi.useFakeTimers();
    const extraction = extractStoredFile("/api/files/file-1", { textOnly: true });
    await vi.advanceTimersByTimeAsync(2_000);
    await expect(extraction).resolves.toMatchObject({ text: "body", format: "text" });
    vi.useRealTimers();
    setCsrfToken("import-csrf");
    await expect(importStoredFile<{ id: string }>("file / 1"))
      .resolves.toEqual({ id: "document-1" });

    expect(fetchMock.mock.calls[0][0]).toBe("/api/files/file-1/content?textOnly=1&async=1&retry=1");
    expect(fetchMock.mock.calls[1][0]).toBe("/api/files/file-1/content?textOnly=1&async=1");
    expect(fetchMock.mock.calls[2][0]).toBe("/api/files/file%20%2F%201/import");
    expect(new Headers(fetchMock.mock.calls[2][1]?.headers).get("X-InteSchool-CSRF"))
      .toBe("import-csrf");
  });
});
