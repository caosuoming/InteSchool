import { useState, useEffect, useRef } from "react";
import {
  FileUp, FileText, File, Sparkles, CheckCircle2, XCircle,
  RefreshCw, Globe, ChevronDown, ChevronRight, Upload, FileQuestion, Check,
} from "lucide-react";
import { useAuthStore } from "@/stores/auth";
import { aiService } from "@/services/ai";
import { knowledgeService } from "@/services/knowledge";
import { toast } from "@/stores/ui";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import type { DocumentRecord, RecognitionResult, Chapter, KnowledgePoint } from "@/types";
import { formatDate } from "@/services/_shared";
import { cn } from "@/lib/utils";

const typeLabel: Record<string, string> = {
  single: "单选",
  multiple: "多选",
  judge: "判断",
  short: "填空",
  essay: "解答",
};

export default function ImportPage() {
  const { teacher } = useAuthStore();
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [selectedDoc, setSelectedDoc] = useState<DocumentRecord | null>(null);
  const [recognitions, setRecognitions] = useState<RecognitionResult[]>([]);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [points, setPoints] = useState<KnowledgePoint[]>([]);
  const [uploading, setUploading] = useState(false);
  const [recognizing, setRecognizing] = useState(false);
  const [recognizingProgress, setRecognizingProgress] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [expandedRecs, setExpandedRecs] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadDocuments();
    if (teacher) {
      knowledgeService.listChapters(teacher.schoolId!).then(setChapters);
      knowledgeService.listKnowledgePoints(teacher.schoolId!).then(setPoints);
    }
  }, [teacher]);

  useEffect(() => {
    if (selectedDoc) {
      aiService.getRecognitions(selectedDoc.id).then(setRecognitions);
    }
  }, [selectedDoc]);

  const loadDocuments = async () => {
    if (!teacher) return;
    const docs = await aiService.listDocuments(teacher.id);
    setDocuments(docs);
    if (docs.length > 0 && !selectedDoc) {
      setSelectedDoc(docs[0]);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !teacher) return;

    setUploading(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase();
      const fileType = ext === "pdf" ? "pdf" : ext === "md" ? "markdown" : "word";
      const doc = await aiService.uploadDocument(
        teacher.id,
        teacher.schoolId!,
        file.name,
        file.size,
        fileType as any,
      );
      toast.success("文档上传成功", "原文已结构化存入讲义库");
      await loadDocuments();
      setSelectedDoc(doc);
    } catch (err) {
      toast.error("上传失败", err instanceof Error ? err.message : undefined);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleRecognize = async () => {
    if (!selectedDoc) return;
    setRecognizing(true);
    setRecognizingProgress(0);

    // 模拟进度更新
    const progressTimer = setInterval(() => {
      setRecognizingProgress((p) => Math.min(p + Math.random() * 8, 95));
    }, 200);

    try {
      const recs = await aiService.recognize(selectedDoc.id);
      setRecognitions(recs);
      setRecognizingProgress(100);
      toast.success("AI 识别完成", `共识别出 ${recs.length} 道题目`);
      // 自动展开所有识别结果
      setExpandedRecs(new Set(recs.map((r) => r.id)));
      await loadDocuments();
    } catch (err) {
      toast.error("识别失败", err instanceof Error ? err.message : undefined);
    } finally {
      clearInterval(progressTimer);
      setTimeout(() => {
        setRecognizing(false);
        setRecognizingProgress(0);
      }, 600);
    }
  };

  const handleConfirmOne = async (rec: RecognitionResult) => {
    if (!teacher) return;
    setConfirming(true);
    try {
      await aiService.confirmRecognition(rec.id, teacher.id, teacher.schoolId!);
      toast.success("题目已入库");
      setRecognitions((prev) =>
        prev.map((r) => (r.id === rec.id ? { ...r, status: "confirmed" as const } : r)),
      );
    } catch (err) {
      toast.error("入库失败", err instanceof Error ? err.message : undefined);
    } finally {
      setConfirming(false);
    }
  };

  const handleReject = async (rec: RecognitionResult) => {
    await aiService.rejectRecognition(rec.id);
    setRecognitions((prev) =>
      prev.map((r) => (r.id === rec.id ? { ...r, status: "rejected" as const } : r)),
    );
    toast.info("已忽略此题目");
  };

  const handleReRecognize = async (rec: RecognitionResult) => {
    toast.info("正在重新识别...");
    const updated = await aiService.reRecognize(rec.id);
    setRecognitions((prev) => prev.map((r) => (r.id === rec.id ? updated : r)));
    toast.success("已重新识别，请再次确认");
  };

  const handleConfirmAll = async () => {
    if (!selectedDoc || !teacher) return;
    setConfirming(true);
    try {
      const created = await aiService.confirmAll(selectedDoc.id, teacher.id, teacher.schoolId!);
      toast.success("批量入库完成", `共入库 ${created.length} 道题目`);
      setRecognitions((prev) =>
        prev.map((r) =>
          r.status === "pending" ? { ...r, status: "confirmed" as const } : r,
        ),
      );
      await loadDocuments();
    } catch (err) {
      toast.error("批量入库失败", err instanceof Error ? err.message : undefined);
    } finally {
      setConfirming(false);
    }
  };

  const toggleSection = (id: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleRec = (id: string) => {
    setExpandedRecs((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const pendingCount = recognitions.filter((r) => r.status === "pending").length;
  const confirmedCount = recognitions.filter((r) => r.status === "confirmed").length;

  const getChapterName = (id: string) => chapters.find((c) => c.id === id)?.name || id;
  const getPointName = (id: string) => points.find((p) => p.id === id)?.name || id;

  return (
    <div>
      <PageHeader
        title="文档导入与 AI 识别"
        description="上传教学文档，AI 自动识别题目、答案、解析与知识点，确认后入库题库"
        icon={<FileUp className="w-5 h-5" />}
        action={
          <Button variant="gold" onClick={() => fileInputRef.current?.click()} loading={uploading}>
            <Upload className="w-4 h-4" />
            上传文档
          </Button>
        }
      />
      <input
        ref={fileInputRef}
        type="file"
        accept=".doc,.docx,.pdf,.md,.txt"
        onChange={handleFileUpload}
        className="hidden"
      />

      <div className="grid lg:grid-cols-4 gap-6">
        {/* 左侧：文档列表 */}
        <div className="lg:col-span-1">
          <Card className="sticky top-6">
            <CardHeader title="文档列表" subtitle={`共 ${documents.length} 份`} />
            <div className="space-y-1.5">
              {documents.length === 0 ? (
                <div className="text-center py-8 text-xs text-ink-400">
                  <File className="w-8 h-8 mx-auto mb-2 text-ink-200" />
                  暂无文档
                </div>
              ) : (
                documents.map((doc) => (
                  <button
                    key={doc.id}
                    onClick={() => setSelectedDoc(doc)}
                    className={cn(
                      "w-full text-left p-3 rounded-md border transition-all",
                      selectedDoc?.id === doc.id
                        ? "border-gold-300 bg-gold-50/30"
                        : "border-ink-100 hover:bg-mist",
                    )}
                  >
                    <div className="flex items-start gap-2">
                      <FileText className={cn("w-4 h-4 flex-shrink-0 mt-0.5", selectedDoc?.id === doc.id ? "text-gold-600" : "text-ink-400")} />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-ink-900 truncate">{doc.fileName}</div>
                        <div className="text-xs text-ink-500 mt-0.5">{formatDate(doc.createdAt, true)}</div>
                        <div className="mt-1.5">
                          {doc.status === "confirmed" ? (
                            <Badge variant="green">已入库</Badge>
                          ) : doc.status === "recognized" ? (
                            <Badge variant="amber">待确认</Badge>
                          ) : doc.status === "recognizing" ? (
                            <Badge variant="teal">识别中</Badge>
                          ) : (
                            <Badge variant="default">已上传</Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </Card>
        </div>

        {/* 右侧：详情与识别 */}
        <div className="lg:col-span-3">
          {!selectedDoc ? (
            <Card>
              <EmptyState
                icon={<FileQuestion className="w-7 h-7" />}
                title="请选择一份文档"
                description="从左侧选择文档查看原文与 AI 识别结果，或上传新文档"
              />
            </Card>
          ) : (
            <div className="space-y-5">
              {/* 文档信息条 */}
              <Card>
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-md bg-ink-100 text-ink-600 flex items-center justify-center flex-shrink-0">
                      <FileText className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-medium text-ink-900 truncate">{selectedDoc.fileName}</div>
                      <div className="text-xs text-ink-500">
                        {selectedDoc.fileType.toUpperCase()} · {(selectedDoc.fileSize / 1024).toFixed(1)} KB · {selectedDoc.sections.length} 节
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {selectedDoc.status === "uploaded" && (
                      <Button variant="gold" onClick={handleRecognize} loading={recognizing}>
                        <Sparkles className="w-4 h-4" />
                        开始 AI 识别
                      </Button>
                    )}
                    {selectedDoc.status === "recognized" && pendingCount > 0 && (
                      <Button variant="gold" onClick={handleConfirmAll} loading={confirming}>
                        <CheckCircle2 className="w-4 h-4" />
                        批量确认入库 ({pendingCount})
                      </Button>
                    )}
                    {selectedDoc.status === "recognizing" && (
                      <Badge variant="teal">识别中...</Badge>
                    )}
                  </div>
                </div>

                {/* 识别进度 */}
                {recognizing && (
                  <div className="mt-4">
                    <div className="flex items-center justify-between text-xs text-ink-600 mb-1.5">
                      <span className="flex items-center gap-1.5">
                        <Sparkles className="w-3 h-3 text-gold-500 animate-pulse-soft" />
                        AI 正在识别题目与知识点...
                      </span>
                      <span className="font-mono">{Math.round(recognizingProgress)}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-ink-100 overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-gold-400 to-gold-500 transition-all duration-200"
                        style={{ width: `${recognizingProgress}%` }}
                      />
                    </div>
                  </div>
                )}
              </Card>

              {/* 原文结构 */}
              <Card>
                <CardHeader
                  title="原文结构（已存入讲义库）"
                  subtitle="保留原始章节结构，可作为讲义直接复用"
                  action={<Badge variant="teal">讲义库</Badge>}
                />
                <div className="space-y-1.5">
                  {selectedDoc.sections.map((sec) => {
                    const expanded = expandedSections.has(sec.id);
                    return (
                      <div key={sec.id} className="border border-ink-100 rounded-md">
                        <button
                          onClick={() => toggleSection(sec.id)}
                          className="w-full flex items-center gap-2 p-3 hover:bg-mist transition-colors text-left"
                        >
                          {expanded ? (
                            <ChevronDown className="w-3.5 h-3.5 text-ink-400" />
                          ) : (
                            <ChevronRight className="w-3.5 h-3.5 text-ink-400" />
                          )}
                          <span className="font-serif font-medium text-sm text-ink-900">{sec.title}</span>
                        </button>
                        {expanded && (
                          <div className="px-3 pb-3 pt-1 animate-fade-in">
                            <pre className="text-xs text-ink-700 whitespace-pre-wrap font-sans bg-mist p-3 rounded-md leading-relaxed">
                              {sec.content}
                            </pre>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </Card>

              {/* AI 识别结果 */}
              <Card>
                <CardHeader
                  title="AI 识别结果"
                  subtitle={`共 ${recognitions.length} 道题目 · 已确认 ${confirmedCount} · 待处理 ${pendingCount}`}
                  action={
                    recognitions.length > 0 && (
                      <div className="flex items-center gap-2">
                        {pendingCount > 0 && (
                          <Button variant="outline" size="sm" onClick={handleConfirmAll} loading={confirming}>
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            全部确认
                          </Button>
                        )}
                      </div>
                    )
                  }
                />

                {recognitions.length === 0 ? (
                  <EmptyState
                    icon={<Sparkles className="w-7 h-7" />}
                    title="尚未进行 AI 识别"
                    description="点击上方「开始 AI 识别」按钮，系统将自动提取题目、答案、解析与知识点建议"
                  />
                ) : (
                  <div className="space-y-3">
                    {recognitions.map((rec, idx) => (
                      <RecognitionCard
                        key={rec.id}
                        recognition={rec}
                        index={idx}
                        expanded={expandedRecs.has(rec.id)}
                        onToggle={() => toggleRec(rec.id)}
                        onConfirm={() => handleConfirmOne(rec)}
                        onReject={() => handleReject(rec)}
                        onReRecognize={() => handleReRecognize(rec)}
                        confirming={confirming}
                        getChapterName={getChapterName}
                        getPointName={getPointName}
                      />
                    ))}
                  </div>
                )}
              </Card>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============ 识别结果卡片 ============
interface RecognitionCardProps {
  recognition: RecognitionResult;
  index: number;
  expanded: boolean;
  onToggle: () => void;
  onConfirm: () => void;
  onReject: () => void;
  onReRecognize: () => void;
  confirming: boolean;
  getChapterName: (id: string) => string;
  getPointName: (id: string) => string;
}

function RecognitionCard({
  recognition: rec,
  index,
  expanded,
  onToggle,
  onConfirm,
  onReject,
  onReRecognize,
  confirming,
  getChapterName,
  getPointName,
}: RecognitionCardProps) {
  const q = rec.question;

  return (
    <div
      className={cn(
        "border rounded-lg overflow-hidden transition-all",
        rec.status === "confirmed"
          ? "border-emerald-200 bg-emerald-50/20"
          : rec.status === "rejected"
            ? "border-ink-200 bg-mist opacity-60"
            : "border-ink-200 bg-paper",
      )}
    >
      {/* 头部 */}
      <div className="flex items-start gap-3 p-3">
        <div className="w-7 h-7 rounded-md bg-ink-900 text-gold-400 flex items-center justify-center font-mono text-xs font-bold flex-shrink-0">
          {index + 1}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <Badge variant="ink">{typeLabel[q.type]}</Badge>
            <Badge variant={q.difficulty <= 2 ? "green" : q.difficulty <= 3 ? "amber" : "red"}>
              难度 {q.difficulty}
            </Badge>
            <span className="text-xs text-ink-500">
              置信度 <span className="font-mono font-semibold text-emerald-600">{Math.round(rec.confidence * 100)}%</span>
            </span>
            {rec.status === "confirmed" && (
              <Badge variant="green">
                <CheckCircle2 className="w-3 h-3" />
                已入库
              </Badge>
            )}
            {rec.status === "rejected" && (
              <Badge variant="default">
                <XCircle className="w-3 h-3" />
                已忽略
              </Badge>
            )}
          </div>
          <div className="text-sm text-ink-900 line-clamp-2">{q.stem}</div>
        </div>
        <button
          onClick={onToggle}
          className="p-1.5 rounded text-ink-400 hover:bg-mist hover:text-ink-700 flex-shrink-0"
        >
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>
      </div>

      {/* 展开内容 */}
      {expanded && (
        <div className="px-3 pb-3 space-y-3 animate-fade-in border-t border-ink-100 pt-3">
          {/* 题目详情 */}
          {q.options && q.options.length > 0 && (
            <div className="space-y-1">
              {q.options.map((opt, i) => (
                <div
                  key={i}
                  className={cn(
                    "text-xs p-2 rounded border flex items-start gap-2",
                    q.answer.includes(String.fromCharCode(65 + i))
                      ? "border-emerald-200 bg-emerald-50/40"
                      : "border-ink-100",
                  )}
                >
                  <span className="font-mono font-semibold text-ink-700">{String.fromCharCode(65 + i)}.</span>
                  <span className="text-ink-800">{opt}</span>
                </div>
              ))}
            </div>
          )}

          <div className="grid sm:grid-cols-2 gap-2 text-xs">
            <div className="p-2 rounded bg-emerald-50/40 border border-emerald-200">
              <div className="text-emerald-700 font-medium mb-0.5">答案</div>
              <div className="text-ink-900 whitespace-pre-wrap">{q.answer}</div>
            </div>
            <div className="p-2 rounded bg-gold-50/30 border border-gold-200">
              <div className="text-gold-700 font-medium mb-0.5">解析</div>
              <div className="text-ink-900 whitespace-pre-wrap">{q.analysis}</div>
            </div>
          </div>

          {/* 知识点建议 */}
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <div className="text-xs font-medium text-ink-600 mb-1.5">AI 建议章节</div>
              <div className="flex flex-wrap gap-1.5">
                {q.chapterIds.length ? (
                  q.chapterIds.map((id) => (
                    <Badge key={id} variant="ink">{getChapterName(id)}</Badge>
                  ))
                ) : (
                  <span className="text-xs text-ink-400">未识别</span>
                )}
              </div>
            </div>
            <div>
              <div className="text-xs font-medium text-ink-600 mb-1.5">AI 建议知识点</div>
              <div className="flex flex-wrap gap-1.5">
                {q.knowledgePointIds.length ? (
                  q.knowledgePointIds.map((id) => (
                    <Badge key={id} variant="teal">{getPointName(id)}</Badge>
                  ))
                ) : (
                  <span className="text-xs text-ink-400">未识别</span>
                )}
              </div>
            </div>
          </div>

          {/* 联网分析 */}
          <div className="p-3 rounded-md bg-ink-50 border border-ink-100">
            <div className="flex items-center gap-1.5 text-xs font-medium text-ink-700 mb-2">
              <Globe className="w-3.5 h-3.5 text-teal-500" />
              联网分析 · 共找到 {rec.webAnnotations.totalSources} 个来源
            </div>
            <div className="grid sm:grid-cols-2 gap-3 text-xs">
              <div>
                <div className="text-ink-500 mb-1">网上常见章节标注</div>
                <div className="space-y-1">
                  {rec.webAnnotations.topChapters.map((c, i) => (
                    <div key={i} className="flex items-center justify-between">
                      <span className="text-ink-800 truncate">{c.chapter}</span>
                      <span className="text-ink-500 font-mono">{c.count} 次</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <div className="text-ink-500 mb-1">网上常见知识点标注</div>
                <div className="space-y-1">
                  {rec.webAnnotations.topKnowledgePoints.map((p, i) => (
                    <div key={i} className="flex items-center justify-between">
                      <span className="text-ink-800 truncate">{p.point}</span>
                      <span className="text-ink-500 font-mono">{p.count} 次</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* 操作按钮 */}
          {rec.status === "pending" && (
            <div className="flex items-center justify-end gap-2 pt-1">
              <Button variant="ghost" size="sm" onClick={onReject}>
                <XCircle className="w-3.5 h-3.5" />
                忽略
              </Button>
              <Button variant="outline" size="sm" onClick={onReRecognize}>
                <RefreshCw className="w-3.5 h-3.5" />
                重新识别
              </Button>
              <Button variant="gold" size="sm" onClick={onConfirm} loading={confirming}>
                <Check className="w-3.5 h-3.5" />
                确认入库
              </Button>
            </div>
          )}
          {rec.status === "confirmed" && (
            <div className="flex items-center gap-2 text-xs text-emerald-700 pt-1">
              <CheckCircle2 className="w-3.5 h-3.5" />
              题目已确认入库，可在题库管理中查看
            </div>
          )}
        </div>
      )}
    </div>
  );
}
