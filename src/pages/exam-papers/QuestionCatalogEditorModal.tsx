import { useEffect, useState } from "react";
import { BookOpen, Lightbulb } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { SearchableTree } from "@/components/tree/SearchableTree";
import { ExtractedQuestionContent } from "./ExtractedQuestionContent";
import { QuestionRemarkControl } from "@/components/editor/QuestionRemarkControl";
import { knowledgeService } from "@/services/knowledge";
import { toast } from "@/stores/ui";
import { cn } from "@/lib/utils";
import type { ExamPaperQuestion, Question, TreeNode } from "@/types";

type CatalogTab = "chapter" | "knowledge" | "method" | "error";

interface Props {
  index: number;
  paperQuestion: ExamPaperQuestion;
  question: Question;
  chapterTree: TreeNode | null;
  knowledgeTree: TreeNode | null;
  onChapterTreeChange: (tree: TreeNode) => void;
  onKnowledgeTreeChange: (tree: TreeNode) => void;
  onUpdateCatalogs: (
    questionId: string,
    chapterIds: string[],
    knowledgePointIds: string[],
    thoughtMethodIds: string[],
    errorReasonIds: string[],
  ) => Promise<void>;
  onQuestionUpdated: (question: Question) => void;
  onClose: () => void;
}

const catalogTabs: { id: CatalogTab; name: string }[] = [
  { id: "chapter", name: "章节课" },
  { id: "knowledge", name: "知识点" },
  { id: "method", name: "思想方法" },
  { id: "error", name: "错因" },
];

/** Both exam-paper modes edit the linked question in the question bank. */
export function QuestionCatalogEditorModal({
  index, paperQuestion, question, chapterTree, knowledgeTree,
  onChapterTreeChange, onKnowledgeTreeChange, onUpdateCatalogs, onQuestionUpdated, onClose,
}: Props) {
  const [activeTab, setActiveTab] = useState<CatalogTab>("chapter");
  const [chapterIds, setChapterIds] = useState([...question.chapterIds]);
  const [knowledgeIds, setKnowledgeIds] = useState([...question.knowledgePointIds]);
  const [methodIds, setMethodIds] = useState([...(question.thoughtMethodIds || [])]);
  const [errorIds, setErrorIds] = useState([...(question.errorReasonIds || [])]);
  const [methodTree, setMethodTree] = useState<TreeNode | null>(null);
  const [errorTree, setErrorTree] = useState<TreeNode | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.all([
      knowledgeService.getMethodTree(question.teacherId),
      knowledgeService.getErrorReasonTree(question.teacherId),
    ]).then(([methods, errors]) => {
      if (active) {
        setMethodTree(methods);
        setErrorTree(errors);
      }
    }).catch((error) => {
      if (active) toast.error("加载题目目录失败", error instanceof Error ? error.message : undefined);
    });
    return () => { active = false; };
  }, [question.teacherId]);

  const counts: Record<CatalogTab, number> = {
    chapter: chapterIds.length,
    knowledge: knowledgeIds.length,
    method: methodIds.length,
    error: errorIds.length,
  };
  const save = async () => {
    setSaving(true);
    try {
      await onUpdateCatalogs(question.id, chapterIds, knowledgeIds, methodIds, errorIds);
      onClose();
    } catch {
      // The caller displays the save error. Preserve drafts so the user can retry.
    } finally {
      setSaving(false);
    }
  };
  const tree = activeTab === "chapter" ? chapterTree
    : activeTab === "knowledge" ? knowledgeTree
    : activeTab === "method" ? methodTree : errorTree;
  const currentIds = activeTab === "chapter" ? chapterIds
    : activeTab === "knowledge" ? knowledgeIds
    : activeTab === "method" ? methodIds : errorIds;
  const setIds = activeTab === "chapter" ? setChapterIds
    : activeTab === "knowledge" ? setKnowledgeIds
    : activeTab === "method" ? setMethodIds : setErrorIds;
  const setTree = activeTab === "chapter" ? onChapterTreeChange
    : activeTab === "knowledge" ? onKnowledgeTreeChange
    : activeTab === "method" ? setMethodTree : setErrorTree;
  const name = catalogTabs.find((tab) => tab.id === activeTab)!.name;

  return (
    <Modal open onClose={onClose} size="xl" title={`编辑第 ${index + 1} 题章节课和知识点`}
      description="左侧查看完整题目，右侧切换属性目录。修改将同步保存到题库原题。"
      footer={<>
        <Button variant="ghost" onClick={onClose} disabled={saving}>取消</Button>
        <Button variant="gold" onClick={() => void save()} loading={saving}>保存</Button>
      </>}>
      <div className="space-y-4" data-testid="question-catalog-editor">
        <QuestionRemarkControl
          question={question}
          onUpdated={onQuestionUpdated}
          className="rounded-lg border border-ink-100 bg-ink-50/40 p-3"
        />
        <div className="grid gap-4 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <section className="min-w-0 rounded-lg border border-ink-100 bg-white p-4" aria-label="完整题目">
            <div className="mb-3 text-sm font-semibold text-ink-800">题目内容</div>
            <ExtractedQuestionContent
              number={index + 1}
              questionType={paperQuestion.type || question.type}
              stem={paperQuestion.stem || question.stem}
              options={paperQuestion.options?.length ? paperQuestion.options : question.options}
              answer={paperQuestion.answer || question.answer}
              analysis={paperQuestion.analysis || question.analysis}
              optionVariant="plain"
            />
          </section>
          <section className="min-w-0 rounded-lg border border-ink-100 p-3" aria-label="题目属性目录">
            <div className="mb-3 grid grid-cols-2 gap-2" role="tablist" aria-label="题目属性分类">
              {catalogTabs.map((tab) => (
                <button key={tab.id} type="button" role="tab"
                  id={`question-catalog-tab-${tab.id}`}
                  aria-selected={activeTab === tab.id}
                  aria-controls="question-catalog-tabpanel"
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    "rounded-lg border px-2 py-2 text-left text-xs transition-colors",
                    activeTab === tab.id
                      ? "border-gold-400 bg-gold-50 font-semibold text-gold-800"
                      : "border-ink-100 bg-ink-50/40 text-ink-600 hover:border-gold-200",
                  )}>
                  {tab.name} <span className="text-ink-400">({counts[tab.id]})</span>
                </button>
              ))}
            </div>
            <div id="question-catalog-tabpanel" role="tabpanel"
              aria-labelledby={`question-catalog-tab-${activeTab}`}>
              <div className="mb-2 flex items-center gap-2 text-sm font-medium text-ink-800">
                {activeTab === "chapter" ? <BookOpen className="h-4 w-4 text-gold-600" /> : <Lightbulb className="h-4 w-4 text-teal-600" />}
                {name}目录
              </div>
              {tree ? (
                <SearchableTree editable data={tree} onDataChange={setTree}
                  title={`${name}目录`} accent={activeTab === "chapter" ? "gold" : "teal"}
                  checkable checkedIds={currentIds} onCheck={setIds}
                  expandLevel={2} searchPlaceholder={`搜索${name}...`}
                  showHeader={false} treeMaxHeightClassName="max-h-[420px]" />
              ) : <div className="py-8 text-center text-xs text-ink-400">{name}目录加载中...</div>}
            </div>
          </section>
        </div>
      </div>
    </Modal>
  );
}
