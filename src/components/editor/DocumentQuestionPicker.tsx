import { MathHtml } from "@/components/ui/MathHtml";
import { cn } from "@/lib/utils";

export interface DocumentQuestionOption {
  id: string;
  questionId?: string;
  title: string;
}

export interface QuestionSourceDocument {
  id: string;
  title: string;
  questions: DocumentQuestionOption[];
}

interface DocumentQuestionPickerProps {
  documents: QuestionSourceDocument[];
  selectedDocumentId: string | null;
  onDocumentSelect: (documentId: string) => void;
  selectedQuestionIds: string[];
  onSelectionChange: (questionIds: string[]) => void;
  singleSelect?: boolean;
  emptyDocumentsText: string;
}

export function DocumentQuestionPicker({
  documents,
  selectedDocumentId,
  onDocumentSelect,
  selectedQuestionIds,
  onSelectionChange,
  singleSelect = false,
  emptyDocumentsText,
}: DocumentQuestionPickerProps) {
  const selectedDocument = documents.find((document) => document.id === selectedDocumentId);
  const selectableQuestionIds = [...new Set(
    selectedDocument?.questions.flatMap((item) => item.questionId ? [item.questionId] : []) ?? [],
  )];
  const allSelected = selectableQuestionIds.length > 0
    && selectableQuestionIds.every((id) => selectedQuestionIds.includes(id));

  return (
    <div className="grid gap-3 md:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] md:min-h-96">
      <div className="min-w-0 overflow-hidden rounded-lg border border-ink-100 bg-ink-50/40">
        <div className="border-b border-ink-100 px-3 py-2 text-xs font-medium text-ink-600">
          选择文档
        </div>
        <div className="max-h-96 space-y-1 overflow-y-auto p-2">
          {documents.map((document) => (
            <button
              key={document.id}
              type="button"
              onClick={() => onDocumentSelect(document.id)}
              aria-pressed={selectedDocumentId === document.id}
              className={cn(
                "w-full rounded-md border px-3 py-2 text-left text-sm transition-colors",
                selectedDocumentId === document.id
                  ? "border-gold-300 bg-gold-50 text-ink-900"
                  : "border-transparent bg-paper text-ink-700 hover:border-ink-200 hover:bg-mist",
              )}
            >
              <span className="block break-words">{document.title}</span>
              <span className="mt-1 block text-xs text-ink-400">{document.questions.length} 道题目</span>
            </button>
          ))}
          {documents.length === 0 && (
            <div className="py-8 text-center text-sm text-ink-400">{emptyDocumentsText}</div>
          )}
        </div>
      </div>
      <div className="min-w-0 overflow-hidden rounded-lg border border-ink-100 bg-paper">
        {selectedDocument ? (
          <>
            <div className="flex items-center justify-between gap-3 border-b border-ink-100 px-3 py-2">
              <div className="min-w-0">
                <div className="break-words text-sm font-medium text-ink-900">{selectedDocument.title}</div>
                <div className="mt-0.5 text-xs text-ink-500">
                  共 {selectedDocument.questions.length} 题，可添加 {selectableQuestionIds.length} 题
                </div>
              </div>
              {!singleSelect && selectableQuestionIds.length > 0 && (
                <button
                  type="button"
                  onClick={() => onSelectionChange(allSelected ? [] : selectableQuestionIds)}
                  className="shrink-0 text-xs text-gold-700 hover:text-gold-800"
                >
                  {allSelected ? "取消全选" : "全选"}
                </button>
              )}
            </div>
            <div className="max-h-96 space-y-2 overflow-y-auto p-2">
              {selectedDocument.questions.map((item, index) => {
                const checked = Boolean(item.questionId && selectedQuestionIds.includes(item.questionId));
                return (
                  <label
                    key={item.id}
                    className={cn(
                      "flex items-start gap-2 rounded-md border p-3 transition-colors",
                      item.questionId ? "cursor-pointer" : "cursor-not-allowed opacity-60",
                      checked ? "border-gold-300 bg-gold-50/30" : "border-ink-100 hover:bg-mist",
                    )}
                  >
                    <input
                      type={singleSelect ? "radio" : "checkbox"}
                      name={singleSelect ? "source-document-question" : undefined}
                      checked={checked}
                      disabled={!item.questionId}
                      onChange={(event) => {
                        if (!item.questionId) return;
                        if (singleSelect) onSelectionChange([item.questionId]);
                        else onSelectionChange(event.target.checked
                          ? [...selectedQuestionIds, item.questionId]
                          : selectedQuestionIds.filter((id) => id !== item.questionId));
                      }}
                      className="mt-1 shrink-0 rounded border-ink-300 text-gold-500 focus:ring-gold-400"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start gap-1 text-sm text-ink-900">
                        <span className="shrink-0">{index + 1}.</span>
                        <MathHtml className="min-w-0 flex-1">{item.title}</MathHtml>
                      </div>
                      {!item.questionId && (
                        <div className="mt-1 text-xs text-ink-400">该题尚未关联题库，无法直接引用</div>
                      )}
                    </div>
                  </label>
                );
              })}
              {selectedDocument.questions.length === 0 && (
                <div className="py-8 text-center text-sm text-ink-400">该文档暂无符合条件的题目</div>
              )}
            </div>
          </>
        ) : (
          <div className="flex min-h-64 items-center justify-center px-4 text-center text-sm text-ink-400 md:min-h-96">
            点击左侧文档后，在这里选择要添加的题目
          </div>
        )}
      </div>
    </div>
  );
}
