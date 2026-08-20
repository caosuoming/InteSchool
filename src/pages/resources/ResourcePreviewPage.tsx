import { openPage } from "@/lib/navigation";
import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import {
  ArrowLeft, FileText, FileSpreadsheet,
  Sparkles, Loader2,
} from "lucide-react";
import { useAuthStore } from "@/stores/auth";
import { lectureService } from "@/services/lecture";
import { examPaperService } from "@/services/examPaper";
import { toast } from "@/stores/ui";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { Spinner } from "@/components/ui/Spinner";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { DocumentDownloadButton } from "@/components/resource/DocumentDownloadButton";
import { DocumentFormatIcon } from "@/components/resource/DocumentFormatIcon";
import { OfficeDocumentHtml } from "@/components/resource/OfficeDocumentHtml";
import { extractStoredFile } from "@/services/api";
import "katex/dist/katex.min.css";
import type { Lecture, ExamPaper } from "@/types";
import {
  isExtractTaskRunning,
  useExtractTasksStore,
} from "@/stores/extractTasks";
import { isPdfDocumentResource, originalDocumentFileType } from "@/lib/document-resource";



export default function ResourcePreviewPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const { teacher } = useAuthStore();

  const resourceType = searchParams.get("type") as "lecture" | "examPaper" | null;
  const [loading, setLoading] = useState(true);
  const [lecture, setLecture] = useState<Lecture | null>(null);
  const [examPaper, setExamPaper] = useState<ExamPaper | null>(null);
  const extractTasks = useExtractTasksStore((state) => state.tasks);
  const startExtractTask = useExtractTasksStore((state) => state.startTask);

  const [docPreview, setDocPreview] = useState<{
    loading: boolean;
    html: string;
    error: string;
  }>({ loading: false, html: "", error: "" });

  const resource = lecture || examPaper;

  useEffect(() => {
    if (!id || !resourceType) {
      toast.error("参数错误");
      navigate("/resources");
      return;
    }

    const loadData = async () => {
      setLoading(true);
      try {
        if (resourceType === "lecture") {
          const data = await lectureService.getLecture(id);
          setLecture(data);
        } else {
          const data = await examPaperService.getPaper(id);
          setExamPaper(data);
        }
      } catch (e) {
        toast.error("加载失败", e instanceof Error ? e.message : undefined);
        navigate("/resources");
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [id, resourceType, navigate]);

  const loadDocxPreview = useCallback(async () => {
    if (!resource?.originalFileUrl || !resource.originalFileName) return;
    const supported = /\.docx$/i.test(resource.originalFileName);
    if (!supported) return;
    setDocPreview({ loading: true, html: "", error: "" });
    try {
      const extracted = await extractStoredFile(resource.originalFileUrl);
      setDocPreview({ loading: false, html: extracted.html, error: "" });
    } catch (error) {
      setDocPreview({
        loading: false,
        html: "",
        error: `加载失败: ${error instanceof Error ? error.message : "未知错误"}`,
      });
    }
  }, [resource]);

  useEffect(() => {
    loadDocxPreview();
  }, [loadDocxPreview]);

  useEffect(() => {
    const handleExtractConfirmed = (event: Event) => {
      const detail = (event as CustomEvent<{
        resourceId: string;
        resourceType: "lecture" | "examPaper";
      }>).detail;
      if (detail?.resourceId === id && detail.resourceType === resourceType) {
        window.location.reload();
      }
    };
    window.addEventListener("extract-task-confirmed", handleExtractConfirmed);
    return () => window.removeEventListener("extract-task-confirmed", handleExtractConfirmed);
  }, [id, resourceType]);

  if (!resource) {
    if (loading) {
      return (
        <div className="flex items-center justify-center py-20">
          <Spinner size={24} />
        </div>
      );
    }
    return null;
  }

  const isExtracted = resource.extractStatus === "done";
  const isExtracting = resource.extractStatus === "extracting"
    || (resourceType ? isExtractTaskRunning(extractTasks, resource.id, resourceType) : false);
  const hasOriginalFile = !!resource.originalFileUrl;
  const isPdfOriginal = isPdfDocumentResource(resource);
  const isWordOriginal = originalDocumentFileType(resource) === "word";

  const handleOpenExtract = () => {
    if (!resourceType) return;
    if (isPdfOriginal) {
      toast.warning("PDF 文档不支持拆解", "可直接在当前页面浏览 PDF 原稿");
      return;
    }
    startExtractTask({
      resourceId: resource.id,
      resourceType,
      resourceTitle: resource.title,
      chapterIds: resource.chapterIds,
      knowledgePointIds: resource.knowledgePointIds,
      grade: resource.grade,
      schoolYear: resource.schoolYear,
      semester: resource.semester || "上学期",
    });
  };

  return (
    <div>
      <PageHeader
        title={resource.title}
        description={`${resourceType === "lecture" ? "讲义" : "试卷"}原稿预览`}
        icon={resourceType === "lecture" ? <FileText className="w-5 h-5" /> : <FileSpreadsheet className="w-5 h-5" />}
        action={
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={() => openPage("/resources")}>
              <ArrowLeft className="w-4 h-4" />
              返回
            </Button>
            {hasOriginalFile && (
              <DocumentDownloadButton
                fileUrl={resource.originalFileUrl}
                fileName={resource.originalFileName}
                label="下载原稿"
                className="gap-2 px-4 py-2 text-sm font-medium text-gold-600 bg-gold-50 rounded-lg hover:bg-gold-100 transition-colors"
              />
            )}
          </div>
        }
      />

      <div className="max-w-6xl mx-auto">
        <Card className="mb-4">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-3">
              <Badge variant={isPdfOriginal ? "ink" : (isExtracted ? "teal" : "amber")}>
                {isPdfOriginal ? "PDF 文档" : (isExtracted ? "已拆解" : "待拆解")}
              </Badge>
              <span className="text-sm text-ink-500">
                {resourceType === "lecture" ? "讲义" : "试卷"}原稿
              </span>
              {resource.originalFileName && (
                <span className="inline-flex items-center gap-1.5 text-xs text-ink-400">
                  <DocumentFormatIcon
                    fileType={resource.originalFileType}
                    fileName={resource.originalFileName}
                  />
                  文件：{resource.originalFileName}
                </span>
              )}
            </div>
            {!isExtracted && !isPdfOriginal && (
              <Button
                variant="gold"
                onClick={handleOpenExtract}
                loading={isExtracting}
              >
                <Sparkles className="w-4 h-4" />
                {isExtracting ? "拆解中..." : "文档拆解"}
              </Button>
            )}
          </div>
        </Card>

        <Card className="overflow-hidden">
          <div className="bg-ink-50 p-4 border-b border-ink-200">
            <div className="flex items-center gap-2 text-sm text-ink-600">
              <FileText className="w-4 h-4" />
              <span>文档预览（只读模式）</span>
            </div>
          </div>

          {hasOriginalFile ? (
            <div className="h-[70vh] bg-white overflow-y-auto">
              {isWordOriginal ? (
                <div className="p-8 docx-preview">
                  <style>{`
                    .docx-preview .katex {
                      font-size: 1em;
                      font-family: inherit;
                    }
                    .docx-preview .katex-display {
                      font-size: 1.2em;
                      margin: 0.5em 0;
                    }
                    .docx-preview .formula-inline {
                      font-size: 0.95em;
                      vertical-align: -0.2em;
                    }
                    .docx-preview .formula-inline .katex {
                      font-size: 1em;
                      vertical-align: baseline;
                    }
                    .docx-preview .formula-display .katex-display {
                      font-size: 1.1em;
                    }
                  `}</style>
                  {docPreview.loading ? (
                    <div className="flex items-center justify-center py-20">
                      <Loader2 className="w-6 h-6 animate-spin text-ink-400" />
                      <span className="ml-2 text-sm text-ink-500">正在解析文档...</span>
                    </div>
                  ) : docPreview.error ? (
                    <div className="text-center py-20 text-red-600">
                      {docPreview.error}
                    </div>
                  ) : docPreview.html ? (
                    <OfficeDocumentHtml html={docPreview.html} />
                  ) : (
                    <div className="text-center py-20 text-ink-400">
                      文档内容为空
                    </div>
                  )}
                </div>
              ) : isPdfOriginal ? (
                <iframe
                  src={resource.originalFileUrl}
                  title={resource.title}
                  className="w-full h-full border-none"
                  allow="autoplay; clipboard-write"
                />
              ) : (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <FileText className="w-16 h-16 text-ink-200 mb-4" />
                  <div className="text-lg font-medium text-ink-900 mb-2">不支持的文件格式</div>
                  <div className="text-sm text-ink-500">当前仅支持预览 DOCX/DOC 和 PDF 格式的文档</div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <FileText className="w-16 h-16 text-ink-200 mb-4" />
              <div className="text-lg font-medium text-ink-900 mb-2">暂无原稿文件</div>
              <div className="text-sm text-ink-500">该资源没有上传原始文档，无法预览原稿</div>
            </div>
          )}
        </Card>

        {!isExtracted && hasOriginalFile && !isPdfOriginal && (
          <Card className="mt-4 bg-amber-50/50 border-amber-200">
            <div className="flex items-start gap-3 p-4">
              <Sparkles className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
              <div>
                <div className="font-medium text-amber-800 mb-1">智能文档拆解</div>
                <div className="text-sm text-amber-700">
                  点击上方「文档拆解」按钮，系统将自动识别文档结构，将文档切分为知识块和题目。
                  支持根据提示词自动识别："一、"表示知识块，"例1"表示题目，"【答案】""【解析】"等表示题目对应的答案解析。
                </div>
              </div>
            </div>
          </Card>
        )}
      </div>

    </div>
  );
}
