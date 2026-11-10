import { afterEach, describe, expect, it, vi } from "vitest";
import { saveVectorExamPdf } from "./exam-vector-pdf";

const mocks = vi.hoisted(() => ({
  embedFont: vi.fn(),
  registerFontkit: vi.fn(),
  save: vi.fn(),
}));

vi.mock("pdf-lib", () => ({
  PDFDocument: {
    create: async () => ({
      registerFontkit: mocks.registerFontkit,
      embedFont: mocks.embedFont,
      save: mocks.save,
    }),
  },
  rgb: vi.fn(),
}));
vi.mock("@pdf-lib/fontkit", () => ({ default: {} }));

describe("exam vector PDF font embedding", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("embeds the entire CFF Chinese font to preserve glyphs in PDF viewers", async () => {
    const fontBytes = new Uint8Array([79, 84, 84, 79]).buffer;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => fontBytes,
    }));
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn(() => "blob:exam-pdf"),
      revokeObjectURL: vi.fn(),
    });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    vi.spyOn(globalThis, "setTimeout").mockImplementation(() => 1 as ReturnType<typeof setTimeout>);
    mocks.save.mockResolvedValue(new Uint8Array([37, 80, 68, 70]));
    await saveVectorExamPdf([], "中文文件名", 210, 297);
    expect(mocks.embedFont).toHaveBeenCalledWith(fontBytes, { subset: false });
    expect(mocks.save).toHaveBeenCalledOnce();
    expect(document.body.querySelector('[aria-hidden="true"][style*="-100000px"]')).toBeNull();
  });
});
