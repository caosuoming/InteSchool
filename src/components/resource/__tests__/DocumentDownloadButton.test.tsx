import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DocumentDownloadButton } from "../DocumentDownloadButton";

const fetchMock = vi.fn();
const NativeURL = URL;
const createObjectURLMock = vi.fn(() => "blob:download");
const revokeObjectURLMock = vi.fn();

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
  it("asks for a DOCX formula format and requests Office Math when selected", async () => {
    fetchMock.mockResolvedValue(new Response("docx", { status: 200 }));
    render(
      <DocumentDownloadButton
        fileUrl="/api/files/file-1"
        fileName="数学试卷.docx"
        label="下载原稿"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "下载原稿" }));
    expect(screen.getByText("选择数学公式格式")).toBeInTheDocument();
    expect(screen.getByText("新微软公式")).toBeInTheDocument();
    expect(screen.getByText("MathType")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /新微软公式/ }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/files/file-1?formulaFormat=office",
        { credentials: "same-origin" },
      );
    });
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledOnce();
    expect(createObjectURLMock).toHaveBeenCalled();
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
