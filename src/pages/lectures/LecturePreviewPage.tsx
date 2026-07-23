import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  FileText, GraduationCap, BookOpen, Type, ListOrdered, Sparkles,
  ChevronRight, Edit3, Printer,
} from "lucide-react";
import { lectureService } from "@/services/lecture";
import { questionService } from "@/services/question";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Spinner } from "@/components/ui/Spinner";
import type { Lecture, LectureSection, Question } from "@/types";
import { cn, getOptionsGridCols } from "@/lib/utils";

type PaperSize = "A4" | "8K";

const difficultyLabel = ["", "简单", "较易", "中等", "较难", "困难"];
const difficultyColor = ["", "text-emerald-600", "text-emerald-600", "text-amber-600", "text-red-600", "text-red-600"];
const typeLabel: Record<string, string> = { single: "单选", multiple: "多选", judge: "判断", short: "填空", essay: "解答" };

export default function LecturePreviewPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [lecture, setLecture] = useState<Lecture | null>(null);
  const [loading, setLoading] = useState(true);
  const [paperSize, setPaperSize] = useState<PaperSize>("A4");

  useEffect(() => {
    if (!id) return;
    lectureService.getLecture(id).then((lec) => {
      if (!lec) {
        navigate("/my-resources");
        return;
      }
      setLecture(lec);
      setLoading(false);
    });
  }, [id, navigate]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner size={24} />
      </div>
    );
  }

  const sections = lecture?.sections || [];
  const questionCount = sections.reduce((acc, s) => {
    if (s.type === "question") return acc + 1;
    return acc + (s.children?.filter((c) => c.type === "question").length || 0);
  }, 0);

  return (
    <div className="max-w-5xl mx-auto">
      <PageHeader
        title={lecture?.title || ""}
        description={lecture?.description || "讲义预览"}
        icon={<FileText className="w-5 h-5" />}
        action={
          <Button variant="outline" onClick={() => navigate(`/lectures/${id}/edit`)}>
            <Edit3 className="w-4 h-4" />
            编辑讲义
          </Button>
        }
      />

      {/* 工具栏：版面选择 + 打印 */}
      <div className="no-print flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-ink-500">版面：</span>
            <select
              value={paperSize}
              onChange={(e) => setPaperSize(e.target.value as PaperSize)}
              className="text-sm border border-ink-200 rounded-md px-2 py-1 bg-white text-ink-700 cursor-pointer focus:outline-none focus:border-gold-400"
            >
              <option value="A4">A4（单栏）</option>
              <option value="8K">8K（双栏）</option>
            </select>
          </div>
          {paperSize === "8K" && (
            <span className="text-xs text-ink-400">8K 默认两栏排版</span>
          )}
        </div>
        <Button variant="gold" onClick={() => window.print()}>
          <Printer className="w-4 h-4" />
          打印
        </Button>
      </div>

      {/* 讲义信息卡片 */}
      <Card className="no-print mb-6 p-4">
        <div className="grid grid-cols-4 gap-4 text-sm">
          <div className="flex items-center gap-2">
            <GraduationCap className="w-4 h-4 text-gold-500" />
            <span className="text-ink-500">年级：</span>
            <span className="font-medium text-ink-900">{lecture?.grade} · {lecture?.schoolYear}</span>
          </div>
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-teal-500" />
            <span className="text-ink-500">章节：</span>
            <span className="font-medium text-ink-900">{sections.filter((s) => s.type === "chapter").length} 章</span>
          </div>
          <div className="flex items-center gap-2">
            <ListOrdered className="w-4 h-4 text-teal-500" />
            <span className="text-ink-500">题目：</span>
            <span className="font-medium text-ink-900">{questionCount} 题</span>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={lecture?.status === "published" ? "green" : "default"}>
              {lecture?.status === "published" ? "已发布" : "草稿"}
            </Badge>
          </div>
        </div>
      </Card>

      {/* 纸张版面 */}
      <div className={cn("paper-sheet rounded-lg", paperSize === "8K" ? "paper-8k" : "paper-a4")}>
        <div className="paper-content p-10 print-area">
          {/* 讲义标题 */}
          <div className="text-center mb-8 pb-4 border-b-2 border-ink-200">
            <h1 className="font-serif text-2xl font-bold text-ink-900 mb-2">{lecture?.title}</h1>
            {lecture?.description && (
              <p className="text-sm text-ink-500">{lecture.description}</p>
            )}
          </div>

          {sections.length === 0 ? (
            <div className="text-center py-16 text-ink-400">
              <FileText className="w-12 h-12 mx-auto mb-3 text-ink-200" />
              <div className="text-sm">讲义暂无内容</div>
            </div>
          ) : (
            <div className="space-y-5">
              {sections.map((sec, idx) => (
                <PreviewSection key={sec.id} section={sec} index={idx} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PreviewSection({ section, index }: { section: LectureSection; index: number }) {
  const [question, setQuestion] = useState<Question | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (section.type === "question" && section.questionId) {
      questionService.getQuestion(section.questionId).then(setQuestion);
    }
  }, [section]);

  // 章节标题
  if (section.type === "chapter") {
    return (
      <div className="pt-4 pb-2">
        <div className="flex items-center gap-2 mb-3">
          <span className="font-serif text-xl font-bold text-ink-900">
            {section.customLabel || `${index + 1}.`} {section.title}
          </span>
        </div>
        {section.content && (
          <div className="mb-4 text-sm text-ink-600 leading-relaxed whitespace-pre-wrap pl-2">
            {section.content}
          </div>
        )}
        {section.children.length > 0 && (
          <div className="space-y-5 pl-3 border-l-2 border-ink-100 ml-2">
            {section.children.map((child, cIdx) => (
              <PreviewSection key={child.id} section={child} index={cIdx} />
            ))}
          </div>
        )}
      </div>
    );
  }

  // 题目（含两侧信息）
  if (section.type === "question") {
    return (
      <div className="pb-3">
        {question ? (
          <div className="flex gap-3">
            {/* 左侧：难度标注 */}
            <div className="flex-shrink-0 w-14 pt-0.5">
              <div className={cn("text-[10px] font-bold text-center px-1 py-0.5 rounded border",
                question.difficulty <= 2 ? "border-emerald-200 bg-emerald-50" :
                question.difficulty === 3 ? "border-amber-200 bg-amber-50" :
                "border-red-200 bg-red-50",
                difficultyColor[question.difficulty])}>
                {difficultyLabel[question.difficulty]}
              </div>
              <div className="text-[9px] text-ink-400 text-center mt-0.5">{typeLabel[question.type]}</div>
            </div>
            {/* 中间：题目内容 */}
            <div className="flex-1 min-w-0 space-y-2">
              <div className="text-sm text-ink-900 leading-relaxed whitespace-pre-wrap">
                <span className="font-mono text-ink-400 mr-1.5">{section.customLabel || `${index + 1}.`}</span>
                {question.stem}
              </div>
              {question.options && question.options.length > 0 && (
                <div className={cn(
                  "pl-6 gap-2 grid",
                  getOptionsGridCols(question.options.length),
                )}>
                  {question.options.map((opt, i) => (
                    <div
                      key={i}
                      className={cn(
                        "p-2 rounded-md border text-sm flex items-start gap-1.5 min-w-0",
                        expanded && question.answer.includes(String.fromCharCode(65 + i))
                          ? "border-emerald-200 bg-emerald-50/40"
                          : "border-ink-100",
                      )}
                    >
                      <span className="font-mono font-semibold text-ink-700 flex-shrink-0">
                        {String.fromCharCode(65 + i)}.
                      </span>
                      <span className="text-ink-900 break-all">{opt}</span>
                    </div>
                  ))}
                </div>
              )}
              {expanded ? (
                <div className="space-y-2 pl-6 animate-fade-in">
                  <div className="p-2.5 rounded-md bg-emerald-50/40 border border-emerald-200 text-sm text-emerald-900 whitespace-pre-wrap">
                    <span className="font-bold">答案：</span>{question.answer}
                  </div>
                  <div className="p-2.5 rounded-md bg-gold-50/30 border border-gold-200 text-sm text-ink-900 leading-relaxed whitespace-pre-wrap">
                    <span className="font-bold text-gold-700">解析：</span>{question.analysis}
                  </div>
                  <button
                    onClick={() => setExpanded(false)}
                    className="no-print text-xs text-ink-500 hover:text-ink-700"
                  >
                    收起答案与解析
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setExpanded(true)}
                  className="no-print text-xs text-gold-600 hover:text-gold-700 flex items-center gap-1 pl-6"
                >
                  <ChevronRight className="w-3 h-3" />
                  展开答案与解析
                </button>
              )}
            </div>
            {/* 右侧：使用次数标注 */}
            <div className="flex-shrink-0 w-16 pt-0.5 text-right">
              {question.usageCount > 0 && (
                <div className="text-[10px] text-ink-400">
                  使用{question.usageCount}次
                </div>
              )}
              {question.recommendation >= 4 && (
                <div className="text-[10px] text-gold-500 font-medium">★推荐</div>
              )}
            </div>
          </div>
        ) : (
          <div className="text-sm text-ink-400">题目加载中...</div>
        )}
      </div>
    );
  }

  // 知识点
  if (section.type === "knowledge") {
    return (
      <div className="pb-3">
        <div className="flex items-center gap-2 mb-1.5">
          <Sparkles className="w-4 h-4 text-gold-500" />
          <span className="font-serif font-medium text-ink-900">{section.customLabel || `${index + 1}.`} {section.title}</span>
        </div>
        <div className="text-sm text-ink-800 whitespace-pre-wrap leading-relaxed pl-6">
          {section.content}
        </div>
      </div>
    );
  }

  // 文本（含空白行）
  if (!section.content && (section.title === "空白行" || section.title === "[空白行]")) {
    // 渲染为空白间距
    return <div className="h-8" />;
  }
  return (
    <div className="pb-3">
      <div className="flex items-center gap-2 mb-1.5">
        <Type className="w-4 h-4 text-ink-400" />
        <span className="font-serif font-medium text-ink-900">{section.customLabel || `${index + 1}.`} {section.title}</span>
      </div>
      <div className="text-sm text-ink-700 whitespace-pre-wrap leading-relaxed pl-6">
        {section.content}
      </div>
    </div>
  );
}
