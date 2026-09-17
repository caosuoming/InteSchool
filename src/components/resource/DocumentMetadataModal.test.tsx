import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DocumentMetadataModal } from "@/components/resource/DocumentMetadataModal";

describe("DocumentMetadataModal", () => {
  it("edits title, remark, learning stage and chapter metadata for courseware", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);

    render(
      <DocumentMetadataModal
        open
        onClose={vi.fn()}
        onSave={onSave}
        resourceLabel="课件"
        value={{
          title: "原课件名",
          description: "原备注",
          grade: "高一",
          schoolYear: "2026-2027",
          semester: "上学期",
          chapterIds: ["chapter-1"],
        }}
        gradeOptions={[{ value: "高一", label: "高一" }, { value: "高二", label: "高二" }]}
        schoolYearOptions={[{ value: "2026-2027", label: "2026-2027" }]}
        semesterOptions={[{ value: "上学期", label: "上学期" }, { value: "下学期", label: "下学期" }]}
        chapterTree={null}
      />,
    );

    expect(screen.getByText("编辑课件属性")).toBeInTheDocument();
    expect(screen.getByText("修改文档名、备注、适用学段和所属章节课目录。")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("文档名"), { target: { value: "  新课件名  " } });
    fireEvent.change(screen.getByLabelText("备注"), { target: { value: "  课堂演示使用  " } });
    fireEvent.change(screen.getByLabelText("年级"), { target: { value: "高二" } });
    fireEvent.change(screen.getByLabelText("学期"), { target: { value: "下学期" } });
    fireEvent.click(screen.getByRole("button", { name: "保存文档属性" }));

    await waitFor(() => expect(onSave).toHaveBeenCalledWith({
      title: "新课件名",
      description: "课堂演示使用",
      grade: "高二",
      schoolYear: "2026-2027",
      semester: "下学期",
      chapterIds: ["chapter-1"],
    }));
  });

  it.each([
    {
      resourceLabel: "试卷" as const,
      documentTypeLabel: "试卷类型" as const,
      initialTypeId: "weekly",
      nextTypeId: "monthly",
      options: [
        { value: "weekly", label: "周练" },
        { value: "monthly", label: "月考" },
      ],
    },
    {
      resourceLabel: "讲义" as const,
      documentTypeLabel: "讲义类型" as const,
      initialTypeId: "lesson-plan",
      nextTypeId: "tutorial",
      options: [
        { value: "lesson-plan", label: "教案" },
        { value: "tutorial", label: "辅导训练" },
      ],
    },
  ])("edits $documentTypeLabel for $resourceLabel metadata", async ({
    resourceLabel,
    documentTypeLabel,
    initialTypeId,
    nextTypeId,
    options,
  }) => {
    const onSave = vi.fn().mockResolvedValue(undefined);

    render(
      <DocumentMetadataModal
        open
        onClose={vi.fn()}
        onSave={onSave}
        resourceLabel={resourceLabel}
        value={{
          title: `原${resourceLabel}名`,
          description: "",
          grade: "高一",
          schoolYear: "2026-2027",
          semester: "上学期",
          chapterIds: [],
          typeId: initialTypeId,
        }}
        gradeOptions={[{ value: "高一", label: "高一" }]}
        schoolYearOptions={[{ value: "2026-2027", label: "2026-2027" }]}
        semesterOptions={[{ value: "上学期", label: "上学期" }]}
        documentTypeLabel={documentTypeLabel}
        documentTypeOptions={options}
        chapterTree={null}
      />,
    );

    fireEvent.change(screen.getByLabelText(documentTypeLabel), { target: { value: nextTypeId } });
    fireEvent.click(screen.getByRole("button", { name: "保存文档属性" }));

    await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      typeId: nextTypeId,
    })));
  });
});
