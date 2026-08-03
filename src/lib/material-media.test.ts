import { describe, expect, it } from "vitest";
import { inferMaterialTypeFromFile, isVideoMaterial } from "@/lib/material-media";

describe("material media detection", () => {
  it("recognizes video files even when an existing material was stored as a generic file", () => {
    expect(isVideoMaterial({
      type: "file",
      title: "圆锥讲解.mp4",
      content: "圆锥讲解.mp4",
      fileUrl: "/api/files/opaque-id",
    })).toBe(true);
    expect(isVideoMaterial({
      type: "file",
      title: "讲义附件",
      content: "讲义.pdf",
      fileUrl: "/api/files/lecture.pdf",
    })).toBe(false);
  });

  it("infers the material type from MIME type or file extension", () => {
    expect(inferMaterialTypeFromFile({ name: "lesson.bin", type: "video/mp4" })).toBe("video");
    expect(inferMaterialTypeFromFile({ name: "lesson.webm", type: "" })).toBe("video");
    expect(inferMaterialTypeFromFile({ name: "diagram.png", type: "" })).toBe("image");
    expect(inferMaterialTypeFromFile({ name: "attachment.pdf", type: "application/pdf" })).toBe("file");
  });
});
