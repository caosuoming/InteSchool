import { useEffect, useState } from "react";
import { useAuthStore } from "@/stores/auth";
import { questionService } from "@/services/question";
import { knowledgeService } from "@/services/knowledge";
import { analyticsService } from "@/services/analytics";
import { toast } from "@/stores/ui";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Textarea } from "@/components/ui/Input";
import { Edit3, Save, BookOpen, Lightbulb, BarChart3, Users, Plus, Trash2, Clock } from "lucide-react";
import type { Question, Chapter, KnowledgePoint, QuestionRemark } from "@/types";
import { formatDate } from "@/lib/service-utils";
import { cn } from "@/lib/utils";
import { MathHtml } from "@/components/ui/MathHtml";
import { QuestionSupplementaryDetails } from "@/components/question/QuestionSupplementaryDetails";
import { useQuestionTypeOptions } from "@/hooks/useQuestionTypeOptions";

const difficultyLabel = ["", "简单", "较易", "中等", "较难", "困难"];

interface QuestionDetailProps {
  question: Question;
  onUpdated?: (q: Question) => void;
}

export function QuestionDetail({ question, onUpdated }: QuestionDetailProps) {
  const { teacher } = useAuthStore();
  const { getLabel: getQuestionTypeLabel } = useQuestionTypeOptions(teacher?.schoolId);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [points, setPoints] = useState<KnowledgePoint[]>([]);
  const [remarks, setRemarks] = useState<QuestionRemark[]>([]);
  const [addingRemark, setAddingRemark] = useState(false);
  const [newRemarkContent, setNewRemarkContent] = useState("");
  const [editingRemarkId, setEditingRemarkId] = useState<string | null>(null);
  const [editingRemarkContent, setEditingRemarkContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [studentStats, setStudentStats] = useState<{ total: number; correct: number } | null>(null);

  useEffect(() => {
    setRemarks(question.remarks || []);
    setAddingRemark(false);
    setEditingRemarkId(null);
    setNewRemarkContent("");
    if (teacher) {
      knowledgeService.listChapters(teacher.schoolId!).then(setChapters);
      knowledgeService.listKnowledgePoints(teacher.schoolId!).then(setPoints);
    }
    analyticsService.listAnswerRecordsByQuestion(question.id).then((records) => {
      const correct = records.filter((r) => r.isCorrect).length;
      setStudentStats({ total: records.length, correct });
    });
  }, [question, teacher]);

  const handleAddRemark = async () => {
    if (!newRemarkContent.trim()) return;
    setSaving(true);
    try {
      const remark = await questionService.addRemark(question.id, newRemarkContent.trim());
      setRemarks((prev) => [...prev, remark]);
      setNewRemarkContent("");
      setAddingRemark(false);
      toast.success("备注已添加");
      const updated = await questionService.getQuestion(question.id);
      if (updated) onUpdated?.(updated);
    } catch (e: any) {
      toast.error("添加失败", e?.message);
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateRemark = async (remarkId: string) => {
    if (!editingRemarkContent.trim()) return;
    setSaving(true);
    try {
      const updated = await questionService.updateRemark(question.id, remarkId, editingRemarkContent.trim());
      setRemarks((prev) => prev.map((r) => (r.id === remarkId ? updated : r)));
      setEditingRemarkId(null);
      toast.success("备注已更新");
      const q = await questionService.getQuestion(question.id);
      if (q) onUpdated?.(q);
    } catch (e: any) {
      toast.error("更新失败", e?.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteRemark = async (remarkId: string) => {
    setSaving(true);
    try {
      await questionService.deleteRemark(question.id, remarkId);
      setRemarks((prev) => prev.filter((r) => r.id !== remarkId));
      toast.success("备注已删除");
      const q = await questionService.getQuestion(question.id);
      if (q) onUpdated?.(q);
    } catch (e: any) {
      toast.error("删除失败", e?.message);
    } finally {
      setSaving(false);
    }
  };

  const chapterNames = chapters
    .filter((c) => question.chapterIds.includes(c.id))
    .map((c) => c.name);
  const pointNames = points
    .filter((p) => question.knowledgePointIds.includes(p.id))
    .map((p) => p.name);

  const correctRate = studentStats && studentStats.total > 0
    ? Math.round((studentStats.correct / studentStats.total) * 100)
    : null;

  return (
    <div className="space-y-5">
      {/* 题型与属性 */}
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="ink">{getQuestionTypeLabel(question.type)}</Badge>
        <Badge variant={question.difficulty <= 2 ? "green" : question.difficulty <= 3 ? "amber" : "red"}>
          {difficultyLabel[question.difficulty]}
        </Badge>
        <Badge variant={question.isShared ? "teal" : "default"}>
          {question.isShared ? "共享" : "私有"}
        </Badge>
        {question.recommendation >= 4 && <Badge variant="gold">推荐 {question.recommendation}/5</Badge>}
        <span className="text-xs text-ink-400 ml-auto">
          创建于 {formatDate(question.createdAt)} · 更新于 {formatDate(question.updatedAt)}
        </span>
      </div>

      {/* 题干 */}
      <div>
        <div className="text-xs font-medium text-ink-500 mb-1.5">题干</div>
        <div className="p-3 rounded-md bg-mist border border-ink-100 text-sm text-ink-900 leading-relaxed whitespace-pre-wrap">
          <MathHtml>{question.stem}</MathHtml>
        </div>
      </div>

      {/* 选项 */}
      {question.options && question.options.length > 0 && (
        <div>
          <div className="text-xs font-medium text-ink-500 mb-1.5">选项</div>
          <div className="space-y-1.5">
            {question.options.map((opt, i) => (
              <div
                key={i}
                className={cn(
                  "p-2.5 rounded-md border text-sm flex items-start gap-2",
                  question.answer.includes(String.fromCharCode(65 + i))
                    ? "border-emerald-200 bg-emerald-50/50"
                    : "border-ink-100 bg-paper",
                )}
              >
                <span className="font-mono font-semibold text-ink-700 flex-shrink-0">
                  {String.fromCharCode(65 + i)}.
                </span>
                <MathHtml className="min-w-0 text-ink-900">{opt}</MathHtml>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 答案 */}
      <div>
        <div className="text-xs font-medium text-ink-500 mb-1.5">答案</div>
        <div className="p-3 rounded-md bg-emerald-50/40 border border-emerald-200 text-sm text-emerald-900 font-medium whitespace-pre-wrap">
          <MathHtml>{question.answer}</MathHtml>
        </div>
      </div>

      {/* 解析 */}
      <div>
        <div className="text-xs font-medium text-ink-500 mb-1.5">解析</div>
        <div className="p-3 rounded-md bg-gold-50/30 border border-gold-200 text-sm text-ink-900 leading-relaxed whitespace-pre-wrap">
          <MathHtml>{question.analysis}</MathHtml>
        </div>
      </div>

      {/* 总结 */}
      {question.summary && (
        <div>
          <div className="text-xs font-medium text-ink-500 mb-1.5">总结</div>
          <div className="p-3 rounded-md bg-amber-50/40 border border-amber-200 text-sm text-amber-900 leading-relaxed whitespace-pre-wrap">
            <MathHtml>{question.summary}</MathHtml>
          </div>
        </div>
      )}

      <QuestionSupplementaryDetails
        board={question.board}
        boardImages={question.boardImages}
        links={question.links}
        explanationVideo={question.explanationVideo}
      />

      {/* 知识点 */}
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <div className="text-xs font-medium text-ink-500 mb-1.5 flex items-center gap-1">
            <BookOpen className="w-3 h-3" />
            章节目录
          </div>
          <div className="flex flex-wrap gap-1.5">
            {chapterNames.length ? (
              chapterNames.map((n) => <Badge key={n} variant="ink">{n}</Badge>)
            ) : (
              <span className="text-xs text-ink-400">未关联章节</span>
            )}
          </div>
        </div>
        <div>
          <div className="text-xs font-medium text-ink-500 mb-1.5 flex items-center gap-1">
            <Lightbulb className="w-3 h-3" />
            知识点
          </div>
          <div className="flex flex-wrap gap-1.5">
            {pointNames.length ? (
              pointNames.map((n) => <Badge key={n} variant="teal">{n}</Badge>)
            ) : (
              <span className="text-xs text-ink-400">未关联知识点</span>
            )}
          </div>
        </div>
      </div>

      {/* 使用统计 */}
      <div className="grid grid-cols-3 gap-3">
        <div className="p-3 rounded-md bg-mist border border-ink-100">
          <div className="text-xs text-ink-500 flex items-center gap-1 mb-1">
            <BarChart3 className="w-3 h-3" />
            使用次数
          </div>
          <div className="font-mono text-xl font-bold text-ink-900">{question.usageCount}</div>
        </div>
        <div className="p-3 rounded-md bg-mist border border-ink-100">
          <div className="text-xs text-ink-500 flex items-center gap-1 mb-1">
            <Users className="w-3 h-3" />
            关联学生
          </div>
          <div className="font-mono text-xl font-bold text-ink-900">
            {studentStats?.total || 0}
          </div>
        </div>
        <div className="p-3 rounded-md bg-mist border border-ink-100">
          <div className="text-xs text-ink-500 mb-1">正确率</div>
          <div className={cn(
            "font-mono text-xl font-bold",
            correctRate === null ? "text-ink-400" : correctRate >= 70 ? "text-emerald-600" : correctRate >= 50 ? "text-amber-600" : "text-red-600",
          )}>
            {correctRate === null ? "—" : `${correctRate}%`}
          </div>
        </div>
      </div>

      {/* 备注列表 */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="text-xs font-medium text-ink-500">教师备注（{remarks.length}）</div>
          {!addingRemark && (
            <Button variant="ghost" size="sm" onClick={() => setAddingRemark(true)}>
              <Plus className="w-3 h-3" />
              添加备注
            </Button>
          )}
        </div>

        {/* 添加备注 */}
        {addingRemark && (
          <div className="mb-3 p-3 rounded-md bg-gold-50/30 border border-gold-200">
            <Textarea
              value={newRemarkContent}
              onChange={(e) => setNewRemarkContent(e.target.value)}
              placeholder="输入新备注内容..."
              rows={3}
              autoFocus
            />
            <div className="flex justify-end gap-2 mt-2">
              <Button variant="ghost" size="sm" onClick={() => {
                setAddingRemark(false);
                setNewRemarkContent("");
              }} disabled={saving}>
                取消
              </Button>
              <Button variant="gold" size="sm" onClick={handleAddRemark} loading={saving}>
                <Save className="w-3 h-3" />
                添加
              </Button>
            </div>
          </div>
        )}

        {/* 备注列表 */}
        {remarks.length === 0 && !addingRemark ? (
          <div className="p-4 rounded-md bg-paper border border-ink-100 text-center text-sm text-ink-400 italic">
            暂无备注，点击"添加备注"开始记录
          </div>
        ) : (
          <div className="space-y-2">
            {[...remarks].reverse().map((r) => (
              <div key={r.id} className="p-3 rounded-md bg-paper border border-ink-100">
                {editingRemarkId === r.id ? (
                  <>
                    <Textarea
                      value={editingRemarkContent}
                      onChange={(e) => setEditingRemarkContent(e.target.value)}
                      rows={3}
                      autoFocus
                    />
                    <div className="flex justify-end gap-2 mt-2">
                      <Button variant="ghost" size="sm" onClick={() => setEditingRemarkId(null)} disabled={saving}>
                        取消
                      </Button>
                      <Button variant="gold" size="sm" onClick={() => handleUpdateRemark(r.id)} loading={saving}>
                        <Save className="w-3 h-3" />
                        保存
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="text-sm text-ink-800 whitespace-pre-wrap">{r.content}</div>
                    <div className="flex items-center justify-between mt-2 pt-2 border-t border-ink-50">
                      <div className="flex items-center gap-1 text-[11px] text-ink-400">
                        <Clock className="w-3 h-3" />
                        {formatDate(r.createdAt)}
                        {r.updatedAt !== r.createdAt && ` (更新于 ${formatDate(r.updatedAt)})`}
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => {
                            setEditingRemarkId(r.id);
                            setEditingRemarkContent(r.content);
                          }}
                          className="p-1 rounded hover:bg-mist text-ink-400 hover:text-ink-600 transition-colors"
                          title="编辑备注"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteRemark(r.id)}
                          className="p-1 rounded hover:bg-red-50 text-ink-400 hover:text-red-500 transition-colors"
                          title="删除备注"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default QuestionDetail;
