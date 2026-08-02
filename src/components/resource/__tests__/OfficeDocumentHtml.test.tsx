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
  it("applies bounded document preview image styling", () => {
    const { container } = render(
      <OfficeDocumentHtml
        html={'<img src="/api/files/file-1/assets/rIdImage" alt="文档图片">'}
      />,
    );

    expect(container.firstElementChild).toHaveClass("document-preview-content");
  });

  it("converts a legacy WMF preview to a browser-safe PNG", async () => {
    fetchMock.mockResolvedValue(
      new Response(Uint8Array.from([1, 2, 3]), { status: 200 }),
    );
    converterMocks.convertWmfToDataUrl.mockResolvedValue(
      "data:image/png;base64,cG5n",
    );

    const { container } = render(
      <OfficeDocumentHtml
        html={
          '<p><img src="/api/files/file-1/assets/rIdPreview?officeMetafile=wmf&officeWidth=96&officeHeight=24" alt="文档公式" data-office-metafile="wmf" data-office-width="96" data-office-height="24"></p>'
        }
      />,
    );

    const image = container.querySelector("img");
    expect(image).not.toBeNull();
    await waitFor(() => {
      expect(image!).toHaveAttribute("src", "data:image/png;base64,cG5n");
      expect(image!).not.toHaveAttribute("data-office-metafile");
      expect(image!).not.toHaveAttribute("aria-busy");
      expect(image!).not.toHaveAttribute("hidden");
      expect(image!).toHaveStyle({
        width: "96px",
        maxWidth: "100%",
        height: "auto",
        aspectRatio: "96 / 24",
        objectFit: "contain",
      });
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining(
        "/api/files/file-1/assets/rIdPreview?officeMetafile=wmf&officeWidth=96&officeHeight=24",
      ),
      expect.objectContaining({
        credentials: "same-origin",
        cache: "force-cache",
      }),
    );
    expect(converterMocks.convertWmfToDataUrl).toHaveBeenCalledWith(
      expect.any(ArrayBuffer),
      { maxWidth: 192, maxHeight: 64, dpiScale: 2 },
    );
    expect(converterMocks.convertEmfToDataUrl).not.toHaveBeenCalled();
  });

  it("replaces an unrenderable metafile with an explicit fallback message", async () => {
    fetchMock.mockResolvedValue(
      new Response(Uint8Array.from([1, 2, 3]), { status: 200 }),
    );
    converterMocks.convertEmfToDataUrl.mockResolvedValue(null);

    render(
      <OfficeDocumentHtml
        html={
          '<img src="/api/files/file-1/assets/rIdPreview?officeMetafile=emf" alt="文档公式" data-office-metafile="emf">'
        }
      />,
    );

    expect(
      await screen.findByRole("img", { name: "文档公式" }),
    ).toHaveTextContent("公式预览不可用：浏览器无法渲染该图元文件");
    expect(
      screen.queryByRole("img", { name: "文档公式", hidden: true }),
    ).toBeInTheDocument();
    expect(converterMocks.convertEmfToDataUrl).toHaveBeenCalledWith(
      expect.any(ArrayBuffer),
      { maxWidth: 1_200, maxHeight: 800, dpiScale: 2 },
    );
  });
});
