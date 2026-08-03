import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QuestionVideoModal } from "@/components/question/QuestionVideoModal";
import { materialService } from "@/services/material";
import type { Material } from "@/types";

vi.mock("@/services/api", () => ({
  uploadFile: vi.fn(),
}));

vi.mock("@/services/material", () => ({
  materialService: {
    listMaterials: vi.fn(),
    createMaterial: vi.fn(),
    updateMaterial: vi.fn(),
  },
}));

vi.mock("@/services/question", () => ({
  questionService: {
    updateQuestion: vi.fn(),
  },
}));

vi.mock("@/stores/ui", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const knowledgeBlock: Material = {
  id: "knowledge-1",
  teacherId: "teacher-1",
  schoolId: "school-1",
  title: "圆锥知识块",
  description: "圆锥的基础知识",
  chapterIds: ["chapter-1"],
  knowledgePointIds: ["point-1"],
  grade: "高一",
  schoolYear: "2026-2027",
  semester: "上学期",
  type: "knowledgeBlock",
  content: "圆锥的定义与性质",
  tags: [],
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
};

const videoStoredAsFile: Material = {
  ...knowledgeBlock,
  id: "video-1",
  title: "圆锥讲解.mp4",
  type: "file",
  content: "圆锥讲解.mp4",
  fileUrl: "/api/files/video-1",
};

const pdfMaterial: Material = {
  ...knowledgeBlock,
  id: "pdf-1",
  title: "圆锥讲义.pdf",
  type: "file",
  content: "圆锥讲义.pdf",
  fileUrl: "/api/files/pdf-1",
};

describe("QuestionVideoModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("links a material-library video file to a knowledge block", async () => {
    vi.mocked(materialService.listMaterials).mockResolvedValue([
      videoStoredAsFile,
      pdfMaterial,
    ]);
    const updated = {
      ...knowledgeBlock,
      explanationVideo: {
        materialId: videoStoredAsFile.id,
        title: videoStoredAsFile.title,
        fileUrl: videoStoredAsFile.fileUrl,
        content: videoStoredAsFile.content,
      },
    };
    vi.mocked(materialService.updateMaterial).mockResolvedValue(updated);
    const onMaterialSaved = vi.fn();

    render(
      <QuestionVideoModal
        open
        question={null}
        material={knowledgeBlock}
        teacherId="teacher-1"
        schoolId="school-1"
        onClose={vi.fn()}
        onMaterialSaved={onMaterialSaved}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole("option", { name: "圆锥讲解.mp4" })).toBeInTheDocument();
    });
    expect(screen.queryByRole("option", { name: "圆锥讲义.pdf" })).not.toBeInTheDocument();
    expect(screen.getByText("素材库中共 1 个视频")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("从素材库选择"), {
      target: { value: videoStoredAsFile.id },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存讲解视频" }));

    await waitFor(() => {
      expect(materialService.updateMaterial).toHaveBeenCalledWith(knowledgeBlock.id, {
        explanationVideo: {
          materialId: videoStoredAsFile.id,
          title: videoStoredAsFile.title,
          fileUrl: videoStoredAsFile.fileUrl,
          content: videoStoredAsFile.content,
        },
      });
      expect(onMaterialSaved).toHaveBeenCalledWith(updated);
    });
  });
});
