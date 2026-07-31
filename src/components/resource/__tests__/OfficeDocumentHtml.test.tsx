import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OfficeDocumentHtml } from "../OfficeDocumentHtml";

const converterMocks = vi.hoisted(() => ({
  convertWmfToDataUrl: vi.fn(),
  convertEmfToDataUrl: vi.fn(),
}));

vi.mock("emf-converter", () => converterMocks);

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  converterMocks.convertWmfToDataUrl.mockReset();
  converterMocks.convertEmfToDataUrl.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("OfficeDocumentHtml", () => {
  it("converts a legacy WMF preview to a browser-safe PNG", async () => {
    fetchMock.mockResolvedValue(new Response(Uint8Array.from([1, 2, 3]), { status: 200 }));
    converterMocks.convertWmfToDataUrl.mockResolvedValue("data:image/png;base64,cG5n");

    const { container } = render(
      <OfficeDocumentHtml
        html={'<p><img src="/api/files/file-1/assets/rIdPreview?officeMetafile=wmf" alt="文档公式" data-office-metafile="wmf"></p>'}
      />,
    );

    const image = container.querySelector("img");
    expect(image).not.toBeNull();
    await waitFor(() => {
      expect(image!).toHaveAttribute("src", "data:image/png;base64,cG5n");
      expect(image!).not.toHaveAttribute("data-office-metafile");
      expect(image!).not.toHaveAttribute("aria-busy");
      expect(image!).not.toHaveAttribute("hidden");
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/files/file-1/assets/rIdPreview?officeMetafile=wmf"),
      expect.objectContaining({ credentials: "same-origin", cache: "force-cache" }),
    );
    expect(converterMocks.convertWmfToDataUrl).toHaveBeenCalledWith(
      expect.any(ArrayBuffer),
      { maxWidth: 2400, maxHeight: 1600, dpiScale: 2 },
    );
    expect(converterMocks.convertEmfToDataUrl).not.toHaveBeenCalled();
  });

  it("replaces an unrenderable metafile with an explicit fallback message", async () => {
    fetchMock.mockResolvedValue(new Response(Uint8Array.from([1, 2, 3]), { status: 200 }));
    converterMocks.convertEmfToDataUrl.mockResolvedValue(null);

    render(
      <OfficeDocumentHtml
        html={'<img src="/api/files/file-1/assets/rIdPreview?officeMetafile=emf" alt="文档公式" data-office-metafile="emf">'}
      />,
    );

    expect(await screen.findByRole("img", { name: "文档公式" })).toHaveTextContent(
      "公式预览不可用：浏览器无法渲染该图元文件",
    );
    expect(screen.queryByRole("img", { name: "文档公式", hidden: true })).toBeInTheDocument();
    expect(converterMocks.convertEmfToDataUrl).toHaveBeenCalledOnce();
  });
});
