import { useCallback, useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ChevronLeft, ChevronRight, Plus, Trash2, Send, Save,
  FileQuestion, Blocks, SplitSquareHorizontal,
  Merge, Edit3, Check, X, MessageSquareText, Star,
  Play,
} from "lucide-react";
import { useAuthStore } from "@/stores/auth";
import { toast } from "@/stores/ui";
import { lessonCoursewareService } from "@/services/lessonCourseware";
import { questionService } from "@/services/question";
import { reflectionService } from "@/services/reflection";
import type { LessonCourseware, LessonSlide, Question, Reflection } from "@/types";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input, Textarea } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { cn } from "@/lib/utils";
import { genId } from "@/services/_shared";
import { PresentationMode } from "./PresentationMode";
import { WpsFormulaEditor } from "@/components/editor/WpsFormulaEditor";

export function LessonEditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { teacher } = useAuthStore();

  const [courseware, setCourseware] = useState<LessonCourseware | null>(null);
  const [slides, setSlides] = useState<LessonSlide[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);

  // 侧边栏相关
  const [showStudentPanel, setShowStudentPanel] = useState(false);
  const [showRelatedPanel, setShowRelatedPanel] = useState(false);
  const [showReflectionPanel, setShowReflectionPanel] = useState(false);
  const [relatedQuestions, setRelatedQuestions] = useState<Question[]>([]);
  // 所有相关题的缓存（id -> Question），供预览模式使用
  const [relatedQuestionsMap, setRelatedQuestionsMap] = useState<Record<string, Question>>({});

  // 课后反思相关
  const [reflections, setReflections] = useState<Reflection[]>([]);
  const [newReflection, setNewReflection] = useState("");
  const [newReflectionRating, setNewReflectionRating] = useState("4");
  const [submittingReflection, setSubmittingReflection] = useState(false);

  // 拆分合并相关
  const [editingSlideId, setEditingSlideId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");

  // 预览模式
  const [previewMode, setPreviewMode] = useState(false);

  // 题目公式编辑器（编辑题干/答案/解析）
  const [formulaEditTarget, setFormulaEditTarget] = useState<{
    field: "stem" | "answer" | "analysis";
    value: string;
  } | null>(null);

  // 学生列表（模拟）
  const [students] = useState([
    { id: "stu-1", name: "张三" },
    { id: "stu-2", name: "李四" },
    { id: "stu-3", name: "王五" },
    { id: "stu-4", name: "赵六" },
    { id: "stu-5", name: "钱七" },
    { id: "stu-6", name: "孙八" },
    { id: "stu-7", name: "周九" },
    { id: "stu-8", name: "吴十" },
  ]);

  const loadCourseware = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const cw = await lessonCoursewareService.getCourseware(id);
      if (!cw) {
        toast.error("课件不存在");
        navigate("/my-lessons");
        return;
      }
      setCourseware(cw);
      setSlides(cw.slides);
      // 加载反思
      const refs = await reflectionService.listByLesson(cw.id);
      setReflections(refs);
      // 预加载所有相关题
      const allRelatedIds = Array.from(
        new Set(cw.slides.flatMap((s) => s.relatedQuestionIds || [])),
      );
      if (allRelatedIds.length > 0) {
        const map: Record<string, Question> = {};
        await Promise.all(
          allRelatedIds.map(async (qid) => {
            try {
              const q = await questionService.getQuestion(qid);
              if (q) map[qid] = q;
            } catch {
              // ignore
            }
          }),
        );
        setRelatedQuestionsMap(map);
      }
    } catch (err) {
      toast.error("加载失败", err instanceof Error ? err.message : undefined);
    } finally {
      setLoading(false);
    }
  }, [id, navigate]);

  useEffect(() => {
    if (!id || !teacher) return;
    loadCourseware();
  }, [id, loadCourseware, teacher]);

  const currentSlide = slides[currentIndex];

  const handleSave = async () => {
    if (!courseware) return;
    setSaving(true);
    try {
      const updated = await lessonCoursewareService.updateCourseware(courseware.id, {
        slides,
        title: courseware.title,
      });
      setCourseware(updated);
      toast.success("已保存");
    } catch (err) {
      toast.error("保存失败", err instanceof Error ? err.message : undefined);
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async () => {
    if (!courseware) return;
    setPublishing(true);
    try {
      await lessonCoursewareService.publishCourseware(courseware.id);
      toast.success("已发布", "课件已推送到上课应用，学生端可查看");
      loadCourseware();
    } catch (err) {
      toast.error("发布失败", err instanceof Error ? err.message : undefined);
    } finally {
      setPublishing(false);
    }
  };

  const moveSlide = (from: number, to: number) => {
    if (to < 0 || to >= slides.length) return;
    const next = [...slides];
    const [removed] = next.splice(from, 1);
    next.splice(to, 0, removed);
    setSlides(next);
    setCurrentIndex(to);
  };

  const deleteSlide = (index: number) => {
    if (slides.length <= 1) {
      toast.error("至少保留一页");
      return;
    }
    const next = slides.filter((_, i) => i !== index);
    setSlides(next);
    if (currentIndex >= next.length) setCurrentIndex(next.length - 1);
  };

  const updateCurrentSlide = (patch: Partial<LessonSlide>) => {
    setSlides((prev) =>
      prev.map((s, i) => (i === currentIndex ? { ...s, ...patch } : s)),
    );
  };

  const toggleStudent = (stuId: string) => {
    if (!currentSlide) return;
    const current = currentSlide.askableStudentIds || [];
    const next = current.includes(stuId)
      ? current.filter((id) => id !== stuId)
      : [...current, stuId];
    updateCurrentSlide({ askableStudentIds: next });
  };

  const loadRelatedQuestions = async () => {
    if (!teacher?.schoolId) return;
    setShowRelatedPanel(true);
    try {
      const qs = await questionService.listQuestions({
        schoolId: teacher.schoolId,
        knowledgePointIds: currentSlide?.questionId ? [] : [],
      });
      setRelatedQuestions(qs.slice(0, 10));
    } catch (err) {
      console.error(err);
    }
  };

  const addRelatedQuestion = (q: Question) => {
    if (!currentSlide) return;
    const current = currentSlide.relatedQuestionIds || [];
    if (current.includes(q.id)) return;
    updateCurrentSlide({ relatedQuestionIds: [...current, q.id] });
    toast.success("已添加相关题");
  };

  const removeRelatedQuestion = (qid: string) => {
    if (!currentSlide) return;
    const current = currentSlide.relatedQuestionIds || [];
    updateCurrentSlide({ relatedQuestionIds: current.filter((id) => id !== qid) });
  };

  // ============ 课后反思 ============
  const handleAddReflection = async () => {
    if (!teacher || !courseware) return;
    if (!newReflection.trim()) {
      toast.error("请输入反思内容");
      return;
    }
    setSubmittingReflection(true);
    try {
      const targetType = courseware.sourceType === "examPaper"
        ? "examPaper"
        : courseware.sourceType === "lecture"
          ? "lecture"
          : "courseware";
      const targetId = courseware.sourceId || courseware.id;
      await reflectionService.createReflection(teacher.id, teacher.schoolId!, {
        lessonCoursewareId: courseware.id,
        targetId,
        targetType,
        content: newReflection.trim(),
        rating: parseInt(newReflectionRating),
      });
      setNewReflection("");
      toast.success("反思已添加", "已同步到关联资源");
      const refs = await reflectionService.listByLesson(courseware.id);
      setReflections(refs);
    } catch (err) {
      toast.error("添加失败", err instanceof Error ? err.message : undefined);
    } finally {
      setSubmittingReflection(false);
    }
  };

  const handleDeleteReflection = async (rid: string) => {
    try {
      await reflectionService.deleteReflection(rid);
      toast.success("已删除");
      if (courseware) {
        const refs = await reflectionService.listByLesson(courseware.id);
        setReflections(refs);
      }
    } catch (err) {
      toast.error("删除失败");
    }
  };

  // 保存公式编辑器内容到当前幻灯片
  const handleSaveFormula = (html: string) => {
    if (!currentSlide || !formulaEditTarget) return;
    if (currentSlide.questionSnapshot) {
      updateCurrentSlide({
        questionSnapshot: {
          ...currentSlide.questionSnapshot,
          [formulaEditTarget.field]: html,
        },
      });
    }
    setFormulaEditTarget(null);
    toast.success("已保存");
  };

  // 打开公式编辑器
  const openFormulaEditor = (field: "stem" | "answer" | "analysis") => {
    if (!currentSlide?.questionSnapshot) return;
    setFormulaEditTarget({
      field,
      value: currentSlide.questionSnapshot[field] || "",
    });
  };

  // 拆分当前页（知识块）为两页
  const splitSlide = () => {
    if (!currentSlide || currentSlide.type !== "knowledge") return;
    const content = currentSlide.content || "";
    const mid = Math.floor(content.length / 2);
    const splitIdx = content.indexOf("。", mid) + 1 || mid;
    const part1 = content.slice(0, splitIdx).trim();
    const part2 = content.slice(splitIdx).trim();

    if (!part1 || !part2) {
      toast.error("内容太短，无法拆分");
      return;
    }

    const newSlide: LessonSlide = {
      id: genId("slide"),
      type: "knowledge",
      title: `${currentSlide.title}（下）`,
      content: part2,
    };

    const next = [...slides];
    next.splice(currentIndex + 1, 0, newSlide);
    updateCurrentSlide({ title: `${currentSlide.title}（上）`, content: part1 });
    setSlides(next);
    toast.success("已拆分为两页");
  };

  // 与下一页合并
  const mergeWithNext = () => {
    if (currentIndex >= slides.length - 1) {
      toast.error("已是最后一页");
      return;
    }
    const nextSlide = slides[currentIndex + 1];
    if (currentSlide?.type !== "knowledge" || nextSlide.type !== "knowledge") {
      toast.error("只有知识块页面可以合并");
      return;
    }
    const mergedContent = `${currentSlide.content || ""}\n\n${nextSlide.content || ""}`;
    const mergedTitle = currentSlide.title;
    updateCurrentSlide({ title: mergedTitle, content: mergedContent });
    deleteSlide(currentIndex + 1);
    toast.success("已合并");
  };

  const startEditSlide = () => {
    if (!currentSlide) return;
    setEditingSlideId(currentSlide.id);
    setEditContent(currentSlide.content || currentSlide.questionSnapshot?.stem || "");
  };

  const saveEditSlide = () => {
    if (!currentSlide) return;
    if (currentSlide.type === "knowledge") {
      updateCurrentSlide({ content: editContent });
    } else if (currentSlide.questionSnapshot) {
      updateCurrentSlide({
        questionSnapshot: { ...currentSlide.questionSnapshot, stem: editContent },
      });
    }
    setEditingSlideId(null);
    toast.success("已保存修改");
  };

  const addNewSlide = () => {
    const newSlide: LessonSlide = {
      id: genId("slide"),
      type: "knowledge",
      title: "新页面",
      content: "",
      relatedQuestionIds: [],
      askableStudentIds: [],
    };
    const next = [...slides];
    next.splice(currentIndex + 1, 0, newSlide);
    setSlides(next);
    setCurrentIndex(currentIndex + 1);
  };

  const questionTypeLabel: Record<string, string> = {
    single: "单选",
    multiple: "多选",
    judge: "判断",
    short: "填空",
    essay: "解答",
  };

  if (loading) {
    return (
      <div className="py-20 text-center">
        <div className="inline-block w-10 h-10 border-2 border-gold-400 border-t-transparent rounded-full animate-spin" />
        <div className="text-sm text-ink-500 mt-3">加载中...</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      {/* 顶部工具栏 */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-ink-200 bg-paper">
        <Button variant="ghost" size="sm" onClick={() => navigate("/my-lessons")}>
          <ChevronLeft className="w-4 h-4" />
          返回
        </Button>
        <div className="h-5 w-px bg-ink-200" />
        <div className="font-serif font-semibold text-ink-900 truncate max-w-md">
          {courseware?.title}
        </div>
        <Badge variant={courseware?.status === "published" ? "green" : "amber"}>
          {courseware?.status === "published" ? "已发布" : "草稿"}
        </Badge>
        <div className="flex-1" />
        <div className="text-sm text-ink-500">
          {currentIndex + 1} / {slides.length} 页
        </div>
        <div className="h-5 w-px bg-ink-200" />
        <Button variant="outline" size="sm" onClick={handleSave} loading={saving}>
          <Save className="w-4 h-4" />
          保存
        </Button>
        <Button variant="outline" size="sm" onClick={() => setPreviewMode(true)}>
          <Play className="w-4 h-4" />
          预览上课
        </Button>
        <Button variant="gold" size="sm" onClick={handlePublish} loading={publishing}>
          <Send className="w-4 h-4" />
          发布到上课
        </Button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* 左侧：幻灯片列表 */}
        <div className="w-52 border-r border-ink-200 bg-mist/30 flex flex-col">
          <div className="p-2 border-b border-ink-200 flex items-center justify-between">
            <span className="text-xs font-medium text-ink-600">课件页面</span>
            <button
              onClick={addNewSlide}
              className="p-1 rounded hover:bg-ink-200/50 text-ink-500 hover:text-ink-800"
              title="添加页面"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-1 overflow-auto p-2 space-y-1.5">
            {slides.map((slide, idx) => {
              const isActive = idx === currentIndex;
              const isQuestion = slide.type === "question";
              return (
                <div
                  key={slide.id}
                  onClick={() => setCurrentIndex(idx)}
                  className={cn(
                    "group relative p-2 rounded-lg cursor-pointer transition-all border",
                    isActive
                      ? "bg-gold-50 border-gold-300 shadow-sm"
                      : "bg-paper border-ink-100 hover:border-ink-300",
                  )}
                >
                  <div className="flex items-start gap-2">
                    <div className={cn(
                      "w-6 h-6 rounded flex items-center justify-center flex-shrink-0 text-[10px] font-mono",
                      isActive ? "bg-gold-200 text-gold-800" : "bg-mist text-ink-500",
                    )}>
                      {idx + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1 mb-0.5">
                        {isQuestion ? (
                          <FileQuestion className="w-3 h-3 text-ink-400" />
                        ) : (
                          <Blocks className="w-3 h-3 text-ink-400" />
                        )}
                        <span className="text-xs font-medium text-ink-700 truncate">
                          {slide.title}
                        </span>
                      </div>
                      <div className="text-[10px] text-ink-400 line-clamp-2">
                        {isQuestion
                          ? slide.questionSnapshot?.stem?.slice(0, 40) || "题目"
                          : slide.content?.slice(0, 40) || "知识块"}
                      </div>
                    </div>
                  </div>
                  {/* 操作按钮 */}
                  <div className="absolute right-1 top-1 hidden group-hover:flex items-center gap-0.5 bg-paper/90 rounded">
                    <button
                      onClick={(e) => { e.stopPropagation(); moveSlide(idx, idx - 1); }}
                      disabled={idx === 0}
                      className="p-0.5 rounded text-ink-400 hover:text-ink-700 disabled:opacity-30"
                      title="上移"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); moveSlide(idx, idx + 1); }}
                      disabled={idx === slides.length - 1}
                      className="p-0.5 rounded text-ink-400 hover:text-ink-700 disabled:opacity-30"
                      title="下移"
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteSlide(idx); }}
                      className="p-0.5 rounded text-ink-400 hover:text-red-500"
                      title="删除"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 中间：主编辑区 */}
        <div className="flex-1 flex flex-col bg-mist/30 overflow-auto">
          {currentSlide && (
            <div className="flex-1 p-8">
              <div className="max-w-3xl mx-auto bg-paper rounded-xl shadow-lg min-h-[500px] p-8">
                {/* 页面标题 */}
                <div className="flex items-center gap-2 mb-6 pb-4 border-b border-ink-100">
                  <Badge variant={currentSlide.type === "question" ? "gold" : "teal"}>
                    {currentSlide.type === "question" ? "题目页" : "知识块"}
                  </Badge>
                  <input
                    value={currentSlide.title}
                    onChange={(e) => updateCurrentSlide({ title: e.target.value })}
                    className="flex-1 text-lg font-serif font-semibold text-ink-900 bg-transparent focus:outline-none"
                  />
                </div>

                {/* 题目内容 */}
                {currentSlide.type === "question" && currentSlide.questionSnapshot && (
                  <div className="space-y-6">
                    <div>
                      <div className="text-xs text-ink-400 mb-2 flex items-center justify-between">
                        <span>题干（{questionTypeLabel[currentSlide.questionSnapshot.type]}）</span>
                        <button
                          onClick={() => openFormulaEditor("stem")}
                          className="text-gold-600 hover:text-gold-700 flex items-center gap-1"
                        >
                          <Edit3 className="w-3 h-3" />
                          公式编辑器编辑
                        </button>
                      </div>
                      <div
                        className="text-base text-ink-900 leading-relaxed"
                        dangerouslySetInnerHTML={{ __html: currentSlide.questionSnapshot.stem }}
                      />
                    </div>

                    {currentSlide.questionSnapshot.options && (
                      <div className="space-y-2">
                        <div className="text-xs text-ink-400 mb-2">选项</div>
                        {currentSlide.questionSnapshot.options.map((opt, i) => (
                          <div key={i} className="flex items-start gap-2 p-3 rounded-lg bg-mist/40">
                            <span className="w-6 h-6 rounded-full bg-ink-900 text-paper flex items-center justify-center text-xs font-mono flex-shrink-0">
                              {String.fromCharCode(65 + i)}
                            </span>
                            <span className="text-sm text-ink-700">{opt}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-4 pt-4 border-t border-ink-100">
                      <div>
                        <div className="text-xs text-ink-400 mb-1 flex items-center justify-between">
                          <span>参考答案</span>
                          <button
                            onClick={() => openFormulaEditor("answer")}
                            className="text-gold-600 hover:text-gold-700 flex items-center gap-1 text-[11px]"
                          >
                            <Edit3 className="w-3 h-3" />
                            公式编辑
                          </button>
                        </div>
                        <div
                          className="text-sm font-medium text-emerald-600"
                          dangerouslySetInnerHTML={{ __html: currentSlide.questionSnapshot.answer }}
                        />
                      </div>
                      <div>
                        <div className="text-xs text-ink-400 mb-1 flex items-center justify-between">
                          <span>解析</span>
                          <button
                            onClick={() => openFormulaEditor("analysis")}
                            className="text-gold-600 hover:text-gold-700 flex items-center gap-1 text-[11px]"
                          >
                            <Edit3 className="w-3 h-3" />
                            公式编辑
                          </button>
                        </div>
                        <div
                          className="text-sm text-ink-600"
                          dangerouslySetInnerHTML={{ __html: currentSlide.questionSnapshot.analysis }}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* 知识块内容 */}
                {currentSlide.type === "knowledge" && (
                  <div>
                    {editingSlideId === currentSlide.id ? (
                      <div className="space-y-3">
                        <Textarea
                          value={editContent}
                          onChange={(e) => setEditContent(e.target.value)}
                          placeholder="输入知识块内容..."
                          rows={15}
                        />
                        <div className="flex justify-end gap-2">
                          <Button variant="ghost" size="sm" onClick={() => setEditingSlideId(null)}>
                            取消
                          </Button>
                          <Button variant="gold" size="sm" onClick={saveEditSlide}>
                            <Check className="w-4 h-4" />
                            保存
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div className="text-base text-ink-800 leading-relaxed whitespace-pre-wrap">
                          {currentSlide.content || "点击编辑按钮添加内容"}
                        </div>
                        <div className="flex items-center gap-2 pt-4 border-t border-ink-100">
                          <Button variant="outline" size="sm" onClick={startEditSlide}>
                            <Edit3 className="w-4 h-4" />
                            编辑内容
                          </Button>
                          <Button variant="outline" size="sm" onClick={splitSlide}>
                            <SplitSquareHorizontal className="w-4 h-4" />
                            拆分页面
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={mergeWithNext}
                            disabled={currentIndex >= slides.length - 1}
                          >
                            <Merge className="w-4 h-4" />
                            合并下一页
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* 底部翻页 */}
              <div className="max-w-3xl mx-auto flex items-center justify-between mt-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
                  disabled={currentIndex === 0}
                >
                  <ChevronLeft className="w-4 h-4" />
                  上一页
                </Button>
                <div className="text-sm text-ink-500">
                  第 {currentIndex + 1} 页，共 {slides.length} 页
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentIndex((i) => Math.min(slides.length - 1, i + 1))}
                  disabled={currentIndex === slides.length - 1}
                >
                  下一页
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* 右侧：属性面板 */}
        <div className="w-72 border-l border-ink-200 bg-paper flex flex-col">
          {/* 标签切换 */}
          <div className="grid grid-cols-4 border-b border-ink-200">
            <button
              onClick={() => { setShowStudentPanel(false); setShowRelatedPanel(false); setShowReflectionPanel(false); }}
              className={cn(
                "py-2 text-xs font-medium transition-colors",
                !showStudentPanel && !showRelatedPanel && !showReflectionPanel
                  ? "text-gold-700 border-b-2 border-gold-400"
                  : "text-ink-500 hover:text-ink-700",
              )}
            >
              属性
            </button>
            <button
              onClick={() => { setShowStudentPanel(true); setShowRelatedPanel(false); setShowReflectionPanel(false); }}
              className={cn(
                "py-2 text-xs font-medium transition-colors",
                showStudentPanel
                  ? "text-gold-700 border-b-2 border-gold-400"
                  : "text-ink-500 hover:text-ink-700",
              )}
            >
              提问学生
            </button>
            <button
              onClick={() => { setShowRelatedPanel(true); setShowStudentPanel(false); setShowReflectionPanel(false); loadRelatedQuestions(); }}
              className={cn(
                "py-2 text-xs font-medium transition-colors",
                showRelatedPanel
                  ? "text-gold-700 border-b-2 border-gold-400"
                  : "text-ink-500 hover:text-ink-700",
              )}
            >
              相关题
            </button>
            <button
              onClick={() => { setShowReflectionPanel(true); setShowStudentPanel(false); setShowRelatedPanel(false); }}
              className={cn(
                "py-2 text-xs font-medium transition-colors",
                showReflectionPanel
                  ? "text-gold-700 border-b-2 border-gold-400"
                  : "text-ink-500 hover:text-ink-700",
              )}
            >
              课后反思
            </button>
          </div>

          <div className="flex-1 overflow-auto p-3">
            {/* 属性面板 */}
            {!showStudentPanel && !showRelatedPanel && !showReflectionPanel && currentSlide && (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-ink-600 mb-1.5">页面标题</label>
                  <Input
                    value={currentSlide.title}
                    onChange={(e) => updateCurrentSlide({ title: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-ink-600 mb-1.5">页面类型</label>
                  <div className="flex gap-1">
                    <button
                      onClick={() => updateCurrentSlide({ type: "question" })}
                      className={cn(
                        "flex-1 py-2 text-xs rounded border transition-colors flex items-center justify-center gap-1",
                        currentSlide.type === "question"
                          ? "bg-gold-50 border-gold-300 text-gold-700"
                          : "border-ink-200 text-ink-500 hover:border-ink-300",
                      )}
                    >
                      <FileQuestion className="w-3.5 h-3.5" />
                      题目
                    </button>
                    <button
                      onClick={() => updateCurrentSlide({ type: "knowledge" })}
                      className={cn(
                        "flex-1 py-2 text-xs rounded border transition-colors flex items-center justify-center gap-1",
                        currentSlide.type === "knowledge"
                          ? "bg-teal-50 border-teal-300 text-teal-700"
                          : "border-ink-200 text-ink-500 hover:border-ink-300",
                      )}
                    >
                      <Blocks className="w-3.5 h-3.5" />
                      知识块
                    </button>
                  </div>
                </div>

                {currentSlide.type === "knowledge" && (
                  <div>
                    <label className="block text-xs font-medium text-ink-600 mb-1.5">备注</label>
                    <Textarea
                      value={currentSlide.note || ""}
                      onChange={(e) => updateCurrentSlide({ note: e.target.value })}
                      placeholder="授课备注..."
                      rows={3}
                    />
                  </div>
                )}

                <div className="pt-3 border-t border-ink-100">
                  <div className="text-xs font-medium text-ink-600 mb-2">页面操作</div>
                  <div className="space-y-2">
                    <Button variant="outline" size="sm" className="w-full" onClick={addNewSlide}>
                      <Plus className="w-4 h-4" />
                      在下方插入新页
                    </Button>
                    {currentSlide.type === "knowledge" && (
                      <>
                        <Button variant="outline" size="sm" className="w-full" onClick={splitSlide}>
                          <SplitSquareHorizontal className="w-4 h-4" />
                          拆分当前页
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full"
                          onClick={mergeWithNext}
                          disabled={currentIndex >= slides.length - 1}
                        >
                          <Merge className="w-4 h-4" />
                          与下一页合并
                        </Button>
                      </>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full text-red-500 hover:text-red-600"
                      onClick={() => deleteSlide(currentIndex)}
                      disabled={slides.length <= 1}
                    >
                      <Trash2 className="w-4 h-4" />
                      删除当前页
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* 提问学生面板 */}
            {showStudentPanel && currentSlide && (
              <div className="space-y-3">
                <div className="text-xs text-ink-500">
                  选择本题可以提问的学生（已选 {(currentSlide.askableStudentIds || []).length} 人）
                </div>
                <div className="space-y-1">
                  {students.map((stu) => {
                    const selected = (currentSlide.askableStudentIds || []).includes(stu.id);
                    return (
                      <button
                        key={stu.id}
                        onClick={() => toggleStudent(stu.id)}
                        className={cn(
                          "w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm text-left transition-colors",
                          selected
                            ? "bg-gold-50 text-gold-800"
                            : "hover:bg-mist text-ink-700",
                        )}
                      >
                        <div className={cn(
                          "w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-medium",
                          selected ? "bg-gold-400 text-ink-900" : "bg-mist text-ink-500",
                        )}>
                          {stu.name.slice(0, 1)}
                        </div>
                        <span className="flex-1">{stu.name}</span>
                        {selected && <Check className="w-3.5 h-3.5 text-gold-600" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 相关题面板 */}
            {showRelatedPanel && currentSlide && (
              <div className="space-y-3">
                <div className="text-xs text-ink-500">
                  已添加相关题：{(currentSlide.relatedQuestionIds || []).length} 道
                </div>

                {(currentSlide.relatedQuestionIds || []).length > 0 && (
                  <div className="space-y-2">
                    <div className="text-[11px] font-medium text-ink-600">已关联的题目</div>
                    {(currentSlide.relatedQuestionIds || []).map((qid, idx) => (
                      <div key={qid} className="flex items-start gap-2 p-2 rounded bg-emerald-50 border border-emerald-200">
                        <span className="text-xs text-emerald-700 font-mono">#{idx + 1}</span>
                        <span className="flex-1 text-xs text-emerald-800 truncate">相关题 {qid.slice(-6)}</span>
                        <button
                          onClick={() => removeRelatedQuestion(qid)}
                          className="text-emerald-500 hover:text-emerald-700"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="space-y-2">
                  <div className="text-[11px] font-medium text-ink-600">推荐相关题</div>
                  {relatedQuestions.map((q) => {
                    const added = (currentSlide.relatedQuestionIds || []).includes(q.id);
                    return (
                      <div key={q.id} className="p-2 rounded border border-ink-100 hover:border-gold-200 transition-colors">
                        <div className="text-xs text-ink-700 line-clamp-2 mb-1">{q.stem}</div>
                        <div className="flex items-center justify-between">
                          <Badge variant="ink">
                            {questionTypeLabel[q.type]}
                          </Badge>
                          {added ? (
                            <span className="text-[11px] text-emerald-600 flex items-center gap-0.5">
                              <Check className="w-3 h-3" />
                              已添加
                            </span>
                          ) : (
                            <button
                              onClick={() => addRelatedQuestion(q)}
                              className="text-[11px] text-gold-600 hover:text-gold-700"
                            >
                              + 添加
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 课后反思面板 */}
            {showReflectionPanel && courseware && (
              <div className="space-y-3">
                <div className="text-xs text-ink-500 flex items-center gap-1">
                  <MessageSquareText className="w-3.5 h-3.5" />
                  课后反思（{reflections.length} 条，同步到源资源）
                </div>

                {/* 新增反思 */}
                <div className="p-3 rounded-lg border border-gold-200 bg-gold-50/30 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-ink-600">课堂效果：</span>
                    <div className="flex gap-0.5">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <button
                          key={n}
                          onClick={() => setNewReflectionRating(String(n))}
                          className="p-0.5"
                          title={`${n} 星`}
                        >
                          <Star
                            className={cn(
                              "w-3.5 h-3.5",
                              parseInt(newReflectionRating) >= n
                                ? "text-gold-500 fill-gold-500"
                                : "text-ink-300",
                            )}
                          />
                        </button>
                      ))}
                    </div>
                  </div>
                  <Textarea
                    value={newReflection}
                    onChange={(e) => setNewReflection(e.target.value)}
                    placeholder="记录本节课的反思：哪些讲解效果好？哪些需要改进？学生理解情况如何？"
                    rows={4}
                  />
                  <div className="flex justify-end">
                    <Button
                      variant="gold"
                      size="sm"
                      onClick={handleAddReflection}
                      loading={submittingReflection}
                      disabled={!newReflection.trim()}
                    >
                      <Plus className="w-4 h-4" />
                      添加反思
                    </Button>
                  </div>
                </div>

                {/* 反思列表 */}
                {reflections.length === 0 ? (
                  <div className="py-6 text-center text-xs text-ink-400">
                    暂无反思记录
                  </div>
                ) : (
                  <div className="space-y-2">
                    {reflections.map((r) => (
                      <div
                        key={r.id}
                        className="p-2.5 rounded-lg border border-ink-100 hover:border-gold-200 transition-colors group"
                      >
                        <div className="flex items-center gap-2 mb-1.5">
                          <div className="flex gap-0.5">
                            {[1, 2, 3, 4, 5].map((n) => (
                              <Star
                                key={n}
                                className={cn(
                                  "w-3 h-3",
                                  (r.rating || 0) >= n
                                    ? "text-gold-500 fill-gold-500"
                                    : "text-ink-200",
                                )}
                              />
                            ))}
                          </div>
                          <span className="text-[11px] text-ink-400 ml-auto">
                            {new Date(r.createdAt).toLocaleString("zh-CN", {
                              month: "2-digit",
                              day: "2-digit",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                          <button
                            onClick={() => handleDeleteReflection(r.id)}
                            className="p-0.5 rounded text-ink-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                            title="删除"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                        <div className="text-xs text-ink-700 leading-relaxed whitespace-pre-wrap">
                          {r.content}
                        </div>
                        <div className="mt-1.5 text-[10px] text-ink-400">
                          已同步到：
                          {r.targetType === "examPaper" ? "试卷库" : r.targetType === "lecture" ? "讲义库" : "课件库"}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 公式编辑器弹窗 */}
      <Modal
        open={!!formulaEditTarget}
        onClose={() => setFormulaEditTarget(null)}
        title={`编辑${
          formulaEditTarget?.field === "stem" ? "题干"
          : formulaEditTarget?.field === "answer" ? "答案"
          : "解析"
        }`}
        description="支持公式插入（基于 KaTeX），可直接编辑富文本"
        size="lg"
        footer={null}
      >
        {formulaEditTarget && (
          <WpsFormulaEditor
            initialHtml={formulaEditTarget.value}
            onSave={handleSaveFormula}
            onCancel={() => setFormulaEditTarget(null)}
          />
        )}
      </Modal>

      {/* 预览模式（全屏覆盖） */}
      {previewMode && (
        <PresentationMode
          slides={slides}
          initialIndex={currentIndex}
          students={students}
          relatedQuestionsById={relatedQuestionsMap}
          onExit={() => setPreviewMode(false)}
        />
      )}
    </div>
  );
}

export default LessonEditorPage;
