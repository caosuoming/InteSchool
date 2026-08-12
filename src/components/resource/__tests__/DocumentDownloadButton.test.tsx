import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DocumentDownloadButton } from "../DocumentDownloadButton";

const fetchMock = vi.fn();
const NativeURL = URL;
const createObjectURLMock = vi.fn(() => "blob:download");
const revokeObjectURLMock = vi.fn();

function capabilityResponse(available: boolean, message = "MathType 转换器可用"): Response {
  return new Response(JSON.stringify({
    officeFormulaConversion: { available, message },
    mathTypeFormulaConversion: { available: true, message: "Word 原生公式可转换为可编辑 MathType 对象" },
    mathTypeOriginalDownload: { available: true },
  }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  createObjectURLMock.mockClear();
  revokeObjectURLMock.mockClear();
  class DownloadURL extends NativeURL {
    static createObjectURL = createObjectURLMock;
    static revokeObjectURL = revokeObjectURLMock;
  }
  vi.stubGlobal("URL", DownloadURL);
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("DocumentDownloadButton", () => {
  it("checks capability and requests Office Math when selected", async () => {
    fetchMock
      .mockResolvedValueOnce(capabilityResponse(true))
      .mockResolvedValueOnce(new Response("docx", { status: 200 }));
    render(
      <DocumentDownloadButton
        fileUrl="/api/files/file-1"
        fileName="数学试卷.docx"
        label="下载原稿"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "下载原稿" }));
    expect(screen.getByText("选择数学公式格式")).toBeInTheDocument();
    expect(screen.getByText("MathType")).toBeInTheDocument();

    const officeButton = screen.getByRole("button", { name: /新微软公式/ });
    await waitFor(() => expect(officeButton).toBeEnabled());
    fireEvent.click(officeButton);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenNthCalledWith(
        1,
        "/api/files/formula-capabilities",
        expect.objectContaining({
          credentials: "same-origin",
          signal: expect.any(AbortSignal),
        }),
      );
      expect(fetchMock).toHaveBeenNthCalledWith(
        2,
        "/api/files/file-1?formulaFormat=office",
        { credentials: "same-origin" },
      );
    });
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledOnce();
    expect(createObjectURLMock).toHaveBeenCalled();
  });

  it("disables Office conversion when the server runtime is unavailable", async () => {
    fetchMock
      .mockResolvedValueOnce(capabilityResponse(false, "未安装 mathtype_to_mathml_plus 0.0.16"))
      .mockResolvedValueOnce(new Response("docx", { status: 200 }));
    render(
      <DocumentDownloadButton
        fileUrl="/api/files/file-1"
        fileName="数学试卷.docx"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "下载" }));

    const officeButton = screen.getByRole("button", { name: /新微软公式/ });
    await waitFor(() => expect(officeButton).toBeDisabled());
    expect(screen.getByText("未安装 mathtype_to_mathml_plus 0.0.16")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^MathType 将 Word 原生公式/ }));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenNthCalledWith(
        2,
        "/api/files/file-1?formulaFormat=mathtype",
        { credentials: "same-origin" },
      );
    });
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledOnce();
  });

  it("downloads non-DOCX files directly without showing the chooser", async () => {
    fetchMock.mockResolvedValue(new Response("pdf", { status: 200 }));
    render(
      <DocumentDownloadButton
        fileUrl="/api/files/file-2"
        fileName="讲义.pdf"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "下载" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/files/file-2",
        { credentials: "same-origin" },
      );
    });
    expect(screen.queryByText("选择数学公式格式")).not.toBeInTheDocument();
  });
});
