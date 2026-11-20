import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { SearchableTree } from "@/components/tree/SearchableTree";
import { includeCurrentDocumentType, type DocumentTypeOption } from "@/hooks/useDocumentTypeOptions";
import { includeCurrentOption } from "@/hooks/useSchoolResourceOptions";
import type { ResourceSemester, TreeNode } from "@/types";
import { knowledgeService } from "@/services/knowledge";
import { lectureService } from "@/services/lecture";
import { examPaperService } from "@/services/examPaper";
import { useAuthStore } from "@/stores/auth";
import { documentDirectoryTree, type DirectoryDocument } from "./document-directory-counts";

export interface DocumentMetadataValue {
  title: string;
  description: string;
  grade: string;
  schoolYear: string;
  semester: ResourceSemester;
  chapterIds: string[];
  knowledgePointIds?: string[];
  thoughtMethodIds?: string[];
  typeId?: string;
}

interface DocumentMetadataModalProps {
  open: boolean;
  onClose: () => void;
  onSave: (value: DocumentMetadataValue) => Promise<void>;
  value: DocumentMetadataValue;
  resourceLabel: "试卷" | "讲义" | "课件";
  gradeOptions: { value: string; label: string }[];
  schoolYearOptions: { value: string; label: string }[];
  semesterOptions: { value: string; label: string }[];
  documentTypeLabel?: "试卷类型" | "讲义类型";
  documentTypeOptions?: DocumentTypeOption[];
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
  documentTypeLabel,
  documentTypeOptions = [],
  chapterTree,
  onChapterTreeChange,
  loading = false,
}: DocumentMetadataModalProps) {
  const [draft, setDraft] = useState(value);
  const [titleError, setTitleError] = useState("");
  const [activeDirectory, setActiveDirectory] = useState<"chapter" | "knowledge" | "method">("chapter");
  const [knowledgeTree, setKnowledgeTree] = useState<TreeNode | null>(null);
  const [methodTree, setMethodTree] = useState<TreeNode | null>(null);
  const [resources, setResources] = useState<DirectoryDocument[] | null>(null);
  const schoolId = useAuthStore((state) => state.teacher?.schoolId);
  const showDirectoryTabs = resourceLabel === "讲义" || resourceLabel === "试卷";

  useEffect(() => {
    if (!open || !showDirectoryTabs || !schoolId) return;
    let cancelled = false;
    setResources(null);
    void Promise.all([
      knowledgeService.getKnowledgeTree(schoolId, false),
      knowledgeService.getMethodTree(schoolId, false),
      resourceLabel === "讲义"
        ? lectureService.listLectures({ schoolId })
        : examPaperService.listPapers({ schoolId }),
    ]).then(([knowledge, method, documents]) => {
      if (cancelled) return;
      setKnowledgeTree(knowledge);
      setMethodTree(method);
      setResources(documents);
    }).catch(() => {
      if (!cancelled) setResources(null);
    });
    return () => { cancelled = true; };
  }, [open, resourceLabel, schoolId, showDirectoryTabs]);

  const directoryTrees = useMemo(() => ({
      chapter: chapterTree && documentDirectoryTree(chapterTree, resources || [], "chapterIds", 3),
      knowledge: knowledgeTree && documentDirectoryTree(knowledgeTree, resources || [], "knowledgePointIds"),
      method: methodTree && documentDirectoryTree(methodTree, resources || [], "thoughtMethodIds"),
  }), [chapterTree, knowledgeTree, methodTree, resources]);

  const handleSave = async () => {
    const title = draft.title.trim();
    if (!title) {
      setTitleError("文档名不能为空");
      return;
    }
    await onSave({ ...draft, title, description: draft.description.trim() });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={`编辑${resourceLabel}属性`}
      description="修改文档名、备注、适用学段和所属章节课目录。"
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
        <Textarea
          label="备注"
          value={draft.description}
          rows={3}
          placeholder="可填写文档用途、内容说明等备注"
          onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))}
        />
        {documentTypeLabel && (
          <Select
            label={documentTypeLabel}
            value={draft.typeId || ""}
            options={[
              { value: "", label: "未指定" },
              ...includeCurrentDocumentType(documentTypeOptions, draft.typeId),
            ]}
            onChange={(event) => setDraft((current) => ({ ...current, typeId: event.target.value }))}
          />
        )}
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
        {showDirectoryTabs && (
          <div role="tablist" aria-label="所属目录" className="grid grid-cols-3 gap-2">
            {([
              ["chapter", "所属章节课目录"],
              ["knowledge", "所属知识点"],
              ["method", "所属思想方法"],
            ] as const).map(([key, label]) => (
              <button key={key} type="button" role="tab" aria-selected={activeDirectory === key}
                onClick={() => setActiveDirectory(key)}
                className={`rounded-lg border px-2 py-3 text-sm font-medium transition-colors ${activeDirectory === key ? "border-gold-400 bg-gold-50 text-gold-800" : "border-ink-150 text-ink-600 hover:bg-mist"}`}>
                {label}
              </button>
            ))}
          </div>
        )}
        <div className="overflow-hidden rounded-lg border border-ink-150">
          {(() => {
            const directory = showDirectoryTabs ? activeDirectory : "chapter";
            const tree = showDirectoryTabs ? directoryTrees[directory] : chapterTree;
            const label = directory === "chapter" ? "所属章节课目录" : directory === "knowledge" ? "所属知识点" : "所属思想方法";
            const idsKey = directory === "chapter" ? "chapterIds" : directory === "knowledge" ? "knowledgePointIds" : "thoughtMethodIds";
            return tree ? (
              <SearchableTree
                key={directory}
                editable={!showDirectoryTabs || directory !== "chapter"}
                data={tree}
                onDataChange={directory === "chapter" ? onChapterTreeChange : directory === "knowledge" ? setKnowledgeTree : setMethodTree}
                title={label}
                accent="gold"
                checkable
                cascadeCheck={false}
                showCount={!showDirectoryTabs || resources !== null}
                checkedIds={draft[idsKey] || []}
                onCheck={(ids) => setDraft((current) => ({ ...current, [idsKey]: ids }))}
                searchPlaceholder={`搜索${label.slice(2)}...`}
                treeMaxHeightClassName="max-h-[320px]"
              />
            ) : <div className="p-6 text-center text-xs text-ink-400">{label}加载失败</div>;
          })()}
        </div>
      </div>
    </Modal>
  );
}
