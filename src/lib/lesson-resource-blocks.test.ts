import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Lecture } from "@/types";
import { extractStoredFile } from "@/services/api";
import { fallbackLessonBlocks } from "./lesson-resource-blocks";

vi.mock("@/services/api", () => ({ extractStoredFile: vi.fn() }));

const lecture = {
  id: "lecture-word",
  title: "双曲线及其标准方程",
  originalFileUrl: "/api/files/lecture-word",
  sections: [],
} as Lecture;

describe("fallbackLessonBlocks", () => {
  beforeEach(() => {
    vi.mocked(extractStoredFile).mockReset();
  });

  it("extracts Word text without expensive preview HTML when sending a lecture to class", async () => {
    vi.mocked(extractStoredFile).mockResolvedValue({
      text: "双曲线的定义与标准方程。\n\n双曲线有两个焦点。",
      html: "",
      format: "docx",
      warnings: [],
    });

    const blocks = await fallbackLessonBlocks(lecture, "lecture", "数学");
    expect(extractStoredFile).toHaveBeenCalledWith("/api/files/lecture-word", { textOnly: true });
    expect(blocks.some((block) => block.type === "knowledge" || block.type === "question")).toBe(true);
  });

  it("accepts older lectures with a null sections field and preserves plain text", async () => {
    vi.mocked(extractStoredFile).mockResolvedValue({
      text: "这是教师上传的课堂讲义正文。",
      html: "",
      format: "docx",
      warnings: [],
    });

    const blocks = await fallbackLessonBlocks({
      ...lecture,
      sections: null as unknown as Lecture["sections"],
    }, "lecture");
    expect(blocks.some((block) => block.type === "knowledge")).toBe(true);
  });

  it("does not re-extract a lecture that already has editable knowledge", async () => {
    const blocks = await fallbackLessonBlocks({
      ...lecture,
      sections: [{ id: "s1", type: "knowledge", title: "定义", content: "双曲线", children: [] }],
    }, "lecture");
    expect(blocks).toEqual([]);
    expect(extractStoredFile).not.toHaveBeenCalled();
  });

  it("explains an empty or unreadable Word file instead of throwing a TypeError", async () => {
    vi.mocked(extractStoredFile).mockResolvedValue({
      text: null as unknown as string,
      html: "",
      format: "docx",
      warnings: [],
    });
    await expect(fallbackLessonBlocks(lecture, "lecture"))
      .rejects.toThrow("原稿没有可读取的文字内容");
  });
});
