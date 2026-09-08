import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Courseware } from "@/types";
import type { PptxEmbeddedImage, PptxExtractionOptions } from "@/lib/pptx";

const mocks = vi.hoisted(() => ({
  loadCoursewarePptSlides: vi.fn(),
  uploadFile: vi.fn(),
  convertEmfToDataUrl: vi.fn(),
  convertWmfToDataUrl: vi.fn(),
}));

vi.mock("@/lib/pptx", () => ({
  loadCoursewarePptSlides: mocks.loadCoursewarePptSlides,
}));
vi.mock("../api", () => ({
  rpcCall: vi.fn(),
  uploadFile: mocks.uploadFile,
}));
vi.mock("emf-converter", () => ({
  convertEmfToDataUrl: mocks.convertEmfToDataUrl,
  convertWmfToDataUrl: mocks.convertWmfToDataUrl,
}));

import { loadEditableCoursewarePptSlides } from "../lessonCourseware";

const courseware: Courseware = {
  id: "cw-1",
  teacherId: "teacher-1",
  schoolId: "school-1",
  title: "函数课件",
  chapterIds: [],
  knowledgePointIds: [],
  grade: "高一",
  schoolYear: "2026-2027",
  semester: "上学期",
  type: "ppt",
  content: "",
  fileUrl: "/api/files/source-ppt",
  fileName: "function.pptx",
  tags: [],
  createdAt: "2026-09-08T00:00:00.000Z",
  updatedAt: "2026-09-08T00:00:00.000Z",
};

function image(contentType = "image/png", packagePath = "ppt/media/image1.png"): PptxEmbeddedImage {
  return {
    data: new Uint8Array([1, 2, 3, 4]),
    contentType,
    fileName: packagePath.split("/").at(-1) || "image.png",
    packagePath,
  };
}

async function invokeImageResolver(asset: PptxEmbeddedImage, twice = false) {
  mocks.loadCoursewarePptSlides.mockImplementationOnce(async (_courseware: Courseware, options: PptxExtractionOptions) => {
    const first = await options.imageUrl?.(1, "rId5", asset);
    const second = twice ? await options.imageUrl?.(2, "rId9", asset) : undefined;
    return [{
      title: "第 1 页",
      content: "正文",
      elements: [{ kind: "image", src: first || "", alt: "PPT 图片", x: 10, y: 10, width: 20, height: 20 }],
      ...(second ? { duplicateUrl: second } : {}),
    }];
  });
}

describe("editable PPT image import", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.uploadFile.mockResolvedValue({ url: "/api/files/copied-image" });
  });

  it("copies embedded raster images into teacher-owned file storage and reuses duplicate media", async () => {
    await invokeImageResolver(image(), true);

    const slides = await loadEditableCoursewarePptSlides(courseware);

    expect(mocks.uploadFile).toHaveBeenCalledTimes(1);
    const uploaded = mocks.uploadFile.mock.calls[0][0] as File;
    expect(uploaded.name).toBe("ppt-1-image1.png");
    expect(uploaded.type).toBe("image/png");
    expect(uploaded.size).toBe(4);
    expect(slides[0].elements?.[0]).toMatchObject({
      kind: "image",
      src: "/api/files/copied-image",
    });
  });

  it("rasterizes WMF images to PNG before storing them", async () => {
    await invokeImageResolver(image("image/wmf", "ppt/media/vector.wmf"));
    mocks.convertWmfToDataUrl.mockResolvedValue("data:image/png;base64,AQIDBA==");

    await loadEditableCoursewarePptSlides(courseware);

    expect(mocks.convertWmfToDataUrl).toHaveBeenCalledTimes(1);
    expect(mocks.convertEmfToDataUrl).not.toHaveBeenCalled();
    const uploaded = mocks.uploadFile.mock.calls[0][0] as File;
    expect(uploaded.name).toBe("ppt-1-vector.png");
    expect(uploaded.type).toBe("image/png");
  });
});
