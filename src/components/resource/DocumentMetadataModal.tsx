import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { SearchableTree } from "@/components/tree/SearchableTree";
import { includeCurrentOption } from "@/hooks/useSchoolResourceOptions";
import type { ResourceSemester, TreeNode } from "@/types";

export interface DocumentMetadataValue {
  title: string;
  grade: string;
  schoolYear: string;
  semester: ResourceSemester;
  chapterIds: string[];
}

interface DocumentMetadataModalProps {
  open: boolean;
  onClose: () => void;
  onSave: (value: DocumentMetadataValue) => Promise<void>;
  value: DocumentMetadataValue;
  resourceLabel: "试卷" | "讲义";
  gradeOptions: { value: string; label: string }[];
  schoolYearOptions: { value: string; label: string }[];
  semesterOptions: { value: string; label: string }[];
  chapterTree: TreeNode | null;
  onChapterTreeChange?: (tree: TreeNode) => void;
  loading?: boolean;
}

export function DocumentMetadataModal({
  open,
  onClose,
  onSave,
  value,
  resourceLabel,
  gradeOptions,
  schoolYearOptions,
  semesterOptions,
  chapterTree,
  onChapterTreeChange,
  loading = false,
}: DocumentMetadataModalProps) {
  const [draft, setDraft] = useState(value);
  const [titleError, setTitleError] = useState("");

  const handleSave = async () => {
    const title = draft.title.trim();
    if (!title) {
      setTitleError("文档名不能为空");
      return;
    }
    await onSave({ ...draft, title });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={`编辑${resourceLabel}属性`}
      description="修改文档名、适用学段和所属章节课目录。"
      footer={(
        <div className="flex w-full justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose} disabled={loading}>取消</Button>
          <Button variant="gold" size="sm" onClick={() => void handleSave()} loading={loading}>
            保存文档属性
          </Button>
        </div>
      )}
    >
      <div className="space-y-4">
        <Input
          label="文档名"
          value={draft.title}
          error={titleError}
          onChange={(event) => {
            setDraft((current) => ({ ...current, title: event.target.value }));
            if (titleError) setTitleError("");
          }}
        />
        <div className="grid gap-3 sm:grid-cols-3">
          <Select
            label="年级"
            value={draft.grade}
            options={[{ value: "", label: "未设置" }, ...includeCurrentOption(gradeOptions, draft.grade)]}
            onChange={(event) => setDraft((current) => ({ ...current, grade: event.target.value }))}
          />
          <Select
            label="学年"
            value={draft.schoolYear}
            options={[{ value: "", label: "未设置" }, ...includeCurrentOption(schoolYearOptions, draft.schoolYear)]}
            onChange={(event) => setDraft((current) => ({ ...current, schoolYear: event.target.value }))}
          />
          <Select
            label="学期"
            value={draft.semester}
            options={semesterOptions}
            onChange={(event) => setDraft((current) => ({
              ...current,
              semester: event.target.value as ResourceSemester,
            }))}
          />
        </div>
        <div className="overflow-hidden rounded-lg border border-ink-150">
          {chapterTree ? (
            <SearchableTree
              editable
              data={chapterTree}
              onDataChange={onChapterTreeChange}
              title="所属章节课目录"
              accent="gold"
              checkable
              checkedIds={draft.chapterIds}
              onCheck={(chapterIds) => setDraft((current) => ({ ...current, chapterIds }))}
              searchPlaceholder="搜索章节课..."
              treeMaxHeightClassName="max-h-[320px]"
            />
          ) : (
            <div className="p-6 text-center text-xs text-ink-400">章节课目录加载失败</div>
          )}
        </div>
      </div>
    </Modal>
  );
}
