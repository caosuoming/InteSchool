import { describe, expect, it } from "vitest";
import { assertMathCoursewareUpload } from "./math-courseware-rules.js";

describe("math courseware upload rules", () => {
  it("accepts math PPT uploads and platform-generated decks without uploaded files", () => {
    expect(() => assertMathCoursewareUpload("数学", "ppt", "/api/files/1", "slides.pptx")).not.toThrow();
    expect(() => assertMathCoursewareUpload("数学", "other", undefined)).not.toThrow();
  });

  it("rejects non-PPT math uploads, including mislabeled files", () => {
    expect(() => assertMathCoursewareUpload("数学", "ggb", "/api/files/1", "circle.ggb")).toThrow(/素材库/);
    expect(() => assertMathCoursewareUpload("数学", "ppt", "/api/files/1", "animation.html")).toThrow(/素材库/);
    expect(() => assertMathCoursewareUpload("数学", "video", "/api/files/1", "movie.mp4")).toThrow(/素材库/);
  });

  it("does not change non-math courseware upload behavior", () => {
    expect(() => assertMathCoursewareUpload("物理", "ggb", "/api/files/1", "circle.ggb")).not.toThrow();
  });
});
