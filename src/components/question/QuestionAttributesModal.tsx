import { useEffect, useState } from "react";
import { useQuestionTypeOptions, includeCurrentQuestionType } from "@/hooks/useQuestionTypeOptions";
import { includeCurrentOption, useSchoolResourceOptions } from "@/hooks/useSchoolResourceOptions";
import { includeCurrentMetadataOption, useQuestionMetadataOptions } from "@/hooks/useQuestionMetadataOptions";
import { questionService } from "@/services/question";
import { knowledgeService } from "@/services/knowledge";
import { SearchableTree } from "@/components/tree/SearchableTree";
import { toast } from "@/stores/ui";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import type { Question, ResourceSemester, TreeNode } from "@/types";

type QuestionAttributes = Pick<Question, "type" | "difficulty" | "recommendation"> & {
  grade: string;
  schoolYear: string;
  semester: ResourceSemester;
  category: string;
  sourceType: string;
  chapterIds: string[];
  knowledgePointIds: string[];
};

export function QuestionAttributesModal({ question, schoolId, onClose, onUpdated }: {
  question: Question;
  schoolId?: string;
  onClose: () => void;
  onUpdated: (question: Question) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<QuestionAttributes>({
    type: question.type,
    difficulty: question.difficulty,
    recommendation: question.recommendation,
    grade: question.grade || "",
    schoolYear: question.schoolYear || "",
    semester: question.semester || "上学期",
    category: question.category || "",
    sourceType: question.sourceType || "",
    chapterIds: [...question.chapterIds],
    knowledgePointIds: [...question.knowledgePointIds],
  });
  const [chapterTree, setChapterTree] = useState<TreeNode | null>(null);
  const [knowledgeTree, setKnowledgeTree] = useState<TreeNode | null>(null);
  useEffect(() => {
    if (!schoolId) return;
    let active = true;
    void knowledgeService.getChapterTree(schoolId).then((tree) => { if (active) setChapterTree(tree); }).catch(() => {});
    void knowledgeService.getKnowledgeTree(schoolId).then((tree) => { if (active) setKnowledgeTree(tree); }).catch(() => {});
    return () => { active = false; };
  }, [schoolId]);
  const { options: questionTypes } = useQuestionTypeOptions(schoolId, question.subject);
  const { gradeOptions, schoolYearOptions, semesterOptions } = useSchoolResourceOptions(schoolId);
  const { categoryOptions, sourceOptions } = useQuestionMetadataOptions(schoolId);

  const save = async () => {
    setSaving(true);
    try {
      const updated = await questionService.updateQuestion(question.id, draft);
      onUpdated(updated);
      onClose();
      toast.success("题目属性已更新");
    } catch (error) {
      toast.error("更新题目属性失败", error instanceof Error ? error.message : undefined);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open onClose={onClose} size="lg" title="编辑题目属性"
      description="修改题型、分类和基本属性，不改变题目内容或文档编排。"
      footer={<div className="flex justify-end gap-2">
        <Button variant="outline" disabled={saving} onClick={onClose}>取消</Button>
        <Button variant="gold" loading={saving} onClick={() => void save()}>保存属性</Button>
      </div>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Select label="题型" value={draft.type}
          options={includeCurrentQuestionType(questionTypes, draft.type)}
          onChange={(event) => setDraft((value) => ({ ...value, type: event.target.value as Question["type"] }))} />
        <Select label="难度" value={String(draft.difficulty)}
          options={[1, 2, 3, 4, 5].map((value) => ({ value: String(value), label: `${value} / 5` }))}
          onChange={(event) => setDraft((value) => ({ ...value, difficulty: Number(event.target.value) as Question["difficulty"] }))} />
        <Select label="推荐程度" value={String(draft.recommendation)}
          options={[1, 2, 3, 4, 5].map((value) => ({ value: String(value), label: `${value} / 5` }))}
          onChange={(event) => setDraft((value) => ({ ...value, recommendation: Number(event.target.value) as Question["recommendation"] }))} />
        <Select label="年级" value={draft.grade}
          options={[{ value: "", label: "未设置" }, ...includeCurrentOption(gradeOptions, draft.grade)]}
          onChange={(event) => setDraft((value) => ({ ...value, grade: event.target.value }))} />
        <Select label="学年" value={draft.schoolYear}
          options={[{ value: "", label: "未设置" }, ...includeCurrentOption(schoolYearOptions, draft.schoolYear)]}
          onChange={(event) => setDraft((value) => ({ ...value, schoolYear: event.target.value }))} />
        <Select label="学期" value={draft.semester} options={semesterOptions}
          onChange={(event) => setDraft((value) => ({ ...value, semester: event.target.value as ResourceSemester }))} />
        <Select label="题类" value={draft.category}
          options={[{ value: "", label: "未设置" }, ...includeCurrentMetadataOption(categoryOptions, draft.category)]}
          onChange={(event) => setDraft((value) => ({ ...value, category: event.target.value }))} />
        <Select label="来源" value={draft.sourceType}
          options={[{ value: "", label: "未设置" }, ...includeCurrentMetadataOption(sourceOptions, draft.sourceType)]}
          onChange={(event) => setDraft((value) => ({ ...value, sourceType: event.target.value }))} />
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {chapterTree && (
          <SearchableTree editable data={chapterTree} onDataChange={setChapterTree}
            title="章节目录" accent="gold" checkable checkedIds={draft.chapterIds}
            onCheck={(chapterIds) => setDraft((value) => ({ ...value, chapterIds }))}
            searchPlaceholder="搜索章节..." treeMaxHeightClassName="max-h-[240px]" />
        )}
        {knowledgeTree && (
          <SearchableTree editable data={knowledgeTree} onDataChange={setKnowledgeTree}
            title="知识点目录" accent="teal" checkable checkedIds={draft.knowledgePointIds}
            onCheck={(knowledgePointIds) => setDraft((value) => ({ ...value, knowledgePointIds }))}
            searchPlaceholder="搜索知识点..." treeMaxHeightClassName="max-h-[240px]" />
        )}
      </div>
    </Modal>
  );
}
