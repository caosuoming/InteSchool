import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ShoppingBasket, Plus, Trash2, ArrowRight, FileText,
  ShoppingCart, Clock, FileQuestion, Star, CheckCircle2, BookOpen, Lightbulb, Tag, GraduationCap,
  TrendingUp, ChevronUp, ChevronDown,
} from "lucide-react";
import { useAuthStore } from "@/stores/auth";
import { basketService } from "@/services/basket";
import { questionService } from "@/services/question";
import { lectureService } from "@/services/lecture";
import { knowledgeService } from "@/services/knowledge";
import { toast } from "@/stores/ui";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Spinner } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";
import type { Basket, Question } from "@/types";
import { timeAgo } from "@/services/_shared";
import { cn } from "@/lib/utils";

const typeLabel: Record<Question["type"], string> = {
  single: "单选",
  multiple: "多选",
  judge: "判断",
  short: "填空",
  essay: "解答",
};

const difficultyLabel = ["", "简单", "较易", "中等", "较难", "困难"];

export default function BasketsPage() {
  const navigate = useNavigate();
  const { teacher } = useAuthStore();
  const [baskets, setBaskets] = useState<Basket[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedBasket, setSelectedBasket] = useState<Basket | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [questionsLoading, setQuestionsLoading] = useState(false);

  // 章节/知识点名称映射
  const [chapterMap, setChapterMap] = useState<Map<string, string>>(new Map());
  const [knowledgeMap, setKnowledgeMap] = useState<Map<string, string>>(new Map());

  // 创建
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");

  // 生成讲义确认
  const [genLectureOpen, setGenLectureOpen] = useState(false);
  const [genLectureTitle, setGenLectureTitle] = useState("");
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    load();
  }, [teacher]);

  useEffect(() => {
    if (!teacher) return;
    Promise.all([
      knowledgeService.listChapters(teacher.schoolId!),
      knowledgeService.listKnowledgePoints(teacher.schoolId!),
    ]).then(([chapters, points]) => {
      setChapterMap(new Map(chapters.map((c) => [c.id, c.name])));
      setKnowledgeMap(new Map(points.map((p) => [p.id, p.name])));
    });
  }, [teacher]);

  const load = async () => {
    if (!teacher) return;
    setLoading(true);
    const bs = await basketService.listBaskets(teacher.id);
    setBaskets(bs);
    setLoading(false);
  };

  const loadQuestions = async (b: Basket) => {
    setSelectedBasket(b);
    setQuestionsLoading(true);
    const all = await questionService.listQuestions({});
    const basketQuestions = all.filter((q) => b.questionIds.includes(q.id));
    setQuestions(basketQuestions);
    setQuestionsLoading(false);
  };

  const handleSetDefault = async (b: Basket) => {
    if (!teacher) return;
    await basketService.setDefaultBasket(teacher.id, b.id);
    toast.success(`已将「${b.name}」设为默认试题篮`);
    await load();
  };

  const handleMoveQuestion = (idx: number, direction: "up" | "down") => {
    if (!selectedBasket) return;
    const newQuestions = [...questions];
    const target = direction === "up" ? idx - 1 : idx + 1;
    if (target < 0 || target >= newQuestions.length) return;
    [newQuestions[idx], newQuestions[target]] = [newQuestions[target], newQuestions[idx]];
    setQuestions(newQuestions);
    // 更新篮子中的题目顺序
    const newQuestionIds = newQuestions.map((q) => q.id);
    basketService.updateBasket(selectedBasket.id, { questionIds: newQuestionIds });
  };

  const handleCreate = async () => {
    if (!teacher) return;
    if (!newName.trim()) {
      toast.error("请填写试题篮名称");
      return;
    }
    const b = await basketService.createBasket(teacher.id, newName, newDesc);
    toast.success("试题篮已创建");
    setCreateOpen(false);
    setNewName("");
    setNewDesc("");
    await load();
    loadQuestions(b);
  };

  const handleRemoveQuestion = async (q: Question) => {
    if (!selectedBasket) return;
    await basketService.removeQuestion(selectedBasket.id, q.id);
    toast.info("已移出试题篮");
    const updated = { ...selectedBasket, questionIds: selectedBasket.questionIds.filter((id) => id !== q.id) };
    setSelectedBasket(updated);
    setQuestions((prev) => prev.filter((x) => x.id !== q.id));
    await load();
  };

  const handleDelete = async (b: Basket) => {
    if (!confirm(`确定要删除「${b.name}」吗？`)) return;
    await basketService.deleteBasket(b.id);
    toast.success("试题篮已删除");
    if (selectedBasket?.id === b.id) setSelectedBasket(null);
    await load();
  };

  const handleGenerateLecture = async () => {
    if (!teacher || !selectedBasket) return;
    if (!genLectureTitle.trim()) {
      toast.error("请填写讲义标题");
      return;
    }
    setGenerating(true);
    try {
      const sections = questions.map((q) => ({
        id: `sec-${Date.now()}-${q.id}`,
        title: `题目·${q.stem.slice(0, 18)}${q.stem.length > 18 ? "..." : ""}`,
        type: "question" as const,
        content: "",
        questionId: q.id,
        children: [],
      }));
      const lecture = await lectureService.createLecture(teacher.id, teacher.schoolId!, {
        title: genLectureTitle,
        description: `由试题篮「${selectedBasket.name}」生成`,
        chapterIds: Array.from(new Set(questions.flatMap((q) => q.chapterIds))),
        knowledgePointIds: Array.from(new Set(questions.flatMap((q) => q.knowledgePointIds))),
        grade: "高一",
        schoolYear: "2025-2026",
        classIds: [],
        studentIds: [],
        sections,
      });
      toast.success("讲义已生成，正在跳转...");
      setGenLectureOpen(false);
      setGenLectureTitle("");
      navigate(`/lectures/${lecture.id}/edit`);
    } catch (e) {
      toast.error("生成失败", e instanceof Error ? e.message : undefined);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="试题篮"
        description="多个试题篮并行管理，可在篮中再次筛选生成讲义"
        icon={<ShoppingBasket className="w-5 h-5" />}
        action={
          <Button variant="gold" onClick={() => setCreateOpen(true)}>
            <Plus className="w-4 h-4" />
            新建试题篮
          </Button>
        }
      />

      {!selectedBasket ? (
        // 篮子列表视图
        loading ? (
          <div className="flex items-center justify-center py-20">
            <Spinner size={24} />
          </div>
        ) : baskets.length === 0 ? (
          <Card>
            <EmptyState
              icon={<ShoppingCart className="w-7 h-7" />}
              title="您还没有试题篮"
              description="创建试题篮后，可在题库或知识树中将题目加入篮中"
              action={
                <Button variant="gold" onClick={() => setCreateOpen(true)}>
                  <Plus className="w-4 h-4" />
                  新建试题篮
                </Button>
              }
            />
          </Card>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 animate-fade-in">
            {baskets.map((b) => (
              <Card key={b.id} hoverable className="group">
                <div className="flex items-start gap-3 mb-3">
                  <div className={cn(
                    "w-11 h-11 rounded-lg flex items-center justify-center flex-shrink-0 relative",
                    b.isDefault ? "bg-gold-100 text-gold-600" : "bg-ink-50 text-ink-500"
                  )}>
                    <ShoppingBasket className="w-5 h-5" />
                    {b.isDefault && (
                      <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-gold-400 flex items-center justify-center">
                        <CheckCircle2 className="w-3 h-3 text-white" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-serif font-semibold text-ink-900 truncate">{b.name}</span>
                      {b.isDefault && (
                        <Badge variant="gold" className="text-[10px]">默认</Badge>
                      )}
                    </div>
                    <div className="text-xs text-ink-500 mt-0.5">{b.description || "无描述"}</div>
                  </div>
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    {!b.isDefault && (
                      <button
                        onClick={() => handleSetDefault(b)}
                        className="p-1 text-ink-300 hover:text-gold-600"
                        title="设为默认"
                      >
                        <Star className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(b)}
                      className="p-1 text-ink-300 hover:text-red-600"
                      title="删除"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs text-ink-500 mb-3 pb-3 border-b border-ink-100">
                  <span className="flex items-center gap-1">
                    <FileText className="w-3 h-3" />
                    <span className="font-mono font-semibold text-ink-700">{b.questionIds.length}</span> 道题目
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {timeAgo(b.updatedAt)}
                  </span>
                </div>

                <Button variant="outline" size="sm" className="w-full" onClick={() => loadQuestions(b)}>
                  查看详情
                  <ArrowRight className="w-3.5 h-3.5" />
                </Button>
              </Card>
            ))}
          </div>
        )
      ) : (
        // 篮子详情视图
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="sm" onClick={() => setSelectedBasket(null)}>
                ← 返回篮子列表
              </Button>
              <div>
                <h2 className="font-serif text-xl font-bold text-ink-900">{selectedBasket.name}</h2>
                <div className="text-xs text-ink-500">{selectedBasket.description}</div>
              </div>
            </div>
            <Button
              variant="gold"
              onClick={() => {
                setGenLectureTitle(`${selectedBasket.name}·讲义`);
                setGenLectureOpen(true);
              }}
              disabled={questions.length === 0}
            >
              <FileText className="w-4 h-4" />
              生成讲义
            </Button>
          </div>

          <Card>
            {questionsLoading ? (
              <div className="flex justify-center py-12">
                <Spinner size={24} />
              </div>
            ) : questions.length === 0 ? (
              <EmptyState
                icon={<FileQuestion className="w-7 h-7" />}
                title="试题篮还是空的"
                description="去题库或知识树中将题目加入此篮"
              />
            ) : (
              <div className="grid lg:grid-cols-2 gap-3">
                {questions.map((q, idx) => (
                  <BasketQuestionCard
                    key={q.id}
                    question={q}
                    index={idx}
                    chapterMap={chapterMap}
                    knowledgeMap={knowledgeMap}
                    onRemove={() => handleRemoveQuestion(q)}
                    onMoveUp={idx > 0 ? () => handleMoveQuestion(idx, "up") : undefined}
                    onMoveDown={idx < questions.length - 1 ? () => handleMoveQuestion(idx, "down") : undefined}
                  />
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {/* 创建试题篮 */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        size="sm"
        title="新建试题篮"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>取消</Button>
            <Button variant="gold" onClick={handleCreate}>
              <Plus className="w-3.5 h-3.5" />
              创建
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Input
            label="名称"
            placeholder="如：期中考试备选"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            autoFocus
          />
          <Input
            label="描述"
            placeholder="试题篮用途说明"
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
          />
        </div>
      </Modal>

      {/* 生成讲义确认 */}
      <Modal
        open={genLectureOpen}
        onClose={() => setGenLectureOpen(false)}
        size="sm"
        title="从试题篮生成讲义"
        description={selectedBasket ? `来源：${selectedBasket.name}（${questions.length} 道题目）` : undefined}
        footer={
          <>
            <Button variant="ghost" onClick={() => setGenLectureOpen(false)}>取消</Button>
            <Button variant="gold" onClick={handleGenerateLecture} loading={generating}>
              <FileText className="w-3.5 h-3.5" />
              生成并跳转编辑
            </Button>
          </>
        }
      >
        <Input
          label="讲义标题"
          value={genLectureTitle}
          onChange={(e) => setGenLectureTitle(e.target.value)}
          autoFocus
        />
        <div className="mt-3 p-3 rounded-md bg-mist border border-ink-100 text-xs text-ink-600">
          系统将自动汇总篮中题目的章节与知识点作为讲义属性，可在编辑器中继续调整。
        </div>
      </Modal>
    </div>
  );
}

// 试题篮题目卡片（显示完整信息）
function BasketQuestionCard({
  question,
  index,
  chapterMap,
  knowledgeMap,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  question: Question;
  index: number;
  chapterMap: Map<string, string>;
  knowledgeMap: Map<string, string>;
  onRemove: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const chapterNames = question.chapterIds.map((id) => chapterMap.get(id)).filter(Boolean) as string[];
  const pointNames = question.knowledgePointIds.map((id) => knowledgeMap.get(id)).filter(Boolean) as string[];

  return (
    <div className="border border-ink-100 rounded-lg overflow-hidden hover:border-ink-200 transition-colors group">
      {/* 顶部操作栏 */}
      <div className="flex items-center justify-between px-3 py-2 bg-mist/50 border-b border-ink-50">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-ink-400 w-5">#{index + 1}</span>
          <Badge variant="ink">{typeLabel[question.type]}</Badge>
          <Badge variant={
            question.difficulty <= 2 ? "green" : question.difficulty <= 3 ? "amber" : "red"
          }>
            {difficultyLabel[question.difficulty]}
          </Badge>
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {onMoveUp && (
            <button onClick={onMoveUp} className="p-1 text-ink-400 hover:text-ink-600" title="上移">
              <ChevronUp className="w-3.5 h-3.5" />
            </button>
          )}
          {onMoveDown && (
            <button onClick={onMoveDown} className="p-1 text-ink-400 hover:text-ink-600" title="下移">
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
          )}
          <button onClick={onRemove} className="p-1 text-ink-400 hover:text-red-600" title="移出">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 内容区 */}
      <div className="p-3">
        {/* 题干 */}
        <div
          onClick={() => setExpanded(!expanded)}
          className={cn(
            "text-sm text-ink-900 leading-relaxed cursor-pointer hover:text-gold-700 transition-colors",
            !expanded && "line-clamp-2"
          )}
        >
          {question.stem}
        </div>

        {/* 选项预览 */}
        {!expanded && question.options && question.options.length > 0 && (
          <div className="text-xs text-ink-500 grid grid-cols-2 gap-1 mt-2">
            {question.options.slice(0, 4).map((opt, i) => (
              <div key={i} className="truncate">
                {String.fromCharCode(65 + i)}. {opt}
              </div>
            ))}
          </div>
        )}

        {/* 展开详情 */}
        {expanded && (
          <div className="mt-3 space-y-3 animate-fade-in">
            {/* 完整选项 */}
            {question.options && question.options.length > 0 && (
              <div className="space-y-1.5">
                {question.options.map((opt, i) => (
                  <div
                    key={i}
                    className={cn(
                      "p-2 rounded-md border text-xs flex items-start gap-2",
                      question.answer.includes(String.fromCharCode(65 + i))
                        ? "border-emerald-200 bg-emerald-50/50"
                        : "border-ink-100 bg-paper"
                    )}
                  >
                    <span className="font-mono font-semibold text-ink-700 flex-shrink-0">
                      {String.fromCharCode(65 + i)}.
                    </span>
                    <span className="text-ink-900">{opt}</span>
                  </div>
                ))}
              </div>
            )}

            {/* 答案 */}
            <div className="p-2 rounded-md bg-emerald-50/40 border border-emerald-200 text-xs text-emerald-900 font-medium">
              答案：{question.answer}
            </div>

            {/* 解析 */}
            <div className="p-2 rounded-md bg-gold-50/30 border border-gold-200 text-xs text-ink-700 leading-relaxed">
              <span className="font-bold text-gold-700">解析：</span>
              {question.analysis}
            </div>
          </div>
        )}

        {/* 展开按钮 */}
        {!expanded && (
          <button
            onClick={() => setExpanded(true)}
            className="text-xs text-gold-600 hover:text-gold-700 mt-2 flex items-center gap-1"
          >
            <ChevronUp className="w-3 h-3 rotate-90" />
            展开查看答案与解析
          </button>
        )}

        {/* 章节与知识点 */}
        <div className="flex items-start gap-3 mt-3 pt-3 border-t border-ink-50 flex-wrap">
          {chapterNames.length > 0 && (
            <div className="flex items-center gap-1 flex-wrap">
              <BookOpen className="w-3 h-3 text-gold-500 flex-shrink-0" />
              {chapterNames.slice(0, 2).map((n) => (
                <span key={n} className="tag-gold text-[10px] py-0.5">{n}</span>
              ))}
              {chapterNames.length > 2 && (
                <span className="text-[10px] text-ink-400">+{chapterNames.length - 2}</span>
              )}
            </div>
          )}
          {pointNames.length > 0 && (
            <div className="flex items-center gap-1 flex-wrap">
              <Lightbulb className="w-3 h-3 text-teal-500 flex-shrink-0" />
              {pointNames.slice(0, 2).map((n) => (
                <span key={n} className="tag-teal text-[10px] py-0.5">{n}</span>
              ))}
              {pointNames.length > 2 && (
                <span className="text-[10px] text-ink-400">+{pointNames.length - 2}</span>
              )}
            </div>
          )}
        </div>

        {/* 其他属性 */}
        <div className="flex items-center gap-3 mt-2 text-xs text-ink-400 flex-wrap">
          {question.grade && (
            <span className="flex items-center gap-1">
              <GraduationCap className="w-3 h-3" />
              {question.grade}
            </span>
          )}
          <span className="flex items-center gap-1">
            <TrendingUp className="w-3 h-3" />
            使用 {question.usageCount} 次
          </span>
          {question.recommendation >= 4 && (
            <span className="flex items-center gap-1 text-gold-600">
              <Star className="w-3 h-3" />
              推荐
            </span>
          )}
          {question.remark && (
            <span className="flex items-center gap-1">
              <Tag className="w-3 h-3" />
              {question.remark.slice(0, 20)}...
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
